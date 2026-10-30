-- NOT EXECUTED. Rollback for 20261029_atlas_todo_inverse_dag_v1.sql.
-- Refuses to drop a table that holds rows: archive them first (archive, do not delete), then rerun.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.atlas_todo_inverse_dag_v1') IS NOT NULL
     AND EXISTS (SELECT 1 FROM atlas_todo_inverse_dag_v1) THEN
    RAISE EXCEPTION 'ROLLBACK_BLOCKED: atlas_todo_inverse_dag_v1 holds rows; archive them first';
  END IF;
END $$;

DROP TABLE IF EXISTS atlas_todo_inverse_dag_v1;

COMMIT;
