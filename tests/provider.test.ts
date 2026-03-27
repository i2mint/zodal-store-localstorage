import { describe, it, expect, beforeEach } from 'vitest';
import { createLocalStorageProvider } from '../src/index.js';

interface TestItem {
  id: string;
  name: string;
  priority: number;
}

describe('createLocalStorageProvider', () => {
  let provider: ReturnType<typeof createLocalStorageProvider<TestItem>>;

  beforeEach(() => {
    localStorage.clear();
    provider = createLocalStorageProvider<TestItem>({ storageKey: 'test-items' });
  });

  it('creates and retrieves an item', async () => {
    const created = await provider.create({ name: 'Alpha', priority: 1 });
    expect(created).toHaveProperty('id');
    expect(created.name).toBe('Alpha');

    const fetched = await provider.getOne(created.id);
    expect(fetched.name).toBe('Alpha');
  });

  it('persists to localStorage', async () => {
    await provider.create({ name: 'Persisted', priority: 1 });
    const raw = localStorage.getItem('test-items');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Persisted');
  });

  it('lists all items', async () => {
    await provider.create({ name: 'A', priority: 1 });
    await provider.create({ name: 'B', priority: 2 });
    const { data, total } = await provider.getList({});
    expect(data).toHaveLength(2);
    expect(total).toBe(2);
  });

  it('updates an item', async () => {
    const created = await provider.create({ name: 'Before', priority: 1 });
    const updated = await provider.update(created.id, { name: 'After' });
    expect(updated.name).toBe('After');
    const fetched = await provider.getOne(created.id);
    expect(fetched.name).toBe('After');
  });

  it('updates many items', async () => {
    const a = await provider.create({ name: 'A', priority: 1 });
    const b = await provider.create({ name: 'B', priority: 2 });
    const updated = await provider.updateMany([a.id, b.id], { priority: 5 });
    expect(updated).toHaveLength(2);
    expect(updated[0].priority).toBe(5);
    expect(updated[1].priority).toBe(5);
  });

  it('deletes an item', async () => {
    const created = await provider.create({ name: 'Doomed', priority: 1 });
    await provider.delete(created.id);
    await expect(provider.getOne(created.id)).rejects.toThrow('Item not found');
  });

  it('deletes many items', async () => {
    const a = await provider.create({ name: 'A', priority: 1 });
    const b = await provider.create({ name: 'B', priority: 2 });
    const c = await provider.create({ name: 'C', priority: 3 });
    await provider.deleteMany([a.id, c.id]);
    const { data } = await provider.getList({});
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('B');
  });

  it('upserts — inserts when new', async () => {
    const item = await provider.upsert!({ id: 'u1', name: 'New', priority: 1 });
    expect(item.id).toBe('u1');
    const { data } = await provider.getList({});
    expect(data).toHaveLength(1);
  });

  it('upserts — updates when existing', async () => {
    await provider.upsert!({ id: 'u1', name: 'V1', priority: 1 });
    await provider.upsert!({ id: 'u1', name: 'V2', priority: 2 });
    const { data } = await provider.getList({});
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('V2');
  });

  it('sorts results', async () => {
    await provider.create({ name: 'Zebra', priority: 1 });
    await provider.create({ name: 'Alpha', priority: 2 });
    const { data } = await provider.getList({
      sort: [{ id: 'name', desc: false }],
    });
    expect(data[0].name).toBe('Alpha');
    expect(data[1].name).toBe('Zebra');
  });

  it('filters with FilterExpression', async () => {
    await provider.create({ name: 'Low', priority: 1 });
    await provider.create({ name: 'High', priority: 5 });
    const { data } = await provider.getList({
      filter: { field: 'priority', operator: 'gte', value: 3 },
    });
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('High');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 15; i++) {
      await provider.create({ name: `Item ${i}`, priority: i });
    }
    const { data, total } = await provider.getList({
      pagination: { page: 2, pageSize: 10 },
    });
    expect(data).toHaveLength(5);
    expect(total).toBe(15);
  });

  it('searches string fields', async () => {
    await provider.create({ name: 'Apple', priority: 1 });
    await provider.create({ name: 'Banana', priority: 2 });
    const { data } = await provider.getList({ search: 'app' });
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Apple');
  });

  it('reports capabilities', () => {
    const caps = provider.getCapabilities!();
    expect(caps.canCreate).toBe(true);
    expect(caps.canUpsert).toBe(true);
    expect(caps.serverSort).toBe(false);
    expect(caps.serverFilter).toBe(false);
  });

  it('throws on getOne for missing item', async () => {
    await expect(provider.getOne('nonexistent')).rejects.toThrow('Item not found');
  });
});
