#!/usr/bin/env node
// NAMING NOTE (2026-08-26, docs-only, no rename): "bm25" here is historical.
// The live index is PostgreSQL native tsvector/GIN full-text search; pg_search
// is not installed (confirmed via `SELECT extname FROM pg_extension`).
// Classify as POSTGRES_FTS_AST, not BM25_AST. See
// parent-atlas-workstation-todo.md's 2026-08-23/26 session handoffs and
// scripts/atlas/audit-graphify-lexical-owner.mjs, which already makes this
// distinction explicit at the query layer.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { buildGraphifyBm25CandidatePlanV1, parseGraphifyBm25PlanLimitV1 } from './lib/graphify-bm25-candidate-plan-v1.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const output = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_BM25_INDEX_PLAN_OUT ?? 'docs/reports/graphify-bm25-index-plan.json',
);
const limit = parseGraphifyBm25PlanLimitV1(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});

const report = {
  schemaVersion: 'atlas.graphify-bm25-index-plan.v1',
  readOnly: true,
  canonicalWriteAttempted: false,
  generatedAt: new Date().toISOString(),
  limit,
  status: 'UNKNOWN',
  candidates: [],
  blockers: [],
};

try {
  await pool.query('BEGIN READ ONLY');
  const relation = await pool.query(
    "SELECT to_regclass('public.graphify_bm25_index_candidates') IS NOT NULL AS present",
  );
  if (!relation.rows[0]?.present) {
    report.status = 'BM25_CONTROL_PLANE_MIGRATION_REQUIRED';
    report.blockers.push('graphify_bm25_index_candidates_view_missing');
  } else {
    const result = await pool.query(
      'SELECT graphify_run_id, workflow_id, workspace_revision, ' +
      'source_manifest_digest, source_manifest_source_count, repository_revision, ' +
      'parameters, graphify_completed_at ' +
      'FROM public.graphify_bm25_index_candidates ' +
      'ORDER BY graphify_completed_at DESC NULLS LAST, graphify_run_id LIMIT $1',
      [limit],
    );
    report.status = 'BM25_INDEX_PLAN_READY';
    report.candidates = result.rows.map(buildGraphifyBm25CandidatePlanV1);
    if (report.candidates.length === 0) report.blockers.push('no_completed_graphify_candidates');
  }
  await pool.query('ROLLBACK');
} finally {
  await pool.end();
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ ...report, output }, null, 2));
