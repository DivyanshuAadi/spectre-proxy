/**
 * Model Classifier
 * Derives provider, family, and capability metadata from model/combo IDs when
 * upstream catalog entries don't carry it. Heuristics only — explicit upstream
 * metadata always wins (see enrich logic in api-routes/models-interceptor).
 * Includes plain Map memoization to avoid redundant regex evaluations.
 */

const PROVIDER_PATTERNS = [
  ['anthropic', /(^|[^a-z])(claude|anthropic)([^a-z]|$)/i],
  ['google', /(^|[^a-z])(gemini|palm|bard|imagen|gemma)([^a-z]|$)/i],
  ['deepseek', /deepseek/i],
  ['qwen', /(^|[^a-z])qwen|qwq/i],
  ['kimi', /(^|[^a-z])kimi|moonshot/i],
  ['mistral', /mistral|mixtral|ministral/i],
  ['meta', /llama|^meta-/i],
  ['xai', /(^|[^a-z])grok/i],
  ['cohere', /command(-|$)|cohere/i],
  ['microsoft', /phi-|wizardlm/i],
  ['openai', /gpt|chatgpt|davinci|(^|\/)o[134](-|$|\.)|omni|mimo/i],
];

const FAMILY_PATTERNS = [
  [/^claude.*3[.-]7/, 'Claude 3.7'],
  [/^claude.*3[.-]5/, 'Claude 3.5'],
  [/^claude.*3[.-]?opus/, 'Claude 3 Opus'],
  [/^claude.*haiku/, 'Claude Haiku'],
  [/^claude/, 'Claude'],
  [/^gpt-4o/, 'GPT-4o'],
  [/^gpt-4\.?1/, 'GPT-4.1'],
  [/^gpt-4/, 'GPT-4'],
  [/^gpt-3/, 'GPT-3.5'],
  [/^(^|\/)o[134](-|\.|$)/, 'OpenAI Reasoning'],
  [/^gemini/, 'Gemini'],
  [/^deepseek.*r1|deepseek-reasoner/, 'DeepSeek R1'],
  [/^deepseek/, 'DeepSeek'],
  [/^qwen.*2[.-]5|qwq/, 'Qwen 2.5'],
  [/^qwen/, 'Qwen'],
  [/llama.*3/, 'Llama 3'],
  [/^llama/, 'Llama'],
  [/^(mixtral|mistral)/, 'Mistral'],
  [/^kimi/, 'Kimi'],
  [/^grok/, 'Grok'],
  [/^mimo/, 'Mimo'],
  [/^phi/, 'Phi'],
];

// Family defaults: [contextWindow, maxTokens] — display strings for the UI.
const FAMILY_CONTEXT_DEFAULTS = [
  [/^claude/, '200k', '8k'],
  [/^gpt-4o|^gpt-4\.?1/, '128k', '16k'],
  [/^gpt-4/, '8k', '8k'],
  [/^gemini/, '1M', '8k'],
  [/^deepseek/, '64k', '8k'],
  [/^qwen/, '128k', '8k'],
  [/llama/, '128k', '4k'],
  [/^kimi/, '200k', '8k'],
  [/^grok/, '128k', '8k'],
];

const classificationMemo = new Map();
const prettifyMemo = new Map();

/** True when the ID represents a virtual routing combo (e.g. auto/*, combo/*). */
export function isComboId(id) {
  const s = String(id || '').trim().toLowerCase();
  return s.startsWith('auto/') || s.startsWith('combo/') || s.startsWith('router/');
}

/** True when the model speaks the Anthropic Messages API (tested via /v1/messages). */
export function isAnthropicModel(id) {
  return /^(claude|anthropic)/i.test(String(id || ''));
}

/** Pretty display name from a raw model ID: "deepseek-r1" -> "Deepseek R1". */
export function prettifyName(id) {
  const strId = String(id || '');
  const cached = prettifyMemo.get(strId);
  if (cached !== undefined) return cached;

  if (strId.startsWith('auto/')) {
    const res = 'Auto: ' + prettifyName(strId.slice(5));
    prettifyMemo.set(strId, res);
    return res;
  }
  if (strId.startsWith('combo/')) {
    const res = 'Combo: ' + prettifyName(strId.slice(6));
    prettifyMemo.set(strId, res);
    return res;
  }

  const result = strId
    .split(/[-_]/)
    .map((part) =>
      /^\d/.test(part) || /^[a-z]\d/i.test(part) // "3-7", "32b", "v3"
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(' ')
    .replace(/\bGpt\b/gi, 'GPT')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bR(\d)\b/g, 'R$1');

  prettifyMemo.set(strId, result);
  return result;
}

/** Format a raw token count for display: 200000 -> "200k", 1048576 -> "1M". */
export function formatTokenCount(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const k = Math.round(n / 1000);
    return `${k}k`;
  }
  return String(n);
}

/**
 * Classify a catalog entry (memoized).
 * @param {string} id Model or combo ID
 * @param {object} [meta] Optional upstream metadata hints
 * @param {string} [meta.name] Upstream display name
 * @param {string} [meta.ownedBy] Upstream owner/provider field
 * @param {number} [meta.contextLength] Context window in tokens
 * @param {number} [meta.maxOutputTokens] Max output tokens
 * @returns {{provider: string, family: string, capabilities: {vision: boolean, reasoning: boolean}, contextWindow: string|null, maxTokens: string|null}}
 */
export function classifyModel(id, meta = {}) {
  const memoKey = `${id}|${meta.name || ''}|${meta.ownedBy || ''}|${meta.contextLength || ''}|${meta.maxOutputTokens || ''}`;
  const cached = classificationMemo.get(memoKey);
  if (cached !== undefined) return cached;

  if (isComboId(id) || meta.isCombo) {
    const result = {
      provider: 'combo',
      family: 'Combos',
      capabilities: {
        vision: false,
        reasoning: true,
      },
      contextWindow: 'Pipeline',
      maxTokens: null,
    };
    classificationMemo.set(memoKey, result);
    return result;
  }

  const hay = `${id} ${meta.name || ''}`;
  const hayLower = hay.toLowerCase();

  let provider = 'other';
  if (meta.ownedBy && PROVIDER_PATTERNS.some(([, re]) => re.test(meta.ownedBy))) {
    provider = PROVIDER_PATTERNS.find(([, re]) => re.test(meta.ownedBy))[0];
  } else {
    for (const [name, re] of PROVIDER_PATTERNS) {
      if (re.test(hay)) {
        provider = name;
        break;
      }
    }
  }

  let family = '';
  for (const [re, label] of FAMILY_PATTERNS) {
    if (re.test(hayLower)) {
      family = label;
      break;
    }
  }
  if (!family) family = prettifyName(String(id).split(/[-_:]/)[0]) || 'Other';

  const contextWindow =
    formatTokenCount(meta.contextLength) ??
    (FAMILY_CONTEXT_DEFAULTS.find(([re]) => re.test(hayLower))?.[1] ?? null);
  const maxTokens =
    formatTokenCount(meta.maxOutputTokens) ??
    (FAMILY_CONTEXT_DEFAULTS.find(([re]) => re.test(hayLower))?.[2] ?? null);

  const result = {
    provider,
    family,
    capabilities: {
      vision:
        /vision|-vl\b|4o|omni|gemini|gpt-4\.?(1|5)?-turbo|multimodal/i.test(hay) ||
        /^claude.*(sonnet|opus|3[.-][57])/i.test(id),
      reasoning:
        /r1|thinking|reason(ing|er)?|(^|\/)o[134](-|$|\.)/i.test(hay) ||
        /^claude.*3[.-]7/i.test(id) ||
        /^deepseek-v3/i.test(id),
    },
    contextWindow,
    maxTokens,
  };

  classificationMemo.set(memoKey, result);
  return result;
}
