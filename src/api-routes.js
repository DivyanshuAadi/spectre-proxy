/**
 * Management REST API — /api/*
 * Consumed exclusively by the dashboard SPA (see public/js/api.js for the
 * exact client contract these handlers mirror).
 */

import { getConfig, updateConfig } from './config.js';
import { bulkUpdate, upsertCatalog, setVisible, flushStore } from './store.js';
import { fetchCatalog, pingUpstream } from './omniroute-client.js';
import { buildMergedCatalog } from './models-interceptor.js';
import { testModel, runAllTests } from './test-runner.js';
import { SSE_HEADERS, sseEvent } from './utils/sse-helper.js';
import { isComboId } from './utils/model-classifier.js';

const MAX_BODY_BYTES = 1_000_000;

/** Dispatch an /api/* request. */
export async function handleApiRequest(req, res, pathname) {
  try {
    switch (`${req.method} ${pathname}`) {
      case 'GET /api/config':
        return sendJson(res, 200, getConfig());

      case 'POST /api/config':
        return await handleSaveConfig(req, res);

      case 'GET /api/models':
        return await handleGetModels(res);

      case 'POST /api/models/refresh':
        return await handleRefresh(res);

      case 'GET /api/health':
        return await handleHealth(res);

      case 'POST /api/visibility/toggle':
        return await handleToggle(req, res);

      case 'POST /api/visibility/bulk':
        return await handleBulk(req, res);

      case 'POST /api/test/single':
        return await handleTestSingle(req, res);

      case 'POST /api/test/run':
        return await handleTestRun(req, res);

      default: {
        if (pathname.startsWith('/api/')) {
          return sendJson(res, 404, { error: `No such API endpoint: ${req.method} ${pathname}` });
        }
        return false; // not an API path — let server.js keep routing
      }
    }
  } catch (err) {
    console.error('[api] handler failure:', err);
    if (!res.headersSent) {
      sendJson(res, err.statusCode ?? 500, { error: err.message || 'Internal server error' });
    } else {
      res.end();
    }
  }
}

// --- handlers ---------------------------------------------------------------

async function handleSaveConfig(req, res) {
  const body = await readJsonBody(req);
  const prev = getConfig();
  const next = await updateConfig(body ?? {});
  const restartRequired =
    prev.proxyPort !== next.proxyPort || prev.proxyHost !== next.proxyHost;
  sendJson(res, 200, { ...next, restartRequired });
}

async function handleGetModels(res) {
  const models = await buildMergedCatalog();
  sendJson(res, 200, { models });
}

async function handleRefresh(res) {
  const catalog = await fetchCatalog({ force: true }); // throws -> 502 when upstream is down
  await upsertCatalog([
    ...catalog.models.map((m) => ({ id: m.id, isCombo: isComboId(m.id) })),
    ...catalog.combos.map((c) => ({ id: c.id, isCombo: true })),
  ]);
  await flushStore();
  sendJson(res, 200, {
    ok: true,
    models: catalog.models.length,
    combos: catalog.combos.length,
    stale: Boolean(catalog.stale),
  });
}

async function handleHealth(res) {
  const ping = await pingUpstream();
  sendJson(res, 200, {
    online: ping.online,
    latencyMs: ping.latencyMs,
    upstream: ping.online ? 'connected' : 'unreachable',
  });
}

async function handleToggle(req, res) {
  const body = await readJsonBody(req);
  if (typeof body?.modelId !== 'string' || !body.modelId.trim()) {
    return sendJson(res, 400, { error: 'modelId (string) is required' });
  }
  if (typeof body.visible !== 'boolean') {
    return sendJson(res, 400, { error: 'visible (boolean) is required' });
  }
  const entry = await setVisible(body.modelId.trim(), body.visible);
  sendJson(res, 200, { ok: true, modelId: body.modelId, visible: entry.visible });
}

const BULK_ACTIONS = new Set(['show_all_working', 'hide_all', 'hide_errors', 'invert']);

async function handleBulk(req, res) {
  const body = await readJsonBody(req);
  if (!BULK_ACTIONS.has(body?.action)) {
    return sendJson(res, 400, { error: `action must be one of: ${[...BULK_ACTIONS].join(', ')}` });
  }

  // Bulk rules evaluate over the merged catalog so entries only present in the
  // store still participate. Map index turns O(N*M) lookup into O(1).
  const catalog = await buildMergedCatalog();
  const testedMap = new Map(catalog.map((m) => [m.id, m.lastTested]));

  const changed = await bulkUpdate((entry) => {
    const tested = testedMap.get(entry.id) ?? entry.lastTested;
    switch (body.action) {
      case 'show_all_working':
        return tested?.status === 'success' ? true : undefined;
      case 'hide_all':
        return false;
      case 'hide_errors':
        return tested?.status === 'error' ? false : undefined;
      case 'invert':
        return !entry.visible;
    }
  });

  await flushStore();
  sendJson(res, 200, { ok: true, action: body.action, changed });
}

async function handleTestSingle(req, res) {
  const body = await readJsonBody(req);
  if (typeof body?.modelId !== 'string' || !body.modelId.trim()) {
    return sendJson(res, 400, { error: 'modelId (string) is required' });
  }
  const result = await testModel(body.modelId.trim(), {
    prompt: typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : undefined,
  });
  sendJson(res, 200, result); // status:'error' is a *diagnosis*, not an HTTP failure
}

async function handleTestRun(req, res) {
  const body = await readJsonBody(req);

  res.writeHead(200, SSE_HEADERS);
  sseWriteSafe(res, { type: 'start' }, 'start');

  // Dashboard "Stop" or tab close aborts scheduling of remaining tests.
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let summary;
  try {
    summary = await runAllTests(
      {
        prompt: typeof body?.prompt === 'string' ? body.prompt : undefined,
        concurrency: Number.isFinite(Number(body?.concurrency)) ? Number(body.concurrency) : undefined,
        autoHideOnFailure:
          typeof body?.autoHideOnFailure === 'boolean' ? body.autoHideOnFailure : undefined,
        autoShowOnSuccess:
          typeof body?.autoShowOnSuccess === 'boolean' ? body.autoShowOnSuccess : undefined,
        excludeVisible: typeof body?.excludeVisible === 'boolean' ? body.excludeVisible : undefined,
        excludeHidden: typeof body?.excludeHidden === 'boolean' ? body.excludeHidden : undefined,
        modelIds: Array.isArray(body?.modelIds) ? body.modelIds : undefined,
        signal: controller.signal,
      },
      (result) => sseWriteSafe(res, result, 'result') // one event per tested model
    );
    // Flush all batched test updates to disk at once upon completion
    await flushStore();
    sseWriteSafe(res, { type: 'done', ...summary }, 'done');
  } catch (err) {
    await flushStore();
    sseWriteSafe(res, { type: 'error', error: err.message }, 'error');
  }
  res.end(); // closing the connection tells the dashboard the run is complete
}

// --- plumbing ---------------------------------------------------------------

function sseWriteSafe(res, data, eventName) {
  if (res.writableEnded || res.destroyed) return;
  res.write(sseEvent(data, eventName));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}
