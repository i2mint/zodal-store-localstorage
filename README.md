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

## License

MIT
