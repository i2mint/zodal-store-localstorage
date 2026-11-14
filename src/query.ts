/**
 * The default query engine for the localStorage provider: filter (`filterToFunction` from
 * `@zodal/store`), case-insensitive substring search, multi-key sort, then 1-based pagination;
 * `total` counts every match.
 */

import type { GetListParams, GetListResult } from '@zodal/store';
import { filterToFunction } from '@zodal/store';

function compareValues(a: any, b: any): number {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return a < b ? -1 : 1;
}

export function defaultQuery<T extends Record<string, any>>(
  all: T[],
  params: GetListParams,
  { searchFields }: { searchFields?: string[] },
): GetListResult<T> {
  let items = all;
  if (params.filter) items = items.filter(filterToFunction<T>(params.filter));
  if (params.search) {
    const lower = params.search.toLowerCase();
    items = items.filter((item) => {
      const fields = searchFields ?? Object.keys(item).filter((k) => typeof (item as any)[k] === 'string');
      return fields.some((f) => typeof (item as any)[f] === 'string' && (item as any)[f].toLowerCase().includes(lower));
    });
  }
  const total = items.length;
  if (params.sort && params.sort.length > 0) {
    items = [...items].sort((a, b) => {
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
}
