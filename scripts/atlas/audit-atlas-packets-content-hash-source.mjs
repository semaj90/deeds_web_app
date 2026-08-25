#!/usr/bin/env node
/**
 * Read-only source-of-truth audit for `atlas_packets.content_hash`.
 *
 * Freezes, as a receipt, why the four related hash columns in this identity
 * chain cannot agree by construction (each hashes different bytes), and
 * computes the one subset that CAN be backfilled correctly: packets whose
 * `source_ref` joins to exactly one distinct `codebase_chunk_index.content_hash`
 * (single-chunk files) — the only value that can ever equal the FTS join's
 * fixed target (`codebase_chunk_index.content_hash` itself).
 *
 * Hash-authority definitions (verified by reading the writer source, not
 * inferred from data):
 *   - atlas_packets.content_hash    : no live writer. Only
 *     scripts/atlas/phase-17-hyperrag-indexing-e2e.mjs sets it
 *     (content_hash: sha256(chunkText)), a demo/e2e script never run against
 *     the live table. schema/atlas-packets.ts does not declare this column
 *     (live-DB-only schema drift).
 *   - atlas_packets.sha256          : sha256(qdrant_payload.content || source_ref)
 *     — scripts/atlas/ingest-qdrant-to-atlas-packets.mjs:188, a one-time
 *     partial Qdrant->Postgres backfill. Different column, different hash.
 *   - codebase_chunk_index.content_hash : sha256(`${relPath}:${chunkIndex}:${chunkText}`)
 *     — scripts/atlas/index-full-repo-for-search.mjs:381. Per-chunk. This is
 *     the FTS adapter's join target and therefore the only correct source.
 *   - atlas_source_refs.content_hash    : copies the chunk hash above when a
 *     matching codebase_chunk_index row exists, else falls back to
 *     sha256(`${path}#${symbol}`) (no real content at all) —
 *     sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs:520.
 *     One file legitimately fans out to many rows (per symbol), so distinct
 *     hash values per packet are expected multiplicity, not corruption.
 *   - atlas_artifacts.content_hash      : sha256(atlas_packets.summary) — the
 *     LLM-generated summary text, not file/chunk bytes at all —
 *     scripts/phase85/p3-backfill-artifact-registry.mjs. Structurally cannot
 *     agree with any content-derived hash.
 *
 * Never writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/atlas-packets-content-hash-source-v1.json');

const HASH_AUTHORITIES = {
  'atlas_packets.content_hash': {
    hashInput: 'NO_LIVE_WRITER',
    grain: null,
    writer: 'scripts/atlas/phase-17-hyperrag-indexing-e2e.mjs (demo/e2e script, never run against the live table)',
    note: 'schema/atlas-packets.ts does not declare this column — live-DB-only schema drift.',
  },
  'atlas_packets.sha256': {
    hashInput: "sha256(qdrant_payload.content || source_ref)",
    grain: 'per-qdrant-point, partial one-time backfill',
    writer: 'scripts/atlas/ingest-qdrant-to-atlas-packets.mjs:188',
    note: 'Different column from content_hash. Not comparable to codebase_chunk_index.content_hash.',
  },
  'codebase_chunk_index.content_hash': {
    hashInput: 'sha256(`${relPath}:${chunkIndex}:${chunkText}`)',
    grain: 'per-chunk',
    writer: 'scripts/atlas/index-full-repo-for-search.mjs:381',
    note: 'FIXED JOIN TARGET of packages/parent-atlas-runtime/src/adapters/postgres-fts.adapter.ts.',
  },
  'atlas_source_refs.content_hash': {
    hashInput: 'codebase_chunk_index.content_hash when present, else sha256(`${path}#${symbol}`)',
    grain: 'per-symbol (one file fans out to many rows)',
    writer: 'sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs:520',
    note: 'Fallback branch hashes a path+symbol string, not real content.',
  },
  'atlas_artifacts.content_hash': {
    hashInput: 'sha256(atlas_packets.summary)',
    grain: 'per-packet, but hashes summary text not file/chunk bytes',
    writer: 'scripts/phase85/p3-backfill-artifact-registry.mjs',
    note: 'Structurally cannot agree with any content-derived hash.',
  },
};

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 60000,
});

const report = {
  schema: 'atlas.atlas-packets-content-hash-source.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  status: 'UNKNOWN',
  hashAuthorities: HASH_AUTHORITIES,
  eligibleSet: null,
  samples: {},
  recommendation: null,
};

function numbers(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

try {
  await pool.query('BEGIN READ ONLY');

  // The one safe backfill candidate: packets whose source_ref maps to
  // exactly one distinct codebase_chunk_index.content_hash value.
  const eligible = await pool.query(`
    WITH chunk_candidates AS (
      SELECT p.packet_key,
             count(DISTINCT c.content_hash) AS distinct_chunk_hashes,
             (array_agg(DISTINCT c.content_hash) FILTER (WHERE c.content_hash IS NOT NULL))[1] AS single_hash
      FROM public.atlas_packets p
      LEFT JOIN public.codebase_chunk_index c ON c.source_ref = p.source_ref
      GROUP BY p.packet_key
    )
    SELECT
      count(*) FILTER (WHERE distinct_chunk_hashes = 0) AS no_chunk_hash,
      count(*) FILTER (WHERE distinct_chunk_hashes = 1) AS chunk_hash_unique_eligible,
      count(*) FILTER (WHERE distinct_chunk_hashes > 1) AS chunk_hash_ambiguous
    FROM chunk_candidates
  `);
  report.eligibleSet = numbers(eligible.rows[0]);

  // Cross-check: how many of the "unique" set already have a NON-NULL
  // atlas_packets.content_hash (should be 0 today; guards against re-running
  // this audit after a partial apply and misreporting the eligible count).
  const alreadyPopulated = await pool.query(`
    WITH chunk_candidates AS (
      SELECT p.packet_key, p.content_hash AS packet_content_hash,
             count(DISTINCT c.content_hash) AS distinct_chunk_hashes
      FROM public.atlas_packets p
      LEFT JOIN public.codebase_chunk_index c ON c.source_ref = p.source_ref
      GROUP BY p.packet_key, p.content_hash
    )
    SELECT count(*) AS n FROM chunk_candidates
    WHERE distinct_chunk_hashes = 1 AND packet_content_hash IS NOT NULL
  `);
  report.eligibleSet.alreadyPopulatedWithinUniqueSet = Number(alreadyPopulated.rows[0].n);
  report.eligibleSet.pendingUniqueBackfill = Math.max(
    0,
    Number(report.eligibleSet.chunk_hash_unique_eligible) -
      Number(report.eligibleSet.alreadyPopulatedWithinUniqueSet),
  );

  const samples = await pool.query(`
    WITH unique_matches AS (
      SELECT p.packet_key, p.source_ref, p.content_hash AS current_packet_content_hash,
             count(DISTINCT c.content_hash) AS distinct_chunk_hashes,
             (array_agg(DISTINCT c.content_hash))[1] AS candidate_content_hash
      FROM public.atlas_packets p
      JOIN public.codebase_chunk_index c ON c.source_ref = p.source_ref
      WHERE p.content_hash IS NULL
      GROUP BY p.packet_key, p.source_ref, p.content_hash
    )
    SELECT packet_key, source_ref, current_packet_content_hash, candidate_content_hash
    FROM unique_matches
    WHERE distinct_chunk_hashes = 1
    ORDER BY packet_key
    LIMIT 10
  `);
  report.samples.unique_eligible_candidates = samples.rows;

  report.status = 'READY';
  await pool.query('ROLLBACK');

  const eligibleCount = report.eligibleSet.chunk_hash_unique_eligible;
  const pendingCount = report.eligibleSet.pendingUniqueBackfill;
  report.recommendation = pendingCount > 0
    ? `SAFE_BACKFILL_ELIGIBLE: ${pendingCount} packets remain pending; ${eligibleCount} packets total ` +
      'have a source_ref that maps to exactly one ' +
      'distinct codebase_chunk_index.content_hash value (single-chunk files). These can be backfilled ' +
      'by copying that chunk hash directly — same hash definition as the FTS join target, so the join ' +
      'will bind for real. The remaining ambiguous/no-match packets require an operator decision on ' +
      'packet/chunk granularity (see AST-ID-06-style UNRESOLVED entry in tasks.md) and are out of scope ' +
      'for this backfill.'
    : eligibleCount > 0
      ? `NO_PENDING_BACKFILL: ${eligibleCount} unique hash matches are already populated; ` +
        'the remaining packets require an operator decision on packet/chunk granularity.'
      : 'BLOCKED: no unambiguous single-chunk-hash candidates are available.';
} catch (error) {
  report.status = 'ERROR';
  report.error = error instanceof Error ? error.message : String(error);
  try { await pool.query('ROLLBACK'); } catch { /* connection may already be closed */ }
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  eligibleSet: report.eligibleSet,
  recommendation: report.recommendation,
  reportPath: path.relative(REPO_ROOT, REPORT_PATH).replaceAll('\\', '/'),
}, null, 2));
