/**
 * Spectre Proxy — Settings Modal Component
 * Omniroute URL, API Key, Proxy Port Configuration, Key Generator & Live Upstream Ping
 */

import { store } from '../state.js';
import { api } from '../api.js';

export class SettingsModalComponent {
  constructor(overlayElement, onToast) {
    this.overlay = overlayElement;
    this.onToast = onToast;
    this.isPasswordVisible = false;
    this.init();
  }

  init() {
    this.render();
    store.subscribe('isSettingsOpen', (isOpen) => this.toggleModal(isOpen));
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
    return `sk-omniroute-${randomHex}`;
  }

  render() {
    if (!this.overlay) return;
    const config = store.get().config || {};

    const eyeIconMasked = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeIconUnmasked = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    this.overlay.innerHTML = `
      <div class="modal-card">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Proxy & Omniroute Settings
          </div>
          <button class="btn-icon sm" id="btn-close-settings" title="Close">✕</button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <!-- Upstream Omniroute Base URL -->
          <div class="drawer-control-group">
            <label class="drawer-label" for="settings-omniroute-url">
              <span style="display:inline-flex; align-items:center;">
                Omniroute Base URL
                <span class="info-help-btn" data-tooltip="The network address where your upstream Omniroute instance is listening (e.g. http://localhost:8000 or a Tailscale/LAN IP).">?</span>
              </span>
              <span style="font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono);">Upstream Endpoint</span>
            </label>
            <input 
              type="text" 
              class="input-control" 
              id="settings-omniroute-url" 
              value="${escapeHtml(config.omnirouteUrl || 'http://localhost:8000')}"
              placeholder="http://localhost:8000"
            />
          </div>

          <!-- Omniroute API Key -->
          <div class="drawer-control-group">
            <div class="drawer-label">
              <span style="display:inline-flex; align-items:center;">
                Omniroute API Key (Bearer Token)
                <span class="info-help-btn" data-tooltip="Upstream API key used by Spectre Proxy when contacting Omniroute /v1/models and model endpoints.">?</span>
              </span>
              <span style="font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono);">Upstream Auth</span>
            </div>
            <div style="position:relative; display:flex; align-items:center;">
              <input 
                type="${this.isPasswordVisible ? 'text' : 'password'}" 
                class="input-control" 
                id="settings-api-key" 
                value="${escapeHtml(config.omnirouteApiKey || '')}"
                placeholder="sk-omniroute-..."
                style="width:100%; padding-right:2.5rem; font-family:var(--font-mono);"
              />
              <button 
                class="btn-icon sm" 
                id="btn-toggle-key-visibility" 
                type="button" 
                style="position:absolute; right:0.5rem; background:none; border:none; color:var(--text-muted); display:inline-flex; align-items:center; justify-content:center;" 
                title="Toggle visibility"
              >
                ${this.isPasswordVisible ? eyeIconUnmasked : eyeIconMasked}
              </button>
            </div>
          </div>

          <!-- Proxy Port -->
          <div class="drawer-control-group">
            <label class="drawer-label" for="settings-proxy-port">
              <span style="display:inline-flex; align-items:center;">
                Proxy Server Port
                <span class="info-help-btn" data-tooltip="The local network port on your machine where Spectre Proxy listens (default: 3005).">?</span>
              </span>
              <span style="font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono);">Local listener</span>
            </label>
            <input 
              type="number" 
              class="input-control" 
              id="settings-proxy-port" 
              value="${config.proxyPort || 3005}"
              placeholder="3005"
            />
          </div>

          <!-- Diagnostic Connection Ping Section -->
          <div style="display:flex; align-items:center; justify-content:space-between; padding:0.85rem 1rem; background:var(--bg-surface-0); border:1px solid var(--border-subtle); border-radius:var(--radius-md); margin-top:0.5rem;">
            <div style="display:flex; flex-direction:column;">
              <span style="font-size:0.82rem; font-weight:600; color:var(--text-primary);">Omniroute Connectivity</span>
              <span id="ping-status-text" style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono);">Status: Click to test connection</span>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-test-ping" type="button">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              Ping Upstream
            </button>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-settings" type="button">Cancel</button>
          <button class="btn btn-primary" id="btn-save-settings" type="button">Save Settings</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const closeBtn = this.overlay.querySelector('#btn-close-settings');
    const cancelBtn = this.overlay.querySelector('#btn-cancel-settings');
    const saveBtn = this.overlay.querySelector('#btn-save-settings');
    const pingBtn = this.overlay.querySelector('#btn-test-ping');
    const toggleKeyBtn = this.overlay.querySelector('#btn-toggle-key-visibility');

    const closeHandler = () => store.set({ isSettingsOpen: false });

    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (cancelBtn) cancelBtn.addEventListener('click', closeHandler);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) closeHandler();
    });

    const eyeIconMasked = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeIconUnmasked = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    if (toggleKeyBtn) {
      toggleKeyBtn.addEventListener('click', () => {
        this.isPasswordVisible = !this.isPasswordVisible;
        const keyInput = this.overlay.querySelector('#settings-api-key');
        if (keyInput) {
          keyInput.type = this.isPasswordVisible ? 'text' : 'password';
          toggleKeyBtn.innerHTML = this.isPasswordVisible ? eyeIconUnmasked : eyeIconMasked;
        }
      });
    }

    if (pingBtn) {
      pingBtn.addEventListener('click', async () => {
        const pingStatus = this.overlay.querySelector('#ping-status-text');
        pingStatus.innerHTML = `<span style="color:var(--status-warning);">Pinging Omniroute...</span>`;

        try {
          const res = await api.pingUpstream();
          if (res.online) {
            pingStatus.innerHTML = `<span style="color:var(--status-success);">✓ Connected (${res.latencyMs}ms latency)</span>`;
          } else {
            pingStatus.innerHTML = `<span style="color:var(--status-error);">✕ Upstream Unreachable</span>`;
          }
        } catch {
          pingStatus.innerHTML = `<span style="color:var(--status-error);">✕ Connection failed</span>`;
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const omnirouteUrl = this.overlay.querySelector('#settings-omniroute-url').value.trim();
        const omnirouteApiKey = this.overlay.querySelector('#settings-api-key').value.trim();
        const proxyPort = parseInt(this.overlay.querySelector('#settings-proxy-port').value, 10) || 3005;

        try {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';

          const newConfig = {
            ...store.get().config,
            omnirouteUrl,
            omnirouteApiKey,
            proxyPort,
          };

          await api.updateConfig(newConfig);
          store.set({ config: newConfig });

          if (this.onToast) this.onToast('Settings saved successfully', 'success');
          closeHandler();
        } catch (err) {
          if (this.onToast) this.onToast(`Failed to save settings: ${err.message}`, 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Settings';
        }
      });
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
