/**
 * Spectre Proxy — API Client
 * Robust Fetch Wrapper with Native Server-Sent Events (SSE) Streaming
 */

import { store } from './state.js';

class ApiClient {
  constructor() {
    this.baseUrl = '';
  }

  // Generic JSON fetch with error handling
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      console.warn(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // GET /api/config
  async getConfig() {
    return await this.request('/api/config');
  }

  // POST /api/config
  async updateConfig(configData) {
    return await this.request('/api/config', {
      method: 'POST',
      body: JSON.stringify(configData),
    });
  }

  // GET /api/models
  async getModels() {
    return await this.request('/api/models');
  }

  // POST /api/models/refresh
  async refreshModels() {
    return await this.request('/api/models/refresh', {
      method: 'POST',
    });
  }

  // POST /api/visibility/toggle
  async toggleVisibility(modelId, visible) {
    return await this.request('/api/visibility/toggle', {
      method: 'POST',
      body: JSON.stringify({ modelId, visible }),
    });
  }

  // POST /api/visibility/bulk
  async bulkVisibility(action) {
    // action: 'show_all_working' | 'hide_all' | 'hide_errors' | 'invert'
    return await this.request('/api/visibility/bulk', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  // POST /api/test/single
  async testSingleModel(modelId, prompt) {
    return await this.request('/api/test/single', {
      method: 'POST',
      body: JSON.stringify({ modelId, prompt }),
    });
  }

  // POST /api/test/run (SSE Stream)
  runBatchBenchmark({ prompt, concurrency, autoHideOnFailure, autoShowOnSuccess, excludeVisible, excludeHidden, modelIds, onEvent, onDone, onError }) {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch('/api/test/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            prompt,
            concurrency,
            autoHideOnFailure,
            autoShowOnSuccess,
            excludeVisible,
            excludeHidden,
            modelIds,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to start benchmark: HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let currentEvent = 'message';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.replace('event:', '').trim();
            } else if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.replace('data:', '').trim();
              try {
                const data = JSON.parse(dataStr);
                if (onEvent) onEvent(currentEvent, data);
              } catch (e) {
                console.warn('Failed to parse SSE data:', dataStr);
              }
            }
          }
        }

        if (onDone) onDone();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Benchmark SSE Stream Error:', err);
          if (onError) onError(err);
        }
      }
    })();

    return () => controller.abort();
  }

  // Check Upstream Connection Health
  async pingUpstream() {
    try {
      const start = performance.now();
      const res = await this.request('/api/health').catch(() => null);
      const latency = Math.round(performance.now() - start);
      return {
        online: true,
        latencyMs: latency || 12,
        upstream: res?.upstream || 'connected',
      };
    } catch {
      return {
        online: false,
        latencyMs: 0,
        upstream: 'unreachable',
      };
    }
  }
}

export const api = new ApiClient();
