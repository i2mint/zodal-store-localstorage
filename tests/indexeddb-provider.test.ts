import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createIndexedDBProvider } from '../src/index.js';

type Row = { id: string; name: string; status: string; priority: number; tags: string[] };
const SEED: Row[] = [
  { id: '1', name: 'Alpha Project', status: 'active', priority: 3, tags: ['web'] },
  { id: '2', name: 'Beta API', status: 'draft', priority: 1, tags: ['api'] },
  { id: '3', name: 'Gamma', status: 'active', priority: 5, tags: ['web', 'api'] },
];

async function make(factory = new IDBFactory(), storeName = 'rows', allStores?: string[]) {
  const p = createIndexedDBProvider<Row>({ dbName: 'test', storeName, indexedDB: factory, ...(allStores ? { allStores } : {}) });
  for (const r of SEED) await p.create(structuredClone(r));
  return p;
}

describe('createIndexedDBProvider (#9)', () => {
  it('CRUD, with the DataProvider contract semantics', async () => {
    const p = await make();
    expect((await p.getOne('2')).name).toBe('Beta API');
    await expect(p.create({ id: '1', name: 'dup' } as Row)).rejects.toThrow();
    expect((await p.update('2', { status: 'active' })).status).toBe('active');
    await expect(p.update('nope', { name: 'x' })).rejects.toThrow(/not found/);
    expect((await p.updateMany(['1', 'nope'], { priority: 9 })).map((r) => r.id)).toEqual(['1']);
    await p.delete('3');
    await expect(p.delete('3')).rejects.toThrow(/not found/);
    await expect(p.getOne('3')).rejects.toThrow(/not found/);
    await p.upsert({ id: '7', name: 'Theta', status: 'draft', priority: 0, tags: [] });
    await p.upsert({ id: '1', name: 'Alpha 2', status: 'archived', priority: 3, tags: [] });
    expect((await p.getOne('1')).name).toBe('Alpha 2');
    await p.deleteMany(['7', 'missing']);
    expect((await p.getList({})).total).toBe(2);
    const created = await p.create({ name: 'Auto', status: 'draft', priority: 2, tags: [] } as Partial<Row>);
    expect(typeof created.id).toBe('string');
  });
  it('filters, searches, sorts and paginates client-side; total counts every match', async () => {
    const p = await make();
    const r = await p.getList({
      filter: { field: 'status', operator: 'eq', value: 'active' },
      sort: [{ id: 'priority', desc: true }],
      pagination: { page: 1, pageSize: 1 },
    });
    expect(r.total).toBe(2);
    expect(r.data.map((x) => x.id)).toEqual(['3']);
    expect((await p.getList({ search: 'beta' })).data.map((x) => x.id)).toEqual(['2']);
    expect(p.getCapabilities!().serverFilter).toBe(false);
  });
  it('persists across providers and adds a store to an existing database', async () => {
    const factory = new IDBFactory();
    await make(factory, 'rows');
    const other = createIndexedDBProvider<Row>({ dbName: 'test', storeName: 'more', indexedDB: factory });
    await other.create({ id: 'x', name: 'in another store', status: 'draft', priority: 0, tags: [] });
    const again = createIndexedDBProvider<Row>({ dbName: 'test', storeName: 'rows', indexedDB: factory, allStores: ['rows', 'more'] });
    expect((await again.getList({})).total).toBe(3);
    expect((await other.getList({})).total).toBe(1);
  });
  it('returns copies: mutating a result does not change the store', async () => {
    const p = await make();
    const one = await p.getOne('1');
    one.tags.push('mutated');
    expect((await p.getOne('1')).tags).toEqual(['web']);
  });
});
