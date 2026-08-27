#!/usr/bin/env node
/** Read-only proof of the current Graphify workspace UUID owner contract. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/graphify-workspace-owner-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

async function main() {
  const tables = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('workspaces', 'graphify_runs', 'graphify_files')
    ORDER BY table_name
  `);
  const columns = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('workspaces', 'graphify_runs', 'graphify_files')
    ORDER BY table_name, ordinal_position
  `);
  const constraints = await pool.query(`
    SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
           kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_schema = ccu.constraint_schema AND tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_schema = 'public' AND tc.table_name IN ('workspaces', 'graphify_runs', 'graphify_files')
    ORDER BY tc.table_name, tc.constraint_name
  `);
  const counts = await pool.query(`
    SELECT 'workspaces' AS table_name, count(*)::integer AS row_count FROM public.workspaces
    UNION ALL SELECT 'graphify_runs', count(*)::integer FROM public.graphify_runs
    UNION ALL SELECT 'graphify_files', count(*)::integer FROM public.graphify_files
  `);
  await pool.end();

  const graphifyRunWorkspaceForeignKey = constraints.rows.some((row) =>
    row.table_name === 'graphify_runs' && row.constraint_type === 'FOREIGN KEY' &&
    row.column_name === 'workspace_id' && row.foreign_table_name === 'workspaces' && row.foreign_column_name === 'id'
  );
  const report = {
    schema: 'atlas.graphify-workspace-owner-v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    canonicalWrites: false,
    candidateOwner: 'public.workspaces.id',
    graphifyRunWorkspaceForeignKey,
    ownerContractStatus: graphifyRunWorkspaceForeignKey ? 'OWNER_CONTRACT_PRESENT' : 'OWNER_CONTRACT_GAP',
    tables: tables.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    counts: Object.fromEntries(counts.rows.map((row) => [row.table_name, row.row_count])),
    conclusion: graphifyRunWorkspaceForeignKey
      ? 'Graphify run workspace identity is referentially bound to public.workspaces.'
      : 'public.workspaces can hold UUIDs, but Graphify lineage does not currently enforce it as the workspace owner.',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.ownerContractStatus, candidateOwner: report.candidateOwner, counts: report.counts, report: REPORT }, null, 2));
  if (!graphifyRunWorkspaceForeignKey) process.exitCode = 2;
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[graphify-workspace-owner] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
