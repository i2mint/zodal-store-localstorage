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
| `onCorrupt` | `'throw' \| (info) => void` | `'throw'` | What to do when the key holds text that is not a JSON array (see below) |

## Unreadable storage is never overwritten

The whole collection lives under one key and every write rewrites it, so a read that treated unreadable text as an empty collection would let the next write destroy the collection. Instead, a missing key reads as an empty collection, and unreadable text (a partial write, a manual edit, another app using the same key) is handled by `onCorrupt`:

- `'throw'` (default): every read and write throws `CorruptStorageError` (with `storageKey` and the `raw` text) and the key is left exactly as it is.
- a callback: the text is moved to `${storageKey}.corrupt-${timestamp}`, the callback receives `{ storageKey, backupKey, error }` so the app can tell the user and offer a restore, and the collection continues empty. If the text cannot be moved aside (storage full), `CorruptStorageError` is thrown instead.

```typescript
const provider = createLocalStorageProvider<Project>({
  storageKey: 'my-app-projects',
  onCorrupt: ({ backupKey }) => notify(`Your saved projects could not be read; a copy was kept under ${backupKey}.`),
});
```

A write refused because storage is full throws `StorageQuotaError`; the previously stored value is unchanged.

## License

MIT
