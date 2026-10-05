/**
 * localStorage DataProvider for zodal.
 *
 * Stores collection items as a JSON array under a single localStorage key.
 * All query operations (sort, filter, search, pagination) are client-side,
 * through `applyQuery()` from `@zodal/store`.
 *
 * A stored value that is not a JSON array is never treated as an empty
 * collection: every read and write throws {@link LocalStorageCorruptError} and
 * leaves the stored text untouched, so a corrupt key cannot be silently
 * overwritten by the next write.
 */

import type { DataProvider, GetListParams, GetListResult, ProviderCapabilities } from '@zodal/store';
import { applyQuery } from '@zodal/store';

/**
 * Thrown when the value stored under a provider's key is not a JSON array.
 * The raw text is left in place (and carried on `raw`) so the app can tell the
 * user, back it up, or restore it.
 */
export class LocalStorageCorruptError extends Error {
  readonly storageKey: string;
  readonly raw: string;

  constructor(storageKey: string, raw: string, cause?: unknown) {
    super(
      `localStorage key "${storageKey}" does not hold a JSON array; ` +
        'refusing to read or overwrite it (the stored text is left untouched).',
      { cause },
    );
    this.name = 'LocalStorageCorruptError';
    this.storageKey = storageKey;
    this.raw = raw;
  }
}

export interface LocalStorageProviderOptions {
  /** localStorage key to store items under. */
  storageKey: string;
  /** Field name used as the unique identifier. Default: 'id'. */
  idField?: string;
  /** Fields to include in text search. Default: all string-valued fields. */
  searchFields?: string[];
}

export function createLocalStorageProvider<T extends Record<string, any>>(
  options: LocalStorageProviderOptions,
): DataProvider<T> {
  const { storageKey, searchFields } = options;
  const idField = options.idField ?? 'id';
  let nextId = Date.now();

  function readItems(): T[] {
    let raw: string | null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      return []; // storage unavailable (SSR, blocked): nothing to read, and a write will throw
    }
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new LocalStorageCorruptError(storageKey, raw, err);
    }
    if (!Array.isArray(parsed)) throw new LocalStorageCorruptError(storageKey, raw);
    return parsed as T[];
  }

  function writeItems(items: T[]): void {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }

  function getItemId(item: T): string {
    return String((item as any)[idField]);
  }

  return {
    async getList(params: GetListParams): Promise<GetListResult<T>> {
      // Items are parsed fresh from storage on every call, so they are already copies.
      return applyQuery(readItems(), params, { searchFields });
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

    getCapabilities(): ProviderCapabilities {
      return {
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
      };
    },
  };
}
