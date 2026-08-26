/**
 * Spectre Proxy — State Store
 * Lightweight Reactive State Management with Pub/Sub Event Emitter
 */

class StateStore {
  constructor() {
    this.state = {
      // Catalog Data
      models: [],
      combos: [],
      lastUpdated: null,

      // Filter & Search Controls
      searchQuery: '',
      providerFilter: 'all',
      familyFilter: 'all',
      typeFilter: 'all',       // 'all' | 'model' | 'combo'
      visibilityFilter: 'all', // 'all' | 'visible' | 'hidden'
      sortBy: 'default',       // 'default' | 'name-asc' | 'name-desc' | 'provider' | 'latency-asc' | 'status'

      // Benchmark & Testing State
      isTestingAll: false,
      testExcludeVisible: false,
      testExcludeHidden: false,
      activeTestWorkers: 0,
      testProgress: {
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        percent: 0,
      },
      testLogs: [], // Array of { modelId, status, statusCode, latencyMs, ttftMs, response, error, timestamp }
      autoHideOnTestFailure: true,
      autoShowOnTestSuccess: true,
      testPrompt: "Respond with 'OK' in one word.",
      testConcurrency: 4,

      // App Config & Connection Status
      config: {
        omnirouteUrl: 'http://localhost:8000',
        omnirouteApiKey: '',
        proxyPort: 3005,
        proxyHost: '0.0.0.0',
        autoHideOnTestFailure: true,
      },
      connection: {
        isOnline: true,
        latencyMs: 14,
        upstreamStatus: 'connected',
        lastChecked: Date.now(),
      },

      // UI Drawer & Modal Visibility
      isTestDrawerOpen: false,
      isQuickConnectOpen: false,
      isSettingsOpen: false,
      activePopoverModelId: null,
    };

    this.listeners = new Map();
  }

  // Helper to check combo
  static isCombo(model) {
    if (!model) return false;
    return Boolean(model.isCombo) || String(model.id || '').startsWith('auto/') || String(model.id || '').startsWith('combo/');
  }

  // Subscribe to changes: event can be specific state key or '*' for any change
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  // Emit event to subscribers
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data, this.state);
        } catch (err) {
          console.error(`Error in state subscriber for '${event}':`, err);
        }
      });
    }

    if (event !== '*' && this.listeners.has('*')) {
      this.listeners.get('*').forEach((cb) => {
        try {
          cb(event, data, this.state);
        } catch (err) {
          console.error(`Error in wildcard subscriber for '${event}':`, err);
        }
      });
    }
  }

  // Update a slice of state
  set(updates) {
    const changedKeys = [];
    for (const [key, value] of Object.entries(updates)) {
      let finalValue = value;
      if (key === 'models' && Array.isArray(value)) {
        finalValue = value.map((m) => {
          const isCombo = StateStore.isCombo(m);
          return {
            ...m,
            isCombo,
            provider: isCombo ? 'combo' : (m.provider || 'other'),
            family: isCombo ? 'Combos' : (m.family || 'Other'),
          };
        });
      }
      if (this.state[key] !== finalValue) {
        this.state[key] = finalValue;
        changedKeys.push(key);
      }
    }

    changedKeys.forEach((key) => this.emit(key, this.state[key]));
    if (changedKeys.length > 0) {
      this.emit('state:changed', this.state);
    }
  }

  // Get current state snapshot
  get() {
    return this.state;
  }

  // Helper: Computed Filtered & Sorted Models
  getFilteredModels() {
    const {
      models,
      searchQuery,
      providerFilter,
      familyFilter,
      typeFilter,
      visibilityFilter,
      sortBy,
    } = this.state;

    return models
      .filter((model) => {
        const isCombo = StateStore.isCombo(model);

        // Search Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesId = (model.id || '').toLowerCase().includes(q);
          const matchesName = (model.name || model.customLabel || '').toLowerCase().includes(q);
          const matchesProvider = (model.provider || '').toLowerCase().includes(q);
          const matchesFamily = (model.family || '').toLowerCase().includes(q);
          if (!matchesId && !matchesName && !matchesProvider && !matchesFamily) {
            return false;
          }
        }

        // Provider Filter
        if (providerFilter !== 'all') {
          if (providerFilter === 'combo' && !isCombo) return false;
          if (providerFilter !== 'combo' && (isCombo || (model.provider || '').toLowerCase() !== providerFilter.toLowerCase())) {
            return false;
          }
        }

        // Family Filter
        if (familyFilter !== 'all') {
          if ((model.family || '').toLowerCase() !== familyFilter.toLowerCase()) {
            return false;
          }
        }

        // Type Filter
        if (typeFilter === 'model' && isCombo) return false;
        if (typeFilter === 'combo' && !isCombo) return false;

        // Visibility Filter
        if (visibilityFilter === 'visible' && !model.visible) return false;
        if (visibilityFilter === 'hidden' && model.visible) return false;

        return true;
      })
      .sort((a, b) => {
        const aCombo = StateStore.isCombo(a);
        const bCombo = StateStore.isCombo(b);

        switch (sortBy) {
          case 'name-asc':
            return (a.name || a.id).localeCompare(b.name || b.id);
          case 'name-desc':
            return (b.name || b.id).localeCompare(a.name || a.id);
          case 'provider':
            return (a.provider || '').localeCompare(b.provider || '');
          case 'family':
            return (a.family || '').localeCompare(b.family || '');
          case 'latency-asc': {
            const latA = a.lastTested?.latencyMs || 99999;
            const latB = b.lastTested?.latencyMs || 99999;
            return latA - latB;
          }
          case 'status': {
            const scoreA = a.lastTested?.status === 'success' ? 1 : a.lastTested?.status === 'error' ? 3 : 2;
            const scoreB = b.lastTested?.status === 'success' ? 1 : b.lastTested?.status === 'error' ? 3 : 2;
            return scoreA - scoreB;
          }
          default:
            // Default sort: Combos first, then visible first, then alphabetical
            if (aCombo !== bCombo) return bCombo ? 1 : -1;
            if (a.visible !== b.visible) return b.visible ? 1 : -1;
            return (a.name || a.id).localeCompare(b.name || b.id);
        }
      });
  }

  // Helper: Computed KPI Metrics
  getMetrics() {
    const { models } = this.state;
    const totalModels = models.length;
    const exposedModels = models.filter((m) => m.visible).length;
    const activeCombos = models.filter((m) => StateStore.isCombo(m)).length;

    const testedModels = models.filter((m) => m.lastTested && m.lastTested.status);
    const passedModels = testedModels.filter((m) => m.lastTested.status === 'success').length;
    const failedModels = testedModels.filter((m) => m.lastTested.status === 'error').length;
    const healthRate = testedModels.length > 0 ? Math.round((passedModels / testedModels.length) * 100) : 100;

    return {
      totalModels,
      exposedModels,
      activeCombos,
      testedCount: testedModels.length,
      passedCount: passedModels,
      failedCount: failedModels,
      healthRate,
    };
  }

  // Helper: Model Families list extracted from active models
  getAvailableFamilies() {
    const families = new Set();
    this.state.models.forEach((m) => {
      if (m.family) families.add(m.family);
    });
    return Array.from(families).sort();
  }

  // Helper: Available Providers list
  getAvailableProviders() {
    const providers = new Set();
    this.state.models.forEach((m) => {
      const isCombo = StateStore.isCombo(m);
      if (m.provider && !isCombo && m.provider !== 'combo') providers.add(m.provider);
    });
    return Array.from(providers).sort();
  }
}

export const store = new StateStore();
