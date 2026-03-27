/**
 * localStorage DataProvider for zodal.
 *
 * Stores collection items as a JSON array under a single localStorage key.
 * All query operations (sort, filter, search, pagination) are client-side.
 */

import type { SortingState, FilterExpression } from '@zodal/core';
import type { DataProvider, GetListParams, GetListResult, ProviderCapabilities } from '@zodal/store';
import { filterToFunction } from '@zodal/store';

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
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeItems(items: T[]): void {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }

  function getItemId(item: T): string {
    return String((item as any)[idField]);
  }

  function matchesSearch(item: T, search: string): boolean {
    if (!search) return true;
    const lowerSearch = search.toLowerCase();
    const fields = searchFields ?? Object.keys(item).filter(k => typeof (item as any)[k] === 'string');
    return fields.some(field => {
      const val = (item as any)[field];
      return typeof val === 'string' && val.toLowerCase().includes(lowerSearch);
    });
  }

  function compareValues(a: any, b: any): number {
    if (a === b) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
    return a < b ? -1 : 1;
  }

  return {
    async getList(params: GetListParams): Promise<GetListResult<T>> {
      let items = readItems();

      if (params.filter) {
        const predicate = filterToFunction<T>(params.filter);
        items = items.filter(predicate);
      }

      if (params.search) {
        items = items.filter(item => matchesSearch(item, params.search!));
      }

      const total = items.length;

      if (params.sort && params.sort.length > 0) {
        items.sort((a, b) => {
          for (const s of params.sort!) {
            const cmp = compareValues((a as any)[s.id], (b as any)[s.id]);
            if (cmp !== 0) return s.desc ? -cmp : cmp;
          }
          return 0;
        });
      }

      if (params.pagination) {
        const { page, pageSize } = params.pagination;
        const start = (page - 1) * pageSize;
        items = items.slice(start, start + pageSize);
      }

      return { data: items, total };
    },

    async getOne(id: string): Promise<T> {
      const items = readItems();
      const item = items.find(i => getItemId(i) === id);
      if (!item) throw new Error(`Item not found: ${id}`);
      return { ...item };
    },

    async create(data: Partial<T>): Promise<T> {
      const items = readItems();
      const newItem = {
        ...data,
        [idField]: (data as any)[idField] ?? String(nextId++),
      } as T;
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
