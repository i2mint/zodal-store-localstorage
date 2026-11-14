/**
 * `@zodal/store-localstorage/lite`: the localStorage collection without the query engine
 * (no `@zodal/store` runtime import), for pages with a byte budget (zodal-store-localstorage#11).
 *
 * `getList` supports pagination only; a filter, search or sort throws, saying where to get them.
 * Everything else (CRUD, upsert, injectable storage, the memory fallback, the status channel,
 * corrupt-storage handling) is the same as the main entry.
 */

export { createLocalCollection as createLocalStorageProvider, WriteConflictError } from './provider.js';
export type {
  LocalStorageProvider,
  LocalStorageProviderOptions,
  QuarantineInfo,
  StorageStatusChannel,
} from './provider.js';
export { createMemoryStorage, probeLocalStorage } from './storage-area.js';
export type { StorageLike, StorageStatus } from './storage-area.js';
export { CorruptStorageError, StorageQuotaError, isQuotaExceededError } from './storage-errors.js';
