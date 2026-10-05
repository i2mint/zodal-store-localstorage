# zodal-store-localstorage — Agent Guide

A zodal DataProvider adapter for browser localStorage.

## What This Is

This package implements `DataProvider<T>` from `@zodal/store`, storing items as a JSON array in browser localStorage. All query operations are client-side.

- Client-side query through `applyQuery()` from `@zodal/store`
- `create` with an existing id rejects; `upsert` overwrites
- `createBrowserBifurcatedProvider` delegates listing to the localStorage provider; its bulk update/delete skip missing ids

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

`tests/contract.test.ts` runs the shared `@zodal/store/testing` conformance kit against the localStorage provider and the browser bifurcated provider with no content fields, and against the IndexedDB records provider over `fake-indexeddb`.
