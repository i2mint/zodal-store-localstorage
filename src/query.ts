/**
 * The default query engine for the localStorage and IndexedDB records providers: `applyQuery`
 * from `@zodal/store` (filter, case-insensitive substring search, multi-key sort, then 1-based
 * pagination; `total` counts every match), the one implementation every zodal adapter shares.
 */

import type { GetListParams, GetListResult } from '@zodal/store';
import { applyQuery } from '@zodal/store';

export function defaultQuery<T extends Record<string, any>>(
  all: T[],
  params: GetListParams,
  { searchFields }: { searchFields?: string[] },
): GetListResult<T> {
  // Items are parsed fresh from storage on every call, so they are already copies.
  return applyQuery(all, params, searchFields ? { searchFields } : {});
}
