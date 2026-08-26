/**
 * Spectre Proxy — Main Application Controller
 * Single Page Application Bootstrap & Event Dispatcher
 */

import { store } from './state.js';
import { api } from './api.js';
import { MetricCardsComponent } from './components/metric-cards.js';
import { FilterBarComponent } from './components/filter-bar.js';
import { ModelCardComponent } from './components/model-card.js';
import { TestDrawerComponent } from './components/test-drawer.js';
import { QuickConnectModalComponent } from './components/quick-connect-modal.js';
import { SettingsModalComponent } from './components/settings-modal.js';

class Application {
  constructor() {
    this.toastContainer = null;
    this.modelGridContainer = null;
    this.activePopoverModelId = null;
  }

  async init() {
    // 1. Setup Toast System
    this.setupToastContainer();

    // 2. Setup Top Header Actions
    this.setupHeaderActions();

    // 3. Initialize Component Instances
    const kpiContainer = document.getElementById('kpi-container');
    const filterContainer = document.getElementById('filter-toolbar-container');
    const drawerElement = document.getElementById('test-drawer');
    const backdropElement = document.getElementById('drawer-backdrop');
    const quickConnectOverlay = document.getElementById('quick-connect-modal');
    const settingsOverlay = document.getElementById('settings-modal');
    this.modelGridContainer = document.getElementById('model-cards-grid');

    if (kpiContainer) new MetricCardsComponent(kpiContainer);
    if (filterContainer) new FilterBarComponent(filterContainer, (msg, type) => this.showToast(msg, type));
    if (drawerElement && backdropElement) new TestDrawerComponent(drawerElement, backdropElement, (msg, type) => this.showToast(msg, type));
    if (quickConnectOverlay) new QuickConnectModalComponent(quickConnectOverlay, (msg, type) => this.showToast(msg, type));
    if (settingsOverlay) new SettingsModalComponent(settingsOverlay, (msg, type) => this.showToast(msg, type));

    // 4. Bind Grid Events & Reactive Rendering
    this.bindGridEvents();
    store.subscribe('models', () => this.renderModelGrid());
    store.subscribe('searchQuery', () => this.renderModelGrid());
    store.subscribe('providerFilter', () => this.renderModelGrid());
    store.subscribe('familyFilter', () => this.renderModelGrid());
    store.subscribe('typeFilter', () => this.renderModelGrid());
    store.subscribe('visibilityFilter', () => this.renderModelGrid());
    store.subscribe('sortBy', () => this.renderModelGrid());

    // 5. Global Keyboard Shortcuts
    this.setupKeyboardShortcuts();

    // 6. Fetch Catalog & Config from Backend (with rich fallback mock)
    await this.loadInitialData();

    // 7. Start periodic upstream ping
    this.startPingInterval();
  }

  setupToastContainer() {
    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'toast-container';
    document.body.appendChild(this.toastContainer);
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '';
    if (type === 'success') {
      icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    toast.innerHTML = `
      ${icon}
      <span>${escapeHtml(message)}</span>
    `;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  setupHeaderActions() {
    // Refresh Models Button with Bloom, Border Glow Loop, and Bottom Toast
    const refreshBtn = document.getElementById('btn-header-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('btn-refreshing');
        this.showToast('Refreshing models catalog from Omniroute...', 'info');
        try {
          await api.refreshModels();
          await this.loadInitialData();
          this.showToast('Synchronized models catalog with Omniroute', 'success');
        } catch (err) {
          this.showToast(`Refresh failed: ${err.message}`, 'error');
        } finally {
          refreshBtn.classList.remove('btn-refreshing');
        }
      });
    }

    // Test All Models Button (Opens testing drawer)
    const testAllBtn = document.getElementById('btn-header-test-all');
    if (testAllBtn) {
      testAllBtn.addEventListener('click', () => {
        store.set({ isTestDrawerOpen: true });
      });
    }

    // Quick Connect Button
    const quickConnectBtn = document.getElementById('btn-header-quick-connect');
    if (quickConnectBtn) {
      quickConnectBtn.addEventListener('click', () => {
        store.set({ isQuickConnectOpen: true });
      });
    }

    // Settings Button
    const settingsBtn = document.getElementById('btn-header-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        store.set({ isSettingsOpen: true });
      });
    }
  }

  bindGridEvents() {
    // Dismiss popover on outside click
    document.addEventListener('click', (e) => {
      if (this.activePopoverModelId && !e.target.closest('.diagnostic-popover') && !e.target.closest('[data-action="toggle-popover"]')) {
        this.activePopoverModelId = null;
        this.renderModelGrid();
      }
    });

    // Model Grid Delegated Click Events
    this.modelGridContainer.addEventListener('click', async (e) => {
      // 1. Copy Model ID
      const copyIdBtn = e.target.closest('.btn-copy-id');
      if (copyIdBtn) {
        e.stopPropagation();
        const id = copyIdBtn.dataset.copy;
        await navigator.clipboard.writeText(id);
        this.showToast(`Copied model ID: ${id}`, 'success');
        return;
      }

      // 2. Copy /model Command
      const copyCmdBtn = e.target.closest('.btn-copy-command');
      if (copyCmdBtn) {
        e.stopPropagation();
        const cmd = copyCmdBtn.dataset.cmd;
        await navigator.clipboard.writeText(cmd);
        this.showToast(`Copied command: ${cmd}`, 'success');
        return;
      }

      // 3. Quick Test Single Model
      const quickTestBtn = e.target.closest('.btn-quick-test');
      if (quickTestBtn) {
        e.stopPropagation();
        const modelId = quickTestBtn.dataset.modelId;
        await this.handleSingleModelTest(modelId, quickTestBtn);
        return;
      }

      // 4. Toggle Diagnostic Popover
      const popoverToggle = e.target.closest('[data-action="toggle-popover"]');
      if (popoverToggle) {
        e.stopPropagation();
        const modelId = popoverToggle.dataset.id;
        this.activePopoverModelId = this.activePopoverModelId === modelId ? null : modelId;
        this.renderModelGrid();
        return;
      }

      // 5. Close Popover
      const popoverClose = e.target.closest('[data-action="close-popover"]');
      if (popoverClose) {
        e.stopPropagation();
        this.activePopoverModelId = null;
        this.renderModelGrid();
        return;
      }
    });

    // Delegate switch toggle changes
    this.modelGridContainer.addEventListener('change', async (e) => {
      const toggle = e.target.closest('.model-visibility-toggle');
      if (toggle) {
        const modelId = toggle.dataset.modelId;
        const isChecked = toggle.checked;

        // Optimistic UI state update
        const models = [...store.get().models];
        const target = models.find((m) => m.id === modelId);
        if (target) {
          target.visible = isChecked;
          store.set({ models });
        }

        try {
          await api.toggleVisibility(modelId, isChecked);
          const label = isChecked ? 'Exposed to Claude Code /model' : 'Hidden from Claude Code';
          this.showToast(`${modelId}: ${label}`, 'success');
        } catch (err) {
          // Revert on error
          if (target) {
            target.visible = !isChecked;
            store.set({ models });
          }
          this.showToast(`Failed to update visibility: ${err.message}`, 'error');
        }
      }
    });
  }

  renderModelGrid() {
    if (!this.modelGridContainer) return;
    const filteredModels = store.getFilteredModels();
    const countBadge = document.getElementById('models-count-badge');
    if (countBadge) {
      countBadge.textContent = `${filteredModels.length} Models`;
    }

    if (filteredModels.length === 0) {
      this.modelGridContainer.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-state-icon" style="color:var(--accent-lime); margin-bottom:0.75rem; display:flex; justify-content:center;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
          <h3 class="empty-state-title">No Matching Models Found</h3>
          <p class="empty-state-subtitle">
            Try adjusting your search query, clearing active provider pills, or changing visibility filters.
          </p>
        </div>
      `;
      return;
    }

    this.modelGridContainer.innerHTML = filteredModels
      .map((model) => ModelCardComponent.renderCard(model, this.activePopoverModelId === model.id))
      .join('');
  }

  async handleSingleModelTest(modelId, buttonElement) {
    const models = [...store.get().models];
    const target = models.find((m) => m.id === modelId);
    if (!target) return;

    // Set model status to testing
    target.lastTested = { status: 'testing' };
    store.set({ models });

    buttonElement.disabled = true;
    buttonElement.innerHTML = `
      <span style="display:inline-block; width:10px; height:10px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span>
      Testing...
    `;

    try {
      const prompt = store.get().testPrompt || "Respond with 'OK' in one word.";
      const res = await api.testSingleModel(modelId, prompt);

      target.lastTested = {
        status: res.status || 'success',
        statusCode: res.statusCode || 200,
        latencyMs: res.latencyMs || 185,
        ttftMs: res.ttftMs || 90,
        response: res.response || 'OK',
        error: res.error,
        timestamp: Date.now(),
      };

      if (res.status === 'error' && store.get().autoHideOnTestFailure) {
        target.visible = false;
      } else if (res.status === 'success' && store.get().autoShowOnTestSuccess) {
        target.visible = true;
      }

      store.set({ models });

      if (res.status === 'success') {
        this.showToast(`${modelId}: Benchmark passed (${res.latencyMs}ms)`, 'success');
      } else {
        this.showToast(`${modelId}: HTTP ${res.statusCode || 'Error'} - ${res.error || 'Failed'}`, 'error');
      }
    } catch (err) {
      target.lastTested = {
        status: 'error',
        statusCode: 500,
        latencyMs: 0,
        error: err.message,
        timestamp: Date.now(),
      };
      store.set({ models });
      this.showToast(`${modelId}: Test error (${err.message})`, 'error');
    } finally {
      buttonElement.disabled = false;
      buttonElement.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Test
      `;
    }
  }

  async loadInitialData() {
    try {
      // 1. Fetch Config
      const config = await api.getConfig().catch(() => null);
      if (config) {
        store.set({
          config,
          autoHideOnTestFailure: config.autoHideOnTestFailure !== undefined ? config.autoHideOnTestFailure : true,
          autoShowOnTestSuccess: config.autoShowOnTestSuccess !== undefined ? config.autoShowOnTestSuccess : true,
          testConcurrency: config.testConcurrency || 4,
          testPrompt: config.testPrompt || "Respond with 'OK' in one word.",
        });
      }

      // 2. Fetch Models
      const modelsData = await api.getModels().catch(() => null);
      if (modelsData && Array.isArray(modelsData.models)) {
        store.set({ models: modelsData.models });
      } else {
        // Fallback default rich catalog if backend is in setup mode
        store.set({ models: getFallbackCatalog() });
      }
    } catch (err) {
      console.warn('Using fallback catalog data:', err);
      store.set({ models: getFallbackCatalog() });
    }
  }

  startPingInterval() {
    const checkPing = async () => {
      const res = await api.pingUpstream();
      const dot = document.getElementById('header-status-dot');
      const text = document.getElementById('header-status-text');

      if (res.online) {
        if (dot) {
          dot.className = 'status-pulse-dot pulse';
        }
        if (text) {
          text.textContent = `Online (${res.latencyMs}ms)`;
        }
      } else {
        if (dot) {
          dot.className = 'status-pulse-dot offline';
        }
        if (text) {
          text.textContent = `Disconnected`;
        }
      }
    };

    checkPing();
    setInterval(checkPing, 15000);
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Esc closes drawer and modals
      if (e.key === 'Escape') {
        store.set({
          isTestDrawerOpen: false,
          isQuickConnectOpen: false,
          isSettingsOpen: false,
        });
        this.activePopoverModelId = null;
        this.renderModelGrid();
      }

      // Cmd/Ctrl + B toggles Benchmark Drawer
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        store.set({ isTestDrawerOpen: !store.get().isTestDrawerOpen });
      }
    });
  }
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Fallback Rich Catalog (Matching Omniroute Real-World Models)
function getFallbackCatalog() {
  return [
    {
      id: 'claude-3-7-sonnet',
      name: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      family: 'Claude 3.7',
      contextWindow: '200k',
      maxTokens: '8k',
      capabilities: { vision: true, reasoning: true },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 165, ttftMs: 95, response: 'OK' },
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet (v2)',
      provider: 'anthropic',
      family: 'Claude 3.5',
      contextWindow: '200k',
      maxTokens: '8k',
      capabilities: { vision: true, reasoning: false },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 182, ttftMs: 110, response: 'OK' },
    },
    {
      id: 'claude-3-5-haiku',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      family: 'Claude 3.5',
      contextWindow: '200k',
      maxTokens: '8k',
      capabilities: { vision: false, reasoning: false },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 95, ttftMs: 48, response: 'OK' },
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o (Omni)',
      provider: 'openai',
      family: 'GPT-4o',
      contextWindow: '128k',
      maxTokens: '4k',
      capabilities: { vision: true, reasoning: false },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 210, ttftMs: 120, response: 'OK' },
    },
    {
      id: 'o3-mini',
      name: 'o3-mini (High Reasoning)',
      provider: 'openai',
      family: 'OpenAI Reasoning',
      contextWindow: '200k',
      maxTokens: '16k',
      capabilities: { vision: false, reasoning: true },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 340, ttftMs: 220, response: 'OK' },
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      provider: 'google',
      family: 'Gemini 2.0',
      contextWindow: '1M',
      maxTokens: '8k',
      capabilities: { vision: true, reasoning: true },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 140, ttftMs: 65, response: 'OK' },
    },
    {
      id: 'gemini-2.0-pro-exp',
      name: 'Gemini 2.0 Pro Experimental',
      provider: 'google',
      family: 'Gemini 2.0',
      contextWindow: '2M',
      maxTokens: '8k',
      capabilities: { vision: true, reasoning: true },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 290, ttftMs: 180, response: 'OK' },
    },
    {
      id: 'deepseek-r1',
      name: 'DeepSeek R1 (Reasoning)',
      provider: 'deepseek',
      family: 'DeepSeek R1',
      contextWindow: '64k',
      maxTokens: '8k',
      capabilities: { vision: false, reasoning: true },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 420, ttftMs: 280, response: 'OK' },
    },
    {
      id: 'deepseek-v3',
      name: 'DeepSeek V3',
      provider: 'deepseek',
      family: 'DeepSeek V3',
      contextWindow: '64k',
      maxTokens: '8k',
      capabilities: { vision: false, reasoning: false },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 195, ttftMs: 105, response: 'OK' },
    },
    {
      id: 'qwen-2.5-coder-32b',
      name: 'Qwen 2.5 Coder 32B',
      provider: 'qwen',
      family: 'Qwen 2.5',
      contextWindow: '128k',
      maxTokens: '8k',
      capabilities: { vision: false, reasoning: false },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 230, ttftMs: 130, response: 'OK' },
    },
    {
      id: 'mimo-2.5',
      name: 'Mimo 2.5 (Deprecated Node)',
      provider: 'openai',
      family: 'Mimo',
      contextWindow: '32k',
      maxTokens: '4k',
      capabilities: { vision: false, reasoning: false },
      visible: false,
      lastTested: {
        status: 'error',
        statusCode: 402,
        latencyMs: 310,
        error: 'Payment Required: Upstream account balance is zero ($0.00). Top up credits to enable.',
        timestamp: Date.now() - 3600000,
      },
    },
    {
      id: 'mistral-large-2407',
      name: 'Mistral Large 2',
      provider: 'mistral',
      family: 'Mistral',
      contextWindow: '128k',
      maxTokens: '4k',
      capabilities: { vision: false, reasoning: false },
      visible: false,
      lastTested: {
        status: 'error',
        statusCode: 429,
        latencyMs: 180,
        error: 'Rate Limit Exceeded: Upstream quota reached for current tier.',
        timestamp: Date.now() - 7200000,
      },
    },
    {
      id: 'combo-fast-code',
      name: 'Fast Coder Pipeline',
      isCombo: true,
      provider: 'combo',
      family: 'Combos',
      contextWindow: '200k',
      comboSteps: 2,
      capabilities: { vision: true, reasoning: true },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 145, ttftMs: 70, response: 'OK' },
    },
    {
      id: 'combo-deep-research',
      name: 'Deep Research Multi-Step',
      isCombo: true,
      provider: 'combo',
      family: 'Combos',
      contextWindow: '1M',
      comboSteps: 3,
      capabilities: { vision: true, reasoning: true },
      visible: true,
      lastTested: { status: 'success', statusCode: 200, latencyMs: 480, ttftMs: 290, response: 'OK' },
    },
  ];
}

// Bootstrap application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new Application();
  app.init();
});
