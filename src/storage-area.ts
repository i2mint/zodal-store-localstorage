/**
 * Where a collection is kept: an injectable `Storage`-like area, a writable probe with an
 * in-memory fallback, and a status channel (zodal-store-localstorage#11).
 *
 * A page that must keep working when storage is missing (a sandboxed iframe, a privacy mode),
 * blocked (`SecurityError` on access) or full needs to know which of those it is in, and to tell
 * the user when a write was not kept. Nothing here depends on the query engine.
 */

import type { StorageQuotaError } from './storage-errors.js';

/** The part of the Web Storage API the provider uses (`localStorage`, `sessionStorage`, a test double). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Which storage a provider is using, and whether a write was lost. */
export interface StorageStatus {
  /** `'localStorage'`, `'memory'` (the fallback: nothing survives a reload) or `'custom'` (injected). */
  backend: 'localStorage' | 'memory' | 'custom';
  /** Why the fallback is in use (absent unless `backend` is `'memory'` by fallback). */
  fallbackReason?: string;
  /** The last write that was not kept, until `acknowledge()`. */
  unsavedWrite?: StorageQuotaError;
}

/** A Map with the `StorageLike` shape (the fallback, and handy in tests). */
export function createMemoryStorage(): StorageLike & { readonly size: number } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    get size() {
      return map.size;
    },
  };
}

const PROBE_KEY = '__zodal_storage_probe__';

/**
 * `globalThis.localStorage` when it exists and accepts a write, else `undefined` and the reason.
 * Reading the property itself can throw (`SecurityError` with storage blocked), so it is guarded.
 */
export function probeLocalStorage(): { storage: StorageLike } | { storage: undefined; reason: string } {
  let ls: StorageLike | undefined;
  try {
    ls = (globalThis as { localStorage?: StorageLike }).localStorage;
  } catch (err) {
    return { storage: undefined, reason: `localStorage is blocked (${(err as Error)?.name ?? 'error'})` };
  }
  if (!ls) return { storage: undefined, reason: 'localStorage is not available here' };
  try {
    ls.setItem(PROBE_KEY, '1');
    ls.removeItem(PROBE_KEY);
  } catch (err) {
    return { storage: undefined, reason: `localStorage refuses writes (${(err as Error)?.name ?? 'error'})` };
  }
  return { storage: ls };
}

/** A status value and its listeners. */
export function createStatusChannel(initial: StorageStatus) {
  let status = initial;
  const listeners = new Set<(s: StorageStatus) => void>();
  const set = (next: StorageStatus) => {
    status = next;
    for (const l of [...listeners]) l(status);
  };
  return {
    get: () => status,
    set,
    subscribe(listener: (s: StorageStatus) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
