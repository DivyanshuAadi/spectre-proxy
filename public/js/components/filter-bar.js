/**
 * Spectre Proxy — Filter & Bulk Action Toolbar Component
 * Features Custom Glassmorphic Sexy Dropdowns, Tactile Pills & Fast Search
 */

import { store } from '../state.js';
import { api } from '../api.js';

export class FilterBarComponent {
  constructor(containerElement, onToast) {
    this.container = containerElement;
    this.onToast = onToast;
    this.init();
  }

  init() {
    this.render();
    store.subscribe('models', () => {
      this.updateProviderPills();
      this.updateFamilyDropdown();
    });
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="toolbar-row-top">
        <!-- Search Input with Shortcut -->
        <div class="toolbar-search-wrapper">
          <div class="search-input-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
            <input 
              type="text" 
              class="search-input" 
              id="model-search-input"
              placeholder="Search by model ID, display name, family, or provider..."
              autocomplete="off"
              spellcheck="false"
            />
            <button class="search-clear-btn" id="search-clear-btn" title="Clear search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
            <span class="search-shortcut-hint">/</span>
          </div>
        </div>

        <!-- Controls: Family, Visibility & Sort (Custom Sexy Glassmorphic Dropdowns) -->
        <div class="toolbar-controls-group">
          <!-- 1. Model Family Dropdown -->
          <div class="sexy-dropdown" id="dropdown-family">
            <button class="sexy-dropdown-trigger" id="btn-trigger-family" type="button">
              <span class="trigger-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="2 17 12 22 22 17"/>
                  <polyline points="2 12 12 17 22 12"/>
                </svg>
              </span>
              <span class="trigger-label" id="label-family">All Model Families</span>
              <svg class="trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            <div class="sexy-dropdown-menu" id="menu-family">
              <!-- Dynamically rendered -->
            </div>
          </div>

          <!-- 2. Visibility Dropdown (Changed to "All") -->
          <div class="sexy-dropdown" id="dropdown-visibility">
            <button class="sexy-dropdown-trigger" id="btn-trigger-visibility" type="button">
              <span class="trigger-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </span>
              <span class="trigger-label" id="label-visibility">All</span>
              <svg class="trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            <div class="sexy-dropdown-menu" id="menu-visibility">
              <button class="sexy-dropdown-item active" data-val="all">
                <div class="item-left">
                  <span class="item-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                  </span>
                  <span>All</span>
                </div>
              </button>
              <button class="sexy-dropdown-item" data-val="visible">
                <div class="item-left">
                  <span class="item-icon" style="color:var(--accent-lime);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  <span>Exposed (/model)</span>
                </div>
              </button>
              <button class="sexy-dropdown-item" data-val="hidden">
                <div class="item-left">
                  <span class="item-icon" style="color:var(--text-muted);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </span>
                  <span>Hidden</span>
                </div>
              </button>
            </div>
          </div>

          <!-- 3. Sort Dropdown -->
          <div class="sexy-dropdown" id="dropdown-sort">
            <button class="sexy-dropdown-trigger" id="btn-trigger-sort" type="button">
              <span class="trigger-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <polyline points="19 12 12 19 5 12"/>
                </svg>
              </span>
              <span class="trigger-label" id="label-sort">Default (Exposed First)</span>
              <svg class="trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            <div class="sexy-dropdown-menu" id="menu-sort">
              <button class="sexy-dropdown-item active" data-val="default">
                <div class="item-left">
                  <span class="item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg></span>
                  <span>Default (Exposed First)</span>
                </div>
              </button>
              <button class="sexy-dropdown-item" data-val="name-asc">
                <div class="item-left">
                  <span class="item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg></span>
                  <span>Name (A → Z)</span>
                </div>
              </button>
              <button class="sexy-dropdown-item" data-val="name-desc">
                <div class="item-left">
                  <span class="item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/></svg></span>
                  <span>Name (Z → A)</span>
                </div>
              </button>
              <button class="sexy-dropdown-item" data-val="provider">
                <div class="item-left">
                  <span class="item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/></svg></span>
                  <span>Provider</span>
                </div>
              </button>
              <button class="sexy-dropdown-item" data-val="latency-asc">
                <div class="item-left">
                  <span class="item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
                  <span>Latency (Fastest)</span>
                </div>
              </button>
              <button class="sexy-dropdown-item" data-val="status">
                <div class="item-left">
                  <span class="item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></span>
                  <span>Health (Healthy First)</span>
                </div>
              </button>
            </div>
          </div>

          <!-- 4. Bulk Actions Dropdown -->
          <div class="sexy-dropdown" id="dropdown-bulk">
            <button class="btn btn-secondary btn-sm sexy-dropdown-trigger" id="btn-trigger-bulk" style="gap:0.4rem;" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <span>Bulk Actions</span>
              <svg class="trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            <div class="sexy-dropdown-menu" id="menu-bulk">
              <div class="sexy-dropdown-header">Batch Operations</div>
              <button class="sexy-dropdown-item bulk-action-item" data-action="expose-all">
                <div class="item-left">
                  <span class="item-icon" style="color:var(--accent-lime);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  </span>
                  <span>Expose All Filtered</span>
                </div>
              </button>
              <button class="sexy-dropdown-item bulk-action-item" data-action="hide-all">
                <div class="item-left">
                  <span class="item-icon" style="color:var(--text-muted);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </span>
                  <span>Hide All Filtered</span>
                </div>
              </button>
              <button class="sexy-dropdown-item bulk-action-item" data-action="hide-errors">
                <div class="item-left">
                  <span class="item-icon" style="color:var(--status-error);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  </span>
                  <span>Hide All Error Models</span>
                </div>
              </button>
              <button class="sexy-dropdown-item bulk-action-item" data-action="expose-healthy">
                <div class="item-left">
                  <span class="item-icon" style="color:var(--status-success);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </span>
                  <span>Expose All Healthy Models</span>
                </div>
              </button>
              <div class="sexy-dropdown-divider"></div>
              <button class="sexy-dropdown-item bulk-action-item" data-action="invert">
                <div class="item-left">
                  <span class="item-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>
                  </span>
                  <span>Invert Visibility</span>
                </div>
              </button>
            </div>
          </div>
          <span class="info-help-btn" data-tooltip="Batch actions to quickly expose, hide, or invert visibility across filtered models or based on test health.">?</span>
        </div>
      </div>

      <!-- Bottom Row: Provider Pills -->
      <div class="toolbar-row-bottom">
        <div class="filter-pills-group" id="provider-pills-container">
          <!-- Rendered dynamically -->
        </div>

        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono); display:inline-flex; align-items:center;">
            Type:
            <span class="info-help-btn" data-tooltip="Switch between single upstream models and multi-model router combinations (auto/* pipelines).">?</span>
          </span>
          <div class="filter-pills-group" id="type-pills-container">
            <button class="filter-pill active" data-type="all">All</button>
            <button class="filter-pill" data-type="model">Single Models</button>
            <button class="filter-pill" data-type="combo">Combos</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.updateProviderPills();
    this.updateFamilyDropdown();
  }

  bindEvents() {
    // Search input
    const searchInput = this.container.querySelector('#model-search-input');
    const clearBtn = this.container.querySelector('#search-clear-btn');
    const shortcutHint = this.container.querySelector('.search-shortcut-hint');

    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      store.set({ searchQuery: val });
      if (val.length > 0) {
        clearBtn.style.display = 'inline-flex';
        shortcutHint.style.display = 'none';
      } else {
        clearBtn.style.display = 'none';
        shortcutHint.style.display = 'block';
      }
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      store.set({ searchQuery: '' });
      clearBtn.style.display = 'none';
      shortcutHint.style.display = 'block';
      searchInput.focus();
    });

    // Global keyboard shortcut '/' to focus search
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        searchInput.focus();
      }
    });

    // Setup Custom Dropdowns
    this.setupDropdown('dropdown-family', 'menu-family', (val, label) => {
      document.getElementById('label-family').textContent = label;
      store.set({ familyFilter: val });
    });

    this.setupDropdown('dropdown-visibility', 'menu-visibility', (val, label) => {
      document.getElementById('label-visibility').textContent = label;
      store.set({ visibilityFilter: val });
    });

    this.setupDropdown('dropdown-sort', 'menu-sort', (val, label) => {
      document.getElementById('label-sort').textContent = label;
      store.set({ sortBy: val });
    });

    this.setupDropdown('dropdown-bulk', 'menu-bulk', async (action) => {
      if (action) {
        await this.handleBulkAction(action);
      }
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sexy-dropdown')) {
        this.container.querySelectorAll('.sexy-dropdown').forEach((d) => d.classList.remove('open'));
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.container.querySelectorAll('.sexy-dropdown').forEach((d) => d.classList.remove('open'));
      }
    });

    // Type Pills
    const typePills = this.container.querySelectorAll('#type-pills-container .filter-pill');
    typePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        typePills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        store.set({ typeFilter: pill.dataset.type });
      });
    });
  }

  setupDropdown(dropdownId, menuId, onSelect) {
    const dropdown = this.container.querySelector(`#${dropdownId}`);
    if (!dropdown) return;

    const trigger = dropdown.querySelector('.sexy-dropdown-trigger');
    const menu = dropdown.querySelector(`#${menuId}`);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      this.container.querySelectorAll('.sexy-dropdown').forEach((d) => d.classList.remove('open'));
      if (!isOpen) {
        dropdown.classList.add('open');
      }
    });

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.sexy-dropdown-item');
      if (!item) return;
      e.stopPropagation();

      menu.querySelectorAll('.sexy-dropdown-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      dropdown.classList.remove('open');

      const val = item.dataset.val || item.dataset.action;
      const label = item.querySelector('.item-left span:last-child')?.textContent || item.textContent.trim();
      onSelect(val, label);
    });
  }

  updateFamilyDropdown() {
    const menu = this.container.querySelector('#menu-family');
    const labelElem = this.container.querySelector('#label-family');
    if (!menu) return;

    const families = store.getAvailableFamilies();
    const currentFamily = store.get().familyFilter;

    let itemsHtml = `
      <button class="sexy-dropdown-item ${currentFamily === 'all' ? 'active' : ''}" data-val="all">
        <div class="item-left">
          <span class="item-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
          </span>
          <span>All Model Families</span>
        </div>
      </button>
    `;

    families.forEach((f) => {
      const isActive = currentFamily === f;
      itemsHtml += `
        <button class="sexy-dropdown-item ${isActive ? 'active' : ''}" data-val="${escapeHtml(f)}">
          <div class="item-left">
            <span class="item-icon" style="color:var(--accent-lime);">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            </span>
            <span>${escapeHtml(f)}</span>
          </div>
        </button>
      `;
    });

    menu.innerHTML = itemsHtml;
    if (labelElem) {
      labelElem.textContent = currentFamily === 'all' ? 'All Model Families' : currentFamily;
    }
  }

  updateProviderPills() {
    const pillsContainer = this.container.querySelector('#provider-pills-container');
    if (!pillsContainer) return;

    const models = store.get().models;
    const currentProvider = store.get().providerFilter;

    // Count by provider
    const counts = { all: models.length, combo: 0 };
    models.forEach((m) => {
      if (m.isCombo) {
        counts.combo = (counts.combo || 0) + 1;
      }
      if (m.provider) {
        const p = m.provider.toLowerCase();
        counts[p] = (counts[p] || 0) + 1;
      }
    });

    // Known curated providers in preferred order
    const priorityProviders = ['anthropic', 'openai', 'google', 'deepseek', 'meta', 'mistral', 'qwen', 'kimi'];
    const otherProviders = Object.keys(counts).filter(
      (p) => !['all', 'combo', ...priorityProviders].includes(p) && counts[p] > 0
    );

    const providerList = ['all', ...priorityProviders.filter((p) => counts[p]), ...otherProviders, 'combo'];

    pillsContainer.innerHTML = providerList
      .map((p) => {
        const label = p === 'all' ? 'All Providers' : p === 'combo' ? 'Combos' : p.charAt(0).toUpperCase() + p.slice(1);
        const isActive = currentProvider === p ? 'active' : '';
        const count = counts[p] || 0;
        return `
          <button class="filter-pill ${isActive}" data-provider="${p}">
            ${label}
            <span class="filter-pill-count">${count}</span>
          </button>
        `;
      })
      .join('');

    // Bind click to pills
    pillsContainer.querySelectorAll('.filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        pillsContainer.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        store.set({ providerFilter: pill.dataset.provider });
      });
    });
  }

  async handleBulkAction(action) {
    const actionLabels = {
      show_all_working: 'Exposed all working models',
      hide_errors: 'Hidden all failing/error models',
      hide_all: 'Hidden all models',
      invert: 'Inverted model visibility',
    };

    try {
      // Optimistic local state update
      const models = [...store.get().models];
      models.forEach((m) => {
        if (action === 'show_all_working') {
          if (!m.lastTested || m.lastTested.status !== 'error') {
            m.visible = true;
          }
        } else if (action === 'hide_errors') {
          if (m.lastTested && m.lastTested.status === 'error') {
            m.visible = false;
          }
        } else if (action === 'hide_all') {
          m.visible = false;
        } else if (action === 'invert') {
          m.visible = !m.visible;
        }
      });
      store.set({ models });

      // Send to backend
      await api.bulkVisibility(action);
      if (this.onToast) {
        this.onToast(actionLabels[action] || 'Updated models in bulk', 'success');
      }
    } catch (err) {
      console.error('Failed bulk update:', err);
      if (this.onToast) {
        this.onToast(`Bulk action failed: ${err.message}`, 'error');
      }
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
