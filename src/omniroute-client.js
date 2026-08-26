/**
 * Omniroute Upstream Client
 * Catalog fetching (/v1/models & /api/combos) and health pings, with a short
 * TTL cache so dashboard polls don't hammer upstream. Inference traffic does
 * NOT pass through here — proxy-handler streams it directly.
 * Uses persistent Keep-Alive agents and connection reuse.
 */

import http from 'node:http';
import https from 'node:https';
import { getConfig } from './config.js';
import { getAgent, attachSocketNoDelay } from './utils/http-agent.js';

const CATALOG_TTL_MS = 30_000;
const HEALTH_TTL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;

let catalogCache = null; // { fetchedAt, models: [], combos: [] }
let healthCache = null; // { at, online, latencyMs }

/** Low-level buffered request to Omniroute. Rejects on network errors/timeouts. */
export function upstreamRequest(pathname, { method = 'GET', headers = {}, body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const cfg = getConfig();
  const base = new URL(cfg.omnirouteUrl);
  const url = new URL(pathname, base); // resolves relative paths against base
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const finalHeaders = { ...headers };
  if (cfg.omnirouteApiKey) {
    finalHeaders.Authorization ??= `Bearer ${cfg.omnirouteApiKey}`;
    finalHeaders['x-api-key'] ??= cfg.omnirouteApiKey;
  }
  if (body != null && !finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: finalHeaders,
        agent: getAgent(isHttps),
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    attachSocketNoDelay(req);
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error('Upstream request timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (body != null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

/**
 * Fetch the full upstream catalog (models + combos), cached for 30s.
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{models: object[], combos: object[], stale?: boolean}>}
 *   Normalized entries: models -> {id,name,ownedBy,contextLength,maxOutputTokens}
 *                       combos -> {id,name,steps:number|null}
 *   `stale: true` means upstream failed and the last-known-good cache was served.
 */
export async function fetchCatalog({ force = false } = {}) {
  if (!force && catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return catalogCache;
  }

  try {
    const [modelsRes, combosRes] = await Promise.all([
      upstreamRequest('/v1/models'),
      upstreamRequest('/api/combos').catch(() => null), // combos endpoint is optional
    ]);

    if (modelsRes.status < 200 || modelsRes.status >= 300) {
      throw Object.assign(new Error(`Omniroute /v1/models responded HTTP ${modelsRes.status}`), { statusCode: modelsRes.status });
    }

    const catalog = {
      fetchedAt: Date.now(),
      models: normalizeModels(safeJson(modelsRes.text)),
      combos: combosRes ? normalizeCombos(safeJson(combosRes.text)) : [],
    };
    catalogCache = catalog;
    return catalog;
  } catch (err) {
    if (catalogCache) return { ...catalogCache, stale: true };
    throw err;
  }
}

/** Quick upstream reachability probe (cached 5s). Drains response so socket is returned to pool. */
export async function pingUpstream() {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache;
  const start = Date.now();
  let online = false;
  try {
    const cfg = getConfig();
    const base = new URL(cfg.omnirouteUrl);
    const isHttps = base.protocol === 'https:';
    await new Promise((resolve, reject) => {
      const headers = {};
      if (cfg.omnirouteApiKey) headers.Authorization = `Bearer ${cfg.omnirouteApiKey}`;
      const req = (isHttps ? https : http).request(
        {
          hostname: base.hostname,
          port: base.port || (isHttps ? 443 : 80),
          path: '/v1/models',
          method: 'GET',
          headers,
          agent: getAgent(isHttps),
        },
        (res) => {
          online = res.statusCode >= 200 && res.statusCode < 500;
          // Drain stream cleanly so socket is preserved in the Keep-Alive pool
          res.resume();
          res.on('end', resolve);
          res.on('error', () => resolve());
        }
      );
      attachSocketNoDelay(req);
      req.setTimeout(4000, () => req.destroy(new Error('ping timed out')));
      req.on('error', reject);
      req.end();
    });
  } catch {
    /* unreachable */
  }
  healthCache = { at: Date.now(), online, latencyMs: online ? Date.now() - start : null };
  return healthCache;
}

// --- normalization helpers -------------------------------------------------

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Accept OpenAI-style {data:[...]} or bare arrays; tolerate missing metadata. */
function normalizeModels(payload) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return list
    .map((m) => ({
      id: String(m.id ?? m.model ?? m.name ?? '').trim(),
      name: m.display_name ?? m.displayName ?? m.name ?? undefined,
      ownedBy: m.owned_by ?? m.ownedBy ?? m.provider ?? undefined,
      contextLength: firstNumber(m.context_length, m.context_window, m.contextWindow, m.max_context_tokens),
      maxOutputTokens: firstNumber(m.max_tokens, m.max_output_tokens, m.maxOutputTokens),
    }))
    .filter((m) => m.id);
}

/**
 * Combos come from Omniroute's own API — shape may vary between versions.
 * Accepts bare arrays or {combos|data|items: [...]}; steps may be an array of
 * model IDs or a count.
 */
function normalizeCombos(payload) {
  let list = [];
  if (Array.isArray(payload)) list = payload;
  else if (payload && typeof payload === 'object') {
    list = payload.combos ?? payload.data ?? payload.items ?? [];
  }
  if (!Array.isArray(list)) list = [];

  return list
    .map((c) => {
      const id = String(c.id ?? c.combo_id ?? c.slug ?? '').trim();
      const rawSteps = c.steps ?? c.models ?? c.pipeline ?? c.step_count;
      const steps = Array.isArray(rawSteps) ? rawSteps.length : Number.isFinite(Number(rawSteps)) ? Number(rawSteps) : null;
      return { id, name: c.display_name ?? c.name ?? undefined, steps };
    })
    .filter((c) => c.id);
}

function firstNumber(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}
