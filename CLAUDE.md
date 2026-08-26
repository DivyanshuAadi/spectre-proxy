# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Spectre Proxy: an ultra-lightweight Node.js proxy sitting between Omniroute (upstream) and AI client tools like Claude Code (downstream). It curates which models appear in Claude Code's `/model` selector, transparently proxies inference with unbuffered SSE streaming, and provides a dark-mode dashboard for visibility toggles and model health benchmarking.

Design constraints: pure Node.js native `http`/`https`, `"type": "module"` (ESM), **zero npm dependencies**, zero build step.

## Commands

```powershell
node server.js        # run the real server on http://localhost:3005
node serve.js         # legacy static/mock preview server (temporary, pre-backend)
```

No test suite, linter, or build step exists. Verify manually with curl:

```bash
curl -s http://localhost:3005/v1/models                                # filtered catalog
curl -s http://localhost:3005/v1/models -H "anthropic-version: 2023-06-01"  # Anthropic dual-format
curl -s http://localhost:3005/api/models                               # full dashboard catalog
```

The project directory name contains spaces and `&` — always quote paths in shell commands. Platform is Windows.

## Architecture

Three request classes dispatched from `server.js` (per BACKEND_PLAN.md):

1. **Management API** (`/api/*`) — REST + one SSE endpoint, consumed by the dashboard SPA.
2. **Model interception** (`GET /v1/models`, `GET /models`) — filters Omniroute's catalog to only entries with `visible === true` in `data/visibility.json`, then emits **dual format**: Anthropic shape (`{data: [{id, type: "model", display_name}], has_more}`) when an `anthropic-version` header is present, OpenAI shape (`{object: "list", data: [{id, object: "model", owned_by}]}`) otherwise.
3. **Transparent inference proxy** (`POST /v1/messages`, `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `GET /v1/models/:model`) — raw `req.pipe(proxyReq)` / `proxyRes.pipe(res)`, never buffer. Injects the Omniroute API key when the client omits one; destroys the upstream request on client `close`.

State lives in two JSON files under `data/` (auto-created): `config.json` (Omniroute URL/key, port, auto-hide flag, test prompt/concurrency) and `visibility.json` (per-model visibility, custom labels, last-test diagnostics). Persistence must be atomic (write temp + rename).

The frontend (`public/`) is a vanilla ES-module SPA (state.js pub/sub store, component renderers) built by a separate agent against FRONTEND_PLAN.md. It is served statically by the same server. Do not introduce bundlers or frameworks on either side.

### Backend ↔ Frontend contract (frontend is the source of truth)

The frontend is already written; the backend must match its exact shapes ([public/js/api.js](public/js/api.js), [public/js/state.js](public/js/state.js), [public/js/components/test-drawer.js](public/js/components/test-drawer.js)). Key details plans don't fully capture:

- `GET /api/models` → `{ models: [...] }`. Each entry: `id`, `name`, `provider`, `family`, `contextWindow` (string like `"200k"`), `maxTokens`, `capabilities: {vision, reasoning}`, `visible`, `isCombo`, `comboSteps`, `lastTested: {status: 'success'|'error', statusCode, latencyMs, ttftMs, response, error, timestamp}`. If this response is missing or `models` isn't an array, the SPA silently falls back to a built-in mock catalog — an empty array is fine during setup, malformed JSON silently shows fake data.
- `GET /api/health` → `{online, upstream}` — polled every 15s for the header badge.
- `GET/POST /api/config` → flat object: `omnirouteUrl`, `omnirouteApiKey`, `proxyPort`, `proxyHost`, `autoHideOnTestFailure`, `testPrompt`, `testConcurrency`.
- `POST /api/visibility/toggle` ← `{modelId, visible}`; `POST /api/visibility/bulk` ← `{action}` where action ∈ `show_all_working | hide_all | hide_errors | invert`.
- `POST /api/test/single` ← `{modelId, prompt}` → one result object (same `lastTested` shape).
- `POST /api/test/run` ← `{prompt, concurrency, autoHideOnFailure}` → **SSE stream**. Any event whose parsed `data` has a `modelId` is treated as a per-model result (`{modelId, status, statusCode, latencyMs, ttftMs, response, error, timestamp}`). The frontend counts progress locally from received events and considers the stream closed when the connection ends — so emit exactly one event per tested model and end the response when done.
- Errors: non-2xx responses should carry `{error: "<message>"}` — the API client surfaces `error.message` to toasts.

Error diagnostics matter: capture exact HTTP status codes and provider messages (401 invalid key, 402 payment/credits, 429 rate limit, 503 unavailable) into `lastTested.error`; auto-hide flips `visible = false` on failure when enabled.

## Planning Docs

- `BACKEND_PLAN.md` — authoritative spec for backend modules (`src/config.js`, `store.js`, `omniroute-client.js`, `proxy-handler.js`, `models-interceptor.js`, `test-runner.js`, `api-routes.js`, `utils/`). Follow its schemas verbatim.
- `FRONTEND_PLAN.md` / `your-task-is-to-fluttering-stardust.md` — context for what was already built; reference only.

`serve.js` is a throwaway mock/static server kept only so the SPA could be previewed before the backend existed — supersede it with `server.js`, then remove it.
