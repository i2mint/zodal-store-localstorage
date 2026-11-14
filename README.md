# zodal-store-localstorage

zodal DataProvider adapter for browser localStorage.

Stores collection items as a JSON array under a single `localStorage` key. All query operations (sort, filter, search, pagination) are evaluated client-side.

## Install

```bash
npm install zodal-store-localstorage @zodal/core @zodal/store
```

## Quick Start

```typescript
import { createLocalStorageProvider } from 'zodal-store-localstorage';

const provider = createLocalStorageProvider<Project>({
  storageKey: 'my-projects',
  idField: 'id',
});

// Works with any zodal collection
const { data, total } = await provider.getList({
  filter: { field: 'status', operator: 'eq', value: 'active' },
  sort: [{ id: 'name', desc: false }],
  pagination: { page: 1, pageSize: 25 },
});
```

## Capabilities

| Capability | Supported |
|---|---|
| Create / Update / Delete | Yes |
| Bulk Update / Delete | Yes |
| Upsert | Yes |
| Server-side Sort | No (client-side) |
| Server-side Filter | No (client-side) |
| Server-side Search | No (client-side) |
| Server-side Pagination | No (client-side) |
| Real-time | No |

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `storageKey` | `string` | (required) | localStorage key to store items under |
| `idField` | `string` | `'id'` | Field name used as unique identifier |
| `searchFields` | `string[]` | all string fields | Fields to include in text search |
| `onCorrupt` | `'throw' \| (info) => void` | `'throw'` | What to do when the key holds text that is not a JSON array of objects (see below) |

## Records in IndexedDB (`createIndexedDBProvider`)

When a collection outgrows localStorage (one JSON string per collection, about 5 MB per origin), keep each item as its own IndexedDB record:

```ts
const notes = createIndexedDBProvider<Note>({ dbName: 'app', storeName: 'notes', allStores: ['notes', 'tags'] });
const tags = createIndexedDBProvider<Tag>({ dbName: 'app', storeName: 'tags', allStores: ['notes', 'tags'] });
```

IndexedDB creates object stores only when a database opens at a new version, so declare every store of a database (`allStores`) in each provider that opens it (a missing one bumps the version once). Writes resolve when their transaction commits; a failed write keeps nothing. The connection reopens after the browser closes it. Filter, search and sort run client-side (capabilities say so). Inject `indexedDB` (e.g. `fake-indexeddb`) in tests.

## A page with no build step

`dist/zodal-store-localstorage.iife.js` is the `./lite` provider in one self-contained file (about 4.5 kB, 2 kB gzipped), defining the global `ZodalStoreLocalStorage`. Load it from a CDN, or have a page generator inline it, so a generated static page keeps the same storage seam as an app:

```html
<script src="https://cdn.jsdelivr.net/npm/@zodal/store-localstorage/dist/zodal-store-localstorage.iife.js"></script>
<script>
  const drafts = ZodalStoreLocalStorage.createLocalStorageProvider({ storageKey: 'paces.draft' });
  drafts.upsert({ id: 'answers', ...collect() });          // survives a reload
  if (drafts.status().backend === 'memory') warn('This draft will not be kept');
</script>
```

It has everything the lite entry has (CRUD, upsert, pagination, the memory fallback, the status channel), and no query engine.

## When storage is missing, blocked or full

`createLocalStorageProvider` probes `localStorage` with a write. When it is missing (a sandboxed iframe), blocked (`SecurityError`) or refuses writes, the collection lives in memory for this page instead (`fallback: 'memory'`, the default; `'throw'` refuses), and the provider says so:

```ts
const views = createLocalStorageProvider({ storageKey: 'app.views' });
views.status();      // { backend: 'localStorage' | 'memory' | 'custom', fallbackReason?, unsavedWrite? }
views.onStatus((s) => s.backend === 'memory' && banner('Your views will not be kept after you leave'));
// a full storage area: the write rejects with StorageQuotaError and status().unsavedWrite is set
views.acknowledge(); // clears unsavedWrite once the user has been told
```

Inject any `Storage`-like area with `storage` (`sessionStorage`, `createMemoryStorage()` in tests); it is used as-is.

**A smaller entry.** `@zodal/store-localstorage/lite` is the same provider without the query engine (no `@zodal/store` runtime import): CRUD, upsert, pagination, the fallback and the status channel. A filter, search or sort throws, and its capabilities declare no filter operators.

## Unreadable storage is never overwritten

The whole collection lives under one key and every write rewrites it, so a read that treated unreadable text as an empty collection would let the next write destroy the collection. Instead, a missing key reads as an empty collection, and unreadable text (a partial write, a manual edit, another app using the same key, an array with an entry that is not an object) is handled by `onCorrupt`:

- `'throw'` (default): every read and write throws `CorruptStorageError` (with `storageKey` and the `raw` text) and the key is left exactly as it is.
- a callback: the text is moved to `${storageKey}.corrupt-${timestamp}`, the callback receives `{ storageKey, backupKey, error }` so the app can tell the user and offer a restore, and the collection continues empty. If the text cannot be moved aside (storage full), `CorruptStorageError` is thrown instead. The callback runs after the operation that found the corruption, so it may use the provider itself (e.g. to seed defaults); an error it throws is not caught.

```typescript
const provider = createLocalStorageProvider<Project>({
  storageKey: 'my-app-projects',
  onCorrupt: ({ backupKey }) => notify(`Your saved projects could not be read; a copy was kept under ${backupKey}.`),
});
```

A write refused because storage is full throws `StorageQuotaError`; the previously stored value is unchanged.

Since 0.3.0 reads no longer hide a storage area that cannot be used at all: where `localStorage` is blocked (a sandboxed iframe, storage disabled) or absent (server-side rendering), reads throw as writes always did. Create the provider only where `localStorage` exists.

## License

MIT
