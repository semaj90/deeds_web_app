-- OpenSpec evidence retrieval v1.
-- Design-only companion to the EVF ledger. Do not apply until the ledger schema,
-- embedding artifact, and independent PostgreSQL readback are proven.
-- No rows are seeded and no projection is written.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS openspec_evidence_chunks_metadata_idx
  ON public.openspec_evidence_chunks (change_id, task_id, workspace_revision, representation_revision);

CREATE INDEX IF NOT EXISTS evidence_receipts_state_revision_idx
  ON public.evidence_receipts (verdict, workspace_revision, change_id, task_id);

CREATE INDEX IF NOT EXISTS openspec_tasks_task_text_trgm_idx
  ON public.openspec_tasks USING gin (task_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS openspec_evidence_chunks_content_fts_idx
  ON public.openspec_evidence_chunks USING gin (to_tsvector('simple', content));
