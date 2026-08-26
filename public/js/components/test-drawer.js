/**
 * Spectre Proxy — Side Testing Console & Benchmark Drawer Component
 * SSE Real-Time Streaming, Concurrency Controls, Scope Targeting & Live Diagnostic Logs
 */

import { store } from '../state.js';
import { api } from '../api.js';

export class TestDrawerComponent {
  constructor(drawerElement, backdropElement, onToast) {
    this.drawer = drawerElement;
    this.backdrop = backdropElement;
    this.onToast = onToast;
    this.abortBenchmarkFn = null;
    this.init();
  }

  init() {
    this.render();
    store.subscribe('isTestDrawerOpen', (isOpen) => this.toggleDrawer(isOpen));
    store.subscribe('testProgress', () => this.updateProgress());
    store.subscribe('testLogs', () => this.updateLogs());
    store.subscribe('models', () => this.updateScopeButtons());
    store.subscribe('testExcludeVisible', () => this.updateScopeButtons());
    store.subscribe('testExcludeHidden', () => this.updateScopeButtons());
  }

  toggleDrawer(isOpen) {
    if (isOpen) {
      this.backdrop.classList.add('active');
      this.drawer.classList.add('active');
      this.updateScopeButtons();
    } else {
      this.backdrop.classList.remove('active');
      this.drawer.classList.remove('active');
    }
  }

  render() {
    if (!this.drawer) return;
    const { testPrompt, testConcurrency, autoHideOnTestFailure, autoShowOnTestSuccess, testProgress, testExcludeVisible, testExcludeHidden, models } = store.get();

    const visibleCount = models.filter((m) => m.visible).length;
    const hiddenCount = models.filter((m) => !m.visible).length;

    let targetCount = models.length;
    if (testExcludeVisible) targetCount = hiddenCount;
    else if (testExcludeHidden) targetCount = visibleCount;

    this.drawer.innerHTML = `
      <!-- Drawer Header -->
      <div class="drawer-header">
        <div class="drawer-title-group">
          <div class="drawer-title-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div>
            <h2 class="drawer-title">Benchmark & Health Console</h2>
            <div style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono);">Live Multi-Model Diagnostic Engine</div>
          </div>
        </div>
        <button class="btn-icon sm" id="btn-close-drawer" title="Close console">✕</button>
      </div>

      <!-- Drawer Body -->
      <div class="drawer-body">
        <!-- Progress Bar Card -->
        <div class="benchmark-progress-box">
          <div class="progress-info-row">
            <span id="progress-status-text">Ready to benchmark</span>
            <span id="progress-counts-text" style="color:var(--accent-lime); font-weight:700;">${testProgress.completed}/${testProgress.total || targetCount}</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar-fill" id="progress-bar-fill" style="width: ${testProgress.percent}%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono); margin-top:0.2rem;">
            <span id="progress-passed-count" style="color:var(--status-success);">✓ ${testProgress.passed} Passed</span>
            <span id="progress-failed-count" style="color:var(--status-error);">✕ ${testProgress.failed} Failed</span>
          </div>
        </div>

        <!-- Scope Targeting Controls: Exclude Exposed / Exclude Hidden -->
        <div class="drawer-control-group">
          <div class="drawer-label">
            <span style="display:inline-flex; align-items:center;">
              Benchmark Scope Filter
              <span class="info-help-btn" data-tooltip="Filter which models to test: choose hidden models only, exposed models only, or the full catalog.">?</span>
            </span>
            <span style="font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono);" id="scope-summary-label">${targetCount} models selected</span>
          </div>
          <div class="scope-buttons-grid">
            <button 
              type="button" 
              class="btn-scope ${testExcludeVisible ? 'active' : ''}" 
              id="btn-scope-exclude-visible"
              title="Skip exposed models and only test currently hidden models"
            >
              <div class="scope-content">
                <span class="scope-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </span>
                <span>Exclude Exposed</span>
              </div>
              <span class="scope-badge" id="badge-exclude-visible">${hiddenCount} hidden</span>
            </button>

            <button 
              type="button" 
              class="btn-scope ${testExcludeHidden ? 'active' : ''}" 
              id="btn-scope-exclude-hidden"
              title="Skip hidden models and only test currently exposed models"
            >
              <div class="scope-content">
                <span class="scope-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </span>
                <span>Exclude Hidden</span>
              </div>
              <span class="scope-badge" id="badge-exclude-hidden">${visibleCount} exposed</span>
            </button>
          </div>
        </div>

        <!-- Controls: Prompt -->
        <div class="drawer-control-group">
          <label class="drawer-label" for="drawer-test-prompt">
            <span style="display:inline-flex; align-items:center;">
              Test Benchmark Prompt
              <span class="info-help-btn" data-tooltip="Single-turn query sent to each model to verify HTTP availability, response latency, and Time-to-First-Token.">?</span>
            </span>
            <span style="font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono);">Single turn</span>
          </label>
          <textarea class="drawer-textarea" id="drawer-test-prompt" rows="2">${escapeHtml(testPrompt)}</textarea>
        </div>

        <!-- Controls: Concurrency Slider -->
        <div class="drawer-control-group">
          <div class="drawer-label">
            <span style="display:inline-flex; align-items:center;">
              Worker Concurrency
              <span class="info-help-btn" data-tooltip="Controls how many models are tested simultaneously in parallel (1–8). Higher values complete the benchmark much faster; lower values reduce concurrent upstream load on Omniroute.">?</span>
            </span>
            <span class="slider-value-pill" id="concurrency-display">${testConcurrency}</span>
          </div>
          <div class="concurrency-slider-container">
            <span style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono);">1</span>
            <input 
              type="range" 
              class="range-slider" 
              id="concurrency-slider" 
              min="1" 
              max="8" 
              value="${testConcurrency}" 
              step="1"
            />
            <span style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono);">8</span>
          </div>
        </div>

        <!-- Controls: Auto-Hide Toggle -->
        <div class="auto-hide-toggle-row">
          <div class="auto-hide-text-group">
            <span class="auto-hide-title" style="display:inline-flex; align-items:center;">
              Auto-Hide Failing Models
              <span class="info-help-btn" data-tooltip="If a model returns a non-200 error, rate limit, or timeout during the benchmark, it is automatically hidden from Claude Code /model list.">?</span>
            </span>
            <span class="auto-hide-desc">Automatically disable visibility for models returning non-200 errors</span>
          </div>
          <label class="switch-toggle">
            <input
              type="checkbox"
              class="switch-input"
              id="drawer-autohide-toggle"
              ${autoHideOnTestFailure ? 'checked' : ''}
            />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>

        <!-- Controls: Auto-Show Toggle -->
        <div class="auto-hide-toggle-row">
          <div class="auto-hide-text-group">
            <span class="auto-hide-title" style="display:inline-flex; align-items:center;">
              Auto-Enable Passing Models
              <span class="info-help-btn" data-tooltip="If a model successfully responds with HTTP 200 OK during the benchmark, it is automatically exposed to Claude Code /model list.">?</span>
            </span>
            <span class="auto-hide-desc">Automatically show models that respond successfully</span>
          </div>
          <label class="switch-toggle">
            <input
              type="checkbox"
              class="switch-input"
              id="drawer-autoshow-toggle"
              ${autoShowOnTestSuccess ? 'checked' : ''}
            />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>

        <!-- Primary Action Button -->
        <button class="btn btn-primary" id="btn-run-all-benchmark" style="width:100%; padding:0.75rem; font-size:0.9rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span id="btn-run-benchmark-label">${this.getRunButtonLabel(targetCount)}</span>
        </button>

        <!-- Live Stream Log Container -->
        <div class="stream-log-container">
          <div class="stream-log-header">
            <span>Live Stream Log</span>
            <button class="btn-icon sm" id="btn-clear-logs" title="Clear stream logs" style="font-size:0.7rem;">Clear</button>
          </div>
          <div class="stream-log-list" id="stream-log-list">
            <!-- Log items appear here -->
            <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.78rem; font-family:var(--font-mono);">
              No active benchmark logs.<br/>Click "Run Benchmark" to start health testing.
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  getRunButtonLabel(targetCount) {
    const { testExcludeVisible, testExcludeHidden, models } = store.get();
    if (testExcludeVisible) {
      return `Run Benchmark (${targetCount} Hidden Models)`;
    }
    if (testExcludeHidden) {
      return `Run Benchmark (${targetCount} Exposed Models)`;
    }
    return `Run Benchmark on All Models (${models.length})`;
  }

  bindEvents() {
    // Close Drawer Button
    const closeBtn = this.drawer.querySelector('#btn-close-drawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        store.set({ isTestDrawerOpen: false });
      });
    }

    // Backdrop Click
    if (this.backdrop) {
      this.backdrop.addEventListener('click', () => {
        store.set({ isTestDrawerOpen: false });
      });
    }

    // Scope Button: Exclude Visible (Test Hidden Only)
    const btnExcludeVisible = this.drawer.querySelector('#btn-scope-exclude-visible');
    if (btnExcludeVisible) {
      btnExcludeVisible.addEventListener('click', () => {
        const current = store.get().testExcludeVisible;
        store.set({
          testExcludeVisible: !current,
          testExcludeHidden: false, // mutually exclusive
        });
      });
    }

    // Scope Button: Exclude Hidden (Test Exposed Only)
    const btnExcludeHidden = this.drawer.querySelector('#btn-scope-exclude-hidden');
    if (btnExcludeHidden) {
      btnExcludeHidden.addEventListener('click', () => {
        const current = store.get().testExcludeHidden;
        store.set({
          testExcludeHidden: !current,
          testExcludeVisible: false, // mutually exclusive
        });
      });
    }

    // Concurrency Slider
    const slider = this.drawer.querySelector('#concurrency-slider');
    const display = this.drawer.querySelector('#concurrency-display');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (display) display.textContent = val;
        store.set({ testConcurrency: val });
      });
    }

    // Auto-hide toggle
    const autohideToggle = this.drawer.querySelector('#drawer-autohide-toggle');
    if (autohideToggle) {
      autohideToggle.addEventListener('change', (e) => {
        store.set({ autoHideOnTestFailure: e.target.checked });
      });
    }

    // Auto-show toggle
    const autoshowToggle = this.drawer.querySelector('#drawer-autoshow-toggle');
    if (autoshowToggle) {
      autoshowToggle.addEventListener('change', (e) => {
        store.set({ autoShowOnTestSuccess: e.target.checked });
      });
    }

    // Test Prompt Textarea
    const promptTextarea = this.drawer.querySelector('#drawer-test-prompt');
    if (promptTextarea) {
      promptTextarea.addEventListener('change', (e) => {
        store.set({ testPrompt: e.target.value });
      });
    }

    // Clear Logs Button
    const clearLogsBtn = this.drawer.querySelector('#btn-clear-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        store.set({ testLogs: [] });
        this.updateLogs();
      });
    }

    // Run All Benchmark Button
    const runBtn = this.drawer.querySelector('#btn-run-all-benchmark');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        if (store.get().isTestingAll) {
          this.stopBenchmark();
        } else {
          this.startBenchmark();
        }
      });
    }
  }

  updateScopeButtons() {
    const { testExcludeVisible, testExcludeHidden, models } = store.get();
    const btnVisible = this.drawer.querySelector('#btn-scope-exclude-visible');
    const btnHidden = this.drawer.querySelector('#btn-scope-exclude-hidden');
    const badgeVisible = this.drawer.querySelector('#badge-exclude-visible');
    const badgeHidden = this.drawer.querySelector('#badge-exclude-hidden');
    const summaryLabel = this.drawer.querySelector('#scope-summary-label');
    const runLabel = this.drawer.querySelector('#btn-run-benchmark-label');

    const visibleCount = models.filter((m) => m.visible).length;
    const hiddenCount = models.filter((m) => !m.visible).length;

    let targetCount = models.length;
    if (testExcludeVisible) targetCount = hiddenCount;
    else if (testExcludeHidden) targetCount = visibleCount;

    if (btnVisible) btnVisible.classList.toggle('active', !!testExcludeVisible);
    if (btnHidden) btnHidden.classList.toggle('active', !!testExcludeHidden);
    if (badgeVisible) badgeVisible.textContent = `${hiddenCount} hidden`;
    if (badgeHidden) badgeHidden.textContent = `${visibleCount} exposed`;
    if (summaryLabel) summaryLabel.textContent = `${targetCount} models selected`;
    if (runLabel && !store.get().isTestingAll) {
      runLabel.textContent = this.getRunButtonLabel(targetCount);
    }
  }

  startBenchmark() {
    const { testPrompt, testConcurrency, autoHideOnTestFailure, autoShowOnTestSuccess, testExcludeVisible, testExcludeHidden, models } = store.get();
    if (!models.length) {
      if (this.onToast) this.onToast('No models to benchmark', 'error');
      return;
    }

    // Filter target models based on exclusion scope
    let targetModels = [...models];
    if (testExcludeVisible) {
      targetModels = targetModels.filter((m) => !m.visible);
    } else if (testExcludeHidden) {
      targetModels = targetModels.filter((m) => m.visible);
    }

    if (!targetModels.length) {
      if (this.onToast) this.onToast('No models match the selected benchmark scope', 'info');
      return;
    }

    store.set({
      isTestingAll: true,
      testProgress: {
        total: targetModels.length,
        completed: 0,
        passed: 0,
        failed: 0,
        percent: 0,
      },
      testLogs: [],
    });

    const runBtn = this.drawer.querySelector('#btn-run-all-benchmark');
    if (runBtn) {
      runBtn.innerHTML = `
        <span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span>
        Stop Benchmark
      `;
      runBtn.classList.remove('btn-primary');
      runBtn.classList.add('btn-danger');
    }

    // Start SSE stream via API client
    this.abortBenchmarkFn = api.runBatchBenchmark({
      prompt: testPrompt,
      concurrency: testConcurrency,
      autoHideOnFailure: autoHideOnTestFailure,
      autoShowOnSuccess: autoShowOnTestSuccess,
      excludeVisible: !!testExcludeVisible,
      excludeHidden: !!testExcludeHidden,
      modelIds: targetModels.map((m) => m.id),
      onEvent: (event, data) => this.handleSSEEvent(event, data),
      onDone: () => this.finishBenchmark(),
      onError: (err) => {
        if (this.onToast) this.onToast(`Benchmark error: ${err.message}`, 'error');
        this.finishBenchmark();
      },
    });
  }

  stopBenchmark() {
    if (this.abortBenchmarkFn) {
      this.abortBenchmarkFn();
      this.abortBenchmarkFn = null;
    }
    this.finishBenchmark();
    if (this.onToast) this.onToast('Benchmark stopped', 'info');
  }

  finishBenchmark() {
    store.set({ isTestingAll: false });
    const runBtn = this.drawer.querySelector('#btn-run-all-benchmark');
    if (runBtn) {
      const { testExcludeVisible, testExcludeHidden, models } = store.get();
      const visibleCount = models.filter((m) => m.visible).length;
      const hiddenCount = models.filter((m) => !m.visible).length;
      let targetCount = models.length;
      if (testExcludeVisible) targetCount = hiddenCount;
      else if (testExcludeHidden) targetCount = visibleCount;

      runBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span id="btn-run-benchmark-label">${this.getRunButtonLabel(targetCount)}</span>
      `;
      runBtn.classList.remove('btn-danger');
      runBtn.classList.add('btn-primary');
    }
  }

  handleSSEEvent(event, data) {
    if (event === 'result' || event === 'test_result' || data.modelId) {
      const { modelId, status, statusCode, latencyMs, ttftMs, response, error, timestamp } = data;

      // Update model in store
      const models = [...store.get().models];
      const idx = models.findIndex((m) => m.id === modelId);
      if (idx !== -1) {
        models[idx] = {
          ...models[idx],
          lastTested: {
            status,
            statusCode: statusCode || (status === 'success' ? 200 : 500),
            latencyMs,
            ttftMs,
            response,
            error,
            timestamp: timestamp || Date.now(),
          },
        };

        // Mirror server-side auto-show / auto-hide so toggles update live
        if (status === 'error' && store.get().autoHideOnTestFailure) {
          models[idx].visible = false;
        } else if (status === 'success' && store.get().autoShowOnTestSuccess) {
          models[idx].visible = true;
        }
      }

      // Add to test logs
      const testLogs = [data, ...store.get().testLogs];

      // Update progress
      const prev = store.get().testProgress;
      const total = prev.total || models.length;
      const completed = prev.completed + 1;
      const passed = status === 'success' ? prev.passed + 1 : prev.passed;
      const failed = status === 'error' ? prev.failed + 1 : prev.failed;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      store.set({
        models,
        testLogs,
        testProgress: { total, completed, passed, failed, percent },
      });
    }
  }

  updateProgress() {
    const { testProgress, isTestingAll } = store.get();
    const statusText = this.drawer.querySelector('#progress-status-text');
    const countsText = this.drawer.querySelector('#progress-counts-text');
    const barFill = this.drawer.querySelector('#progress-bar-fill');
    const passedCount = this.drawer.querySelector('#progress-passed-count');
    const failedCount = this.drawer.querySelector('#progress-failed-count');

    if (!statusText || !barFill) return;

    statusText.textContent = isTestingAll ? 'Benchmarking models...' : testProgress.completed > 0 ? 'Benchmark complete' : 'Ready to benchmark';
    countsText.textContent = `${testProgress.completed}/${testProgress.total || store.get().models.length}`;
    barFill.style.width = `${testProgress.percent}%`;
    if (passedCount) passedCount.textContent = `✓ ${testProgress.passed} Passed`;
    if (failedCount) failedCount.textContent = `✕ ${testProgress.failed} Failed`;
  }

  updateLogs() {
    const list = this.drawer.querySelector('#stream-log-list');
    if (!list) return;

    const logs = store.get().testLogs;
    if (logs.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.78rem; font-family:var(--font-mono);">
          No active benchmark logs.<br/>Click "Run Benchmark" to start health testing.
        </div>
      `;
      return;
    }

    list.innerHTML = logs
      .slice(0, 50)
      .map((log) => {
        const isSuccess = log.status === 'success';
        return `
          <div class="stream-log-item ${isSuccess ? 'success' : 'error'}">
            <div class="stream-log-item-header">
              <span class="stream-model-id">${escapeHtml(log.modelId)}</span>
              <span class="stream-latency-tag ${isSuccess ? 'success' : 'error'}">
                ${isSuccess ? `✓ ${log.latencyMs}ms` : `✕ HTTP ${log.statusCode || 'ERR'}`}
              </span>
            </div>
            ${
              isSuccess
                ? `<div class="stream-response-preview">"${escapeHtml(log.response || 'OK')}" ${log.ttftMs ? `· TTFT: ${log.ttftMs}ms` : ''}</div>`
                : `<div class="stream-error-desc"><strong>Failure Reason:</strong> ${escapeHtml(log.error || 'Request failed')}</div>`
            }
          </div>
        `;
      })
      .join('');
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
