# zodal-store-localstorage — Agent Guide

A zodal DataProvider adapter for browser localStorage.

## What This Is

This package implements `DataProvider<T>` from `@zodal/store`, storing items as a JSON array in browser localStorage. All query operations are client-side.

- Client-side query through `applyQuery()` from `@zodal/store`
- `create` with an existing id rejects; `upsert` overwrites
- A stored value that is not a JSON array throws `LocalStorageCorruptError` on every read and write and is never overwritten (only a missing or empty key reads as `[]`)
- `createBrowserBifurcatedProvider` delegates listing to the localStorage provider; its bulk update/delete skip missing ids
- `src/descriptor.ts` exports a provider descriptor per menu entry (`descriptor` = `localStorage`, `browserBifurcatedDescriptor` = `browserBifurcated`, `indexedDBBlobDescriptor` = `indexedDBBlob`; `createIndexedDBContentProvider` has none, being the blob provider with other defaults), built with `defineProviderDescriptor` from `@zodal/store/descriptor`. `supports()` probes a real localStorage write / an `indexedDB` factory. Keep each options schema in step with its factory's options (validation strips undeclared keys); `create` imports the provider module lazily

## Skills

Before making changes, read the zodal store adapter skill for patterns and conventions:
- **Store adapter guide**: https://github.com/i2mint/zodal/tree/main/.claude/skills/zodal-store-adapter
- **zodal architecture**: https://github.com/i2mint/zodal/tree/main/docs/architecture.md

## Build & Test

```bash
pnpm install
pnpm build
pnpm test
```

`tests/contract.test.ts` runs the shared `@zodal/store/testing` conformance kit against the localStorage provider and the browser bifurcated provider with no content fields (the IndexedDB providers are not exercised: jsdom has no IndexedDB). `tests/descriptor.test.ts` runs the kit again through `createFromDescriptor`, and checks `supports()`, validation errors, secret/live paths, described vs. reported capabilities, and `bifurcatedDescriptor` composition.
