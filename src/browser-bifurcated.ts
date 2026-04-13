/**
 * Browser Bifurcated Provider: localStorage metadata + IndexedDB content.
 *
 * Convenience factory for the most common browser-side bifurcation pattern:
 *   - Metadata in localStorage (small, JSON, queryable by zodal)
 *   - Content in IndexedDB (larger binary objects, Blob/ArrayBuffer support)
 *
 * @example
 * ```typescript
 * const provider = createBrowserBifurcatedProvider({
 *   storageKey: 'my-docs',
 *   contentFields: ['attachment'],
 * });
 * ```
 */

import type { DataProvider, GetListParams, GetListResult } from '@zodal/store';
import type { ProviderCapabilities } from '@zodal/store';

/** Content reference — matches @zodal/core ContentRef (available in >= 0.2.0). */
interface ContentRef {
  readonly _tag: 'ContentRef';
  field: string;
  itemId: string;
  hash?: string;
  url?: string;
  mimeType?: string;
  size?: number;
}
import { createLocalStorageProvider } from './provider.js';
import { createIndexedDBContentProvider } from './indexeddb-content-provider.js';

export interface BrowserBifurcatedOptions {
  /** localStorage key for metadata. */
  storageKey: string;
  /** Content field names. */
  contentFields: string[];
  /** ID field. Default: 'id'. */
  idField?: string;
  /** Fields for text search. Default: all string metadata fields. */
  searchFields?: string[];
  /** IndexedDB database name. Default: 'zodal-content'. */
  dbName?: string;
  /** IndexedDB object store name. Default: 'content'. */
  storeName?: string;
  /** How content fields appear in getList. Default: 'reference'. */
  listStrategy?: 'reference' | 'omit';
}

export function createBrowserBifurcatedProvider<T extends Record<string, any>>(
  options: BrowserBifurcatedOptions,
): DataProvider<T> {
  const {
    storageKey, contentFields, searchFields,
    listStrategy = 'reference',
    idField = 'id',
    dbName = 'zodal-content',
    storeName = 'content',
  } = options;
  const contentSet = new Set(contentFields);

  const metaProvider = createLocalStorageProvider<Record<string, any>>({
    storageKey,
    idField,
    searchFields,
  });

  const contentProvider = createIndexedDBContentProvider<Record<string, any>>({
    contentFields,
    idField,
    dbName,
    storeName,
  });

  function toContentRef(id: string, field: string): ContentRef {
    return { _tag: 'ContentRef', field, itemId: id };
  }

  function applyContentStrategy(item: Record<string, any>): Record<string, any> {
    const result = { ...item };
    for (const field of contentFields) {
      if (listStrategy === 'omit') delete result[field];
      else result[field] = toContentRef(String(item[idField]), field);
    }
    return result;
  }

  function splitFields(data: Record<string, any>): { meta: Record<string, any>; content: Record<string, any> } {
    const meta: Record<string, any> = {};
    const content: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (contentSet.has(key)) content[key] = value;
      else meta[key] = value;
    }
    return { meta, content };
  }

  return {
    async getList(params: GetListParams): Promise<GetListResult<T>> {
      const result = await metaProvider.getList(params);
      return {
        data: result.data.map(applyContentStrategy) as T[],
        total: result.total,
      };
    },

    async getOne(id: string): Promise<T> {
      const meta = await metaProvider.getOne(id);
      return applyContentStrategy(meta) as T;
    },

    async create(data: Partial<T>): Promise<T> {
      const { meta, content } = splitFields(data as Record<string, any>);
      const created = await metaProvider.create(meta);
      const id = String(created[idField]);

      if (Object.keys(content).length > 0) {
        await contentProvider.create({ ...content, [idField]: id });
      }

      return created as T;
    },

    async update(id: string, data: Partial<T>): Promise<T> {
      const { meta, content } = splitFields(data as Record<string, any>);

      let result: Record<string, any>;
      if (Object.keys(meta).length > 0) {
        result = await metaProvider.update(id, meta);
      } else {
        result = await metaProvider.getOne(id);
      }

      if (Object.keys(content).length > 0) {
        await contentProvider.update(id, content);
      }

      return result as T;
    },

    async updateMany(ids: string[], data: Partial<T>): Promise<T[]> {
      return Promise.all(ids.map(id => this.update(id, data)));
    },

    async delete(id: string): Promise<void> {
      try { await contentProvider.delete(id); } catch { /* swallow */ }
      await metaProvider.delete(id);
    },

    async deleteMany(ids: string[]): Promise<void> {
      await Promise.all(ids.map(id => this.delete(id)));
    },

    getCapabilities(): ProviderCapabilities {
      return {
        canCreate: true, canUpdate: true, canDelete: true,
        canBulkUpdate: true, canBulkDelete: true, canUpsert: false,
        serverSort: false, serverFilter: false, serverSearch: false, serverPagination: false,
        ...({ bifurcated: true, contentFields } as any),
      };
    },

    async getContent(id: string, field: string): Promise<unknown> {
      if (!contentSet.has(field)) throw new Error(`'${field}' is not a content field`);
      const item = await contentProvider.getOne(id);
      return (item as Record<string, any>)[field];
    },

    async setContent(id: string, field: string, content: unknown): Promise<ContentRef> {
      if (!contentSet.has(field)) throw new Error(`'${field}' is not a content field`);
      await contentProvider.update(id, { [field]: content });
      return toContentRef(id, field);
    },
  } as DataProvider<T>;
}
