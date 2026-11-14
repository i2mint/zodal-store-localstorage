export { createLocalStorageProvider } from './full.js';
export { createLocalCollection } from './provider.js';
export type {
  LocalStorageProviderOptions,
  LocalStorageProvider,
  QuarantineInfo,
  QueryFn,
  StorageStatusChannel,
} from './provider.js';
export { defaultQuery } from './query.js';
export { createMemoryStorage, probeLocalStorage } from './storage-area.js';
export type { StorageLike, StorageStatus } from './storage-area.js';
export { CorruptStorageError, StorageQuotaError, isQuotaExceededError } from './storage-errors.js';

// IndexedDB content provider (for browser bifurcation)
export { createIndexedDBContentProvider } from './indexeddb-content-provider.js';
export type { IndexedDBContentOptions } from './indexeddb-content-provider.js';

// Browser bifurcated: localStorage metadata + IndexedDB content
export { createBrowserBifurcatedProvider } from './browser-bifurcated.js';
export type { BrowserBifurcatedOptions } from './browser-bifurcated.js';

// Blob-only provider for cross-backend bifurcation
export { createIndexedDBBlobProvider } from './blob-provider.js';
export type { IndexedDBBlobProviderOptions } from './blob-provider.js';
