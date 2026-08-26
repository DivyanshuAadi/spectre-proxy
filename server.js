/**
 * Spectre Proxy — entrypoint & request dispatcher
 *
 *   /api/*                      -> src/api-routes.js        (dashboard REST + SSE)
 *   GET  /v1/models | /models   -> src/models-interceptor.js (curated dual-format catalog)
 *   POST /v1/messages, POST /v1/chat/completions, POST /v1/completions,
 *   POST /v1/embeddings, GET /v1/models/:model
 *                               -> src/proxy-handler.js      (transparent streaming)
 *   anything else (GET/HEAD)    -> static files from public/
 */

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, getConfig, CONFIG_FILE_PATH } from './src/config.js';
import { loadStore, STORE_FILE_PATH, flushStore } from './src/store.js';
import { handleApiRequest } from './src/api-routes.js';
import { handleModelsRequest } from './src/models-interceptor.js';
import { handleProxy } from './src/proxy-handler.js';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

// In-memory static asset cache to avoid blocking the event loop on disk reads
const staticCache = new Map();

// Inference paths proxied verbatim to Omniroute.
const PROXY_POST_PATHS = new Set(['/v1/messages', '/v1/chat/completions', '/v1/completions', '/v1/embeddings']);

function routeRequest(req, res) {
  const pathname = safePathname(req);
  if (!pathname) return sendJson(res, 400, { error: 'Malformed request path' });

  // 1. Management API
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return handleApiRequest(req, res, pathname);
  }

  // 2. Catalog interception (exact matches only — /v1/models/:id falls through to proxy)
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/v1/models' || pathname === '/models')) {
    return handleModelsRequest(req, res);
  }

  // 3. Transparent inference proxy
  if (
    (req.method === 'POST' && PROXY_POST_PATHS.has(pathname)) ||
    (req.method === 'GET' && /^\/v1\/models\/.+/.test(pathname))
  ) {
    return handleProxy(req, res);
  }

  // 4. Dashboard SPA static assets
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, pathname);
  }

  sendJson(res, 404, { error: `Not found: ${req.method} ${pathname}` });
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = normalize(join(PUBLIC_DIR, relative));

  // Path traversal guard: resolved target must stay inside public/.
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  let cached = staticCache.get(filePath);
  if (cached === undefined) {
    try {
      const buffer = await fs.readFile(filePath);
      const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      cached = { buffer, mime };
      staticCache.set(filePath, cached);
    } catch {
      staticCache.set(filePath, null); // negative cache
      cached = null;
    }
  }

  if (cached === null) {
    return sendJson(res, 404, { error: `Not found: ${pathname}` });
  }

  res.writeHead(200, {
    'Content-Type': cached.mime,
    'Content-Length': cached.buffer.length,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  res.end(cached.buffer);
}

function safePathname(req) {
  const url = req.url;
  if (!url) return '/';
  const qIdx = url.indexOf('?');
  const raw = qIdx === -1 ? url : url.slice(0, qIdx);
  if (raw.indexOf('%') === -1) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function sendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

// --- bootstrap ---------------------------------------------------------------

await loadConfig();
await loadStore();

const config = getConfig();
const server = createServer(
  {
    keepAlive: true,
    keepAliveInitialDelay: 1000,
    noDelay: true,
  },
  routeRequest
);

// Mitigate stale-socket races between Node HTTP keep-alive and clients
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.proxyPort} is already in use. Stop the other process or change proxyPort in ${CONFIG_FILE_PATH}.`);
    process.exit(1);
  }
  throw err;
});

server.listen(config.proxyPort, config.proxyHost, () => {
  const displayHost = config.proxyHost === '0.0.0.0' ? 'localhost' : config.proxyHost;
  console.log('Spectre Proxy');
  console.log(`  Dashboard : http://${displayHost}:${config.proxyPort}`);
  console.log(`  Upstream  : ${config.omnirouteUrl}`);
  console.log(`  State     : ${CONFIG_FILE_PATH}`);
  console.log(`              ${STORE_FILE_PATH}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    try {
      await flushStore();
    } catch {
      /* ignore shutdown flush error */
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref(); // don't hang on open streams
  });
}
