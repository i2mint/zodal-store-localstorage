# zodal-store-localstorage — Agent Guide

A zodal DataProvider adapter for browser localStorage.

## What This Is

This package implements `DataProvider<T>` from `@zodal/store`, storing items as a JSON array in browser localStorage. All query operations are client-side.

## Skills

Before making changes, read the zodal store adapter skill for patterns and conventions:
- **Store adapter guide**: `/Users/thorwhalen/Dropbox/py/proj/i/zodal/.claude/skills/zodal-store-adapter/SKILL.md`
- **zodal architecture**: `/Users/thorwhalen/Dropbox/py/proj/i/zodal/docs/architecture.md`

## Build & Test

```bash
pnpm install
pnpm build
pnpm test
```
