# zodal-store-localstorage

zodal DataProvider adapter for browser localStorage.

Stores collection items as a JSON array under a single `localStorage` key. All query operations (sort, filter, search, pagination) are evaluated client-side.

## Install

```bash
npm install @zodal/store-localstorage @zodal/core @zodal/store zod
```

## Quick Start

```typescript
import { createLocalStorageProvider } from '@zodal/store-localstorage';

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

## Use from a menu

Each provider is also exported as a descriptor (`@zodal/store` ≥ 0.2.2): its name, runtime, options as a Zod schema, capabilities and a `supports()` check, so an app, a playground or an agent can list it, check it can run here, and create it by name. `create` loads the provider module only when called.

```typescript
import { createFromDescriptor, isProviderSupported } from '@zodal/store/descriptor';
import { descriptor, browserBifurcatedDescriptor, indexedDBBlobDescriptor } from '@zodal/store-localstorage';

// 'localStorage', 'browserBifurcated', 'indexedDBBlob'; runtime 'browser'
if (await isProviderSupported(descriptor)) {
  const provider = await createFromDescriptor(descriptor, { storageKey: 'my-projects' });
}
```

`supports()` tries a real write (private browsing can expose `localStorage` and then throw); the IndexedDB descriptors check for `indexedDB`. No option is a secret or a live object, so options can be saved and shared as they are. `browserBifurcatedDescriptor` is marked `composite`; for a cross-backend split, give `indexedDBBlobDescriptor` to `bifurcatedDescriptor` from `@zodal/store/descriptor`.

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
