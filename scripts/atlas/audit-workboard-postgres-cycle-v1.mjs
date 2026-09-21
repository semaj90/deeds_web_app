#!/usr/bin/env node

/**
 * Read-only PostgreSQL proof for the workboard dependency graph.
 *
 * This is deliberately an audit, not a scheduler or a writer.  The CYCLE
 * clause proves the read-model behavior independently of the tasks.md parser.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const reportPath = path.join(REPO_ROOT, 'docs', 'reports', 'workboard-postgres-cycle-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 20000,
  application_name: 'atlas-workboard-postgres-cycle-audit-v1',
});

const cycleSql = `
  WITH RECURSIVE cycle_walk(parent_task_id, child_task_id, path) AS (
    SELECT d.parent_task_id, d.child_task_id,
           ARRAY[d.parent_task_id, d.child_task_id]::text[]
      FROM public.kanban_task_dependencies d
    UNION ALL
    SELECT w.parent_task_id, d.child_task_id, w.path || d.child_task_id
      FROM cycle_walk w
      JOIN public.kanban_task_dependencies d
        ON d.parent_task_id = w.child_task_id
  )
  CYCLE child_task_id SET is_cycle USING cycle_path
  SELECT
    count(*)::int AS walk_rows,
    count(*) FILTER (WHERE is_cycle)::int AS cycle_rows,
    coalesce(max(array_length(cycle_path, 1)), 0)::int AS max_cycle_path_length
    FROM cycle_walk
`;

const countsSql = `
  SELECT
    (SELECT count(*)::int FROM public.kanban_tasks) AS task_rows,
    (SELECT count(*)::int FROM public.kanban_task_dependencies) AS dependency_rows,
    (SELECT count(*)::int
       FROM public.kanban_task_dependencies d
      WHERE NOT EXISTS (SELECT 1 FROM public.kanban_tasks t WHERE t.task_id = d.parent_task_id)
         OR NOT EXISTS (SELECT 1 FROM public.kanban_tasks t WHERE t.task_id = d.child_task_id)) AS unresolved_rows,
    (SELECT count(*)::int
       FROM (SELECT parent_task_id, child_task_id, count(*)
               FROM public.kanban_task_dependencies
              GROUP BY parent_task_id, child_task_id
             HAVING count(*) > 1) duplicate_edges) AS duplicate_edge_groups
`;

let report;
try {
  const [cycleResult, countsResult] = await Promise.all([
    pool.query(cycleSql),
    pool.query(countsSql),
  ]);
  const cycle = cycleResult.rows[0] ?? {};
  const counts = countsResult.rows[0] ?? {};
  const cycleRows = Number(cycle.cycle_rows ?? 0);
  const unresolvedRows = Number(counts.unresolved_rows ?? 0);
  const duplicateEdgeGroups = Number(counts.duplicate_edge_groups ?? 0);
  report = {
    schema: 'atlas.workboard-postgres-cycle-audit.v1',
    generatedAt: new Date().toISOString(),
    status: cycleRows === 0 && unresolvedRows === 0 && duplicateEdgeGroups === 0
      ? 'PG_WORKBOARD_DEPENDENCY_CYCLE_PROVEN'
      : 'PG_WORKBOARD_DEPENDENCY_REVIEW_REQUIRED',
    proof: {
      recursiveCteCycleClause: true,
      cycleRows,
      walkRows: Number(cycle.walk_rows ?? 0),
      maxCyclePathLength: Number(cycle.max_cycle_path_length ?? 0),
      unresolvedRows,
      duplicateEdgeGroups,
    },
    tables: {
      kanbanTasks: Number(counts.task_rows ?? 0),
      kanbanTaskDependencies: Number(counts.dependency_rows ?? 0),
    },
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
    readOnly: true,
    nextGate: 'DECLARE_REVISION_QUALIFIED_DEPENDENCY_RECEIPTS_BEFORE_SCHEDULER_ADMISSION',
  };
} catch (error) {
  report = {
    schema: 'atlas.workboard-postgres-cycle-audit.v1',
    generatedAt: new Date().toISOString(),
    status: 'PG_WORKBOARD_DEPENDENCY_CYCLE_AUDIT_FAILED',
    error: error instanceof Error ? error.message : String(error),
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
    readOnly: true,
  };
  process.exitCode = 1;
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
