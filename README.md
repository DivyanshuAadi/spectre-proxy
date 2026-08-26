# Spectre Proxy ⚡

**Spectre Proxy** is an ultra-lightweight, zero-dependency Node.js proxy that sits between [Omniroute](https://github.com/) (upstream) and AI developer tools like **Claude Code**, **Cursor**, and **Cline** (downstream).

It filters and curates which models appear in client `/model` selectors, transparently proxies inference with unbuffered Server-Sent Events (SSE) streaming, and provides an Obsidian/Neon-dark dashboard for model visibility management, health benchmarking, and latency diagnostics.

---

## ✨ Features

- **Zero npm Dependencies**: Pure native Node.js (`http`/`https`, ESM) — no `node_modules` installation or build step needed.
- **Dual-Format Model Catalog**: Intercepts `/v1/models` and `/models` to dynamically output **Anthropic** format (when `anthropic-version` header is present) or **OpenAI** format for universal client compatibility.
- **Zero-Overhead Transparent Inference**: Proxies `/v1/messages`, `/v1/chat/completions`, `/v1/completions`, and `/v1/embeddings` directly to Omniroute with unbuffered streaming pipelines (`req.pipe(proxyReq)` / `proxyRes.pipe(res)`).
- **High-Performance Architecture**: Built-in HTTP connection pooling (`keep-alive`), TCP_NODELAY, pre-serialized catalog caching, and atomic debounced disk persistence.
- **Automated Health & Benchmarking Drawer**:
  - Live model latency (TTFT + full roundtrip) testing with configurable concurrency.
  - Granular error capture (e.g. `401`, `402` credits, `429` rate limit, `503` unavailable).
  - Optional **Auto-Hide on Failure** & **Auto-Show on Success**.
- **Dark Mode Dashboard SPA**: Vanilla ES Module Single Page Application served statically from `public/`.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: >= 18.0.0 (Native ESM support)
- An active **Omniroute** instance

### 2. Run Locally

```bash
# Clone the repository
git clone https://github.com/your-username/spectre-proxy.git
cd spectre-proxy

# Copy environment template (optional)
cp .env.example .env

# Start the proxy server
npm start
# or: node server.js
```

The proxy dashboard will be available at: **`http://localhost:3005`**

---

### 3. Run with Docker / Docker Compose

```bash
docker compose up -d --build
```

---

## 🛠️ Client Configuration

### Claude Code CLI

Set the base URL environment variable to point to Spectre Proxy:

```bash
# Linux / macOS
export ANTHROPIC_BASE_URL=http://localhost:3005

# Windows PowerShell
$env:ANTHROPIC_BASE_URL="http://localhost:3005"
```

Now running `claude` and using the `/model` selector will only show the models you've marked as visible in the Spectre dashboard!

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OMNIROUTE_URL` | `http://localhost:8000` | URL of the upstream Omniroute instance |
| `OMNIROUTE_API_KEY` | *(empty)* | Optional API key injected when downstream requests lack auth |
| `PORT` / `PROXY_PORT` | `3005` | Port the proxy listens on |
| `HOST` / `PROXY_HOST` | `0.0.0.0` | Host bind address |
| `DATA_DIR` | `./data` | Custom storage directory for `config.json` and `visibility.json` |

---

## 📂 Project Structure

```
.
├── server.js              # Entrypoint & HTTP dispatcher (Native Node)
├── package.json           # Manifest (zero external dependencies)
├── Dockerfile             # Alpine Node.js container
├── docker-compose.yml     # Compose setup with volume mount
├── data/                  # Local persistence (config.json, visibility.json)
├── src/                   # Backend architecture
│   ├── api-routes.js      # Dashboard REST + SSE endpoints
│   ├── config.js          # In-memory config store
│   ├── models-interceptor.js # Dual-format filtered /v1/models catalog
│   ├── omniroute-client.js# Upstream HTTP client
│   ├── proxy-handler.js   # Zero-latency streaming inference proxy
│   ├── store.js           # Atomic JSON disk persistence
│   ├── test-runner.js     # Concurrency-controlled model testing
│   └── utils/             # HTTP agents, cache, classifier, SSE helpers
└── public/                # Frontend UI Dashboard SPA (ES Modules + CSS)
    ├── index.html
    ├── genome.png         # Favicon & logo
    ├── css/               # Modular styling (theme, layout, components)
    └── js/                # State store, API client, component renderers
```

---

## 📄 License

[MIT](LICENSE)
