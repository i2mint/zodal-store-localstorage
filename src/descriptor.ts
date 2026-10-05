/**
 * Provider descriptors for this package: each browser-storage provider described
 * as data, so an app, a playground or an agent can list it in a backend menu,
 * render its options, check it can run here, and create it by name with
 * `createFromDescriptor` from `@zodal/store/descriptor`.
 *
 * - `descriptor` (`localStorage`): items as a JSON array under one localStorage key.
 * - `browserBifurcatedDescriptor` (`browserBifurcated`): localStorage metadata plus
 *   IndexedDB content.
 * - `indexedDBBlobDescriptor` (`indexedDBBlob`): content only, in IndexedDB; the
 *   content side of a bifurcation. (`createIndexedDBContentProvider` is the same
 *   provider with other database defaults, so it gets no separate menu entry.)
 *
 * `supports()` is a real feature check: private browsing can expose
 * `localStorage` and then throw on write. None of the options is a secret or a
 * live object. `create` imports its provider module lazily.
 */

import { z } from 'zod';
import { defineProviderDescriptor } from '@zodal/store/descriptor';
import type { ProviderCapabilities } from '@zodal/store';

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
  options: z.object({ storageKey, idField, searchFields }),
  capabilities: {
    canCreate: true, canUpdate: true, canDelete: true,
    canBulkUpdate: true, canBulkDelete: true, canUpsert: true,
    ...CLIENT_SIDE,
  },
  create: async (o) => (await import('./provider.js')).createLocalStorageProvider(o),
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
