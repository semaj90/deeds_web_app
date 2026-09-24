 WITH latest_completed_execution AS (
         SELECT DISTINCT ON (graphify_executions.workspace_id) graphify_executions.execution_id,
            graphify_executions.workspace_id,
            graphify_executions.workspace_revision,
            graphify_executions.completed_at
           FROM graphify_executions
          WHERE graphify_executions.status = 'COMPLETED'::text
          ORDER BY graphify_executions.workspace_id, graphify_executions.completed_at DESC
        ), last_seen_per_source AS (
         SELECT gef.source_ref,
            ge.workspace_id,
            gef.workspace_revision,
            gef.execution_id AS last_seen_execution_id,
            gef.code_source_revision AS last_seen_code_source_revision,
            ge.completed_at AS last_seen_completed_at,
            row_number() OVER (PARTITION BY gef.source_ref, ge.workspace_id ORDER BY ge.completed_at DESC) AS rn
           FROM graphify_execution_files gef
             JOIN graphify_executions ge ON ge.execution_id = gef.execution_id
          WHERE ge.status = 'COMPLETED'::text
        )
 SELECT lsp.source_ref,
    lsp.workspace_id,
    lsp.workspace_revision,
    lsp.last_seen_execution_id,
    lsp.last_seen_code_source_revision,
    lsp.last_seen_completed_at,
    lce.execution_id AS latest_workspace_execution_id,
    lce.workspace_revision AS latest_workspace_revision,
    lsp.last_seen_execution_id = lce.execution_id AS active
   FROM last_seen_per_source lsp
     JOIN latest_completed_execution lce ON lce.workspace_id = lsp.workspace_id
  WHERE lsp.rn = 1;
