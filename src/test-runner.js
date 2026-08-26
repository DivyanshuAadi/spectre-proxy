/**
 * Test Runner — Model Health Benchmarking
 * Streams a tiny prompt to every model/combo through Omniroute, measures TTFT
 * and total latency, captures exact failure diagnostics (HTTP status + provider
 * message), optionally auto-hides failures / auto-shows successes, and reports
 * results one-by-one so the dashboard can stream live progress over SSE.
 * Uses persistent Keep-Alive agents without socket destruction on success.
 */

import http from 'node:http';
import https from 'node:https';
import { getConfig } from './config.js';
import { fetchCatalog } from './omniroute-client.js';
import { isAnthropicModel } from './utils/model-classifier.js';
import { recordTestResult, getEntry } from './store.js';
import { getAgent, attachSocketNoDelay } from './utils/http-agent.js';

const MAX_TEST_TOKENS = 64;
const OVERALL_TIMEOUT_MS = 90_000;
const MAX_ERROR_BODY = 32 * 1024;

/** Human-readable diagnosis per HTTP status (plan §4.4). */
const STATUS_DIAGNOSES = {
  400: 'Bad Request',
  401: 'Unauthorized / Invalid API key',
  402: 'Payment Required / Insufficient credits',
  403: 'Forbidden / Access denied',
  404: 'Not Found / Model unavailable on this node',
  408: 'Request Timeout',
  422: 'Unprocessable Request',
  429: 'Rate Limited / Upstream quota exceeded',
  500: 'Internal Server Error',
  502: 'Provider Unavailable',
  503: 'Provider Unavailable / Model offline',
  504: 'Upstream Gateway Timeout',
};

/**
 * Test a single model or combo.
 * @param {string} modelId
 * @param {{prompt?: string, autoHideOnFailure?: boolean, autoShowOnSuccess?: boolean}} [opts]
 * @returns {Promise<{modelId, status:'success'|'error', statusCode, latencyMs, ttftMs?, response?, error?, timestamp}>}
 */
export async function testModel(modelId, opts = {}) {
  const cfg = getConfig();
  const prompt = opts.prompt || cfg.testPrompt;
  const autoHide = opts.autoHideOnFailure ?? cfg.autoHideOnTestFailure;
  const autoShow = opts.autoShowOnSuccess ?? cfg.autoShowOnTestSuccess;
  const startedAt = Date.now();

  let result;
  try {
    result = await executeTest(modelId, prompt, startedAt);
  } catch (err) {
    result = {
      modelId,
      status: 'error',
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      ttftMs: null,
      error: describeNetworkError(err),
    };
  }

  const final = { ...result, modelId, timestamp: Date.now() };
  await recordTestResult(modelId, final, autoHide, autoShow);
  return final;
}

// --- single-model execution -------------------------------------------------

async function executeTest(modelId, prompt, startedAt) {
  const anthropicStyle = isAnthropicModel(modelId);
  const path = anthropicStyle ? '/v1/messages' : '/v1/chat/completions';
  const body = JSON.stringify({
    model: modelId,
    max_tokens: MAX_TEST_TOKENS,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  });

  const res = await sendStreaming(path, anthropicStyle, body);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const errBody = await drainErrorBody(res);
    return {
      status: 'error',
      statusCode: res.statusCode,
      latencyMs: Date.now() - startedAt,
      ttftMs: null,
      error: formatHttpError(res.statusCode, errBody),
    };
  }
  // Successful streaming drains cleanly to 'end' so the pooled socket is preserved
  return await consumeStream(res, modelId, startedAt);
}

function sendStreaming(path, anthropicStyle, body) {
  const cfg = getConfig();
  const base = new URL(cfg.omnirouteUrl);
  const target = new URL(path, base);
  const isHttps = target.protocol === 'https:';
  const transport = isHttps ? https : http;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'Content-Length': Buffer.byteLength(body),
  };
  if (cfg.omnirouteApiKey) {
    headers.Authorization = `Bearer ${cfg.omnirouteApiKey}`;
    headers['x-api-key'] = cfg.omnirouteApiKey;
  }
  if (anthropicStyle) headers['anthropic-version'] = '2023-06-01';

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers,
        agent: getAgent(isHttps),
      },
      resolve
    );
    attachSocketNoDelay(req);
    req.setTimeout(OVERALL_TIMEOUT_MS, () =>
      req.destroy(Object.assign(new Error('Test timed out'), { code: 'ETIMEDOUT' }))
    );
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Consume an SSE (or plain JSON) success response, measuring time-to-first-token.
 * Drains cleanly on end so socket is returned to the Keep-Alive pool.
 */
async function consumeStream(res, modelId, startedAt) {
  let ttftMs = null;
  let text = '';
  let buffer = '';
  let sawSseFrame = false;

  return await new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => {
      res.destroy();
      reject(Object.assign(new Error('No response within timeout'), { code: 'ETIMEDOUT' }));
    }, OVERALL_TIMEOUT_MS);

    res.on('data', (chunk) => {
      if (ttftMs === null && chunk.length > 0) ttftMs = Date.now() - startedAt;
      buffer += chunk.toString('utf8');

      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        sawSseFrame = true;
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        text += extractSseText(frame);
      }
    });

    res.on('end', () => {
      clearTimeout(watchdog);
      // Some providers ignore stream:true and answer with plain JSON.
      if (!sawSseFrame && !text.trim()) text = extractJsonText(buffer);
      resolve({
        status: 'success',
        statusCode: res.statusCode,
        latencyMs: Date.now() - startedAt,
        ttftMs,
        response: text.replace(/\s+/g, ' ').trim().slice(0, 200) || '(empty response)',
      });
    });

    res.on('error', (err) => {
      clearTimeout(watchdog);
      reject(err);
    });
  });
}

/** Pull assistant-visible text out of one SSE frame (either API dialect). */
function extractSseText(frame) {
  let out = '';
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const evt = JSON.parse(payload);
      out +=
        evt?.delta?.text ?? // Anthropic content_block_delta
        evt?.choices?.[0]?.delta?.content ?? // OpenAI chat delta
        evt?.choices?.[0]?.text ?? // OpenAI legacy completions
        '';
    } catch {
      /* keepalive comments / partial frames are ignored */
    }
  }
  return out;
}

/** Best-effort text extraction from a non-streamed JSON reply. */
function extractJsonText(raw) {
  try {
    const evt = JSON.parse(raw);
    if (Array.isArray(evt?.content)) {
      return evt.content.map((b) => b.text ?? '').join('');
    }
    return evt?.choices?.[0]?.message?.content ?? evt?.choices?.[0]?.text ?? '';
  } catch {
    return '';
  }
}

async function drainErrorBody(res) {
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of res) {
      size += chunk.length;
      chunks.push(chunk);
      if (size >= MAX_ERROR_BODY) {
        res.destroy();
        break;
      }
    }
  } catch {
    /* ignore drain abort */
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** "402 Payment Required / Insufficient credits: Your balance is $0.00" */
function formatHttpError(statusCode, rawBody) {
  const label = STATUS_DIAGNOSES[statusCode] ?? `HTTP ${statusCode} Error`;
  const providerMessage = extractProviderErrorMessage(rawBody);
  return `${label}${providerMessage ? `: ${providerMessage}` : ''}`;
}

function extractProviderErrorMessage(rawBody) {
  if (!rawBody) return '';
  try {
    const parsed = JSON.parse(rawBody);
    const msg =
      parsed?.error?.message ??
      parsed?.error ??
      parsed?.message ??
      parsed?.detail ??
      (typeof parsed === 'string' ? parsed : '');
    if (typeof msg !== 'string') return '';
    return msg.replace(/\s+/g, ' ').trim().slice(0, 300);
  } catch {
    return String(rawBody).replace(/\s+/g, ' ').trim().slice(0, 300);
  }
}

function describeNetworkError(err) {
  switch (err?.code) {
    case 'ECONNREFUSED':
      return 'Cannot reach Omniroute upstream (connection refused)';
    case 'ETIMEDOUT':
      return 'Upstream timed out during test';
    case 'ECONNRESET':
      return 'Connection reset by upstream mid-test';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Omniroute hostname could not be resolved';
    default:
      return err?.message || 'Unknown network failure';
  }
}

// --- batch runner -----------------------------------------------------------

/**
 * Run the benchmark across the full catalog with bounded concurrency.
 *
 * @param {{prompt?: string, concurrency?: number, autoHideOnFailure?: boolean, autoShowOnSuccess?: boolean}} opts
 * @param {(result: object) => (void | Promise<void>)} onResult called as each test finishes
 * @returns {Promise<{total:number, passed:number, failed:number}>}
 */
export async function runAllTests(opts = {}, onResult) {
  const cfg = getConfig();
  const prompt = opts.prompt || cfg.testPrompt;
  const concurrency = Math.min(8, Math.max(1, Number(opts.concurrency) || cfg.testConcurrency));
  const autoHide = opts.autoHideOnFailure ?? cfg.autoHideOnTestFailure;
  const autoShow = opts.autoShowOnSuccess ?? cfg.autoShowOnTestSuccess;

  let ids = [];
  if (Array.isArray(opts.modelIds) && opts.modelIds.length > 0) {
    ids = opts.modelIds;
  } else {
    const catalog = await fetchCatalog({ force: true }).catch(() => ({ models: [], combos: [] }));
    ids = [
      ...catalog.models.map((m) => m.id),
      ...catalog.combos.map((c) => c.id),
    ];
    if (opts.excludeVisible) {
      ids = ids.filter((id) => {
        const entry = getEntry(id);
        return !entry?.visible;
      });
    } else if (opts.excludeHidden) {
      ids = ids.filter((id) => {
        const entry = getEntry(id);
        return !!entry?.visible;
      });
    }
  }

  let passed = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length && !opts.signal?.aborted) {
      const id = ids[cursor++];
      const result = await testModel(id, { prompt, autoHideOnFailure: autoHide, autoShowOnSuccess: autoShow });
      if (result.status === 'success') passed++;
      else failed++;
      await onResult?.(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return { total: ids.length, passed, failed };
}
