/** The single-file IIFE build (zodal#116): self-contained, defines a global, works from a plain <script>. */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const file = join(__dirname, '../dist/zodal-store-localstorage.iife.js');

describe.skipIf(!existsSync(file))('dist/zodal-store-localstorage.iife.js', () => {
  it('is self-contained and defines ZodalStoreLocalStorage', async () => {
    const code = readFileSync(file, 'utf8');
    expect(code).not.toMatch(/\brequire\(|\bimport\s*\(|from\s*["']@zodal/);
    const store = new Map<string, string>();
    const ctx: any = {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
      queueMicrotask,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const draft = ctx.ZodalStoreLocalStorage.createLocalStorageProvider({ storageKey: 'draft' });
    await draft.upsert({ id: 'answers', q1: 'yes' });
    expect(JSON.parse(store.get('draft')!)).toEqual([{ id: 'answers', q1: 'yes' }]);
    expect(draft.status().backend).toBe('localStorage');
    expect(code.length).toBeLessThan(10_000);
  });
});
