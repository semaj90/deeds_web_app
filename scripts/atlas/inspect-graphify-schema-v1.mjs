#!/usr/bin/env node

/**
 * Read-only Graphify/workspace schema inspector.
 *
 * Recreated 2026-09-05 after five one-off throwaway probe scripts used to
 * ground SOURCE-EVIDENCE-AUTHORITY-01's selector logic were `rm`'d instead of
 * kept, against this repo's own "archive, don't delete" convention. This
 * consolidates what those probes actually checked into one reusable,
 * documented tool instead of scratch fragments, so the same grounding work
 * doesn't need to be redone from scratch for a future gate.
 *
 * Performs ONLY SELECT queries against information_schema and the live
 * tables. Never writes. Safe to re-run at any time.
 *
 * Usage: node scripts/atlas/inspect-graphify-schema-v1.mjs [--json]
 */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const asJson = process.argv.includes('--json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });

async function columns(table) {
  return (await pool.query(
    `select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
    [table],
  )).rows;
}

async function main() {
  const result = {};

  result.graphifyRunsColumns = await columns('graphify_runs');
  result.graphifyFilesColumns = await columns('graphify_files');

  result.workspaceRelatedTables = (await pool.query(
    `select table_name from information_schema.tables where table_schema='public' and table_name ilike '%workspace%' order by table_name`,
  )).rows.map((r) => r.table_name);

  result.workspaces = (await pool.query(`select id::text as id, logical_key, title from public.workspaces`)).rows;

  result.runStatusCounts = (await pool.query(
    `select status, count(*)::int as count from public.graphify_runs group by 1 order by 2 desc`,
  )).rows;

  result.sourceRevisionAuthorityDistinct = (await pool.query(
    `select source_revision_authority, count(*)::int as count from public.graphify_files group by 1 order by 2 desc limit 10`,
  )).rows;

  // The core join that grounds SOURCE-EVIDENCE-AUTHORITY-01 and every
  // audit-graphify-run-file-binding-v1.mjs-style script: per-run status +
  // workspace_revision + how many graphify_files rows are bound to it.
  result.runsWithFileBindingCounts = (await pool.query(`
    select r.run_id::text as run_id, r.status, r.workspace_id::text as workspace_id,
           r.workspace_revision, r.source_manifest_digest, r.source_manifest_source_count,
           r.started_at, r.completed_at,
           count(f.source_ref)::int as file_count
    from public.graphify_runs r
    left join public.graphify_files f on f.last_seen_run_id = r.run_id
    group by r.run_id, r.status, r.workspace_id, r.workspace_revision, r.source_manifest_digest, r.source_manifest_source_count, r.started_at, r.completed_at
    order by r.completed_at desc nulls last, r.started_at desc nulls last
  `)).rows;

  return result;
}

let output;
let error = null;
try {
  output = await main();
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause);
} finally {
  await pool.end();
}

if (error) {
  console.error(JSON.stringify({ status: 'INSPECTION_FAILED', error }, null, 2));
  process.exitCode = 1;
} else if (asJson) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(`graphify_runs columns: ${output.graphifyRunsColumns.map((c) => c.column_name).join(', ')}`);
  console.log(`graphify_files columns: ${output.graphifyFilesColumns.map((c) => c.column_name).join(', ')}`);
  console.log(`workspace-related tables: ${output.workspaceRelatedTables.join(', ')}`);
  console.log(`workspaces: ${JSON.stringify(output.workspaces)}`);
  console.log(`run status counts: ${JSON.stringify(output.runStatusCounts)}`);
  console.log(`source_revision_authority distinct: ${JSON.stringify(output.sourceRevisionAuthorityDistinct)}`);
  console.log(`runs with file-binding counts (${output.runsWithFileBindingCounts.length} rows):`);
  for (const row of output.runsWithFileBindingCounts) {
    console.log(`  ${row.run_id}  ${row.status.padEnd(9)}  files=${row.file_count}  workspace_revision=${row.workspace_revision}`);
  }
}
