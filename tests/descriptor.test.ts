/**
 * The provider descriptors: created by name through `createFromDescriptor`, the
 * localStorage providers pass the `@zodal/store/testing` contract; `supports()`
 * really probes storage; bad options fail with a structural error naming the
 * descriptor; no option is secret or live; and what a menu shows as capabilities
 * is what the created provider reports.
 *
 * jsdom has no IndexedDB, so the IndexedDB-backed descriptors are checked for
 * shape, support detection (with a stubbed factory) and creation, not exercised.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createFromDescriptor,
  defineProviderDescriptor,
  describedCapabilities,
  isProviderSupported,
  liveOptionPaths,
  redactOptions,
  secretOptionPaths,
  bifurcatedDescriptor,
  type ProviderDescriptor,
} from '@zodal/store/descriptor';
import { providerContract, type ContractRow } from '@zodal/store/testing';
import type { DataProvider } from '@zodal/store';
import { descriptor, browserBifurcatedDescriptor, indexedDBBlobDescriptor } from '../src/index.js';

let counter = 0;
const freshKey = () => `zodal-descriptor-${++counter}`;

const all: [string, ProviderDescriptor, Record<string, unknown>][] = [
  ['descriptor', descriptor, { storageKey: 'items', idField: 'key', searchFields: ['name'] }],
  ['browserBifurcatedDescriptor', browserBifurcatedDescriptor, { storageKey: 'docs', contentFields: ['body'], dbName: 'db', storeName: 'st', listStrategy: 'omit' }],
  ['indexedDBBlobDescriptor', indexedDBBlobDescriptor, { contentFields: ['body'], dbName: 'db', storeName: 'st' }],
];

// The contract, run through the descriptor path (validation, then lazy create).
const contractShapes: [string, ProviderDescriptor, (storageKey: string) => Record<string, unknown>][] = [
  ['descriptor', descriptor, (storageKey) => ({ storageKey })],
  ['browserBifurcatedDescriptor (no content fields)', browserBifurcatedDescriptor, (storageKey) => ({ storageKey, contentFields: [] })],
];
for (const [label, d, options] of contractShapes) {
  const keys = new WeakMap<object, string>();
  const cases = await providerContract({
    make: async (seed) => {
      const storageKey = freshKey();
      const provider = (await createFromDescriptor(d, options(storageKey))) as DataProvider<ContractRow>;
      for (const row of seed) await provider.create(row);
      keys.set(provider, storageKey);
      return provider;
    },
    dispose: (provider) => {
      const storageKey = keys.get(provider);
      if (storageKey) localStorage.removeItem(storageKey);
    },
  });
  describe(`localStorage ${label} via createFromDescriptor: DataProvider contract`, () => {
    for (const c of cases) (c.skip ? it.skip : it)(c.name, c.run);
  });
}

describe('localStorage provider descriptors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('are accepted by defineProviderDescriptor, with distinct names and their own source', () => {
    for (const [, d] of all) expect(defineProviderDescriptor(d)).toBe(d);
    expect(all.map(([, d]) => d.name)).toEqual(['localStorage', 'browserBifurcated', 'indexedDBBlob']);
    for (const [exportName, d] of all) {
      expect(d.source).toEqual({ module: '@zodal/store-localstorage', export: exportName });
      expect(d.runtime).toBe('browser');
    }
  });

  it('supports() writes a probe to localStorage, and leaves nothing behind', async () => {
    const before = localStorage.length;
    expect(await isProviderSupported(descriptor)).toBe(true);
    expect(localStorage.length).toBe(before);
  });

  it('supports() is false when localStorage throws on write (private browsing, quota)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    expect(await isProviderSupported(descriptor)).toBe(false);
    expect(await isProviderSupported(browserBifurcatedDescriptor)).toBe(false);
  });

  it('supports() is false when localStorage is absent', async () => {
    vi.stubGlobal('localStorage', undefined);
    expect(await isProviderSupported(descriptor)).toBe(false);
  });

  it('the IndexedDB descriptors are supported only where IndexedDB exists', async () => {
    expect(await isProviderSupported(indexedDBBlobDescriptor)).toBe(false); // jsdom: no IndexedDB
    expect(await isProviderSupported(browserBifurcatedDescriptor)).toBe(false);
    vi.stubGlobal('indexedDB', { open: () => ({}) });
    expect(await isProviderSupported(indexedDBBlobDescriptor)).toBe(true);
    expect(await isProviderSupported(browserBifurcatedDescriptor)).toBe(true);
  });

  it('create a working provider from valid options', async () => {
    const storageKey = freshKey();
    const provider = await createFromDescriptor(descriptor, { storageKey, idField: 'key', searchFields: ['name'] });
    await provider.create({ key: 'a', name: 'Alpha' });
    expect(await provider.getOne('a')).toEqual({ key: 'a', name: 'Alpha' });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([{ key: 'a', name: 'Alpha' }]);
    // The IndexedDB providers open their database lazily, so they can be created here.
    const blob = await createFromDescriptor(indexedDBBlobDescriptor, { contentFields: ['body'] });
    expect(blob.getCapabilities!().canUpsert).toBe(false);
  });

  it('reject invalid options with a structural error naming the descriptor', async () => {
    await expect(createFromDescriptor(descriptor, {})).rejects.toThrow(/Invalid options for provider "localStorage": storageKey: invalid_type/);
    await expect(createFromDescriptor(descriptor, { storageKey: '' })).rejects.toThrow(/provider "localStorage": storageKey: too_small/);
    await expect(createFromDescriptor(browserBifurcatedDescriptor, { storageKey: 'k' })).rejects.toThrow(/provider "browserBifurcated": contentFields/);
    await expect(createFromDescriptor(indexedDBBlobDescriptor, { contentFields: 'body' })).rejects.toThrow(/provider "indexedDBBlob": contentFields: invalid_type/);
  });

  it('have no secret and no live option: options are plain, shareable data', () => {
    for (const [, d, o] of all) {
      expect(secretOptionPaths(d)).toEqual([]);
      expect(liveOptionPaths(d)).toEqual([]);
      expect(redactOptions(d, o)).toEqual(o);
    }
  });

  it('describe the capabilities the created provider reports', async () => {
    for (const [, d, o] of all) {
      const provider = await createFromDescriptor(d, { ...o, ...('storageKey' in o ? { storageKey: freshKey() } : {}) });
      expect(provider.getCapabilities!()).toMatchObject(describedCapabilities(d, o as any));
    }
    expect(describedCapabilities(browserBifurcatedDescriptor, { storageKey: 'k', contentFields: ['body'] })).toMatchObject({ bifurcated: true, contentFields: ['body'] });
  });

  it('compose under bifurcatedDescriptor; the browser bifurcated provider is not a child', () => {
    const bifurcated = bifurcatedDescriptor(all.map(([, d]) => d));
    expect(secretOptionPaths(bifurcated)).toEqual([]);
    const parsed = bifurcated.options.safeParse({
      metadata: { name: 'browserBifurcated', options: { storageKey: 'k', contentFields: [] } },
      content: { name: 'indexedDBBlob', options: { contentFields: ['body'] } },
      contentFields: ['body'],
    });
    expect(parsed.success).toBe(false);
    expect(
      bifurcated.options.safeParse({
        metadata: { name: 'localStorage', options: { storageKey: 'k' } },
        content: { name: 'indexedDBBlob', options: { contentFields: ['body'] } },
        contentFields: ['body'],
      }).success,
    ).toBe(true);
  });
});
