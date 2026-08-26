/**
 * Spectre Proxy — Metric Cards Component
 * Updates KPI Summary Tiles with Smooth Numbers & Glowing Accents
 */

import { store } from '../state.js';

export class MetricCardsComponent {
  constructor(containerElement) {
    this.container = containerElement;
    this.init();
  }

  init() {
    this.render();
    store.subscribe('models', () => this.render());
    store.subscribe('state:changed', () => this.render());
  }

  render() {
    if (!this.container) return;
    const metrics = store.getMetrics();

    this.container.innerHTML = `
      <!-- Total Models KPI -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title" style="display:inline-flex; align-items:center;">
            Total Upstream Models
            <span class="info-help-btn" data-tooltip="Total number of AI models and combo pipelines fetched directly from your upstream Omniroute instance.">?</span>
          </span>
          <div class="kpi-icon-pill">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m7.5 4.27 9 5.15"/>
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
              <path d="m3.3 7 8.7 5 8.7-5"/>
              <path d="M12 22V12"/>
            </svg>
          </div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value">${metrics.totalModels}</span>
          <span class="kpi-badge-trend">Omniroute Sync</span>
        </div>
        <div class="kpi-footer-subtext">All synced upstream AI models & combos</div>
      </div>

      <!-- Exposed to Claude Code KPI (Vibrant Neon Lime) -->
      <div class="kpi-card highlight-lime">
        <div class="kpi-header">
          <span class="kpi-title" style="color: var(--accent-lime); display:inline-flex; align-items:center;">
            Exposed to Claude Code
            <span class="info-help-btn" data-tooltip="Total count of models and combos exposed to AI client tools (Claude Code, Cursor, Cline) via /model and GET /v1/models.">?</span>
          </span>
          <div class="kpi-icon-pill">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value">${metrics.exposedModels}</span>
          <span class="kpi-badge-trend success">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--accent-lime);"></span>
            Active in /model
          </span>
        </div>
        <div class="kpi-footer-subtext">Returned by <code style="color:var(--accent-lime); font-family:var(--font-mono);">GET /v1/models</code></div>
      </div>

      <!-- Active Combos KPI (Electric Cyan) -->
      <div class="kpi-card highlight-cyan">
        <div class="kpi-header">
          <span class="kpi-title" style="color: var(--accent-cyan); display:inline-flex; align-items:center;">
            Active Routing Combos
            <span class="info-help-btn" data-tooltip="Virtual routing pipelines starting with auto/*, combo/*, or router/* that coordinate multi-model reasoning or fallbacks.">?</span>
          </span>
          <div class="kpi-icon-pill">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value">${metrics.activeCombos}</span>
          <span class="kpi-badge-trend" style="color:var(--accent-cyan); background:var(--accent-cyan-dim); border:1px solid var(--accent-cyan-border);">Virtual Routes</span>
        </div>
        <div class="kpi-footer-subtext">Multi-step fallback & reasoning pipelines</div>
      </div>

      <!-- System Health KPI -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title" style="display:inline-flex; align-items:center;">
            System Health Rate
            <span class="info-help-btn" data-tooltip="Percentage of tested models that responded with HTTP 200 OK during live benchmark testing.">?</span>
          </span>
          <div class="kpi-icon-pill" style="color:${metrics.failedCount > 0 ? 'var(--status-error)' : 'var(--status-success)'};">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value" style="color:${metrics.failedCount > 0 ? 'var(--status-error)' : 'var(--status-success)'};">
            ${metrics.healthRate}%
          </span>
          <span class="kpi-badge-trend ${metrics.failedCount > 0 ? '' : 'success'}">
            ${metrics.passedCount} Passed / ${metrics.failedCount} Failed
          </span>
        </div>
        <div class="kpi-footer-subtext">${metrics.testedCount} of ${metrics.totalModels} models verified with benchmark</div>
      </div>
    `;
  }
}
