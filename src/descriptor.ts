/**
 * Provider descriptors for this package: each browser-storage provider described
 * as data, so an app, a playground or an agent can list it in a backend menu,
 * render its options, check it can run here, and create it by name with
 * `createFromDescriptor` from `@zodal/store/descriptor`.
 *
 * - `descriptor` (`localStorage`): items as a JSON array under one localStorage key.
 * - `browserBifurcatedDescriptor` (`browserBifurcated`): localStorage metadata plus
 *   IndexedDB content.
 * - `indexedDBDescriptor` (`indexedDB`): items as records in one IndexedDB object
 *   store (`createIndexedDBProvider`).
 * - `indexedDBBlobDescriptor` (`indexedDBBlob`): content only, in IndexedDB; the
 *   content side of a bifurcation. (`createIndexedDBContentProvider` is the same
 *   provider with other database defaults, so it gets no separate menu entry.)
 *
 * `supports()` is a real feature check: private browsing can expose
 * `localStorage` and then throw on write. (`createLocalStorageProvider` itself
 * falls back to memory by default, and reports it through `status()`; the menu
 * offers it only where it persists.) None of the options is a secret.
 *
 * **Live options** (supplied in code, never shared or exported): `storage` (an
 * injected `StorageLike`), `onCorrupt` (as a whole: its value is `'throw'` or a
 * callback), `indexedDB` (an injected `IDBFactory`). `create` imports its provider
 * module lazily.
 */

import { z } from 'zod';
import { defineProviderDescriptor } from '@zodal/store/descriptor';
import type { ProviderCapabilities } from '@zodal/store';
import type { StorageLike } from './storage-area.js';

const MODULE = '@zodal/store-localstorage';
const PROBE_KEY = '__zodal_store_localstorage_probe__';

/** Can this page write to localStorage right now? (Exists, and a write does not throw.) */
function localStorageWritable(): boolean {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) return false;
    storage.setItem(PROBE_KEY, PROBE_KEY);
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Is an IndexedDB factory available here? */
function indexedDBAvailable(): boolean {
  try {
    return typeof (globalThis as { indexedDB?: IDBFactory }).indexedDB?.open === 'function';
  } catch {
    return false;
  }
}

const storageKey = z.string().min(1).meta({ description: 'localStorage key the items are stored under.' });
const idField = z.string().min(1).optional().meta({ description: "Field used as the unique identifier. Default: 'id'." });
const searchFields = z.array(z.string()).optional().meta({ description: 'Fields searched by text search. Default: every string field.' });
const onCorrupt = z
  .union([z.literal('throw'), z.custom<(info: unknown) => void>((v) => typeof v === 'function')])
  .optional()
  .meta({
    serializable: false,
    description: "Unreadable stored text: 'throw' (default) refuses every read and write; a callback gets it moved to a backup key and the collection continues empty. Supply in code.",
  });
const contentFields = z.array(z.string()).meta({ description: 'Fields stored as content in IndexedDB.' });
const dbName = (fallback: string) =>
  z.string().min(1).optional().meta({ description: `IndexedDB database name. Default: '${fallback}'.` });
const storeName = (fallback: string) =>
  z.string().min(1).optional().meta({ description: `IndexedDB object store name. Default: '${fallback}'.` });

/** Everything is evaluated in the page: browser storage does no querying. */
const CLIENT_SIDE: Pick<ProviderCapabilities, 'serverSort' | 'serverFilter' | 'serverSearch' | 'serverPagination'> = {
  serverSort: false,
  serverFilter: false,
  serverSearch: false,
  serverPagination: false,
};

/** Items as a JSON array under one localStorage key (`createLocalStorageProvider`). */
export const descriptor = defineProviderDescriptor({
  name: 'localStorage',
  label: 'Browser localStorage',
  description: "Items as a JSON array under one key in this browser's localStorage.",
  source: { module: MODULE, export: 'descriptor' },
  runtime: 'browser',
  supports: localStorageWritable,
  options: z.object({
    storageKey,
    idField,
    searchFields,
    onCorrupt,
    storage: z.custom<StorageLike>((v) => typeof v === 'object' && v !== null).optional()
      .meta({ description: 'The storage area (a StorageLike: sessionStorage, an in-memory area...). Default: localStorage after a probe write. Supply in code.' }),
    fallback: z.enum(['memory', 'throw']).optional()
      .meta({ description: "When localStorage cannot be used: 'memory' (default; nothing survives a reload, status() says so) or 'throw'." }),
  }),
  capabilities: {
    // Content-version conditional writes; declared structurally, as the provider does.
    ...({ versioned: true } as Partial<ProviderCapabilities>),
    canCreate: true, canUpdate: true, canDelete: true,
    canBulkUpdate: true, canBulkDelete: true, canUpsert: true,
    ...CLIENT_SIDE,
  },
  create: async (o) => (await import('./full.js')).createLocalStorageProvider(o),
});

/**
 * localStorage metadata plus IndexedDB content (`createBrowserBifurcatedProvider`).
 * Already metadata + content in one provider, so it is marked `composite` and is
 * not offered as a child of `bifurcatedDescriptor`.
 */
export const browserBifurcatedDescriptor = defineProviderDescriptor({
  name: 'browserBifurcated',
  label: 'Browser localStorage + IndexedDB',
  description: 'Queryable fields in localStorage, content fields in IndexedDB.',
  source: { module: MODULE, export: 'browserBifurcatedDescriptor' },
  runtime: 'browser',
  composite: true,
  supports: () => localStorageWritable() && indexedDBAvailable(),
  options: z.object({
    storageKey,
    contentFields,
    idField,
    searchFields,
    dbName: dbName('zodal-content'),
    storeName: storeName('content'),
    listStrategy: z.enum(['reference', 'omit']).optional().meta({ description: "How content fields appear in lists. Default: 'reference'." }),
    onCorrupt,
  }),
  capabilities: (o) => ({
    canCreate: true, canUpdate: true, canDelete: true,
    canBulkUpdate: true, canBulkDelete: true, canUpsert: false,
    ...CLIENT_SIDE,
    bifurcated: true,
    contentFields: o.contentFields,
  }),
  create: async (o) => (await import('./browser-bifurcated.js')).createBrowserBifurcatedProvider(o),
});

/** Items as records in one IndexedDB object store (`createIndexedDBProvider`). */
export const indexedDBDescriptor = defineProviderDescriptor({
  name: 'indexedDB',
  label: 'Browser IndexedDB (records)',
  description: "Items as records in one object store of this browser's IndexedDB; queries run in the page.",
  source: { module: MODULE, export: 'indexedDBDescriptor' },
  runtime: 'browser',
  supports: indexedDBAvailable,
  options: z.object({
    storeName: z.string().min(1).meta({ description: "This collection's object store." }),
    dbName: dbName('zodal'),
    allStores: z.array(z.string()).optional().meta({ description: 'Every object store in this database (declare the same list in every provider sharing it).' }),
    idField,
    searchFields,
    indexedDB: z.custom<IDBFactory>((v) => typeof v === 'object' && v !== null).optional()
      .meta({ description: 'The IDBFactory. Default: globalThis.indexedDB. Supply in code (e.g. fake-indexeddb in tests).' }),
  }),
  capabilities: {
    canCreate: true, canUpdate: true, canDelete: true,
    canBulkUpdate: true, canBulkDelete: true, canUpsert: true,
    ...CLIENT_SIDE,
  },
  create: async (o) => (await import('./indexeddb-provider.js')).createIndexedDBProvider(o),
});

/** Content only, in IndexedDB (`createIndexedDBBlobProvider`): the content side of a bifurcation. */
export const indexedDBBlobDescriptor = defineProviderDescriptor({
  name: 'indexedDBBlob',
  label: 'Browser IndexedDB (content)',
  description: 'Content fields only, as IndexedDB entries keyed {id}/{field}; pair it with a metadata provider.',
  source: { module: MODULE, export: 'indexedDBBlobDescriptor' },
  runtime: 'browser',
  supports: indexedDBAvailable,
  options: z.object({
    contentFields,
    idField,
    dbName: dbName('zodal-blobs'),
    storeName: storeName('blobs'),
  }),
  capabilities: {
    canCreate: true, canUpdate: true, canDelete: true,
    canBulkUpdate: true, canBulkDelete: true, canUpsert: false,
    ...CLIENT_SIDE,
  },
  create: async (o) => (await import('./blob-provider.js')).createIndexedDBBlobProvider(o),
});
