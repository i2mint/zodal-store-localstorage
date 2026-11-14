/** `createLocalStorageProvider`: the localStorage collection with the default query engine. */

import { createLocalCollection } from './provider.js';
import type { LocalStorageProvider, LocalStorageProviderOptions } from './provider.js';
import { defaultQuery } from './query.js';

/**
 * A `DataProvider` keeping a collection as one JSON array under `storageKey`, with client-side
 * filter, search, sort and pagination, and a storage status channel (`status`, `onStatus`,
 * `acknowledge`).
 */
export function createLocalStorageProvider<T extends Record<string, any>>(
  options: LocalStorageProviderOptions,
): LocalStorageProvider<T> {
  return createLocalCollection<T>(options, defaultQuery);
}
