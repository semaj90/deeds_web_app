-- Prepared rollback; not applied. Run the preflight first and stop if it returns rows.
-- The old key cannot be restored while multiple pending content revisions exist.
-- Deployment gate: pause/drain all promotion enqueuers and workers, deploy or
-- retain the old application version, then run this rollback and resume jobs.
-- Do not run with revised application instances targeting the v2 index.
SELECT packet_key, source_ref, operation, count(*) AS pending_revisions
FROM public.promotion_outbox
WHERE status = 'pending'
GROUP BY packet_key, source_ref, operation
HAVING count(*) > 1;

-- Only after the preflight returns zero rows, run each statement separately.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_promotion_outbox_unique_pending
  ON public.promotion_outbox (packet_key, source_ref, operation)
  WHERE status = 'pending';

DROP INDEX CONCURRENTLY IF EXISTS public.idx_promotion_outbox_unique_pending_v2;

-- Keep source_revision until a separately reviewed migration removes the column.
