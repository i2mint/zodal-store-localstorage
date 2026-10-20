import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createLocalStorageProvider,
  createBrowserBifurcatedProvider,
  CorruptStorageError,
  StorageQuotaError,
  type QuarantineInfo,
} from '../src/index.js';

const KEY = 'corrupt-test';
const CORRUPT_VALUES = ['{not json', '{"id":"1"}', 'null', '42', '"text"', '[1,null,{"id":"a"}]', '[[]]', '["a"]'];

function backupKeys(): string[] {
  return Object.keys(localStorage).filter(k => k.startsWith(`${KEY}.corrupt-`));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("onCorrupt: 'throw' (default)", () => {
  it.each(CORRUPT_VALUES)('a write never overwrites unreadable text %j', async (raw) => {
    localStorage.setItem(KEY, raw);
    const provider = createLocalStorageProvider<any>({ storageKey: KEY });

    await expect(provider.create({ name: 'new' })).rejects.toBeInstanceOf(CorruptStorageError);
    await expect(provider.upsert!({ id: '1', name: 'new' })).rejects.toBeInstanceOf(CorruptStorageError);
    await expect(provider.update('1', { name: 'new' })).rejects.toBeInstanceOf(CorruptStorageError);
    await expect(provider.updateMany!(['1'], { name: 'new' })).rejects.toBeInstanceOf(CorruptStorageError);
    await expect(provider.delete('1')).rejects.toBeInstanceOf(CorruptStorageError);
    await expect(provider.deleteMany!(['1'])).rejects.toBeInstanceOf(CorruptStorageError);

    expect(localStorage.getItem(KEY)).toBe(raw);
  });

  it('reads throw a typed error carrying the key and the raw text', async () => {
    localStorage.setItem(KEY, '{not json');
    const provider = createLocalStorageProvider<any>({ storageKey: KEY });

    const error = await provider.getList({}).catch(e => e);
    expect(error).toBeInstanceOf(CorruptStorageError);
    expect(error.name).toBe('CorruptStorageError');
    expect(error.storageKey).toBe(KEY);
    expect(error.raw).toBe('{not json');
    expect(error.cause).toBeInstanceOf(SyntaxError);
    await expect(provider.getOne('1')).rejects.toBeInstanceOf(CorruptStorageError);
  });

  it('a missing key is an empty collection, not an error', async () => {
    const provider = createLocalStorageProvider<any>({ storageKey: KEY });
    expect(await provider.getList({})).toEqual({ data: [], total: 0 });
  });

  it('an empty string is an empty collection, not an error', async () => {
    localStorage.setItem(KEY, '');
    const provider = createLocalStorageProvider<any>({ storageKey: KEY });
    expect(await provider.getList({})).toEqual({ data: [], total: 0 });
  });

  it('createBrowserBifurcatedProvider applies the same policy to its metadata key', async () => {
    localStorage.setItem(KEY, '{not json');
    const provider = createBrowserBifurcatedProvider<any>({ storageKey: KEY, contentFields: ['body'] });
    await expect(provider.getList({})).rejects.toBeInstanceOf(CorruptStorageError);
    expect(localStorage.getItem(KEY)).toBe('{not json');
  });

  it('an empty array is an empty collection, not an error', async () => {
    localStorage.setItem(KEY, '[]');
    const provider = createLocalStorageProvider<any>({ storageKey: KEY });
    expect(await provider.getList({})).toEqual({ data: [], total: 0 });
  });
});

describe('onCorrupt: callback (quarantine)', () => {
  it('moves the text aside, reports where, and continues with an empty collection', async () => {
    localStorage.setItem(KEY, '{not json');
    const reports: QuarantineInfo[] = [];
    const provider = createLocalStorageProvider<any>({ storageKey: KEY, onCorrupt: info => reports.push(info) });

    const created = await provider.create({ name: 'new' });

    expect(reports).toHaveLength(1);
    const [{ storageKey, backupKey, error }] = reports;
    expect(storageKey).toBe(KEY);
    expect(backupKeys()).toEqual([backupKey]);
    expect(localStorage.getItem(backupKey)).toBe('{not json');
    expect(error).toBeInstanceOf(CorruptStorageError);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([created]);
  });

  it('reports once, not on every read', async () => {
    localStorage.setItem(KEY, '{not json');
    const onCorrupt = vi.fn();
    const provider = createLocalStorageProvider<any>({ storageKey: KEY, onCorrupt });

    await provider.getList({});
    await provider.getList({});
    await provider.create({ name: 'new' });

    expect(onCorrupt).toHaveBeenCalledTimes(1);
    expect(backupKeys()).toHaveLength(1);
  });

  it('a write made from the callback is kept, not overwritten by the operation that found the corruption', async () => {
    localStorage.setItem(KEY, '{not json');
    const provider = createLocalStorageProvider<any>({
      storageKey: KEY,
      onCorrupt: () => void provider.create({ id: 'seed' }),
    });

    await provider.create({ id: 'user' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const ids = JSON.parse(localStorage.getItem(KEY)!).map((i: any) => i.id).sort();
    expect(ids).toEqual(['seed', 'user']);
  });

  it('a callback that throws does not fail the operation, and the text is already safe', async () => {
    localStorage.setItem(KEY, '{not json');
    const scheduled: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(fn => void scheduled.push(fn));
    const provider = createLocalStorageProvider<any>({
      storageKey: KEY,
      onCorrupt: () => {
        throw new Error('callback bug');
      },
    });

    await expect(provider.create({ id: 'user' })).resolves.toMatchObject({ id: 'user' });
    expect(scheduled).toHaveLength(1);
    expect(() => scheduled[0]()).toThrow('callback bug');
    expect(backupKeys().map(k => localStorage.getItem(k))).toEqual(['{not json']);
  });

  it('two corruptions in the same millisecond keep both backups', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const provider = createLocalStorageProvider<any>({ storageKey: KEY, onCorrupt: () => {} });

    localStorage.setItem(KEY, 'FIRST{');
    await provider.getList({});
    localStorage.setItem(KEY, 'SECOND{');
    await provider.getList({});

    expect(backupKeys().map(k => localStorage.getItem(k)).sort()).toEqual(['FIRST{', 'SECOND{']);
  });

  it('throws and leaves the text in place when it cannot be moved aside', async () => {
    localStorage.setItem(KEY, '{not json');
    const onCorrupt = vi.fn();
    const provider = createLocalStorageProvider<any>({ storageKey: KEY, onCorrupt });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    await expect(provider.create({ name: 'new' })).rejects.toBeInstanceOf(CorruptStorageError);

    vi.restoreAllMocks();
    expect(localStorage.getItem(KEY)).toBe('{not json');
    expect(backupKeys()).toEqual([]);
    expect(onCorrupt).not.toHaveBeenCalled();
  });
});

describe('write failures', () => {
  it('a full storage area raises StorageQuotaError and keeps the previous value', async () => {
    const provider = createLocalStorageProvider<any>({ storageKey: KEY });
    await provider.create({ id: '1', name: 'kept' });
    const before = localStorage.getItem(KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    const error = await provider.create({ name: 'new' }).catch(e => e);

    vi.restoreAllMocks();
    expect(error).toBeInstanceOf(StorageQuotaError);
    expect(error.storageKey).toBe(KEY);
    expect(error.cause).toBeInstanceOf(DOMException);
    expect(localStorage.getItem(KEY)).toBe(before);
  });

  it('other write failures propagate unchanged', async () => {
    const provider = createLocalStorageProvider<any>({ storageKey: KEY });
    const boom = new Error('boom');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw boom;
    });

    await expect(provider.create({ name: 'new' })).rejects.toBe(boom);
  });
});
