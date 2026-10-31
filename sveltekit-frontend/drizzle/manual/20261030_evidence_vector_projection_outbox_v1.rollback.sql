BEGIN;

DO $$
DECLARE
  queued_rows bigint;
BEGIN
  IF to_regclass('public.evidence_vector_projection_outbox') IS NULL THEN
    RAISE EXCEPTION 'evidence_vector_projection_outbox is missing';
  END IF;

  SELECT count(*) INTO queued_rows FROM public.evidence_vector_projection_outbox;
  IF queued_rows <> 0 THEN
    RAISE EXCEPTION 'Refusing to drop evidence projection outbox containing % rows', queued_rows;
  END IF;
END;
$$;

DROP TABLE public.evidence_vector_projection_outbox;

COMMIT;
