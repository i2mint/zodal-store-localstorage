/**
 * Typed errors for the localStorage provider.
 *
 * A collection lives under one key, and every write rewrites the whole key, so a
 * read that silently returned `[]` for unreadable text would let the next write
 * destroy the collection. These errors keep the three outcomes apart:
 * a missing key (an empty collection, not an error), an unreadable key
 * (`CorruptStorageError`), and a full storage area on write (`StorageQuotaError`).
 */

/** The text stored under `storageKey` is not a JSON array. The stored text is left untouched. */
export class CorruptStorageError extends Error {
  readonly storageKey: string;
  /** The unreadable text, exactly as stored. */
  readonly raw: string;

  constructor(storageKey: string, raw: string, options?: { cause?: unknown }) {
    super(
      `localStorage key ${JSON.stringify(storageKey)} does not hold a JSON array; ` +
        `refusing to read or write it so the stored text is not overwritten`,
      options,
    );
    this.name = 'CorruptStorageError';
    this.storageKey = storageKey;
    this.raw = raw;
  }
}

/** A write was refused because the storage area is full. The previously stored value is unchanged. */
export class StorageQuotaError extends Error {
  readonly storageKey: string;

  constructor(storageKey: string, options?: { cause?: unknown }) {
    super(`localStorage is full: could not write key ${JSON.stringify(storageKey)}`, options);
    this.name = 'StorageQuotaError';
    this.storageKey = storageKey;
  }
}

/** True for the quota error each browser throws from `Storage.setItem`. */
export function isQuotaExceededError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  // Chrome/Safari/jsdom use 'QuotaExceededError'; older Firefox used 'NS_ERROR_DOM_QUOTA_REACHED'.
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}
