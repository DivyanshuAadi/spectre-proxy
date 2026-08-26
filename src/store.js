/**
 * Visibility Store — data/visibility.json
 * Per-model visibility flags, custom labels, and last-test diagnostics.
 * Mutations update in-memory state instantly, bump a revision counter, and debounce
 * atomic persistence to prevent disk write storms during benchmarks.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readJson, writeJsonAtomic } from './utils/atomic-json.js';
import { isComboId } from './utils/model-classifier.js';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const VISIBILITY_FILE = process.env.DATA_DIR
  ? join(process.env.DATA_DIR, 'visibility.json')
  : join(ROOT_DIR, 'data', 'visibility.json');

const DEBOUNCE_MS = 250;

let state = { models: {} };
let revision = 0;
let debounceTimer = null;
let pendingPersist = null;

/** Load visibility.json (or initialise an empty store). */
export async function loadStore() {
  const raw = await readJson(VISIBILITY_FILE, {});
  state = { models: raw && typeof raw.models === 'object' ? raw.models : {} };
  revision++;
  return state;
}

/** Get monotonic revision counter for cache invalidation. */
export function getRevision() {
  return revision;
}

export function getAll() {
  return state.models;
}

export function getEntry(modelId) {
  return state.models[modelId] ?? null;
}

/** Default entry shape for a model never seen before. */
export function makeEntry(isCombo = false, id = '') {
  const finalIsCombo = Boolean(isCombo) || (id ? isComboId(id) : false);
  return { visible: false, isCombo: finalIsCombo }; // strict filter: unknown models start hidden
}

/**
 * Merge upstream catalog IDs into the store without touching existing flags.
 * @param {Array<{id: string, isCombo?: boolean}>} entries
 * @returns {Promise<number>} count of newly added IDs
 */
export async function upsertCatalog(entries) {
  let added = 0;
  for (const { id, isCombo } of entries) {
    if (!id) continue;
    const finalIsCombo = Boolean(isCombo) || isComboId(id);
    if (!state.models[id]) {
      state.models[id] = makeEntry(finalIsCombo, id);
      added++;
    } else if (finalIsCombo && !state.models[id].isCombo) {
      state.models[id].isCombo = true;
      added++;
    }
  }
  if (added > 0) {
    revision++;
    schedulePersist();
  }
  return added;
}

export async function setVisible(modelId, visible) {
  const entry = state.models[modelId] ?? (state.models[modelId] = makeEntry(false));
  entry.visible = Boolean(visible);
  revision++;
  schedulePersist();
  return entry;
}

/** Persist last-test diagnostics; optionally auto-hide failures / auto-show successes. */
export async function recordTestResult(modelId, result, autoHideOnFailure, autoShowOnSuccess) {
  const entry = state.models[modelId] ?? (state.models[modelId] = makeEntry(false));
  entry.lastTested = { ...result, timestamp: Date.now() };
  if (autoHideOnFailure && result.status === 'error') {
    entry.visible = false;
  }
  if (autoShowOnSuccess && result.status === 'success') {
    entry.visible = true;
  }
  revision++;
  schedulePersist();
  return entry;
}

/**
 * Apply a visibility rule across many entries at once, persisting a single time.
 * @param {(entry: {id:string, visible:boolean, isCombo:boolean, lastTested?:object}) => boolean | undefined} ruleFn
 *   Return the new `visible` value, or undefined to leave this entry untouched.
 * @returns {Promise<number>} count of entries whose visibility changed
 */
export async function bulkUpdate(ruleFn) {
  let changed = 0;
  for (const [id, entry] of Object.entries(state.models)) {
    const next = ruleFn({
      id,
      visible: entry.visible === true,
      isCombo: entry.isCombo === true,
      lastTested: entry.lastTested,
    });
    if (next === undefined || next === Boolean(entry.visible)) continue;
    entry.visible = Boolean(next);
    changed++;
  }
  if (changed > 0) {
    revision++;
    schedulePersist();
  }
  return changed;
}

export async function removeEntry(modelId) {
  if (!(modelId in state.models)) return false;
  delete state.models[modelId];
  revision++;
  schedulePersist();
  return true;
}

/** Schedule a debounced atomic write to disk. */
function schedulePersist() {
  if (!debounceTimer) {
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      pendingPersist = doPersist();
    }, DEBOUNCE_MS);
  }
}

/** Explicitly flush any pending store writes to disk immediately. */
export async function flushStore() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingPersist = doPersist();
  return pendingPersist;
}

async function doPersist() {
  try {
    await writeJsonAtomic(VISIBILITY_FILE, state);
  } catch (err) {
    console.error('[store] failed to persist visibility store:', err.message);
  }
}

export const STORE_FILE_PATH = VISIBILITY_FILE;
