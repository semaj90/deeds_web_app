#!/usr/bin/env node
/** Read-only audit of the owner for revision-qualified graph evidence. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/graph-revision-owner-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const loadWorkspaceRevision = () => {
  try {
    const report = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json'), 'utf8'));
    return report.record?.workspaceRevision ?? null;
  } catch { return null; }
};

async function main() {
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('atlas_hyperedges', 'atlas_relationships',
        'atlas_ontology_tuples', 'atlas_taxonomy_assignment_candidates',
        'graph_analysis_runs', 'atlas_graph_snapshots_v2')
  `);
  const present = new Set(tables.rows.map((row) => row.table_name));
  const revisionTables = {};
  for (const table of present) {
    const columns = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    const names = new Set(columns.rows.map((row) => row.column_name));
    if (!names.has('graph_revision')) continue;
    const workspace = names.has('workspace_revision') ? 'workspace_revision' : 'NULL::text';
    const result = await pool.query(`
      SELECT count(*)::integer AS rows,
             count(*) FILTER (WHERE graph_revision IS NOT NULL)::integer AS graph_revision_present,
             count(DISTINCT graph_revision)::integer AS graph_revision_distinct,
             count(*) FILTER (WHERE ${workspace} IS NOT NULL)::integer AS workspace_revision_present,
             count(DISTINCT ${workspace})::integer AS workspace_revision_distinct
      FROM public.${table}
    `);
    const samples = await pool.query(`
      SELECT DISTINCT graph_revision::text AS graph_revision,
             ${workspace}::text AS workspace_revision
      FROM public.${table}
      WHERE graph_revision IS NOT NULL
      ORDER BY graph_revision::text, ${workspace}::text NULLS FIRST
      LIMIT 20
    `);
    revisionTables[table] = { ...result.rows[0], revisionSamples: samples.rows };
  }
  const workspaceRevision = loadWorkspaceRevision();
  const snapshotOwner = revisionTables.atlas_graph_snapshots_v2 ?? null;
  const analysisOwner = revisionTables.graph_analysis_runs ?? null;
  const report = {
    schema: 'atlas.graph-revision-owner.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    expectedWorkspaceRevision: workspaceRevision,
    presentTables: [...present].sort(),
    revisionTables,
    ownerCandidates: {
      atlasGraphSnapshotsV2: snapshotOwner ? 'SCHEMA_OWNER_CANDIDATE' : 'UNAVAILABLE',
      graphAnalysisRuns: analysisOwner ? 'ANALYSIS_OWNER_CANDIDATE' : 'UNAVAILABLE',
      relationshipRows: 'NOT_AN_OWNER_UNTIL_WRITER_BINDS_CURRENT_WORKSPACE',
    },
    status: snapshotOwner?.graph_revision_present > 0 || analysisOwner?.graph_revision_present > 0
      ? 'GRAPH_REVISION_OWNER_DATA_PRESENT_REQUIRES_CURRENT_BINDING_CHECK'
      : 'GRAPH_REVISION_OWNER_DATA_MISSING',
    nextGate: 'TRACE_GRAPH_SNAPSHOT_OR_ANALYSIS_WRITER_TO_CURRENT_WORKSPACE_REVISION',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  await pool.end();
  console.log(JSON.stringify({
    schema: report.schema, status: report.status, readOnly: true,
    expectedWorkspaceRevision: workspaceRevision, revisionTables, report: REPORT,
  }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[graph-revision-owner] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
