#!/usr/bin/env node
/**
 * GEM Taskade · smoke test
 * Exercises every live endpoint after a deploy.
 *
 * Env:
 *   WORKER_URL   · https://gem-bot.YOUR-SUBDOMAIN.workers.dev
 *   FRONTEND_URL · https://your-app.vercel.app  (optional)
 */

const WORKER = process.env.WORKER_URL;
const FRONTEND = process.env.FRONTEND_URL;

if (!WORKER) { console.error('WORKER_URL env required'); process.exit(2); }

const results = [];
function t(name, pass, detail = '') { results.push({ name, pass, detail }); }

async function run() {
  // 1. Worker health
  try {
    const r = await fetch(`${WORKER}/health`);
    const d = await r.json();
    t('worker/health', r.ok && d.ok === true, `agents=${d.agents?.length} providers=${d.providers?.join(',')}`);
    if (!d.providers?.length) throw new Error('no AI providers configured');
  } catch (e) { t('worker/health', false, e.message); }

  // 2. /llm raw provider route
  try {
    const r = await fetch(`${WORKER}/llm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: 'You are a terse assistant.',
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        max_tokens: 32,
      }),
    });
    const d = await r.json();
    const text = d.content?.[0]?.text || '';
    t('/llm', r.ok && text.toLowerCase().includes('ok'), `model=${d.model} text="${text.slice(0,80)}"`);
  } catch (e) { t('/llm', false, e.message); }

  // 3. /agent/:name runtime
  for (const name of ['TSK-Auto', 'Architect', 'Sentinel', 'Analyst', 'Codex']) {
    try {
      const r = await fetch(`${WORKER}/agent/${encodeURIComponent(name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `In one line, state your role.`, user_id: 'smoke' }),
      });
      const d = await r.json();
      const ok = r.ok && d.content?.[0]?.text && d.grade >= 50;
      t(`/agent/${name}`, ok, `grade=${d.grade} model=${d.model?.split('/').pop()} cls=${d.classification}`);
    } catch (e) { t(`/agent/${name}`, false, e.message); }
  }

  // 4. Agent memory persistence
  try {
    const userId = `smoke-${Date.now()}`;
    const seed = await fetch(`${WORKER}/agent/Architect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'My favorite deployment target is Vercel. Just remember this.', user_id: userId }),
    });
    const recall = await fetch(`${WORKER}/agent/Architect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is my favorite deployment target?', user_id: userId }),
    });
    const rd = await recall.json();
    const text = (rd.content?.[0]?.text || '').toLowerCase();
    t('agent-memory', text.includes('vercel'), text.slice(0, 100));
  } catch (e) { t('agent-memory', false, e.message); }

  // 5. CORS preflight on /agent
  try {
    const r = await fetch(`${WORKER}/agent/Architect`, {
      method: 'OPTIONS',
      headers: { Origin: FRONTEND || 'https://example.com', 'Access-Control-Request-Method': 'POST' },
    });
    t('cors-preflight', r.status === 204 && r.headers.get('access-control-allow-origin'), `status=${r.status}`);
  } catch (e) { t('cors-preflight', false, e.message); }

  // 6. Frontend reachable (if provided)
  if (FRONTEND) {
    try {
      const r = await fetch(FRONTEND);
      const html = await r.text();
      t('frontend', r.ok && html.includes('<div id="root"'), `status=${r.status} size=${html.length}`);
    } catch (e) { t('frontend', false, e.message); }
  }

  // ── Report ──
  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  console.log('\n═══ SMOKE TEST ═══');
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'}  ${r.name.padEnd(22)}  ${r.detail}`);
  }
  console.log(`\n  ${pass}/${results.length} passing${fail ? ` · ${fail} FAILED` : ''}`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
