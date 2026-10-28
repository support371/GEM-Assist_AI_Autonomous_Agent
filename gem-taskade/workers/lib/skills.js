/**
 * Skills · tools the agent can call to compensate for lower free-model raw power.
 * All skills are free-tier friendly.
 *
 * Available:
 *   web_search    · DuckDuckGo HTML scrape (unlimited, no key)
 *   fetch_url     · plain HTTPS GET with 10s timeout
 *   calculator    · safe math eval
 *   rag_search    · Supabase pgvector + Workers AI embeddings
 *   send_telegram · post to a Telegram chat/channel via the bot token
 */

export const SKILL_DEFINITIONS = {
  web_search: {
    description: 'Search the web for current information. Use when the user asks about recent events, people, products, prices, or anything time-sensitive.',
    parameters: { query: 'string · search terms', limit: 'number · max results, default 5' },
  },
  fetch_url: {
    description: 'Fetch the text content of a URL. Use to read documentation, news articles, or any specific page the user mentions.',
    parameters: { url: 'string · absolute URL (https only)' },
  },
  calculator: {
    description: 'Evaluate a numeric expression safely. Use for exact arithmetic.',
    parameters: { expression: "string · e.g. '(1200 * 1.08) / 12'" },
  },
  rag_search: {
    description: 'Search the GEM Enterprise knowledge base for relevant internal context. Use when the user mentions internal projects, standards, runbooks, or decisions.',
    parameters: { query: 'string · what to look up', k: 'number · max chunks, default 5' },
  },
  send_telegram: {
    description: 'Send a message to a Telegram chat or channel. Use only when the user explicitly asks to post or notify someone.',
    parameters: { chat_id: 'string · numeric chat id or @channelname', text: 'string · HTML allowed' },
  },
};

/** Build the "available tools" block for the system prompt. */
export function toolsPrompt(skillNames) {
  if (!skillNames?.length) return '';
  const lines = ['## Available tools (call via JSON)',
    'To use a tool, output a single line of valid JSON in this exact shape:',
    '`<<TOOL_CALL>>{"tool":"name","args":{...}}<<END_TOOL_CALL>>`',
    'The runtime executes the tool and sends the result back. Then produce your final answer.',
    ''];
  for (const name of skillNames) {
    const def = SKILL_DEFINITIONS[name];
    if (!def) continue;
    lines.push(`- **${name}** · ${def.description}`);
    lines.push(`  params: ${JSON.stringify(def.parameters)}`);
  }
  return lines.join('\n');
}

/** Parse an assistant message for a tool call directive. */
export function parseToolCall(text) {
  const m = text.match(/<<TOOL_CALL>>([\s\S]*?)<<END_TOOL_CALL>>/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

/** Dispatch to the right skill implementation. */
export async function runSkill(call, env) {
  const { tool, args } = call;
  if (tool === 'web_search')    return webSearch(args, env);
  if (tool === 'fetch_url')     return fetchUrl(args, env);
  if (tool === 'calculator')    return calculator(args, env);
  if (tool === 'rag_search')    return ragSearch(args, env);
  if (tool === 'send_telegram') return sendTelegram(args, env);
  return { error: `Unknown tool: ${tool}` };
}

// ─────────────────────────────────────────────────────────────
// Skill implementations
// ─────────────────────────────────────────────────────────────

async function webSearch({ query, limit = 5 }, env) {
  try {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GEM-Bot/1.0' } });
    const html = await res.text();
    // Lightweight parse: pull <a class="result__a">title</a> and <a class="result__snippet">
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m, count = 0;
    while ((m = re.exec(html)) && count < limit) {
      const title = stripTags(m[2]);
      const snippet = stripTags(m[3]);
      let link = m[1];
      // DuckDuckGo wraps external URLs; unwrap
      const dd = link.match(/uddg=([^&]+)/);
      if (dd) link = decodeURIComponent(dd[1]);
      results.push({ title, link, snippet });
      count++;
    }
    return { results };
  } catch (e) { return { error: e.message }; }
}

async function fetchUrl({ url }, env) {
  if (!/^https:\/\//i.test(url)) return { error: 'Only https URLs allowed' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 GEM-Bot/1.0' } });
    clearTimeout(timer);
    const ct = res.headers.get('content-type') || '';
    const body = await res.text();
    const content = ct.includes('html') ? stripTags(body).slice(0, 8000) : body.slice(0, 8000);
    return { status: res.status, content_type: ct, content };
  } catch (e) { return { error: e.message }; }
}

function calculator({ expression }, env) {
  // Allow only digits, operators, parens, dots, spaces, basic Math.*
  if (!/^[\d\s+\-*/().,eE%]+$/.test(expression)) {
    return { error: 'Expression contains disallowed characters. Allowed: digits + - * / ( ) . , e E %' };
  }
  try {
    const result = Function(`"use strict";return (${expression})`)();
    return { expression, result };
  } catch (e) { return { error: e.message }; }
}

async function ragSearch({ query, k = 5 }, env) {
  if (!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && env.AI)) {
    return { error: 'RAG not configured (needs Supabase + Workers AI)' };
  }
  try {
    // 1. Embed the query via Workers AI (free)
    const emb = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [query] });
    const vector = emb.data?.[0];
    if (!vector) return { error: 'Embedding failed' };
    // 2. Call Supabase RPC match_knowledge(query_embedding, match_count)
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_knowledge`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query_embedding: vector, match_count: k }),
    });
    if (!res.ok) return { error: `RAG query failed: ${res.status}` };
    const rows = await res.json();
    return { matches: rows.map(r => ({ source: r.source, chunk: r.chunk, similarity: r.similarity })) };
  } catch (e) { return { error: e.message }; }
}

async function sendTelegram({ chat_id, text }, env) {
  if (!env.TG_BOT_TOKEN) return { error: 'Bot token not configured' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
    });
    const d = await r.json();
    return { ok: d.ok, message_id: d.result?.message_id, error: d.description };
  } catch (e) { return { error: e.message }; }
}

function stripTags(html) {
  return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
