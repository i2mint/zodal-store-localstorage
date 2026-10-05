/**
 * The localStorage collection, without a query engine.
 *
 * Stores collection items as a JSON array under a single key of a `Storage`-like area. All query
 * operations are client-side, done by the `query` function the caller passes: `index.ts` passes
 * one built on `applyQuery` from `@zodal/store`; the `./lite` entry passes none, so a page
 * with a byte budget does not pull the query engine in (zodal-store-localstorage#11).
 */

import type { DataProvider, GetListParams, GetListResult, ProviderCapabilities } from '@zodal/store';
import { CorruptStorageError, StorageQuotaError, isQuotaExceededError } from './storage-errors.js';
import { createMemoryStorage, createStatusChannel, probeLocalStorage } from './storage-area.js';
import type { StorageLike, StorageStatus } from './storage-area.js';

/**
 * A conditional write lost (zodal#118). Named `WriteConflict` so `isWriteConflict` from
 * `@zodal/store` recognises it; declared here because the `@zodal/store` on npm predates it.
 */
export class WriteConflictError extends Error {
  override name = 'WriteConflict';
  constructor(
    readonly id: string,
    readonly expected: string | number,
    readonly actual: string | number | undefined,
  ) {
    super(
      actual === undefined
        ? `Write conflict on ${JSON.stringify(id)}: it was deleted since version ${JSON.stringify(expected)} was read`
        : `Write conflict on ${JSON.stringify(id)}: expected version ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
    );
  }
}

/** JSON with sorted object keys, so key order does not change a version. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/** A content version: FNV-1a (64-bit, as two 32-bit halves) of the item's stable JSON. */
function contentVersion(item: unknown): string {
  const text = stableJson(item);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `v${h1.toString(36)}${h2.toString(36)}`;
}

/** Applies a `getList`'s filter, search, sort and pagination to the stored items. */
export type QueryFn<T> = (items: T[], params: GetListParams, options: { searchFields?: string[] }) => GetListResult<T>;

/** What `onCorrupt` is told after an unreadable collection has been moved aside. */
export interface QuarantineInfo {
  /** The collection's key; it no longer exists, so the collection now reads as empty. */
  storageKey: string;
  /** The key now holding the unreadable text, exactly as it was stored. */
  backupKey: string;
  /** Why the text could not be read. */
  error: CorruptStorageError;
}

export interface LocalStorageProviderOptions {
  /** localStorage key to store items under. */
  storageKey: string;
  /** Field name used as the unique identifier. Default: 'id'. */
  idField?: string;
  /** Fields to include in text search. Default: all string-valued fields. */
  searchFields?: string[];
  /**
   * What to do when the stored text is not a JSON array. The stored text is never overwritten.
   * - `'throw'` (default): every read and write throws `CorruptStorageError`, leaving the key as it is.
   * - a function: the text is moved to `${storageKey}.corrupt-${timestamp}`, the function is told
   *   where (so the app can tell the user and offer a restore), and the collection continues empty.
   *   If the text cannot be moved (e.g. storage is full), `CorruptStorageError` is thrown instead.
   *   The function runs in a microtask, after the operation that found the corruption has finished,
   *   so it may itself use the provider (e.g. to seed defaults); an error it throws is not caught.
   */
  onCorrupt?: 'throw' | ((info: QuarantineInfo) => void);
  /**
   * The storage area. Default: `globalThis.localStorage`, after a probe write; when it is missing,
   * blocked or refuses writes, see `fallback`. An injected area is used as-is (no probe).
   */
  storage?: StorageLike;
  /**
   * When `localStorage` cannot be used: `'memory'` (default) keeps the collection in memory for
   * this page (nothing survives a reload) and says so through `status()`; `'throw'` refuses.
   */
  fallback?: 'memory' | 'throw';
}

/** The provider's storage status channel (see {@link StorageStatus}). */
export interface StorageStatusChannel {
  /** Which storage is in use, and whether a write was not kept. */
  status(): StorageStatus;
  /** Listen to status changes (fallback in use, a write not kept, acknowledged); returns an unsubscribe. */
  onStatus(listener: (status: StorageStatus) => void): () => void;
  /** Clear `unsavedWrite` once the user has been told. */
  acknowledge(): void;
}

/** The provider type: a `DataProvider` plus the storage status channel. */
export type LocalStorageProvider<T> = DataProvider<T> &
  StorageStatusChannel & {
    /** Insert or replace several items in one write (`DataProvider.upsertMany`). */
    upsertMany(data: T[]): Promise<T[]>;
    /** An item with its content version (`DataProvider.getVersioned`). */
    getVersioned(id: string): Promise<{ item: T; version: string }>;
    /** Merge `data` only if the item is still at `expected`; else a `WriteConflictError`. */
    updateIfVersion(id: string, data: Partial<T>, expected: string | number): Promise<{ item: T; version: string }>;
    /** Delete only if the item is still at `expected`; else a `WriteConflictError`. */
    deleteIfVersion(id: string, expected: string | number): Promise<void>;
  };

/** Build the collection with a given query function (or none: filter, search and sort then throw). */
export function createLocalCollection<T extends Record<string, any>>(
  options: LocalStorageProviderOptions,
  query?: QueryFn<T>,
): LocalStorageProvider<T> {
  const { storageKey, searchFields } = options;
  const idField = options.idField ?? 'id';
  const onCorrupt = options.onCorrupt ?? 'throw';
  let nextId = Date.now();

  let initial: StorageStatus;
  let localStorage: StorageLike;
  if (options.storage) {
    localStorage = options.storage;
    initial = { backend: 'custom' };
  } else {
    const probe = probeLocalStorage();
    if (probe.storage) {
      localStorage = probe.storage;
      initial = { backend: 'localStorage' };
    } else if ((options.fallback ?? 'memory') === 'memory') {
      localStorage = createMemoryStorage();
      initial = { backend: 'memory', fallbackReason: probe.reason };
    } else {
      throw new Error(`createLocalStorageProvider: ${probe.reason} (fallback: 'throw')`);
    }
  }
  const channel = createStatusChannel(initial);

  function isRecord(entry: unknown): boolean {
    return typeof entry === 'object' && entry !== null && !Array.isArray(entry);
  }

  /** A missing or empty key is an empty collection; unreadable text goes to `handleCorrupt`, never to `[]`. */
  function readItems(): T[] {
    const raw = localStorage.getItem(storageKey);
    if (raw == null || raw === '') return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      return handleCorrupt(new CorruptStorageError(storageKey, raw, { cause }));
    }
    // An entry that is not an object (`[1, null, {...}]`) is someone else's data under this key too.
    if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
      return handleCorrupt(new CorruptStorageError(storageKey, raw));
    }
    return parsed as T[];
  }

  function handleCorrupt(error: CorruptStorageError): T[] {
    if (onCorrupt === 'throw') throw error;
    const report = onCorrupt;
    const backupKey = freeBackupKey();
    try {
      localStorage.setItem(backupKey, error.raw);
    } catch (cause) {
      // Could not move the text aside, so it must stay where it is: refuse, as 'throw' would.
      throw new CorruptStorageError(storageKey, error.raw, { cause });
    }
    // Remove only the text that was backed up; anything written since (another tab) stays.
    if (localStorage.getItem(storageKey) === error.raw) localStorage.removeItem(storageKey);
    // Report after the current operation has written, so a write from the callback is not overwritten.
    queueMicrotask(() => report({ storageKey, backupKey, error }));
    return [];
  }

  /** `${storageKey}.corrupt-${timestamp}`, suffixed if that key is taken, so no earlier backup is overwritten. */
  function freeBackupKey(): string {
    const base = `${storageKey}.corrupt-${Date.now()}`;
    let key = base;
    for (let n = 1; localStorage.getItem(key) !== null; n++) key = `${base}-${n}`;
    return key;
  }

  function writeItems(items: T[]): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (cause) {
      if (isQuotaExceededError(cause)) {
        const error = new StorageQuotaError(storageKey, { cause });
        channel.set({ ...channel.get(), unsavedWrite: error });
        throw error;
      }
      throw cause;
    }
  }

  function getItemId(item: T): string {
    return String((item as any)[idField]);
  }

  return {
    status: () => channel.get(),
    onStatus: (listener) => channel.subscribe(listener),
    acknowledge() {
      const { unsavedWrite: _dropped, ...rest } = channel.get();
      channel.set(rest);
    },

    async getList(params: GetListParams): Promise<GetListResult<T>> {
      const items = readItems();
      if (query) return query(items, params, searchFields ? { searchFields } : {});
      if (params.filter || params.search || (params.sort && params.sort.length > 0)) {
        throw new Error(
          'This localStorage provider was built without a query engine (the ./lite entry): ' +
            'filter, search and sort are not available; import createLocalStorageProvider from the main entry for them',
        );
      }
      if (!params.pagination) return { data: items, total: items.length };
      const { page, pageSize } = params.pagination;
      const start = (page - 1) * pageSize;
      return { data: items.slice(start, start + pageSize), total: items.length };
    },

    async getOne(id: string): Promise<T> {
      const items = readItems();
      const item = items.find(i => getItemId(i) === id);
      if (!item) throw new Error(`Item not found: ${id}`);
      return { ...item };
    },

    async create(data: Partial<T>): Promise<T> {
      const items = readItems();
      const taken = new Set(items.map(getItemId));
      const given = (data as any)[idField];
      if (given != null && taken.has(String(given))) {
        throw new Error(`Item already exists: ${given}`);
      }
      let id = given;
      if (id == null) {
        do id = String(nextId++); while (taken.has(id));
      }
      const newItem = { ...data, [idField]: id } as T;
      items.push(newItem);
      writeItems(items);
      return { ...newItem };
    },

    async update(id: string, data: Partial<T>): Promise<T> {
      const items = readItems();
      const index = items.findIndex(i => getItemId(i) === id);
      if (index === -1) throw new Error(`Item not found: ${id}`);
      items[index] = { ...items[index], ...data };
      writeItems(items);
      return { ...items[index] };
    },

    async updateMany(ids: string[], data: Partial<T>): Promise<T[]> {
      const items = readItems();
      const updated: T[] = [];
      for (const id of ids) {
        const index = items.findIndex(i => getItemId(i) === id);
        if (index !== -1) {
          items[index] = { ...items[index], ...data };
          updated.push({ ...items[index] });
        }
      }
      writeItems(items);
      return updated;
    },

    async delete(id: string): Promise<void> {
      const items = readItems();
      const index = items.findIndex(i => getItemId(i) === id);
      if (index === -1) throw new Error(`Item not found: ${id}`);
      items.splice(index, 1);
      writeItems(items);
    },

    async deleteMany(ids: string[]): Promise<void> {
      let items = readItems();
      const idSet = new Set(ids);
      items = items.filter(i => !idSet.has(getItemId(i)));
      writeItems(items);
    },

    async upsert(data: T): Promise<T> {
      const items = readItems();
      const id = getItemId(data);
      const index = items.findIndex(i => getItemId(i) === id);
      const item = { ...data };
      if (index === -1) {
        items.push(item);
      } else {
        items[index] = item;
      }
      writeItems(items);
      return { ...item };
    },

    /** Insert or replace several items in ONE write of the collection (zodal#122). */
    async upsertMany(data: T[]): Promise<T[]> {
      const items = readItems();
      const positions = new Map(items.map((i, index) => [getItemId(i), index]));
      const out = data.map((d) => {
        const item = { ...d };
        const id = getItemId(item);
        const index = positions.get(id);
        if (index === undefined) {
          positions.set(id, items.length);
          items.push(item);
        } else {
          items[index] = item;
        }
        return { ...item };
      });
      writeItems(items);
      return out;
    },

    // Conditional writes (zodal#118). The version is a hash of the stored item, so a write from
    // anywhere (another tab, another provider over the same key) changes it, and nothing extra
    // is stored. Read, compare and write happen in one synchronous step within this tab.
    async getVersioned(id: string): Promise<{ item: T; version: string }> {
      const item = readItems().find((i) => getItemId(i) === id);
      if (!item) throw new Error(`Item not found: ${id}`);
      return { item: { ...item }, version: contentVersion(item) };
    },

    async updateIfVersion(id: string, data: Partial<T>, expected: string | number): Promise<{ item: T; version: string }> {
      const items = readItems();
      const index = items.findIndex((i) => getItemId(i) === id);
      const current = index === -1 ? undefined : contentVersion(items[index]!);
      if (current !== expected) throw new WriteConflictError(id, expected, current);
      items[index] = { ...items[index]!, ...data };
      writeItems(items);
      return { item: { ...items[index]! }, version: contentVersion(items[index]!) };
    },

    async deleteIfVersion(id: string, expected: string | number): Promise<void> {
      const items = readItems();
      const index = items.findIndex((i) => getItemId(i) === id);
      const current = index === -1 ? undefined : contentVersion(items[index]!);
      if (current !== expected) throw new WriteConflictError(id, expected, current);
      items.splice(index, 1);
      writeItems(items);
    },

    getCapabilities(): ProviderCapabilities {
      return {
        // `versioned` is declared structurally: the @zodal/store on npm predates the field.
        ...({ versioned: true } as Partial<ProviderCapabilities>),
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canBulkUpdate: true,
        canBulkDelete: true,
        canUpsert: true,
        serverSort: false,
        serverFilter: false,
        serverSearch: false,
        serverPagination: false,
        // Without a query engine (./lite) no filter operator is available.
        ...(query ? {} : { filterOperators: { '*': [] } }),
      };
    },
  };
}
