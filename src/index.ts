export { createLocalStorageProvider } from './provider.js';
export type { LocalStorageProviderOptions, QuarantineInfo } from './provider.js';
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
