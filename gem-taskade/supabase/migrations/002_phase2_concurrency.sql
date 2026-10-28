-- GEM Taskade · Phase 2 migration · concurrency + atomic writes
-- Apply with: supabase db execute --file supabase/migrations/002_phase2_concurrency.sql
-- or paste into the SQL editor.

-- ───────── Append-only agent turn log ─────────
-- Replaces read-modify-write on agent_conversations.messages with a
-- single INSERT per turn. agent_conversations.messages stays as a cache
-- for the SPA; the authoritative log is this table.
CREATE TABLE IF NOT EXISTS agent_conversation_turns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  owner_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content       TEXT NOT NULL,
  tool_name     TEXT,
  model_used    TEXT,
  latency_ms    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_turns_agent_owner_time
  ON agent_conversation_turns(agent_id, owner_id, created_at DESC);

ALTER TABLE agent_conversation_turns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS turns_own_read  ON agent_conversation_turns;
DROP POLICY IF EXISTS turns_own_write ON agent_conversation_turns;
CREATE POLICY turns_own_read  ON agent_conversation_turns FOR SELECT USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY turns_own_write ON agent_conversation_turns FOR INSERT WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

-- ───────── Atomic project + tasks RPC ─────────
-- Called by the SPA when a project is created from an AI plan: one
-- transaction, no half-landed state possible.
CREATE OR REPLACE FUNCTION create_project_with_tasks(
  p_workspace UUID,
  p_project   JSONB,
  p_tasks     JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  new_project_id UUID;
BEGIN
  INSERT INTO projects (workspace_id, name, icon, color)
  VALUES (
    p_workspace,
    COALESCE(p_project->>'name', 'Untitled'),
    p_project->>'icon',
    p_project->>'color'
  )
  RETURNING id INTO new_project_id;

  IF jsonb_typeof(p_tasks) = 'array' THEN
    INSERT INTO tasks (id, project_id, title, completed, priority, due_date, assignee, notes)
    SELECT
      COALESCE((t->>'id')::uuid, gen_random_uuid()),
      new_project_id,
      t->>'title',
      COALESCE((t->>'completed')::boolean, false),
      NULLIF(t->>'priority',''),
      NULLIF(t->>'due_date','')::timestamptz,
      NULLIF(t->>'assignee',''),
      NULLIF(t->>'notes','')
    FROM jsonb_array_elements(p_tasks) AS t
    WHERE t ? 'title';
  END IF;

  RETURN new_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_project_with_tasks(UUID, JSONB, JSONB) TO authenticated, anon, service_role;
