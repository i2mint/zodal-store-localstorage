import { describe, it, expect, afterEach, vi } from 'vitest';
import { createLocalStorageProvider, createMemoryStorage, StorageQuotaError } from '../src/index.js';
import { createLocalStorageProvider as createLite } from '../src/lite.js';

afterEach(() => vi.unstubAllGlobals());

describe('injectable storage, fallback and status (#11)', () => {
  it('uses an injected storage area as-is', async () => {
    const storage = createMemoryStorage();
    const p = createLocalStorageProvider<{ id: string }>({ storageKey: 'k', storage });
    await p.create({ id: 'a' });
    expect(storage.getItem('k')).toBe('[{"id":"a"}]');
    expect(p.status()).toEqual({ backend: 'custom' });
  });
  it('falls back to memory when localStorage is missing or refuses writes, and says why', async () => {
    vi.stubGlobal('localStorage', undefined);
    const p = createLocalStorageProvider<{ id: string }>({ storageKey: 'k' });
    await p.create({ id: 'a' });
    expect((await p.getList({})).total).toBe(1);
    expect(p.status()).toMatchObject({ backend: 'memory', fallbackReason: expect.stringMatching(/not available/) });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw Object.assign(new Error('x'), { name: 'SecurityError' }); }, removeItem: () => {} });
    expect(createLocalStorageProvider({ storageKey: 'k' }).status().fallbackReason).toMatch(/refuses writes \(SecurityError\)/);
    expect(() => createLocalStorageProvider({ storageKey: 'k', fallback: 'throw' })).toThrow(/refuses writes/);
  });
  it('reports a write that was not kept until acknowledged', async () => {
    const storage = createMemoryStorage();
    let full = false;
    const quota = { ...storage, getItem: storage.getItem, removeItem: storage.removeItem, setItem: (k: string, v: string) => {
      if (full) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      storage.setItem(k, v);
    } };
    const p = createLocalStorageProvider<{ id: string }>({ storageKey: 'k', storage: quota });
    const seen: unknown[] = [];
    p.onStatus((s) => seen.push(s));
    await p.create({ id: 'a' });
    full = true;
    await expect(p.create({ id: 'b' })).rejects.toBeInstanceOf(StorageQuotaError);
    expect(p.status().unsavedWrite).toBeInstanceOf(StorageQuotaError);
    p.acknowledge();
    expect(p.status().unsavedWrite).toBeUndefined();
    expect(seen.length).toBe(2);
  });
});

describe('the ./lite entry', () => {
  it('does CRUD and pagination, and refuses queries it cannot answer', async () => {
    const p = createLite<{ id: string; n: number }>({ storageKey: 'k', storage: createMemoryStorage() });
    for (let i = 0; i < 5; i++) await p.create({ id: String(i), n: i });
    expect((await p.getList({ pagination: { page: 2, pageSize: 2 } })).data.map((x) => x.id)).toEqual(['2', '3']);
    await expect(p.getList({ search: 'x' })).rejects.toThrow(/without a query engine/);
    await expect(p.getList({ sort: [{ id: 'n', desc: true }] })).rejects.toThrow(/main entry/);
  });
});
