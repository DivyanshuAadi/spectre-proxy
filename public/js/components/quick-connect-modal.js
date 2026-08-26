/**
 * Spectre Proxy — Quick Connect Modal Component
 * Interactive Endpoint Configurator, Live API Key Generator & Multi-Client Snippets
 */

import { store } from '../state.js';
import { api } from '../api.js';

export class QuickConnectModalComponent {
  constructor(overlayElement, onToast) {
    this.overlay = overlayElement;
    this.onToast = onToast;
    this.activeTab = 'powershell';
    this.customHost = 'http://localhost:3005';
    this.customKey = '';
    this.isKeyMasked = false;
    this.activePreset = 'localhost';
    this.init();
  }

  init() {
    this.render();
    store.subscribe('isQuickConnectOpen', (isOpen) => {
      if (isOpen) {
        // Sync with active config if customKey is empty
        const config = store.get().config;
        if (!this.customKey) {
          this.customKey = config.omnirouteApiKey || 'sk-omniroute-key';
        }
        if (!this.customHost) {
          const port = config.proxyPort || 3005;
          this.customHost = `http://localhost:${port}`;
        }
        this.render();
      }
      this.toggleModal(isOpen);
    });
    store.subscribe('config', () => this.render());
  }

  toggleModal(isOpen) {
    if (isOpen) {
      this.overlay.classList.add('active');
    } else {
      this.overlay.classList.remove('active');
    }
  }

  generateRandomKey() {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sk-proxy-${randomHex}`;
  }

  getEffectiveHost() {
    return (this.customHost || 'http://localhost:3005').replace(/\/+$/, '');
  }

  getEffectiveKey() {
    if (this.customKey && this.customKey.trim()) {
      return this.customKey.trim();
    }
    const configKey = store.get().config?.omnirouteApiKey;
    return configKey || 'sk-proxy-demo-key';
  }

  getSnippets() {
    const host = this.getEffectiveHost();
    const apiKey = this.getEffectiveKey();

    return {
      powershell: `# Set environment variables and launch Claude Code CLI
$env:ANTHROPIC_BASE_URL="${host}"
$env:ANTHROPIC_API_KEY="${apiKey}"
claude`,

      bash: `# Export variables and launch Claude Code CLI
export ANTHROPIC_BASE_URL="${host}"
export ANTHROPIC_API_KEY="${apiKey}"
claude`,

      json: `{
  "env": {
    "ANTHROPIC_BASE_URL": "${host}",
    "ANTHROPIC_API_KEY": "${apiKey}"
  }
}`,

      cursor: `# In Cursor / Continue / Cline Settings:
Base URL:  ${host}/v1
API Key:   ${apiKey}
Model:     Any exposed model ID from this dashboard`,

      python: `import anthropic

client = anthropic.Anthropic(
    base_url="${host}",
    api_key="${apiKey}",
)

# Test a prompt with any exposed model
response = client.messages.create(
    model="claude-3-7-sonnet",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello via Spectre Proxy!"}]
)
print(response.content[0].text)`,

      curl: `# Test proxy model list
curl ${host}/v1/models \\
  -H "x-api-key: ${apiKey}"

# Test direct message completion
curl ${host}/v1/messages \\
  -H "x-api-key: ${apiKey}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-3-7-sonnet","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}'`,
    };
  }

  render() {
    if (!this.overlay) return;
    const config = store.get().config || {};
    const port = config.proxyPort || 3005;
    const effectiveHost = this.getEffectiveHost();
    const effectiveKey = this.getEffectiveKey();
    const snippets = this.getSnippets();

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width: 720px;">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-lime)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            Quick Connect & Endpoint Configuration
          </div>
          <button class="btn-icon sm" id="btn-close-quick-connect" title="Close">✕</button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body" style="gap: 1.15rem;">
          <p style="font-size:0.83rem; color:var(--text-secondary); line-height:1.45;">
            Configure your proxy endpoint and API key to generate customized connection snippets for Claude Code, Cursor, Cline, and SDKs.
          </p>

          <!-- 1. Host & Endpoint Configuration Box -->
          <div style="background:var(--bg-surface-0); border:1px solid var(--border-medium); border-radius:var(--radius-lg); padding:1rem; display:flex; flex-direction:column; gap:0.75rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
              <span style="font-size:0.78rem; font-weight:700; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:0.35rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                1. Proxy Host & Port
                <span class="info-help-btn" data-tooltip="The target address where Spectre Proxy is running. Use localhost for local tools, or your network/Tailscale IP for remote machines.">?</span>
              </span>

              <!-- Host Preset Pills -->
              <div style="display:flex; align-items:center; gap:0.3rem;" id="host-presets-group">
                <button class="filter-pill ${this.activePreset === 'localhost' ? 'active' : ''}" data-preset="localhost" data-host="http://localhost:${port}" style="font-size:0.72rem; padding:0.2rem 0.55rem;">localhost</button>
                <button class="filter-pill ${this.activePreset === 'loopback' ? 'active' : ''}" data-preset="loopback" data-host="http://127.0.0.1:${port}" style="font-size:0.72rem; padding:0.2rem 0.55rem;">127.0.0.1</button>
                <button class="filter-pill ${this.activePreset === 'tailscale' ? 'active' : ''}" data-preset="tailscale" data-host="http://100.x.y.z:${port}" style="font-size:0.72rem; padding:0.2rem 0.55rem;">Tailscale</button>
                <button class="filter-pill ${this.activePreset === 'azure' ? 'active' : ''}" data-preset="azure" data-host="http://20.x.y.z:${port}" style="font-size:0.72rem; padding:0.2rem 0.55rem;">Azure VM</button>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:0.6rem;">
              <div style="position:relative; flex:1; display:flex; align-items:center;">
                <input 
                  type="text" 
                  class="input-control" 
                  id="quick-connect-host-input" 
                  value="${escapeHtml(effectiveHost)}" 
                  placeholder="http://localhost:3005"
                  style="width:100%; font-family:var(--font-mono); font-size:0.84rem; padding-left:0.85rem;"
                />
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-reset-host" title="Reset to default local port" style="font-size:0.75rem;">Reset</button>
            </div>
          </div>

          <!-- 2. API Key (Client Auth / Header Key) -->
          <div style="background:var(--bg-surface-0); border:1px solid var(--border-medium); border-radius:var(--radius-lg); padding:1rem; display:flex; flex-direction:column; gap:0.75rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
              <span style="font-size:0.78rem; font-weight:700; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:0.35rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
                2. API Key (Client Auth / Header Key)
                <span class="info-help-btn" data-tooltip="Authorization key supplied to Claude Code or IDE plugins in the Authorization header to authenticate requests.">?</span>
              </span>
              <button class="btn btn-secondary btn-sm" id="btn-copy-quick-key" style="font-size:0.72rem; padding:0.25rem 0.6rem; gap:0.3rem;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                Copy Key
              </button>
            </div>

            <div style="position:relative; display:flex; align-items:center;">
              <input 
                type="${this.isKeyMasked ? 'password' : 'text'}" 
                class="input-control" 
                id="quick-connect-key-input" 
                value="${escapeHtml(effectiveKey)}" 
                placeholder="sk-proxy-..."
                readonly
                style="width:100%; padding-right:2.5rem; font-family:var(--font-mono); font-size:0.84rem; cursor:default; background:var(--bg-surface-1);"
              />
              <button 
                class="btn-icon sm" 
                id="btn-toggle-quick-key-mask" 
                type="button" 
                style="position:absolute; right:0.5rem; background:none; border:none; color:var(--text-muted); display:inline-flex; align-items:center; justify-content:center;" 
                title="Toggle key visibility"
              >
                ${this.isKeyMasked ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>` : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`}
              </button>
            </div>
          </div>

          <!-- 3. Code Snippet Tabs -->
          <div>
            <div class="code-tab-nav" style="margin-bottom:0.75rem;">
              <button class="code-tab-btn ${this.activeTab === 'powershell' ? 'active' : ''}" data-tab="powershell">PowerShell</button>
              <button class="code-tab-btn ${this.activeTab === 'bash' ? 'active' : ''}" data-tab="bash">Bash / Zsh</button>
              <button class="code-tab-btn ${this.activeTab === 'json' ? 'active' : ''}" data-tab="json">settings.json</button>
              <button class="code-tab-btn ${this.activeTab === 'cursor' ? 'active' : ''}" data-tab="cursor">Cursor / Cline</button>
              <button class="code-tab-btn ${this.activeTab === 'python' ? 'active' : ''}" data-tab="python">Python SDK</button>
              <button class="code-tab-btn ${this.activeTab === 'curl' ? 'active' : ''}" data-tab="curl">cURL</button>
            </div>

            <!-- Code Block with Copy Action -->
            <div class="code-block-wrapper" style="min-height: 120px;">
              <button class="btn btn-outline-lime btn-sm copy-snippet-btn" id="btn-copy-snippet" title="Copy snippet to clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                Copy
              </button>
              <pre class="code-block" id="snippet-code-text">${escapeHtml(snippets[this.activeTab])}</pre>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer" style="justify-content: space-between;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">
            Models visible: <span style="color:var(--accent-lime); font-weight:700;">${store.get().models.filter(m => m.visible).length}</span> exposed
          </div>
          <button class="btn btn-secondary" id="btn-dismiss-quick-connect">Close</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Close button & Dismiss
    const closeBtn = this.overlay.querySelector('#btn-close-quick-connect');
    const dismissBtn = this.overlay.querySelector('#btn-dismiss-quick-connect');
    const closeHandler = () => store.set({ isQuickConnectOpen: false });

    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (dismissBtn) dismissBtn.addEventListener('click', closeHandler);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) closeHandler();
    });

    // Preset Pills
    const presetPills = this.overlay.querySelectorAll('#host-presets-group .filter-pill');
    const hostInput = this.overlay.querySelector('#quick-connect-host-input');

    presetPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        presetPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.activePreset = pill.dataset.preset;
        this.customHost = pill.dataset.host;
        if (hostInput) hostInput.value = this.customHost;
        this.updateSnippetDisplay();
      });
    });

    // Custom Host Input
    if (hostInput) {
      hostInput.addEventListener('input', (e) => {
        this.customHost = e.target.value;
        this.updateSnippetDisplay();
      });
    }

    // Reset Host Button
    const resetHostBtn = this.overlay.querySelector('#btn-reset-host');
    if (resetHostBtn) {
      resetHostBtn.addEventListener('click', () => {
        const port = store.get().config?.proxyPort || 3005;
        this.customHost = `http://localhost:${port}`;
        this.activePreset = 'localhost';
        if (hostInput) hostInput.value = this.customHost;
        presetPills.forEach((p) => p.classList.toggle('active', p.dataset.preset === 'localhost'));
        this.updateSnippetDisplay();
        if (this.onToast) this.onToast('Reset host to localhost', 'info');
      });
    }

    // Copy Quick Key
    const copyKeyBtn = this.overlay.querySelector('#btn-copy-quick-key');
    if (copyKeyBtn) {
      copyKeyBtn.addEventListener('click', async () => {
        const configKey = store.get().config?.omnirouteApiKey || '';
        const effectiveKey = this.customKey || configKey || 'sk-omniroute-default';
        try {
          await navigator.clipboard.writeText(effectiveKey);
          if (this.onToast) this.onToast('API Key copied to clipboard', 'success');
        } catch {
          if (this.onToast) this.onToast('Failed to copy API key', 'error');
        }
      });
    }

    // Toggle Key Mask
    const maskBtn = this.overlay.querySelector('#btn-toggle-quick-key-mask');
    const keyInput = this.overlay.querySelector('#quick-connect-key-input');
    const eyeIconMasked = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeIconUnmasked = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    if (maskBtn && keyInput) {
      maskBtn.addEventListener('click', () => {
        this.isKeyMasked = !this.isKeyMasked;
        keyInput.type = this.isKeyMasked ? 'password' : 'text';
        maskBtn.innerHTML = this.isKeyMasked ? eyeIconMasked : eyeIconUnmasked;
      });
    }

    // Tab buttons
    const tabBtns = this.overlay.querySelectorAll('.code-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        this.updateSnippetDisplay();
      });
    });

    // Copy snippet button
    const copyBtn = this.overlay.querySelector('#btn-copy-snippet');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const snippets = this.getSnippets();
        const text = snippets[this.activeTab];
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.innerHTML = `✓ Copied!`;
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Copy
            `;
          }, 2000);
          if (this.onToast) this.onToast('Snippet copied to clipboard', 'success');
        } catch (err) {
          console.error('Failed to copy snippet:', err);
        }
      });
    }
  }

  updateSnippetDisplay() {
    const snippets = this.getSnippets();
    const codeElem = this.overlay.querySelector('#snippet-code-text');
    if (codeElem) {
      codeElem.textContent = snippets[this.activeTab];
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
