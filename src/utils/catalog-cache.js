/**
 * Catalog Cache (Leaf Module)
 * Caches merged catalog structures and pre-serialized JSON responses for /v1/models
 * keyed by (storeRevision, upstreamFetchedAt, format).
 * Zero circular dependencies.
 */

let cachedMerged = null; // { revision: number, upstreamFetchedAt: number, data: Array }
const responseCache = new Map(); // key: `${revision}:${upstreamFetchedAt}:${format}` -> string (JSON)

/**
 * Get the cached merged catalog if revisions match.
 * @param {number} storeRevision
 * @param {number} upstreamFetchedAt
 * @returns {Array | null}
 */
export function getCachedMergedCatalog(storeRevision, upstreamFetchedAt) {
  if (
    cachedMerged &&
    cachedMerged.revision === storeRevision &&
    cachedMerged.upstreamFetchedAt === upstreamFetchedAt
  ) {
    return cachedMerged.data;
  }
  return null;
}

/**
 * Store the merged catalog in cache.
 * @param {number} storeRevision
 * @param {number} upstreamFetchedAt
 * @param {Array} data
 */
export function setCachedMergedCatalog(storeRevision, upstreamFetchedAt, data) {
  cachedMerged = {
    revision: storeRevision,
    upstreamFetchedAt,
    data,
  };
  // Invalidate previous serialized responses if revision or upstream timestamp changed
  responseCache.clear();
}

/**
 * Get pre-serialized response JSON for /v1/models.
 * @param {number} storeRevision
 * @param {number} upstreamFetchedAt
 * @param {'openai' | 'anthropic'} format
 * @returns {string | null}
 */
export function getCachedSerializedResponse(storeRevision, upstreamFetchedAt, format) {
  const key = `${storeRevision}:${upstreamFetchedAt}:${format}`;
  return responseCache.get(key) ?? null;
}

/**
 * Set pre-serialized response JSON for /v1/models.
 * @param {number} storeRevision
 * @param {number} upstreamFetchedAt
 * @param {'openai' | 'anthropic'} format
 * @param {string} jsonString
 */
export function setCachedSerializedResponse(storeRevision, upstreamFetchedAt, format, jsonString) {
  const key = `${storeRevision}:${upstreamFetchedAt}:${format}`;
  responseCache.set(key, jsonString);
}

/**
 * Explicit cache clear if needed.
 */
export function clearCatalogCache() {
  cachedMerged = null;
  responseCache.clear();
}
