/**
 * The DataProvider contract from `@zodal/store/testing`, run against the
 * localStorage provider (alone, and as the metadata side of the browser
 * bifurcated provider with no content fields, which needs no IndexedDB).
 * Each case gets its own storage key, removed by `dispose`.
 */

import { describe, it } from 'vitest';
import { providerContract, type ContractRow } from '@zodal/store/testing';
import type { DataProvider } from '@zodal/store';
import { createLocalStorageProvider } from '../src/provider.js';
import { createBrowserBifurcatedProvider } from '../src/browser-bifurcated.js';

const keys = new WeakMap<object, string>();
let counter = 0;

async function seeded(
  build: (storageKey: string) => DataProvider<ContractRow>,
  seed: ContractRow[],
): Promise<DataProvider<ContractRow>> {
  const storageKey = `zodal-contract-${++counter}`;
  const provider = build(storageKey);
  for (const row of seed) await provider.create(row);
  keys.set(provider, storageKey);
  return provider;
}

const dispose = (provider: DataProvider<ContractRow>) => {
  const storageKey = keys.get(provider);
  if (storageKey) localStorage.removeItem(storageKey);
};

const shapes: [string, (storageKey: string) => DataProvider<ContractRow>][] = [
  ['localStorage provider', (storageKey) => createLocalStorageProvider<ContractRow>({ storageKey })],
  [
    'browser bifurcated provider (no content fields)',
    (storageKey) => createBrowserBifurcatedProvider<ContractRow>({ storageKey, contentFields: [] }),
  ],
];

for (const [label, build] of shapes) {
  const cases = await providerContract({ make: (seed) => seeded(build, seed), dispose });
  describe(`${label}: DataProvider contract`, () => {
    for (const c of cases) (c.skip ? it.skip : it)(c.name, c.run);
  });
}
