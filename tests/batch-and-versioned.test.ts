import { describe, it, expect } from 'vitest';
import { createLocalStorageProvider, createMemoryStorage, WriteConflictError } from '../src/index.js';

const make = () => {
  const storage = createMemoryStorage();
  let writes = 0;
  const counted = { ...storage, getItem: storage.getItem, removeItem: storage.removeItem, setItem: (k: string, v: string) => (writes++, storage.setItem(k, v)) };
  const p = createLocalStorageProvider<{ id: string; n: number }>({ storageKey: 'k', storage: counted });
  return { p, writes: () => writes, storage };
};

describe('upsertMany (zodal#122)', () => {
  it('writes a page of items in one write', async () => {
    const { p, writes } = make();
    await p.create({ id: 'a', n: 0 });
    const before = writes();
    await p.upsertMany(Array.from({ length: 50 }, (_, i) => ({ id: i === 0 ? 'a' : `x${i}`, n: i + 1 })));
    expect(writes() - before).toBe(1);
    expect((await p.getList({})).total).toBe(50);
    expect((await p.getOne('a')).n).toBe(1);
  });
});

describe('conditional writes (zodal#118)', () => {
  it('a write at the read version succeeds; a stale one conflicts and writes nothing', async () => {
    const { p } = make();
    await p.create({ id: 'a', n: 1 });
    const v1 = await p.getVersioned('a');
    const next = await p.updateIfVersion('a', { n: 2 }, v1.version);
    expect(next.version).not.toBe(v1.version);
    const err = await p.updateIfVersion('a', { n: 9 }, v1.version).catch((e) => e);
    expect(err).toBeInstanceOf(WriteConflictError);
    expect(err.name).toBe('WriteConflict'); // what isWriteConflict in @zodal/store matches
    expect((await p.getOne('a')).n).toBe(2);
    await expect(p.deleteIfVersion('a', v1.version)).rejects.toBeInstanceOf(WriteConflictError);
    await p.deleteIfVersion('a', next.version);
    await expect(p.getOne('a')).rejects.toThrow();
    await expect(p.updateIfVersion('a', { n: 1 }, next.version)).rejects.toMatchObject({ actual: undefined });
  });
  it('sees a write made by another provider over the same key (another tab)', async () => {
    const { p, storage } = make();
    await p.create({ id: 'a', n: 1 });
    const { version } = await p.getVersioned('a');
    const otherTab = createLocalStorageProvider<{ id: string; n: number }>({ storageKey: 'k', storage });
    await otherTab.update('a', { n: 5 });
    await expect(p.updateIfVersion('a', { n: 2 }, version)).rejects.toBeInstanceOf(WriteConflictError);
    expect((p.getCapabilities!() as any).versioned).toBe(true);
  });
});
