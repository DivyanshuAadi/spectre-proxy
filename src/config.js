/**
 * Configuration Store — data/config.json
 * Flat settings object shared with the dashboard via GET/POST /api/config.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readJson, writeJsonAtomic } from './utils/atomic-json.js';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR ? join(process.env.DATA_DIR) : join(ROOT_DIR, 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

// Only these keys are accepted from POST /api/config or env overrides.
const KNOWN_KEYS = new Set([
  'omnirouteUrl',
  'omnirouteApiKey',
  'proxyPort',
  'proxyHost',
  'autoHideOnTestFailure',
  'autoShowOnTestSuccess',
  'testPrompt',
  'testConcurrency',
]);

function defaults() {
  return {
    omnirouteUrl: process.env.OMNIROUTE_URL || 'http://localhost:8000',
    omnirouteApiKey: process.env.OMNIROUTE_API_KEY || '',
    proxyPort: toInt(process.env.PROXY_PORT ?? process.env.PORT, 3005),
    proxyHost: process.env.PROXY_HOST ?? process.env.HOST ?? '0.0.0.0',
    autoHideOnTestFailure: true,
    autoShowOnTestSuccess: true,
    testPrompt: "Respond with 'OK' in one word.",
    testConcurrency: 4,
  };
}

function toInt(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitize(raw) {
  const cfg = defaults();
  for (const key of KNOWN_KEYS) {
    if (raw[key] === undefined || raw[key] === null) continue;
    switch (key) {
      case 'proxyPort':
        cfg[key] = toInt(raw[key], cfg[key], 1, 65535);
        break;
      case 'testConcurrency':
        cfg[key] = toInt(raw[key], cfg[key], 1, 8); // worker pool bounds per plan
        break;
      case 'autoHideOnTestFailure':
      case 'autoShowOnTestSuccess':
        cfg[key] = Boolean(raw[key]);
        break;
      default:
        if (typeof raw[key] === 'string') cfg[key] = raw[key].trim();
    }
  }
  return cfg;
}

let current = defaults();
let loaded = false;

/** Load data/config.json once at startup (env vars fill any gaps). */
export async function loadConfig() {
  const persisted = await readJson(CONFIG_FILE, {});
  current = sanitize({ ...persisted });
  loaded = true;
  return getConfig();
}

export function getConfig() {
  if (!loaded) throw new Error('config.loadConfig() must be awaited before first use');
  return { ...current };
}

/** Merge a partial patch into config, persist atomically, return the result. */
export async function updateConfig(patch = {}) {
  current = sanitize({ ...current, ...patch });
  await writeJsonAtomic(CONFIG_FILE, current);
  return getConfig();
}

/** Raw file location (for startup logging). */
export const CONFIG_FILE_PATH = CONFIG_FILE;
