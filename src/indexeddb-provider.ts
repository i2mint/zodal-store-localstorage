/**
 * IndexedDB records provider: a `DataProvider<T>` for items (not blobs) in IndexedDB
 * (zodal-store-localstorage#9).
 *
 * A local-first app outgrows localStorage (one JSON string per collection, ~5 MB per origin);
 * IndexedDB keeps each item as its own structured-cloned record.
 *
 * - `allStores`: IndexedDB creates object stores only when a database is opened at a new
 *   version, so every collection sharing a database must be declared together, by every provider
 *   opening it. A store missing from an existing database bumps the version once.
 * - Writes resolve when their transaction commits, not when the request succeeds.
 * - The connection reopens after the browser closes it (mobile browsers do, and so does a
 *   version change from another tab).
 * - Filter (`filterToFunction` from `@zodal/store`), search and sort run client-side; the
 *   capabilities say so.
 */

import type { DataProvider, GetListParams, GetListResult, ProviderCapabilities } from '@zodal/store';
import { defaultQuery } from './query.js';

export interface IndexedDBProviderOptions {
  /** Database name. Default: `'zodal'`. */
  dbName?: string;
  /** This collection's object store. */
  storeName: string;
  /**
   * Every object store in this database (this one is added if missing). Declare the same list
   * in every provider sharing the database.
   */
  allStores?: string[];
  /** Field holding the id (the object store's key path). Default: `'id'`. */
  idField?: string;
  /** Fields searched by `getList({ search })`. Default: every string field. */
  searchFields?: string[];
  /** The `IDBFactory`. Default: `globalThis.indexedDB` (inject `fake-indexeddb` in tests). */
  indexedDB?: IDBFactory;
}

function promisify<R>(req: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Create a records provider over one IndexedDB object store. */
export function createIndexedDBProvider<T extends Record<string, any>>(options: IndexedDBProviderOptions): DataProvider<T> {
  const { dbName = 'zodal', storeName, idField = 'id', searchFields } = options;
  const stores = [...new Set([...(options.allStores ?? []), storeName])];
  const factory = options.indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) throw new Error('createIndexedDBProvider: no IndexedDB here (pass options.indexedDB)');
  let nextId = Date.now();
  let dbPromise: Promise<IDBDatabase> | undefined;

  const open = (version?: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = version === undefined ? factory.open(dbName) : factory.open(dbName, version);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of stores) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: idField });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error(`IndexedDB "${dbName}" upgrade is blocked by another open tab`));
    });

  async function connect(): Promise<IDBDatabase> {
    let db = await open();
    const missing = stores.filter((n) => !db.objectStoreNames.contains(n));
    if (missing.length) {
      const next = db.version + 1;
      db.close();
      db = await open(next);
    }
    // Reconnect on the next call after the browser (or another tab's upgrade) closes us.
    db.onclose = () => {
      dbPromise = undefined;
    };
    db.onversionchange = () => {
      db.close();
      dbPromise = undefined;
    };
    return db;
  }

  const getDb = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = connect().catch((err) => {
        dbPromise = undefined;
        throw err;
      });
    }
    return dbPromise;
  };

  /** Run `body` in one transaction; resolve with its result once the transaction commits. */
  async function inTx<R>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => Promise<R>): Promise<R> {
    const db = await getDb();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, mode);
    } catch (err) {
      // InvalidStateError: the connection was closing; retry once on a fresh one.
      dbPromise = undefined;
      tx = (await getDb()).transaction(storeName, mode);
    }
    const done = committed(tx);
    let result: R;
    try {
      result = await body(tx.objectStore(storeName));
    } catch (err) {
      // Nothing of a failed body is kept: abort (if still active), and do not leave the
      // transaction's own failure unhandled.
      done.catch(() => {});
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      throw err;
    }
    await done;
    return result;
  }

  const idOf = (item: Record<string, unknown>) => String(item[idField]);

  async function readAll(): Promise<T[]> {
    return inTx('readonly', (s) => promisify(s.getAll() as IDBRequest<T[]>));
  }

  return {
    async getList(params: GetListParams): Promise<GetListResult<T>> {
      return defaultQuery(await readAll(), params, searchFields ? { searchFields } : {});
    },

    async getOne(id: string): Promise<T> {
      const item = await inTx('readonly', (s) => promisify(s.get(id) as IDBRequest<T | undefined>));
      if (item === undefined) throw new Error(`Item not found: ${id}`);
      return item;
    },

    async create(data: Partial<T>): Promise<T> {
      const item = { ...data, [idField]: (data as any)[idField] ?? String(nextId++) } as T;
      // `add` rejects (ConstraintError) when the id exists.
      await inTx('readwrite', (s) => promisify(s.add(item)));
      return { ...item };
    },

    async update(id: string, data: Partial<T>): Promise<T> {
      return inTx('readwrite', async (s) => {
        const existing = (await promisify(s.get(id))) as T | undefined;
        if (existing === undefined) throw new Error(`Item not found: ${id}`);
        const next = { ...existing, ...data, [idField]: existing[idField] } as T;
        await promisify(s.put(next));
        return { ...next };
      });
    },

    async updateMany(ids: string[], data: Partial<T>): Promise<T[]> {
      return inTx('readwrite', async (s) => {
        const out: T[] = [];
        for (const id of ids) {
          const existing = (await promisify(s.get(id))) as T | undefined;
          if (existing === undefined) continue;
          const next = { ...existing, ...data, [idField]: existing[idField] } as T;
          await promisify(s.put(next));
          out.push({ ...next });
        }
        return out;
      });
    },

    async delete(id: string): Promise<void> {
      await inTx('readwrite', async (s) => {
        if ((await promisify(s.count(id))) === 0) throw new Error(`Item not found: ${id}`);
        await promisify(s.delete(id));
      });
    },

    async deleteMany(ids: string[]): Promise<void> {
      await inTx('readwrite', async (s) => {
        for (const id of ids) await promisify(s.delete(id));
      });
    },

    async upsert(data: T): Promise<T> {
      if (data[idField] === undefined) throw new Error(`upsert needs an id (${idField})`);
      await inTx('readwrite', (s) => promisify(s.put({ ...data })));
      return { ...data, [idField]: idOf(data) } as T;
    },

    getCapabilities(): ProviderCapabilities {
      return {
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canBulkUpdate: true,
        canBulkDelete: true,
        canUpsert: true,
        serverSort: false,
        serverFilter: false,
        serverSearch: false,
        serverPagination: false,
      };
    },
  };
}
