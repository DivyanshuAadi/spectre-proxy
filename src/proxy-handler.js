/**
 * Transparent Streaming Proxy
 * Pipes inference traffic straight through to Omniroute — never buffers.
 * Reuses persistent Keep-Alive connections with TCP_NODELAY and immediate header flushing.
 * Connect timeout is cancelled once response headers arrive so long reasoning streams survive.
 */

import http from 'node:http';
import https from 'node:https';
import { getConfig } from './config.js';
import { getAgent, attachSocketNoDelay } from './utils/http-agent.js';

// Complete hop-by-hop / transport headers we must not copy verbatim across pooled connections.
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'proxy-connection',
]);

const STRIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'trailer',
  'upgrade',
  'proxy-connection',
]);

const CONNECT_TIMEOUT_MS = 30_000;
const STREAM_IDLE_TIMEOUT_MS = 300_000; // 5 minutes generous idle gap for slow reasoning generation

/** Handle any whitelisted inference request listed in server.js. */
export function handleProxy(req, res) {
  const cfg = getConfig();
  let base;
  try {
    base = new URL(cfg.omnirouteUrl);
  } catch {
    sendJsonError(res, 500, `Invalid omnirouteUrl in config: "${cfg.omnirouteUrl}"`);
    return;
  }

  const target = new URL(req.url, base); // preserves incoming path + query
  const isHttps = target.protocol === 'https:';
  const transport = isHttps ? https : http;

  // Optimize socket options on incoming client connection
  req.socket?.setNoDelay(true);
  res.socket?.setNoDelay(true);

  // Fast header copying without Object.entries() array allocations
  const headers = {};
  for (const key in req.headers) {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers[key] = req.headers[key];
    }
  }

  // Inject the configured Omniroute key only when the client didn't bring one.
  if (cfg.omnirouteApiKey && !headers.authorization && !headers['x-api-key']) {
    headers.authorization = `Bearer ${cfg.omnirouteApiKey}`;
    headers['x-api-key'] = cfg.omnirouteApiKey;
  }

  let connectTimer = null;

  const proxyReq = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
      agent: getAgent(isHttps),
    },
    (proxyRes) => {
      // Connect phase is complete; clear connect timeout so slow token generation is not interrupted
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }

      // Generous stream-level idle safety timeout
      proxyReq.setTimeout(STREAM_IDLE_TIMEOUT_MS, () => {
        proxyReq.destroy(Object.assign(new Error('Stream idle timeout exceeded'), { code: 'ETIMEDOUT' }));
        res.destroy();
      });

      const outHeaders = {};
      for (const key in proxyRes.headers) {
        if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
          outHeaders[key] = proxyRes.headers[key];
        }
      }

      res.writeHead(proxyRes.statusCode ?? 502, outHeaders);
      // Immediately flush headers to client so TTFB is minimal
      res.flushHeaders?.();

      proxyRes.pipe(res); // raw passthrough — zero buffering, SSE-safe
      proxyRes.on('error', () => res.destroy());
    }
  );

  // Disable Nagle's algorithm on the outgoing socket as soon as it is assigned
  attachSocketNoDelay(proxyReq);

  // Connect-phase timeout (cleared as soon as response headers arrive)
  connectTimer = setTimeout(() => {
    connectTimer = null;
    if (!res.headersSent) sendJsonError(res, 504, 'Upstream connect timed out');
    proxyReq.destroy();
  }, CONNECT_TIMEOUT_MS);

  proxyReq.on('error', (err) => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    if (!res.headersSent) {
      const message =
        err.code === 'ECONNREFUSED'
          ? 'Cannot reach Omniroute upstream (connection refused)'
          : err.code === 'ETIMEDOUT'
            ? 'Upstream timed out'
            : err.code === 'ECONNRESET'
              ? 'Upstream connection reset'
              : `Proxy failure: ${err.message}`;
      sendJsonError(res, 502, message);
    } else {
      res.destroy(); // mid-stream failure — nothing left to signal cleanly
    }
  });

  const cleanup = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    if (!proxyReq.destroyed) proxyReq.destroy();
  };

  // Immediate teardown on client abort or socket close
  req.on('aborted', cleanup);
  req.on('error', cleanup);
  res.on('close', () => {
    if (!res.writableEnded) cleanup();
  });

  req.pipe(proxyReq); // stream request body straight upstream
}

function sendJsonError(res, status, message) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}
