-- KERNEL-REVISION-LINEAGE-01: additive, idempotent indexes for the read-time lineage join
--   codebase_chunk_index.id -> atlas_packet_chunk_lineage.chunk_row_id (PROVEN) -> atlas_workspace_source_bindings (exact source_ref + whole-file digest at the admitted workspace)
-- No tables, no column changes, no data writes. Not in the Drizzle journal (manual sidecar, per the Drizzle Safety Rule).
-- Apply (outside a transaction, one statement at a time): each CREATE INDEX CONCURRENTLY must run in autocommit.
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_pcl_chunk_row_id_proven; DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_wsb_workspace_ref_digest;
-- Evidence for need: the executor's LEFT JOIN on chunk_row_id seq-scanned all 127,927 bridge rows (44 ms for 8 candidates); chunk_row_id had no index.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_pcl_chunk_row_id_proven
  ON public.atlas_packet_chunk_lineage (chunk_row_id) WHERE revision_status = 'PROVEN';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_wsb_workspace_ref_digest
  ON public.atlas_workspace_source_bindings (workspace_revision, canonical_source_ref, content_digest);
