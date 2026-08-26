/**
 * Models Interceptor
 * Serves the *curated* catalog on GET /v1/models and GET /models so Claude
 * Code's /model selector only lists entries marked visible in the dashboard.
 * Dual format: Anthropic shape when an `anthropic-version` header is present,
 * OpenAI list shape otherwise.
 * Response is pre-serialized and cached for sub-millisecond dispatch.
 */

import { fetchCatalog } from './omniroute-client.js';
import { getAll, getRevision } from './store.js';
import { classifyModel, prettifyName, isComboId } from './utils/model-classifier.js';
import {
  getCachedMergedCatalog,
  setCachedMergedCatalog,
  getCachedSerializedResponse,
  setCachedSerializedResponse,
} from './utils/catalog-cache.js';

const ANTHROPIC_CREATED_AT = '2025-01-01T00:00:00Z';
const OPENAI_CREATED = 1735689600; // same instant, epoch seconds

/** Handle GET /v1/models | GET /models */
export async function handleModelsRequest(req, res) {
  const anthropicStyle = Boolean(req.headers['anthropic-version']);
  const format = anthropicStyle ? 'anthropic' : 'openai';

  try {
    const storeRev = getRevision();
    let catalog;
    try {
      catalog = await fetchCatalog();
    } catch {
      catalog = { fetchedAt: 0, models: [], combos: [] };
    }
    const fetchedAt = catalog.fetchedAt ?? 0;

    // Check pre-serialized response cache (sub-millisecond response path)
    const cachedResponse = getCachedSerializedResponse(storeRev, fetchedAt, format);
    if (cachedResponse !== null) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(cachedResponse);
      return;
    }

    const merged = buildMergedCatalogWithCatalog(catalog, storeRev);
    const visible = merged.filter((e) => e.visible);

    const payload = anthropicStyle
      ? {
          data: visible.map((e) => ({
            id: e.id,
            type: 'model',
            display_name: e.name,
            created_at: ANTHROPIC_CREATED_AT,
          })),
          has_more: false,
        }
      : {
          object: 'list',
          data: visible.map((e) => ({
            id: e.id,
            object: 'model',
            created: OPENAI_CREATED,
            owned_by: e.provider,
          })),
        };

    const jsonString = JSON.stringify(payload);
    setCachedSerializedResponse(storeRev, fetchedAt, format, jsonString);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(jsonString);
  } catch (err) {
    // Upstream down and no cache: an empty catalog keeps clients functional.
    console.warn('[models-interceptor] catalog unavailable:', err.message);
    const empty = anthropicStyle
      ? { data: [], has_more: false }
      : { object: 'list', data: [] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(empty));
  }
}

/** Fetch upstream catalog, apply visibility flags, return visible entries only. */
export async function getVisibleCatalog() {
  return (await buildMergedCatalog()).filter((e) => e.visible);
}

/**
 * Merge upstream catalog with stored visibility state into dashboard-shaped entries.
 * Cached based on (storeRevision, upstreamFetchedAt).
 *
 * @returns {Promise<Array<{id,name,provider,family,contextWindow,maxTokens,capabilities,visible,isCombo,comboSteps,lastTested}>>}
 */
export async function buildMergedCatalog() {
  const storeRev = getRevision();
  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch {
    catalog = { fetchedAt: 0, models: [], combos: [] }; // fall through to stored-only entries
  }
  return buildMergedCatalogWithCatalog(catalog, storeRev);
}

function buildMergedCatalogWithCatalog(catalog, storeRev) {
  const fetchedAt = catalog.fetchedAt ?? 0;
  const cached = getCachedMergedCatalog(storeRev, fetchedAt);
  if (cached !== null) return cached;

  const visibility = getAll();
  const seen = new Set();
  const merged = [];

  for (const model of catalog.models) {
    seen.add(model.id);
    const isCombo = isComboId(model.id) || Boolean(visibility[model.id]?.isCombo);
    merged.push(buildEntry(model.id, isCombo, null, model, visibility));
  }
  for (const combo of catalog.combos) {
    seen.add(combo.id);
    merged.push(buildEntry(combo.id, true, combo.steps, null, visibility));
  }

  // Stored-only entries (upstream currently unreachable or model removed).
  for (const [id, entry] of Object.entries(visibility)) {
    if (!seen.has(id)) {
      const isCombo = isComboId(id) || Boolean(entry.isCombo);
      merged.push(buildEntry(id, isCombo, null, null, visibility));
    }
  }

  setCachedMergedCatalog(storeRev, fetchedAt, merged);
  return merged;
}

function buildEntry(id, isCombo, comboSteps, upstream, visibility) {
  const vis = visibility[id] ?? {};
  const meta = upstream ?? {};
  const finalIsCombo = Boolean(isCombo) || isComboId(id) || Boolean(vis.isCombo);
  const cls = classifyModel(id, { ...meta, isCombo: finalIsCombo });
  const name =
    vis.customLabel || meta.name || prettifyName(id);

  return {
    id,
    name,
    provider: finalIsCombo ? 'combo' : cls.provider,
    family: finalIsCombo ? 'Combos' : cls.family,
    contextWindow: cls.contextWindow,
    maxTokens: finalIsCombo ? null : cls.maxTokens,
    capabilities: cls.capabilities,
    visible: vis.visible === true, // strict: hidden unless explicitly exposed
    isCombo: finalIsCombo,
    ...(finalIsCombo ? { comboSteps: comboSteps ?? vis.comboSteps ?? null } : {}),
    ...(vis.lastTested ? { lastTested: vis.lastTested } : {}),
  };
}
