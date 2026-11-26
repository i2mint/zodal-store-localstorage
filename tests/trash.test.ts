/**
 * `withTrash` (zodal#156) over the localStorage provider (zodal#162): the deletion mark is an
 * ordinary field, so it persists in storage. Skipped until the installed `@zodal/store` ships
 * `withTrash`.
 */
import { describe, it, expect } from 'vitest';
import * as store from '@zodal/store';
import { createLocalStorageProvider, createMemoryStorage } from '../src/index.js';

const withTrash = (store as any).withTrash as typeof import('@zodal/store').withTrash | undefined;
const make = async () => {
  const p = createLocalStorageProvider<{ id: string; n: number; deletedAt?: string | null }>({
    storageKey: 'trash-test',
    storage: createMemoryStorage(),
  });
  for (const id of ['a', 'b', 'c']) await p.create({ id, n: 1 });
  return p;
};

describe.skipIf(!withTrash)('withTrash over localStorage', () => {
  it('delete moves to the Trash; restore and purge work; the DataProvider contract holds', async () => {
    const p = withTrash(await make(), { stamp: () => '2026-01-01T00:00:00.000Z' });
    expect(p.getCapabilities().softDelete).toBe(true);
    await p.delete('a');
    expect((await p.getList({})).data.map((x: any) => x.id).sort()).toEqual(['b', 'c']);
    await expect(p.getOne('a')).rejects.toThrow();
    expect((await p.trashed.getList({})).data.map((x: any) => x.id)).toEqual(['a']);
    expect(await p.restore(['a'])).toEqual(['a']);
    expect((await p.getList({})).total).toBe(3);
    await p.deleteMany(['b', 'c']);
    expect(await p.emptyTrash()).toBe(2);
    expect((await p.getList({})).data.map((x: any) => x.id)).toEqual(['a']);
    expect((await p.trashed.getList({})).total).toBe(0);
  });
});
