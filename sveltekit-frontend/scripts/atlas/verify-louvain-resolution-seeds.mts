#!/usr/bin/env node
/**
 * Read-only verifier for the Louvain unresolved-seed ledger.
 *
 * Confirms the live table exists and reports the current row count for the
 * latest succeeded Louvain run. This is a post-apply audit helper, not a
 * mutation path.
 */

import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;

async function main(): Promise<void> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT ?? 5434),
    user: process.env.POSTGRES_USER ?? 'legal_admin',
    password: process.env.POSTGRES_PASSWORD ?? '123456',
    database: process.env.POSTGRES_DB ?? 'legal_ai_db',
  });

  try {
    const { rows: tableRows } = await pool.query<{ table_name: string | null }>(`
      SELECT to_regclass('public.graph_community_resolution_seeds')::text AS table_name
    `);
    const tableName = String(tableRows[0]?.table_name ?? '');
    if (!tableName) {
      process.stdout.write(`${JSON.stringify({
        status: 'MISSING',
        table: 'graph_community_resolution_seeds',
        rows: 0,
      }, null, 2)}\n`);
      return;
    }

    const { rows } = await pool.query<{ rows: number; run_id: string | null }>(`
      SELECT COUNT(*)::int AS rows,
             (SELECT run_id::text
                FROM graph_analysis_runs
               WHERE algorithm = 'louvain' AND status = 'succeeded'
               ORDER BY started_at DESC
               LIMIT 1) AS run_id
      FROM graph_community_resolution_seeds
    `);
    process.stdout.write(`${JSON.stringify({
      status: 'PRESENT',
      table: tableName,
      rows: Number(rows[0]?.rows ?? 0),
      latestLouvainRunId: rows[0]?.run_id ?? null,
    }, null, 2)}\n`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
