/**
 * IndexedDB Blob Provider: Pure content-only storage for cross-backend bifurcation.
 *
 * Stores each content field as an IndexedDB entry keyed by `{id}/{field}`.
 *
 * Designed to be used as the `contentProvider` argument to
 * `createBifurcatedProvider()` from @zodal/store, paired with any
 * metadata provider (localStorage, in-memory, etc.).
 *
 * This is a thin wrapper around `createIndexedDBContentProvider` with
 * a consistent naming convention matching the other blob providers.
 *
 * @example
 * ```typescript
 * import { createBifurcatedProvider } from '@zodal/store';
 * import { createLocalStorageProvider, createIndexedDBBlobProvider } from '@zodal/store-localstorage';
 *
 * const provider = createBifurcatedProvider({
 *   metadataProvider: createLocalStorageProvider({ storageKey: 'docs' }),
 *   contentProvider: createIndexedDBBlobProvider({
 *     contentFields: ['attachment'],
 *   }),
 *   contentFields: ['attachment'],
 * });
 * ```
 */

import type { DataProvider } from '@zodal/store';
import { createIndexedDBContentProvider } from './indexeddb-content-provider.js';

export interface IndexedDBBlobProviderOptions {
  /** Content field names this provider manages. */
  contentFields: string[];
  /** Field used as unique identifier. Default: 'id'. */
  idField?: string;
  /** IndexedDB database name. Default: 'zodal-blobs'. */
  dbName?: string;
  /** IndexedDB object store name. Default: 'blobs'. */
  storeName?: string;
}

export function createIndexedDBBlobProvider<T extends Record<string, any>>(
  options: IndexedDBBlobProviderOptions,
): DataProvider<T> {
  return createIndexedDBContentProvider<T>({
    contentFields: options.contentFields,
    idField: options.idField,
    dbName: options.dbName ?? 'zodal-blobs',
    storeName: options.storeName ?? 'blobs',
  });
}
