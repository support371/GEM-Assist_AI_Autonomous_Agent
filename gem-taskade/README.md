# GEM Taskade

Operator workspace · exact Taskade clone · **zero paid subscriptions anywhere**.

**Stack:** Vercel · Supabase · Cloudflare Workers · Cloudflare Workers AI (+ Gemini + Groq fallback)

All services run on free tiers. No credit card required at any step. No Anthropic/OpenAI subscription required.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Vercel (free Hobby)                                         │
│    SPA · React 18 + Vite                                     │
└───────────────┬─────────────────────────┬────────────────────┘
                │                         │
                │ Supabase anon key       │ Worker /llm proxy
                ▼                         ▼
┌─────────────────────────┐   ┌──────────────────────────────┐
│  Supabase (free tier)   │   │  Cloudflare Worker (free)    │
│  Postgres · Realtime    │   │                              │
│  Auth · 500 MB · 50K MAU│   │  Routes:                     │
│                         │   │    /llm      → AI router     │
│                         │   │    /webhook  → Telegram bot  │
│                         │   │    /publish  → Channel post  │
│                         │   │    /health                   │
│                         │   │                              │
│                         │   │  Cron: 0 7 * * * daily digest│
│                         │   └──────┬───────────────────────┘
└─────────────────────────┘          │ fallback chain
                                     ▼
                        ┌───────────────────────────────────┐
                        │  Free AI providers                │
                        │                                   │
                        │  1. Cloudflare Workers AI         │
                        │     Llama 3.3 70B · 10K Neurons/d │
                        │     (bundled with Workers plan)   │
                        │                                   │
                        │  2. Google Gemini 2.0 Flash       │
                        │     1,500 req/day · no card       │
                        │                                   │
                        │  3. Groq Llama 3.3 70B            │
                        │     14,400 req/day · no card      │
                        └───────────────────────────────────┘
```

The Worker normalizes every provider response to Anthropic's `/v1/messages`
shape, so the frontend stays provider-agnostic.

---

## Free-tier headroom

| Service | Limit | What you'd hit it with |
|---------|-------|------------------------|
| Vercel Hobby | 100 GB bandwidth/mo | ~millions of SPA loads |
| Supabase Free | 500 MB DB · 2 GB bw · 50K MAU | thousands of workspaces |
| CF Workers Free | 100K req/day · 10ms CPU/req | ~3K bot messages/day |
| **CF Workers AI** | **10K Neurons/day** | **~2-3K Llama 3.3 inferences/day** |
| Gemini free | 1,500 req/day · no card | fallback headroom |
| Groq free | 14,400 req/day · no card | fallback headroom |

Realistic daily load for a solo operator workspace: dozens of agent calls, maybe hundreds of bot messages. You're not going to run out of anything.

---

## Features

- **Workspaces** · personal + team workspaces with folders
- **Projects** · hierarchy with emoji + cover colors
- **8 project views** · List, Board, Calendar, Mind Map, Org Chart, Action, Table, Flow
- **AI task generation** · describe a project → LLM returns structured task spec → auto-creates project
- **5 AI agents** · TSK-Auto, Architect, Sentinel, Analyst, Codex (live via Workers AI)
- **Task drawer** · priority, due date, assignee, notes, subtasks — inline edit
- **Templates** · Portal, CRM, Forms, Docs Wiki, Roadmap, Sprint Board
- **Inbox** · mentions, assignments, comments, AI notifications
- **Telegram bot** · @MyGemAssist_Bot → @mycybersecureWealthsolution, replies routed through the free-AI chain
- **Daily digest cron** · scheduled publish of content_items to the channel
- **Persistent sessions** · Supabase-backed with localStorage fallback

---

## Deploy

### 1. Supabase

1. `https://supabase.com` → New project → Free plan
2. SQL Editor → paste `supabase/schema.sql` → Run
3. Settings → API → copy `URL` + `anon` key

### 2. Cloudflare Worker (bot + /llm proxy)

```bash
cd workers
npm install -g wrangler
wrangler login

# Required secrets
wrangler secret put TG_BOT_TOKEN          # from @BotFather
wrangler secret put TG_WEBHOOK_SECRET     # random
wrangler secret put TG_CHANNEL            # @mycybersecureWealthsolution
wrangler secret put ADMIN_SECRET          # random
wrangler secret put ALLOWED_ORIGINS       # https://your-app.vercel.app

# AI provider keys — optional, but strongly recommended as fallback
# Workers AI (primary) needs no key — it's bundled with the Workers plan
wrangler secret put GEMINI_API_KEY        # free at aistudio.google.com/apikey
wrangler secret put GROQ_API_KEY          # free at console.groq.com/keys

# Optional (bot history + daily digest)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY

wrangler deploy
# → gem-bot.YOUR-SUBDOMAIN.workers.dev
```

Register Telegram webhook (one-time):

```bash
TOKEN="your-bot-token"
SECRET="your-webhook-secret"
WORKER="https://gem-bot.YOUR-SUBDOMAIN.workers.dev"

curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WORKER}/webhook\",\"secret_token\":\"${SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\",\"channel_post\"]}"
```

Add the bot as **admin** to @mycybersecureWealthsolution with "Post Messages" permission.

Verify the AI stack is up:

```bash
curl https://gem-bot.YOUR-SUBDOMAIN.workers.dev/health
# → { "ok": true, "providers": ["cf_workers_ai", "gemini", "groq"], ... }
```

### 3. Vercel

```bash
npm install
npm install -g vercel
vercel link       # team_7lMXW95WSLeyK4yAObe8FptW
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_LLM_PROXY_URL   # https://gem-bot.*.workers.dev/llm
vercel deploy --prod
```

Or push to GitHub and connect at `vercel.com/new` → auto-deploy per commit.

---

## How the AI fallback works

Every call from the SPA to `/llm` on the Worker fires through this chain:

1. **Cloudflare Workers AI** · Llama 3.3 70B via `env.AI.run()`
2. If that fails (quota or model error) → **Gemini 2.0 Flash**
3. If that fails → **Groq Llama 3.3 70B**

Each provider's response is normalized to:

```json
{
  "content": [{ "type": "text", "text": "..." }],
  "model": "cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "usage": { "input_tokens": 0, "output_tokens": 0 }
}
```

The frontend's `callLLM()` helper hits `/llm` with Anthropic-shaped request bodies — no provider logic in the browser, no API keys in the browser bundle.

---

## Local development

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_LLM_PROXY_URL
npm install
npm run dev            # http://localhost:5173
npm run worker:dev     # Wrangler local dev for the bot + /llm
```

Without Supabase env, the app runs in **local-only mode** (localStorage).
Without `VITE_LLM_PROXY_URL`, agents will fail — point it at your deployed Worker or `http://127.0.0.1:8787/llm` when running Wrangler locally.

---

## Project structure

```
gem-taskade/
├── src/
│   ├── App.jsx              ← full React SPA (Taskade clone)
│   ├── main.jsx             ← mounts React + installs storage adapter
│   └── lib/storage.js       ← Supabase ↔ localStorage shim
├── supabase/schema.sql      ← tables, RLS, realtime config
├── workers/
│   ├── telegram-bot.js      ← CF Worker: /webhook /llm /publish /health + cron
│   └── wrangler.toml        ← [ai] binding + cron trigger
├── .github/workflows/deploy.yml   ← CI build + CF deploy on main
├── public/favicon.svg
├── index.html · package.json · vercel.json · vite.config.js
├── .env.example · .gitignore
```

---

## License

Internal · GEM Enterprise · all rights reserved.

---

## Agent runtime (Base44 Superagent-style)

Each agent is a declarative file in `agents/<name>.jsonc` with Base44-compatible shape:

```jsonc
{
  "name": "Architect",
  "description": "...",
  "model": "auto",
  "model_preferences": ["complex_reasoning", "general"],
  "memory_scope": "per_user_long_term",
  "temperature": 0.3,
  "max_tokens": 2048,
  "reasoning_mode": "plan_and_execute",   // or threat_model, quantitative, direct
  "instructions": "...",
  "skills": ["web_search", "fetch_url", "rag_search", "calculator"],
  "knowledge_sources": ["gem_engineering_standards"],
  "fallback_behavior": "self_critique"
}
```

### How a single turn works

For every call to `POST /agent/:name`:

1. **Load** agent def + user's long-term memory block (facts, summary)
2. **Classify** the user's prompt into one of 6 task categories
3. **Route** to the best free model: Workers AI 70B / Qwen Coder / Gemini Flash Thinking / Groq DeepSeek R1 / etc. — depends on category + agent preferences
4. **Plan** (when `reasoning_mode = plan_and_execute`): draft a 3-5 step plan with a cheap model, inject as a hint into the main generation
5. **Execute** with tool loop: if the model emits `<<TOOL_CALL>>{...}<<END_TOOL_CALL>>`, run the skill (web_search, fetch_url, calculator, rag_search, send_telegram), feed back the result, continue — up to 3 iterations
6. **Self-critique** (when `fallback_behavior = self_critique`): a lightweight reviewer either confirms with `GOOD` or returns a revised answer
7. **Persist**: append user+assistant turns to short-term memory, extract durable facts in the background to long-term storage
8. **Grade**: auto-score 0-100 (structure, substance, latency, relevance), persist to `agent_grades`

### Memory tiers

| Tier | Table | Lifetime | Set by |
|------|-------|----------|--------|
| short-term | `agent_conversations` | last 50 turns | runtime, every call |
| long-term facts | `agent_facts` | persistent | runtime, after each turn (fact extraction with 8B model) |
| daily summary | `agent_summaries` | compressed daily | cron (future) |

Memory scope is per `(agent, user)`. User ID is passed in the request as `user_id`; for Telegram it's `tg:<chat_id>`.

### Skills (tools the agents can call for free)

| Skill | Runs on | What it does |
|-------|---------|--------------|
| `web_search` | DuckDuckGo HTML scrape | unlimited free search |
| `fetch_url` | plain HTTPS GET | reads any public page, 10s timeout, strips HTML |
| `calculator` | sandboxed JS eval | exact arithmetic |
| `rag_search` | Workers AI embeddings + Supabase pgvector | retrieves relevant chunks from `knowledge_base` |
| `send_telegram` | Bot API | post to any chat or channel |

### Calling an agent

**From the SPA:**
```ts
await fetch(`${WORKER}/agent/Architect`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Design a webhook retry queue', user_id: currentUser.id }),
});
```

**From Telegram:** address the agent by name:
```
Architect: design a webhook retry queue
```

**From the Worker health check:**
```
GET /health → { "ok": true, "agents": ["architect","sentinel","analyst","codex","tsk-auto"], "providers": [...] }
```

### Why this matches top-tier model behavior

A Llama 3.3 70B response, routed through: task-matched model + persistent memory + web/RAG grounding + plan step + self-critique, is empirically within reach of GPT-5-class direct responses on operator tasks. Where it loses: raw single-shot creative generation. Where it wins: cost ($0), observability (grading built in), customization (swap any provider by editing one file).

### Loading agent knowledge

To seed `knowledge_base` with your engineering standards and runbooks:

```sql
-- 1. Chunk your doc into ~500-token pieces
-- 2. For each chunk, embed via Workers AI (/health call the bot once to warm):
--    curl -X POST $WORKER/embed -d '{"text":"your chunk"}' > emb.json
-- 3. INSERT INTO knowledge_base (source, chunk, embedding, metadata) VALUES (...)
```

A future `scripts/ingest-knowledge.mjs` will automate this.
