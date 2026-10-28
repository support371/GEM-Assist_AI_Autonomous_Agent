/**
 * Model router · picks the best free-tier model for each task class.
 *
 * Free providers (all zero-cost, no card):
 *   cf_workers_ai → @cf/meta/llama-3.3-70b-instruct-fp8-fast  (10K Neurons/day)
 *   cf_workers_ai → @cf/qwen/qwen2.5-coder-32b-instruct       (code specialist)
 *   gemini        → gemini-2.0-flash                          (1,500 req/day)
 *   gemini        → gemini-2.0-flash-thinking-exp             (reasoning)
 *   groq          → llama-3.3-70b-versatile                   (14,400 req/day)
 *   groq          → deepseek-r1-distill-llama-70b             (reasoning)
 *
 * Task categories (Base44-style classification):
 *   complex_reasoning · code · workflow · general · fast · vision
 */

export const MODEL_MAP = {
  complex_reasoning: [
    { provider: 'groq',          model: 'deepseek-r1-distill-llama-70b' },
    { provider: 'gemini',        model: 'gemini-2.0-flash-thinking-exp' },
    { provider: 'groq',          model: 'llama-3.3-70b-versatile' },
    { provider: 'cf_workers_ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  ],
  code: [
    { provider: 'cf_workers_ai', model: '@cf/qwen/qwen2.5-coder-32b-instruct' },
    { provider: 'groq',          model: 'llama-3.3-70b-versatile' },
    { provider: 'cf_workers_ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  ],
  workflow: [
    { provider: 'groq',          model: 'llama-3.3-70b-versatile' },
    { provider: 'cf_workers_ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
    { provider: 'gemini',        model: 'gemini-2.0-flash' },
  ],
  general: [
    { provider: 'cf_workers_ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
    { provider: 'groq',          model: 'llama-3.3-70b-versatile' },
    { provider: 'gemini',        model: 'gemini-2.0-flash' },
  ],
  fast: [
    { provider: 'gemini',        model: 'gemini-2.0-flash' },
    { provider: 'cf_workers_ai', model: '@cf/meta/llama-3.1-8b-instruct' },
    { provider: 'groq',          model: 'llama-3.3-70b-versatile' },
  ],
  vision: [
    { provider: 'gemini',        model: 'gemini-2.0-flash' },  // only free vision option
  ],
};

const KEYWORDS = {
  complex_reasoning: ['architect','design','tradeoff','trade-off','analyze','evaluate','strategy','compare','reason','why','prove','derive','critique'],
  code:              ['code','function','class','component','typescript','javascript','python','react','next','vue','svelte','debug','refactor','implement','fix bug','pr review','test'],
  workflow:          ['workflow','automation','pipeline','cron','schedule','integrate','webhook','trigger'],
  fast:              ['tldr','summary','summarize','quick','briefly','one sentence'],
  vision:            ['image','screenshot','photo','picture','diagram','chart','infographic'],
};

/** Classify task by keywords. Fast, free, deterministic. */
export function classifyTask(prompt) {
  const t = String(prompt || '').toLowerCase();
  const scores = { complex_reasoning:0, code:0, workflow:0, general:0, fast:0, vision:0 };
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    for (const kw of kws) if (t.includes(kw)) scores[cat] += 1;
  }
  const best = Object.entries(scores).sort((a,b) => b[1]-a[1])[0];
  return best[1] > 0 ? best[0] : 'general';
}

/** Build the ordered provider chain for a classified task. */
export function routeModel(category, preferences = [], env) {
  // Preferences first, then default order
  const ordered = [];
  const seen = new Set();
  const push = (p, m) => {
    const key = `${p}:${m}`;
    if (!seen.has(key)) { ordered.push({ provider:p, model:m }); seen.add(key); }
  };
  for (const pref of preferences) {
    for (const entry of (MODEL_MAP[pref] || [])) push(entry.provider, entry.model);
  }
  for (const entry of (MODEL_MAP[category] || MODEL_MAP.general)) push(entry.provider, entry.model);

  // Drop entries whose provider is not configured
  return ordered.filter(e => isProviderAvailable(e.provider, env));
}

function isProviderAvailable(provider, env) {
  if (provider === 'cf_workers_ai') return !!env.AI;
  if (provider === 'gemini')        return !!env.GEMINI_API_KEY;
  if (provider === 'groq')          return !!env.GROQ_API_KEY;
  return false;
}
