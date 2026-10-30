-- Prepared PostgreSQL 18 sidecar migration; not applied.
-- Run each statement as a standalone command (not inside a transaction).
-- This allows a pending job for a changed content revision while keeping retries
-- idempotent for the same packet/source/operation/content revision.
-- Deployment gate: pause/drain every promotion enqueue path and outbox worker
-- before applying this migration. Old application code targets the old index;
-- revised application code requires this column and the v2 index. Apply the
-- migration, deploy the matching application, then resume enqueue/workers.
-- Do not run with mixed old/new application instances.

ALTER TABLE public.promotion_outbox
  ADD COLUMN IF NOT EXISTS source_revision text;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_promotion_outbox_unique_pending_v2
  ON public.promotion_outbox (packet_key, source_ref, operation, content_hash, source_revision)
  WHERE status = 'pending' AND content_hash IS NOT NULL AND source_revision IS NOT NULL;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_promotion_outbox_unique_pending;
