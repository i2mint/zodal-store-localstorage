/**
 * IndexedDB Content Provider: Browser-side content storage.
 *
 * Stores content (Blob, ArrayBuffer, strings) in IndexedDB.
 * Designed as the content side of a browser bifurcation pair:
 *   - localStorage or IndexedDB for metadata (small, structured)
 *   - IndexedDB for content (larger binary objects, up to hundreds of MB)
 *
 * Each item's content is stored as entries in an IndexedDB object store,
 * keyed by `{id}/{field}`.
 */

import type { DataProvider, GetListParams, GetListResult } from '@zodal/store';
import type { ProviderCapabilities } from '@zodal/store';

export interface IndexedDBContentOptions {
  /** IndexedDB database name. Default: 'zodal-content'. */
  dbName?: string;
  /** Object store name. Default: 'content'. */
  storeName?: string;
  /** Content field names. */
  contentFields: string[];
  /** ID field. Default: 'id'. */
  idField?: string;
}

function openDB(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db: IDBDatabase, storeName: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, storeName: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Create a content-only DataProvider backed by IndexedDB.
 *
 * This is a specialized provider for content fields. It implements
 * the DataProvider interface minimally — getList returns empty,
 * getOne returns content fields only. Designed to be composed via
 * createBifurcatedProvider() with a metadata provider.
 *
 * For a ready-made browser bifurcation, use createBrowserBifurcatedProvider().
 */
export function createIndexedDBContentProvider<T extends Record<string, any>>(
  options: IndexedDBContentOptions,
): DataProvider<T> {
  const {
    contentFields,
    dbName = 'zodal-content',
    storeName = 'content',
    idField = 'id',
  } = options;
  const contentSet = new Set(contentFields);
  let dbPromise: Promise<IDBDatabase> | null = null;

  function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) dbPromise = openDB(dbName, storeName);
    return dbPromise;
  }

  function contentKey(id: string, field: string): string {
    return `${id}/${field}`;
  }

  return {
    async getList(): Promise<GetListResult<T>> {
      // Content-only provider — metadata provider handles listing
      return { data: [], total: 0 };
    },

    async getOne(id: string): Promise<T> {
      const db = await getDB();
      const result: Record<string, any> = { [idField]: id };
      for (const field of contentFields) {
        result[field] = await idbGet(db, storeName, contentKey(id, field));
      }
      return result as T;
    },

    async create(data: Partial<T>): Promise<T> {
      const db = await getDB();
      const id = String((data as any)[idField]);
      for (const field of contentFields) {
        if ((data as any)[field] !== undefined) {
          await idbPut(db, storeName, contentKey(id, field), (data as any)[field]);
        }
      }
      return { [idField]: id } as T;
    },

    async update(id: string, data: Partial<T>): Promise<T> {
      const db = await getDB();
      for (const [key, value] of Object.entries(data)) {
        if (contentSet.has(key) && value !== undefined) {
          await idbPut(db, storeName, contentKey(id, key), value);
        }
      }
      return { [idField]: id } as T;
    },

    async updateMany(ids: string[], data: Partial<T>): Promise<T[]> {
      return Promise.all(ids.map(id => this.update(id, data)));
    },

    async delete(id: string): Promise<void> {
      const db = await getDB();
      for (const field of contentFields) {
        await idbDelete(db, storeName, contentKey(id, field));
      }
    },

    async deleteMany(ids: string[]): Promise<void> {
      await Promise.all(ids.map(id => this.delete(id)));
    },

    getCapabilities(): ProviderCapabilities {
      return {
        canCreate: true, canUpdate: true, canDelete: true,
        canBulkUpdate: true, canBulkDelete: true, canUpsert: false,
        serverSort: false, serverFilter: false, serverSearch: false, serverPagination: false,
      };
    },
  };
}
