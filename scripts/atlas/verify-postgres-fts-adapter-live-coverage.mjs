#!/usr/bin/env node
/**
 * Runs the real `searchPostgresFts()` adapter (the actual code path, not a mirrored SQL query)
 * against the same 8 frozen queries used by `audit-postgres-fts-identity-coverage.mjs`, to
 * confirm the two-lane bridge join (added 2026-08-25, see PACKET-CHUNK-GRANULARITY-01 in
 * openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md) actually returns bridge-lane
 * hits through the adapter's own import/entry point, not just via a standalone mirrored query.
 *
 * Read-only. Never writes.
 */
import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { searchPostgresFts } from '../../packages/parent-atlas-runtime/src/adapters/postgres-fts.adapter.ts';

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/postgres-fts-adapter-live-coverage-v1.json');

// Same frozen set as audit-postgres-fts-identity-coverage.mjs — do not re-sample.
const FROZEN_QUERIES = [
  'IngestionJobStatus',
  'GpuConfig',
  'SystemStatus',
  'ErrorPatchLogInsert',
  'extractLegalEntities',
  'CourtroomScene',
  'embedding search',
  'packet identity',
];

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 20000,
});
const db = drizzle(pool);

const report = {
  schema: 'atlas.postgres-fts-adapter-live-coverage.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  perQueryResults: [],
  summary: null,
};

try {
  let totalCandidates = 0;
  let totalExactLane = 0;
  let totalBridgeLane = 0;

  for (const query of FROZEN_QUERIES) {
    const candidates = await searchPostgresFts({ db, query, limit: 20 });
    const exactLane = candidates.filter((c) => c.identity_resolution_source === 'source_ref_content_hash_exact').length;
    const bridgeLane = candidates.filter((c) => c.identity_resolution_source === 'chunk_packet_identity_link_exact_canonical').length;
    totalCandidates += candidates.length;
    totalExactLane += exactLane;
    totalBridgeLane += bridgeLane;
    report.perQueryResults.push({
      query,
      candidateCount: candidates.length,
      exactLaneCount: exactLane,
      bridgeLaneCount: bridgeLane,
    });
  }

  report.summary = {
    totalCandidates,
    totalExactLane,
    totalBridgeLane,
    bridgeLaneContributedAnyResults: totalBridgeLane > 0,
  };
  report.status = 'READY';
} catch (error) {
  report.status = 'ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
