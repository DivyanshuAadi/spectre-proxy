/**
 * Spectre Proxy — Model & Combo Card Component
 * Tactile Neon-Lime Switch, Diagnostic Error Popover, and Single-Model Benchmark
 */

import { store } from '../state.js';
import { api } from '../api.js';

export class ModelCardComponent {
  /**
   * Render single model card HTML
   */
  static renderCard(model, isPopoverOpen = false) {
    const isVisible = !!model.visible;
    const isCombo = !!model.isCombo || String(model.id || '').startsWith('auto/') || String(model.id || '').startsWith('combo/');
    const provider = (isCombo ? 'combo' : (model.provider || 'ai')).toLowerCase();
    const lastTested = model.lastTested || {};

    // Health badge markup & status
    let healthBadgeHtml = '';
    if (lastTested.status === 'success') {
      const ttftText = lastTested.ttftMs ? ` (TTFT ${lastTested.ttftMs}ms)` : '';
      healthBadgeHtml = `
        <div class="health-badge success" title="Response: ${lastTested.latencyMs}ms${ttftText}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          ${lastTested.latencyMs}ms
        </div>
      `;
    } else if (lastTested.status === 'error') {
      const code = lastTested.statusCode || 'ERR';
      healthBadgeHtml = `
        <div class="health-badge error" data-action="toggle-popover" data-id="${model.id}" title="Click to view failure reason">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          ${code} Error
        </div>
      `;
    } else if (lastTested.status === 'testing') {
      healthBadgeHtml = `
        <div class="health-badge testing">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--status-warning); animation:pulse-ring 1.5s infinite;"></span>
          Testing...
        </div>
      `;
    } else {
      healthBadgeHtml = `
        <div class="health-badge untested">
          Untested
        </div>
      `;
    }

    // Capability chips
    const capabilities = [];
    if (model.capabilities?.vision || (model.id || '').includes('vision') || (model.id || '').includes('4o')) {
      capabilities.push('<span class="cap-chip vision">Vision</span>');
    }
    if (model.capabilities?.reasoning || (model.id || '').includes('r1') || (model.id || '').includes('thinking') || (model.id || '').includes('o1') || (model.id || '').includes('o3')) {
      capabilities.push('<span class="cap-chip reasoning">Reasoning</span>');
    }
    if (model.contextWindow) {
      capabilities.push(`<span class="cap-chip">${model.contextWindow}</span>`);
    } else if (model.capabilities?.context) {
      capabilities.push(`<span class="cap-chip">${model.capabilities.context}</span>`);
    }
    if (model.maxTokens) {
      capabilities.push(`<span class="cap-chip">Max ${model.maxTokens}</span>`);
    }

    // Diagnostic Popover Markup (if open)
    let popoverHtml = '';
    if (isPopoverOpen && lastTested.status === 'error') {
      popoverHtml = `
        <div class="diagnostic-popover" id="popover-${model.id}">
          <div class="popover-header">
            <span style="display:flex; align-items:center; gap:0.35rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              HTTP ${lastTested.statusCode || 500} Failure Diagnostic
            </span>
            <button class="btn-icon sm" data-action="close-popover" data-id="${model.id}" style="background:none; border:none; color:var(--status-error);">✕</button>
          </div>
          <div class="popover-body">
            <strong>Reason:</strong> ${lastTested.error || 'Upstream provider returned an error response.'}
          </div>
          ${lastTested.response ? `<div class="popover-code">${escapeHtml(typeof lastTested.response === 'object' ? JSON.stringify(lastTested.response) : String(lastTested.response))}</div>` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--text-muted); margin-top:0.25rem;">
            <span>Tested: ${lastTested.timestamp ? new Date(lastTested.timestamp).toLocaleTimeString() : 'Recent'}</span>
            <span style="color:var(--status-error); font-weight:600;">Auto-hidden from Claude Code</span>
          </div>
        </div>
      `;
    }

    // Provider Badge Label
    const providerLabel = isCombo
      ? `COMBO (${model.steps?.length || model.comboSteps || 2} STEPS)`
      : provider.toUpperCase();

    return `
      <div class="model-card ${isVisible ? 'is-visible' : 'is-hidden'} ${isCombo ? 'is-combo' : ''}" data-model-id="${model.id}">
        <!-- Card Header -->
        <div class="model-card-header">
          <div class="model-brand-info">
            <span class="provider-badge ${provider}">${providerLabel}</span>
            <div class="model-name-row" style="margin-top:0.25rem;">
              <h3 class="model-display-name" title="${escapeHtml(model.name || model.id)}">${escapeHtml(model.name || model.id)}</h3>
            </div>
            <div class="model-id-mono" title="Click to copy Model ID">
              <button class="btn-copy-id" data-copy="${escapeHtml(model.id)}" style="background:none; border:none; color:inherit; font-family:inherit; font-size:inherit; display:flex; align-items:center; gap:0.25rem; cursor:pointer; padding:0;">
                <span>${escapeHtml(model.id)}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Tactile Switch Toggle -->
          <label class="switch-toggle" title="${isVisible ? 'Visible in Claude Code /model' : 'Hidden from Claude Code'}">
            <input 
              type="checkbox" 
              class="switch-input model-visibility-toggle" 
              data-model-id="${model.id}"
              ${isVisible ? 'checked' : ''}
            />
            <span class="switch-track">
              <span class="switch-thumb"></span>
            </span>
          </label>
        </div>

        <!-- Capability Chips -->
        <div class="capabilities-list">
          ${capabilities.join('')}
        </div>

        <!-- Health Status Badge -->
        ${healthBadgeHtml}

        <!-- Diagnostic Popover -->
        ${popoverHtml}

        <!-- Card Footer Actions -->
        <div class="model-card-footer">
          <div class="model-card-footer-left">
            <button class="btn btn-secondary btn-sm btn-quick-test" data-model-id="${model.id}" title="Run single prompt test">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Test
            </button>
          </div>

          <button class="btn btn-outline-lime btn-sm btn-copy-command" data-cmd="/model ${escapeHtml(model.id)}" title="Copy Claude Code /model command">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
            /model
          </button>
        </div>
      </div>
    `;
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
