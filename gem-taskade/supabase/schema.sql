-- GEM Taskade · Supabase schema (free tier compatible)
-- Deploy: psql $DATABASE_URL -f supabase/schema.sql
--     or paste into Supabase SQL Editor

-- ───────── Key-Value store (powers window.storage) ─────────
CREATE TABLE IF NOT EXISTS kv (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_kv_owner ON kv(owner_id);
CREATE INDEX IF NOT EXISTS idx_kv_updated ON kv(updated_at DESC);

-- ───────── Workspaces · Projects · Tasks (relational mirror) ─────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  emoji       TEXT,
  color       TEXT,
  is_personal BOOLEAN DEFAULT TRUE,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id     UUID,
  name          TEXT NOT NULL,
  emoji         TEXT,
  color         TEXT,
  cover         TEXT DEFAULT 'coral',
  favorite      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  completed   BOOLEAN DEFAULT FALSE,
  priority    TEXT DEFAULT 'medium',          -- high | medium | low
  assignee    TEXT,
  due_date    DATE,
  tags        TEXT[] DEFAULT '{}',
  notes       TEXT,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- ───────── AI agent conversations ─────────
CREATE TABLE IF NOT EXISTS agent_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────── Telegram bot: subscribers + routing ─────────
CREATE TABLE IF NOT EXISTS tg_subscribers (
  chat_id       BIGINT PRIMARY KEY,
  username      TEXT,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  linked_user   UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS tg_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id      BIGINT REFERENCES tg_subscribers(chat_id) ON DELETE CASCADE,
  direction    TEXT NOT NULL,                 -- in | out
  content      TEXT,
  model_used   TEXT,
  tokens_used  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tg_msg_chat ON tg_messages(chat_id, created_at DESC);

-- ───────── Content pipeline (daily digest publisher) ─────────
CREATE TABLE IF NOT EXISTS content_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  summary     TEXT,
  source_url  TEXT,
  source_name TEXT,
  category    TEXT,                           -- cybersecurity | real_estate | market_intelligence
  ai_summary  TEXT,
  image_url   TEXT,
  status      TEXT DEFAULT 'draft',           -- draft | ready | published | failed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS publish_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id  UUID REFERENCES content_items(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,                  -- telegram | whatsapp | discord | x | facebook
  status      TEXT DEFAULT 'pending',
  posted_url  TEXT,
  error       TEXT,
  published_at TIMESTAMPTZ,
  UNIQUE(content_id, platform)
);

-- ───────── Row Level Security ─────────
ALTER TABLE kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;

-- Public read for kv when owner_id IS NULL (shared seed data)
-- Owner-only read/write otherwise
DROP POLICY IF EXISTS kv_select ON kv;
DROP POLICY IF EXISTS kv_insert ON kv;
DROP POLICY IF EXISTS kv_update ON kv;
DROP POLICY IF EXISTS kv_delete ON kv;

CREATE POLICY kv_select ON kv FOR SELECT
  USING (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY kv_insert ON kv FOR INSERT
  WITH CHECK (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY kv_update ON kv FOR UPDATE
  USING (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY kv_delete ON kv FOR DELETE
  USING (owner_id IS NULL OR owner_id = auth.uid());

-- Workspaces/projects/tasks — owner scoped
DROP POLICY IF EXISTS ws_owner ON workspaces;
CREATE POLICY ws_owner ON workspaces USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS proj_owner ON projects;
CREATE POLICY proj_owner ON projects USING (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
) WITH CHECK (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

DROP POLICY IF EXISTS task_owner ON tasks;
CREATE POLICY task_owner ON tasks USING (
  project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
) WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
);

DROP POLICY IF EXISTS agent_owner ON agent_conversations;
CREATE POLICY agent_owner ON agent_conversations USING (owner_id = auth.uid() OR owner_id IS NULL)
  WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

-- ───────── Realtime (free tier) ─────────
-- Enable Realtime for the collaboration tables in Supabase dashboard,
-- or via SQL (requires superuser):
-- ALTER PUBLICATION supabase_realtime ADD TABLE projects, tasks, kv;

-- ═══════════════════════════════════════════════════════════════════
-- Agent runtime (Base44 Superagent-style memory + knowledge RAG)
-- ═══════════════════════════════════════════════════════════════════

-- Facts: durable truths the agent learned about the user
CREATE TABLE IF NOT EXISTS agent_facts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL,
  owner_id    TEXT NOT NULL,                   -- 'anonymous' or user id or 'tg:<chat_id>'
  fact        TEXT NOT NULL,
  category    TEXT DEFAULT 'general',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_facts_lookup ON agent_facts(agent_id, owner_id, created_at DESC);

-- Daily session summaries (rolled up by cron)
CREATE TABLE IF NOT EXISTS agent_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  summary     TEXT NOT NULL,
  date_range  DATERANGE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_summaries ON agent_summaries(agent_id, owner_id, created_at DESC);

-- Knowledge base (RAG) · requires pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,                   -- 'gem_engineering_standards' etc.
  chunk       TEXT NOT NULL,
  embedding   VECTOR(768),                     -- bge-base-en-v1.5 dimension
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_base(source);
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Match function used by the Worker's rag_search skill
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5
)
RETURNS TABLE (id UUID, source TEXT, chunk TEXT, similarity FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT kb.id, kb.source, kb.chunk,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.embedding IS NOT NULL
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Response grades (fills Base44's observability gap)
CREATE TABLE IF NOT EXISTS agent_grades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  owner_id      TEXT,
  score         INT NOT NULL,                  -- 0-100 auto-grade
  user_rating   TEXT,                          -- 'up' | 'down' | null
  model_used    TEXT,
  latency_ms    INT,
  input_tokens  INT,
  output_tokens INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_grades ON agent_grades(agent_id, created_at DESC);
