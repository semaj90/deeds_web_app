#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 15000 });
const cols = await pool.query(`
  SELECT column_name, data_type, is_generated, generation_expression
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='atlas_packets'
    AND column_name IN ('workspace_revision','source_revision','representation_revision')
`);
const counts = await pool.query(`
  SELECT count(*)::int AS total,
         count(workspace_revision)::int AS workspace_revision_nonnull,
         count(source_revision)::int AS source_revision_nonnull,
         count(representation_revision)::int AS representation_revision_nonnull
  FROM atlas_packets
`);
const sample = await pool.query(`SELECT packet_key, source_ref, workspace_revision, source_revision, representation_revision FROM atlas_packets WHERE workspace_revision IS NOT NULL LIMIT 3`);
const report = {
  schema: 'atlas.atlas-packets-revision-columns.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LIVE_SCHEMA_CENSUS',
  table: 'public.atlas_packets',
  columns: cols.rows,
  counts: counts.rows[0],
  sample: sample.rows,
  writesPerformed: false,
};
const reportPath = path.join(REPO_ROOT, 'docs/reports/atlas-packets-revision-columns-v1.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: 'docs/reports/atlas-packets-revision-columns-v1.json' }, null, 2));
await pool.end();
