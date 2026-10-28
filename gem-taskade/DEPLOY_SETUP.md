# Deploy setup · one-page runbook

Three deploy targets. All on free tiers. Set once, auto-deploys on every push to `main`.

## 1. Supabase (database)

1. Sign in at https://supabase.com → **New project** → free plan → choose region close to you
2. SQL Editor → paste contents of `supabase/schema.sql` → Run
3. Settings → API → copy these two values:
   - **URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_KEY` (keep secret, server-side only)

## 2. Cloudflare Worker (bot + /llm + /agent runtime)

```bash
cd workers
npm install -g wrangler
wrangler login                        # opens browser once

# Required secrets (set each via `wrangler secret put NAME`)
wrangler secret put TG_BOT_TOKEN          # from @BotFather
wrangler secret put TG_WEBHOOK_SECRET     # any random string
wrangler secret put TG_CHANNEL            # @mycybersecureWealthsolution
wrangler secret put ADMIN_SECRET          # any random string
wrangler secret put ALLOWED_ORIGINS       # https://your-app.vercel.app

# Free AI providers (all optional — Workers AI works with no key)
wrangler secret put GEMINI_API_KEY        # aistudio.google.com/apikey
wrangler secret put GROQ_API_KEY          # console.groq.com/keys

# Supabase (for bot history + agent memory + /agent/* JWT verification)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY       # Phase 3: /agent/* JWT verification
wrangler secret put SUPABASE_SERVICE_KEY

node prebuild.mjs                      # JSONC → JSON for bundler
wrangler deploy                        # → gem-bot.YOUR-SUBDOMAIN.workers.dev
```

Register Telegram webhook (one-time):
```bash
TOKEN="$TG_BOT_TOKEN"
SECRET="$TG_WEBHOOK_SECRET"
WORKER="https://gem-bot.YOUR-SUBDOMAIN.workers.dev"
curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${WORKER}/webhook\",\"secret_token\":\"${SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\",\"channel_post\"]}"
```

Add the bot as **admin** to `@mycybersecureWealthsolution` with "Post Messages" permission.

Verify:
```bash
curl $WORKER/health
# → { "ok": true, "agents": ["architect","sentinel","analyst","codex","tsk-auto"], "providers": [...] }
```

## 3. Vercel (frontend)

```bash
npm install -g vercel
vercel link                            # team_7lMXW95WSLeyK4yAObe8FptW
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_LLM_PROXY_URL      # https://gem-bot.*.workers.dev/llm
vercel deploy --prod
```

Or connect the repo at https://vercel.com/new → auto-deploy on every commit.

## 4. GitHub Actions · auto-deploy on main

Settings → Secrets and variables → Actions → New repository secret. Add each:

| Name | Value | For |
|------|-------|-----|
| `VITE_SUPABASE_URL` | from Supabase | build |
| `VITE_SUPABASE_ANON_KEY` | from Supabase | build |
| `VITE_LLM_PROXY_URL` | your Worker's `/llm` | build |
| `CLOUDFLARE_API_TOKEN` | from Cloudflare → My Profile → API Tokens → Create → Edit Workers | worker deploy |
| `CLOUDFLARE_ACCOUNT_ID` | from Cloudflare dashboard sidebar | worker deploy |
| `VERCEL_TOKEN` | from Vercel → Account Settings → Tokens | frontend deploy |
| `WORKER_URL` | https://gem-bot.*.workers.dev | smoke test |
| `TG_BOT_TOKEN`, `TG_WEBHOOK_SECRET`, `TG_CHANNEL`, `ADMIN_SECRET`, `ALLOWED_ORIGINS` | same values set via wrangler | worker secrets refresh |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | same as wrangler | worker secrets refresh |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | same as wrangler | worker secrets refresh |

Push to `main` → the workflow runs validate → build → deploy-worker → deploy-vercel → smoke-test.

## Smoke test (manual)

```bash
WORKER_URL=https://gem-bot.YOUR-SUBDOMAIN.workers.dev \
FRONTEND_URL=https://your-app.vercel.app \
npm run smoke
```

Exercises: `/health`, `/llm`, every `/agent/:name`, memory persistence, CORS, frontend reachability.

## Troubleshooting

- **Worker 429 on `/llm`** → you hit the 10K Neurons/day free limit. Add `GEMINI_API_KEY` or `GROQ_API_KEY` as fallback (automatic).
- **Agent response empty** → check `curl $WORKER/health` → `providers` array. If empty, no AI provider is configured.
- **Supabase RLS blocks writes** → make sure the client is authenticated. For local dev without auth, temporarily `ALTER TABLE kv DISABLE ROW LEVEL SECURITY;`
- **Telegram webhook not firing** → `curl https://api.telegram.org/bot$TG_BOT_TOKEN/getWebhookInfo` to see delivery errors.
