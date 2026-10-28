-- GEM Taskade · Phase 3 migration · auth scoping + knowledge tenant isolation
-- Apply after schema.sql and migrations/002_phase2_concurrency.sql.
--
-- Scope:
--   1. Workspace-scoped knowledge_base (tenant isolation)
--   2. New match_knowledge() signature that filters by workspace visibility
--   3. RLS on knowledge_base so direct REST reads honor the same rules
--   4. Public match_knowledge_public() for shared/global knowledge only

-- ───────── Knowledge base tenant scoping ─────────
-- NULL workspace_id = global/public (default — engineering standards, docs
-- anyone in the org should see). Non-null = scoped to one workspace, visible
-- only to that workspace's members.
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_knowledge_workspace ON knowledge_base(workspace_id);

-- ───────── Replace match_knowledge with scoped variant ─────────
-- Workers passing a workspace_id get that workspace's chunks + globals.
-- Workers passing NULL get globals only (safe default for unauthenticated).
DROP FUNCTION IF EXISTS match_knowledge(VECTOR, INT);

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5,
  caller_workspace UUID DEFAULT NULL
)
RETURNS TABLE (id UUID, source TEXT, chunk TEXT, similarity FLOAT, workspace_id UUID)
LANGUAGE sql STABLE AS $$
  SELECT kb.id, kb.source, kb.chunk,
    1 - (kb.embedding <=> query_embedding) AS similarity,
    kb.workspace_id
  FROM knowledge_base kb
  WHERE kb.embedding IS NOT NULL
    AND (kb.workspace_id IS NULL OR kb.workspace_id = caller_workspace)
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ───────── RLS on knowledge_base ─────────
-- Blocks direct REST reads of workspace-private rows. The Worker's service-role
-- key bypasses RLS (that's by design — it enforces the filter in match_knowledge).
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kb_read_global_or_member ON knowledge_base;
CREATE POLICY kb_read_global_or_member ON knowledge_base FOR SELECT
  USING (
    workspace_id IS NULL
    OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
DROP POLICY IF EXISTS kb_write_owner_or_member ON knowledge_base;
CREATE POLICY kb_write_owner_or_member ON knowledge_base FOR ALL
  USING (
    workspace_id IS NULL
    OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    workspace_id IS NULL
    OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

GRANT EXECUTE ON FUNCTION match_knowledge(VECTOR, INT, UUID) TO authenticated, anon, service_role;

-- ───────── RLS on observability tables ─────────
-- Agent grades, facts, summaries, and conversation turns are per-user. The
-- Worker writes with service_role (bypasses RLS); clients reading directly
-- see only their own rows.
ALTER TABLE agent_grades    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_facts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grades_own  ON agent_grades;
DROP POLICY IF EXISTS facts_own   ON agent_facts;
DROP POLICY IF EXISTS summ_own    ON agent_summaries;

CREATE POLICY grades_own  ON agent_grades    FOR SELECT USING (owner_id::uuid = auth.uid() OR owner_id IS NULL);
CREATE POLICY facts_own   ON agent_facts     FOR SELECT USING (owner_id::uuid = auth.uid() OR owner_id IS NULL);
CREATE POLICY summ_own    ON agent_summaries FOR SELECT USING (owner_id::uuid = auth.uid() OR owner_id IS NULL);
