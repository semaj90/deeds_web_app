#!/usr/bin/env node

/**
 * Read-only coverage receipt for the dense Qdrant -> PostgreSQL canonical
 * lineage bridge. It proves adapter reachability and measures live data
 * coverage; it never repairs or promotes rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const baseUrl = process.env.GO_RETRIEVAL_URL ?? 'http://127.0.0.1:8100';
const reportPath = path.join(root, 'docs/reports/go-retrieval-dense-lineage-v1.json');
const report = {
  schema: 'atlas.go-retrieval-dense-lineage.v1',
  generatedAt: new Date().toISOString(),
  mode: 'LIVE_READ_ONLY',
  baseUrl,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
};

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 30_000,
  application_name: 'atlas-go-retrieval-dense-lineage-v1',
});

try {
  const healthResponse = await fetch(`${baseUrl}/health`);
  report.healthStatus = healthResponse.status;
  report.health = await healthResponse.json();
  const searchResponse = await fetch(`${baseUrl}/search/codebase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'PostgreSQL source revision', limit: 3 }),
  });
  report.searchStatus = searchResponse.status;
  report.search = await searchResponse.json();

  const db = await pool.query(`
    SELECT
      count(*)::int AS chunk_rows,
      count(*) FILTER (WHERE c.qdrant_id IS NOT NULL AND btrim(c.qdrant_id) <> '')::int AS qdrant_rows,
      count(*) FILTER (WHERE l.revision_status = 'PROVEN')::int AS proven_lineage_rows,
      count(*) FILTER (
        WHERE l.revision_status = 'PROVEN'
          AND b.canonical_source_ref IS NOT NULL
          AND c.chunk_id IS NOT NULL AND btrim(c.chunk_id) <> ''
          AND l.packet_key IS NOT NULL AND btrim(l.packet_key) <> ''
          AND l.canonical_chunk_id IS NOT NULL AND btrim(l.canonical_chunk_id) <> ''
          AND l.source_revision IS NOT NULL AND btrim(l.source_revision) <> ''
          AND c.workspace_revision IS NOT NULL AND btrim(c.workspace_revision) <> ''
          AND c.representation_revision IS NOT NULL AND btrim(c.representation_revision) <> ''
      )::int AS fully_qualified_rows
    FROM public.codebase_chunk_index c
    LEFT JOIN public.atlas_packet_chunk_lineage l
      ON l.chunk_row_id = c.id AND l.revision_status = 'PROVEN'
    LEFT JOIN public.atlas_workspace_source_bindings b
      ON b.repo_id = 'deeds-web-app'
     AND b.canonical_source_ref = l.source_ref
     AND b.workspace_revision = c.workspace_revision
     AND b.source_revision = l.source_revision
  `);
  report.coverage = db.rows[0];
  report.checks = {
    health: report.health?.status === 'healthy' ? 'PASS' : 'REVIEW_REQUIRED',
    boundedDenseSearch: searchResponse.status === 200 ? 'PASS' : 'FAIL',
    adapterMode: 'EXACT_QDRANT_ID_PROVEN_LINEAGE_ONLY',
    canonicalPromotion: 'BLOCKED_UNTIL_FULLY_QUALIFIED',
  };
  report.status = report.checks.health === 'PASS' && report.checks.boundedDenseSearch === 'PASS'
    ? (Number(report.coverage.fully_qualified_rows) > 0
      ? 'GO_RETRIEVAL_DENSE_LINEAGE_PARTIAL_COVERAGE'
      : 'GO_RETRIEVAL_DENSE_LINEAGE_ADAPTER_PROVEN_DATA_BLOCKED')
    : 'GO_RETRIEVAL_DENSE_LINEAGE_REVIEW_REQUIRED';
} catch (error) {
  report.status = 'GO_RETRIEVAL_DENSE_LINEAGE_UNAVAILABLE';
  report.error = String(error?.message ?? error);
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, reportPath: 'docs/reports/go-retrieval-dense-lineage-v1.json', writesPerformed: false }, null, 2));
process.exitCode = report.status.startsWith('GO_RETRIEVAL_DENSE_LINEAGE_') ? 0 : 1;
