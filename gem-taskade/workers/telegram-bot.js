/**
 * GEM Bot · Cloudflare Worker (free tier · no paid AI subscriptions)
 *
 * Routes:
 *   POST /webhook         → Telegram bot (secret-token verified)
 *   POST /llm             → Raw provider router (Anthropic-shaped request/response)
 *   POST /agent/:name     → Base44-style Superagent: memory + tools + routing + critique
 *   POST /publish         → Post to Telegram channel (admin-token guarded)
 *   GET  /health
 *   cron 0 7 * * *        → daily digest publisher + fact rollup
 *
 * See lib/ for the modular runtime.
 */

import { classifyTask, routeModel } from './lib/router.js';
import { callProvider } from './lib/providers.js';
import { runAgent, registerAgents, AGENT_REGISTRY } from './lib/agent.js';

// Agents are embedded at build time (not loaded from disk — Workers don't have filesystem).
import architectDef from '../agents/architect.json' with { type: 'json' };
import sentinelDef  from '../agents/sentinel.json'  with { type: 'json' };
import analystDef   from '../agents/analyst.json'   with { type: 'json' };
import codexDef     from '../agents/codex.json'     with { type: 'json' };
import tskAutoDef   from '../agents/tsk-auto.json'  with { type: 'json' };

// Register agents on cold start
registerAgents([architectDef, sentinelDef, analystDef, codexDef, tskAutoDef]);

const BOT_SYSTEM = `You are MyGemAssist — the Telegram agent for GEM Enterprise.
Cover cybersecurity threats, real estate opportunities, and market intel.
Use HTML (<b>, <i>, <code>) for emphasis. Be concise, direct, actionable.`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/health') return json({
      ok: true, agents: Object.keys(AGENT_REGISTRY),
      providers: availableProviders(env), ts: new Date().toISOString(),
    });

    // CORS preflight
    if (request.method === 'OPTIONS') return corsResponse(request, env);

    // /llm · raw provider router
    if (path === '/llm' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await callLLMRaw(env, body);
        return json(result, 200, corsHeaders(request, env));
      } catch (e) { return json({ error: { message: e.message } }, 500, corsHeaders(request, env)); }
    }

    // /agent/:name · full Superagent runtime
    const agentMatch = path.match(/^\/agent\/([a-z0-9_-]+)$/i);
    if (agentMatch && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await runAgent({
          agentName: agentMatch[1],
          userText: body.message || body.content || '',
          userId:   body.user_id || 'anonymous',
          env, ctx,
        });
        return json(result, 200, corsHeaders(request, env));
      } catch (e) { return json({ error: { message: e.message } }, 500, corsHeaders(request, env)); }
    }

    // /webhook · Telegram
    if (path === '/webhook' && request.method === 'POST') {
      if (request.headers.get('x-telegram-bot-api-secret-token') !== env.TG_WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });
      const update = await request.json();
      ctx.waitUntil(handleUpdate(update, env, ctx));
      return new Response('OK', { status: 200 });
    }

    // /publish · admin-guarded channel post
    if (path === '/publish' && request.method === 'POST') {
      if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_SECRET}`) return new Response('Forbidden', { status: 403 });
      const body = await request.json();
      return json(await postToChannel(env, body.text, body.photo_url));
    }

    // /embed · bge-base embeddings (admin-guarded, powers ingest-knowledge.mjs)
    if (path === '/embed' && request.method === 'POST') {
      if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_SECRET}`) return new Response('Forbidden', { status: 403 });
      try {
        const body = await request.json();
        const texts = Array.isArray(body.text) ? body.text : [body.text];
        if (!env.AI) return json({ error: 'AI binding not configured' }, 500);
        const out = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: texts });
        return json({ data: (out?.data || []).map((v, i) => ({ embedding: v, index: i })), model: '@cf/baai/bge-base-en-v1.5' }, 200, corsHeaders(request, env));
      } catch (e) { return json({ error: { message: e.message } }, 500, corsHeaders(request, env)); }
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Daily digest + agent-memory rollup. Both are tolerant of individual failure.
    ctx.waitUntil(Promise.allSettled([runDailyDigest(env), runMemoryRollup(env)]));
  },
};

// ───────── Provider availability ─────────

function availableProviders(env) {
  const list = [];
  if (env.AI)              list.push('cf_workers_ai');
  if (env.GEMINI_API_KEY)  list.push('gemini');
  if (env.GROQ_API_KEY)    list.push('groq');
  return list;
}

// ───────── /llm raw router ─────────

async function callLLMRaw(env, body) {
  const category = classifyTask(body.messages?.map(m => m.content).join(' ') || '');
  const chain = routeModel(category, [], env);
  if (!chain.length) throw new Error('No AI provider configured. Set env.AI binding or GEMINI_API_KEY or GROQ_API_KEY.');
  let last;
  for (const { provider, model } of chain) {
    try {
      return await callProvider({
        provider, model,
        system: body.system,
        messages: body.messages || [],
        max_tokens: body.max_tokens || 1024,
        temperature: body.temperature ?? 0.3,
      }, env);
    } catch (e) { last = e; }
  }
  throw new Error(`All providers failed. Last: ${last?.message}`);
}

// ───────── Telegram bot ─────────

async function handleUpdate(update, env, ctx) {
  if (update.callback_query) {
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: update.callback_query.id }),
    });
    return;
  }
  if (!update.message) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  await trackSubscriber(env, msg).catch(() => {});

  if (text.startsWith('/')) {
    const cmd = text.split(/\s|@/)[0];
    if (cmd === '/start') return sendMessage(env, chatId,
      `<b>Welcome, ${escapeHtml(msg.from?.first_name || 'friend')}!</b> 🔺\n\n` +
      `I'm MyGemAssist — cybersecurity, real estate, market intel.\n\n` +
      `Try <code>/help</code> or just ask me anything.`);
    if (cmd === '/help') return sendMessage(env, chatId,
      `<b>Commands</b>\n/start · intro\n/help · this\n/status · system\n/agents · list specialist agents\n/digest · latest intel\n\n` +
      `Or send any question — I route it through the free-tier AI stack with memory, tools, and self-review.`);
    if (cmd === '/status') return sendMessage(env, chatId,
      `<b>Status</b> · 🟢 operational\n` +
      `Providers · <code>${availableProviders(env).join(', ') || 'none'}</code>\n` +
      `Agents · <code>${Object.keys(AGENT_REGISTRY).join(', ')}</code>\n` +
      `Channel · ${escapeHtml(env.TG_CHANNEL || '@mycybersecureWealthsolution')}`);
    if (cmd === '/agents') return sendMessage(env, chatId,
      `<b>Specialist agents</b>\n` +
      Object.values(AGENT_REGISTRY).map(a => `· <b>${escapeHtml(a.name)}</b> — ${escapeHtml(a.description)}`).join('\n') +
      `\n\nAddress one by starting your message with its name, e.g. <code>Architect: design a webhook retry queue</code>`);
    if (cmd === '/digest') {
      const item = await latestContentItem(env);
      if (!item) return sendMessage(env, chatId, 'No digest ready yet.');
      return sendMessage(env, chatId, `<b>${escapeHtml(item.title)}</b>\n\n${escapeHtml(item.ai_summary || item.summary || '')}`);
    }
    return sendMessage(env, chatId, 'Unknown command. Try /help');
  }

  // Agent addressing: "Architect: ..." → runs the Architect agent
  let reply = '';
  try {
    const agentMatch = text.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*[:>]\s*([\s\S]+)$/);
    if (agentMatch && AGENT_REGISTRY[agentMatch[1].toLowerCase()]) {
      const result = await runAgent({
        agentName: agentMatch[1],
        userText: agentMatch[2],
        userId: `tg:${chatId}`,
        env, ctx,
      });
      reply = result.content?.[0]?.text || '(empty)';
    } else {
      // Default: raw LLM call with the bot system prompt
      const result = await callLLMRaw(env, {
        system: BOT_SYSTEM,
        messages: [{ role: 'user', content: text }],
        max_tokens: 1024,
      });
      reply = result.content?.[0]?.text || '(empty)';
    }
  } catch (e) { reply = `⚠️ ${e.message}`; }

  await sendMessage(env, chatId, reply.slice(0, 4000));
  await logMessage(env, chatId, 'in', text).catch(() => {});
  await logMessage(env, chatId, 'out', reply, 'agent').catch(() => {});
}

// ───────── Telegram API ─────────

async function sendMessage(env, chatId, text) {
  return fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}
async function postToChannel(env, text, photoUrl) {
  const channel = env.TG_CHANNEL || '@mycybersecureWealthsolution';
  const endpoint = photoUrl ? 'sendPhoto' : 'sendMessage';
  const body = photoUrl
    ? { chat_id: channel, photo: photoUrl, caption: text, parse_mode: 'HTML' }
    : { chat_id: channel, text, parse_mode: 'HTML' };
  const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

// ───────── Supabase helpers (optional) ─────────

async function sbRequest(env, path, method = 'GET', body) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}
async function trackSubscriber(env, msg) {
  // Read current count, then upsert with count+1 (upsert without a read would
  // reset the field; Supabase REST does not support column-expression updates).
  const existing = await sbRequest(env, `tg_subscribers?chat_id=eq.${msg.chat.id}&select=message_count`);
  const nextCount = (existing?.[0]?.message_count ?? 0) + 1;
  return sbRequest(env, 'tg_subscribers', 'POST', {
    chat_id: msg.chat.id, username: msg.from?.username,
    last_message: new Date().toISOString(), message_count: nextCount,
  });
}
async function logMessage(env, chatId, direction, content, model) {
  return sbRequest(env, 'tg_messages', 'POST', { chat_id: chatId, direction, content, model_used: model });
}
async function latestContentItem(env) {
  const d = await sbRequest(env, `content_items?status=eq.ready&order=created_at.desc&limit=1`);
  return d?.[0];
}

// ───────── Daily memory rollup cron ─────────
// Compresses yesterday's agent_conversations into agent_summaries rows per
// (agent_id, owner_id). Caps context-block growth over months of use.

async function runMemoryRollup(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = await sbRequest(env, `agent_conversations?updated_at=gte.${since}&select=agent_id,owner_id,messages,updated_at`);
  if (!Array.isArray(rows) || rows.length === 0) return;
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.agent_id}::${r.owner_id || 'anonymous'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(...(r.messages || []));
  }
  for (const [key, msgs] of groups) {
    if (msgs.length < 4) continue;
    const [agent_id, owner_id] = key.split('::');
    const transcript = msgs.slice(-30).map(m => `${m.role}: ${String(m.content).slice(0, 300)}`).join('\n');
    const prompt = `Summarize this agent↔user exchange in <=120 words. Keep decisions, blockers, open questions, named entities. Omit greetings.\n\n${transcript}`;
    try {
      const chain = routeModel('fast', [], env);
      if (!chain.length) continue;
      const resp = await callProvider(chain[0], env, { messages: [{ role: 'user', content: prompt }], max_tokens: 300 });
      const summary = resp?.content?.[0]?.text?.trim();
      if (!summary) continue;
      await sbRequest(env, 'agent_summaries', 'POST', {
        agent_id, owner_id: owner_id === 'anonymous' ? null : owner_id,
        summary, period_start: since, period_end: new Date().toISOString(), model_used: resp.model,
      });
    } catch (err) {
      console.error('[rollup] failed for', key, err?.message || err);
    }
  }
}

// ───────── Daily digest cron ─────────

async function runDailyDigest(env) {
  const item = await latestContentItem(env);
  if (!item) return;
  const text = `<b>${escapeHtml(item.title)}</b>\n\n${escapeHtml(item.ai_summary || '')}\n\n<i>Source · ${escapeHtml(item.source_name || 'GEM')}</i>`;
  await postToChannel(env, text, item.image_url);
  await sbRequest(env, 'content_items?id=eq.' + item.id, 'PATCH', { status: 'published' });
  await sbRequest(env, 'publish_log', 'POST', {
    content_id: item.id, platform: 'telegram', status: 'ok', published_at: new Date().toISOString(),
  });
}

// ───────── Utils ─────────

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowed.length === 0 || allowed.includes(origin) ? (origin || '*') : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', 'Vary': 'Origin',
  };
}
function corsResponse(request, env) { return new Response(null, { status: 204, headers: corsHeaders(request, env) }); }
function json(o, status = 200, extra = {}) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...extra } });
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
