#!/usr/bin/env node
/**
 * Read-only proof for Query/Lexical feature statistics.
 *
 * This uses PostgreSQL's existing ts_stat over codebase_chunk_index.search_vector
 * and emits a replay receipt. It deliberately creates no view/table/index and
 * does not write candidate features.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/query-lexical-stats-v1.json');
const TERMS = ['search', 'runtime', 'semantic', 'qdrant', 'retrieval', 'workspace'];
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: Number(process.env.ATLAS_LEXICAL_STATS_TIMEOUT_MS || 60000),
});

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value) {
  return crypto.createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

async function snapshot(client) {
  const corpus = await client.query(`
    SELECT
      count(*)::int AS row_count,
      count(*) FILTER (WHERE search_vector IS NOT NULL)::int AS search_vector_count,
      count(*) FILTER (WHERE source_ref IS NOT NULL AND btrim(source_ref) <> '')::int AS source_ref_count,
      count(DISTINCT source_ref) FILTER (WHERE source_ref IS NOT NULL AND btrim(source_ref) <> '')::int AS source_ref_distinct_count
    FROM public.codebase_chunk_index
  `);
  const stats = await client.query(`
    SELECT word, ndoc::int AS document_frequency, nentry::int AS corpus_frequency
    FROM ts_stat('SELECT search_vector FROM public.codebase_chunk_index WHERE search_vector IS NOT NULL')
    WHERE word = ANY($1::text[])
    ORDER BY word ASC
  `, [TERMS]);
  const body = {
    terms: TERMS,
    corpus: corpus.rows[0],
    termStats: stats.rows,
  };
  return { ...body, snapshotChecksum: checksum(body) };
}

const report = {
  schema: 'parent-atlas.query-lexical-stats.v1',
  status: 'UNPROVEN',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  source: 'public.codebase_chunk_index.search_vector',
  statisticOwner: 'PostgreSQL ts_stat',
  terms: TERMS,
  firstSnapshot: null,
  replaySnapshot: null,
  replayStable: false,
  corpusSnapshotChecksum: null,
  evidenceRefs: [
    'sveltekit-frontend/src/lib/server/retrieval/retrieve-candidates.ts',
    'sveltekit-frontend/drizzle/0019_bm25_search_vector.sql',
    'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/lexical-fingerprint-v1.ts',
  ],
  nextAction: 'Join these statistics to an existing revision-qualified CandidateFeatureSnapshotV1; do not persist ts_stat output yet.',
};

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    report.firstSnapshot = await snapshot(client);
    report.replaySnapshot = await snapshot(client);
    report.replayStable = report.firstSnapshot.snapshotChecksum === report.replaySnapshot.snapshotChecksum;
    report.corpusSnapshotChecksum = report.firstSnapshot.snapshotChecksum;
    report.status = report.replayStable ? 'QUERY_LEXICAL_STATS_READ_ONLY_PROVEN' : 'QUERY_LEXICAL_STATS_REPLAY_DRIFT';
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
} catch (error) {
  report.status = 'QUERY_LEXICAL_STATS_BLOCKED';
  report.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error) };
  try {
    const client = await pool.connect();
    await client.query('ROLLBACK');
    client.release();
  } catch {
    // Preserve the original diagnostic.
  }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify({
  status: report.status,
  readOnly: report.readOnly,
  writesPerformed: report.writesPerformed,
  replayStable: report.replayStable,
  corpusSnapshotChecksum: report.corpusSnapshotChecksum,
  reportPath: REPORT_PATH,
}, null, 2));
