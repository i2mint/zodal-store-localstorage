# zodal-store-localstorage — Agent Guide

A zodal DataProvider adapter for browser localStorage.

## What This Is

This package implements `DataProvider<T>` from `@zodal/store`, storing items as a JSON array in browser localStorage. All query operations are client-side.

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
