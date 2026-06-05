-- Backfill task_semantic_packets.source_ref + workspace_id for rows with empty values
-- Root cause: create-agent-pickup-packets.mjs did not include these columns in INSERT
-- Fix: derive source_ref from workspace_tasks.workspace_id + task id

UPDATE task_semantic_packets tsp
SET
  workspace_id = COALESCE(NULLIF(tsp.workspace_id, ''), wt.workspace_id, 'global'),
  source_ref   = CASE
    WHEN tsp.source_ref IS NULL OR tsp.source_ref = '' THEN
      COALESCE(wt.workspace_id, 'global') || ':task:' || tsp.workspace_task_id
    ELSE tsp.source_ref
  END,
  updated_at = now()
FROM workspace_tasks wt
WHERE tsp.workspace_task_id = wt.id
  AND (tsp.source_ref IS NULL OR tsp.source_ref = '');

-- Also patch any packets that have workspace_id NULL/empty but source_ref already set
UPDATE task_semantic_packets
SET
  workspace_id = split_part(source_ref, ':', 1),
  updated_at = now()
WHERE (workspace_id IS NULL OR workspace_id = '')
  AND source_ref IS NOT NULL
  AND source_ref != '';

-- Verify
SELECT
  COUNT(*) FILTER (WHERE source_ref IS NULL OR source_ref = '')  AS empty_source_ref,
  COUNT(*) FILTER (WHERE file_path IS NOT NULL AND file_path != '') AS with_file_path,
  COUNT(*) FILTER (WHERE cluster_id IS NOT NULL) AS with_cluster_id,
  COUNT(*)                                        AS total
FROM task_semantic_packets;
