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

-- Drop the Phase-2 (source, chunk_index) unique index — it would let a
-- workspace re-ingest clobber the global copy of the same document
-- because it ignores workspace_id in the conflict key.
DROP INDEX IF EXISTS idx_kb_source_chunk;
-- Replacement: scope-aware uniqueness. COALESCE lets NULL (global) and
-- distinct workspaces coexist for the same (source, chunk_index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_scope_source_chunk
  ON knowledge_base(COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), source, chunk_index)
  WHERE chunk_index IS NOT NULL;

-- Remove legacy rows that pre-date chunk_index — they'd otherwise stay
-- globally visible as unscoped globals and poison RAG results. Safe to
-- delete because the ingest script re-creates them with upsert.
DELETE FROM knowledge_base WHERE chunk_index IS NULL;

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
-- Reads: globals + the caller's own workspaces.
-- Writes: ONLY to a workspace the caller owns. Global rows are
--   write-locked for regular users — only the service role (ingest script)
--   may insert / update / delete them. This closes the "poison globals"
--   path where any authenticated user with the client lib could rewrite
--   shared knowledge.
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kb_read_global_or_member    ON knowledge_base;
DROP POLICY IF EXISTS kb_write_owner_or_member    ON knowledge_base;
DROP POLICY IF EXISTS kb_insert_owned_workspace   ON knowledge_base;
DROP POLICY IF EXISTS kb_update_owned_workspace   ON knowledge_base;
DROP POLICY IF EXISTS kb_delete_owned_workspace   ON knowledge_base;

CREATE POLICY kb_read_global_or_member ON knowledge_base FOR SELECT
  USING (
    workspace_id IS NULL
    OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

-- INSERT / UPDATE / DELETE all require a non-null workspace the caller owns.
-- Globals are managed only by the service role (which bypasses RLS).
CREATE POLICY kb_insert_owned_workspace ON knowledge_base FOR INSERT
  WITH CHECK (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
CREATE POLICY kb_update_owned_workspace ON knowledge_base FOR UPDATE
  USING (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
CREATE POLICY kb_delete_owned_workspace ON knowledge_base FOR DELETE
  USING (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

GRANT EXECUTE ON FUNCTION match_knowledge(VECTOR, INT, UUID) TO authenticated, anon, service_role;

-- ───────── RLS on observability tables ─────────
-- Agent grades, facts, summaries, and conversation turns are per-user. The
-- Worker writes with service_role (bypasses RLS); clients reading directly
-- see only their own rows.
--
-- IMPORTANT: owner_id is stored as TEXT (so Telegram chat ids and anon-xxx
-- fallbacks fit). Compare as text — casting stored values to uuid raises
-- an error on non-UUID rows and breaks the whole read.
-- Anonymous rows (owner_id IS NULL) are NOT visible to arbitrary callers,
-- otherwise one user could read another's anonymous session summary.
ALTER TABLE agent_grades    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_facts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grades_own  ON agent_grades;
DROP POLICY IF EXISTS facts_own   ON agent_facts;
DROP POLICY IF EXISTS summ_own    ON agent_summaries;

CREATE POLICY grades_own  ON agent_grades    FOR SELECT USING (owner_id = auth.uid()::text);
CREATE POLICY facts_own   ON agent_facts     FOR SELECT USING (owner_id = auth.uid()::text);
CREATE POLICY summ_own    ON agent_summaries FOR SELECT USING (owner_id = auth.uid()::text);
