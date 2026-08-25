#!/usr/bin/env node
/**
 * Read-only (source_ref, content_hash) identity-join coverage audit for the
 * new canonical `searchPostgresFts()` query in
 * packages/parent-atlas-runtime/src/adapters/postgres-fts.adapter.ts.
 *
 * Purpose: before promoting that adapter, quantify exactly how well
 * codebase_chunk_index rows bind to atlas_packets via the exact
 * (source_ref, content_hash) join it uses — per the explicit instruction
 * NOT to relax the join to source_ref alone without first proving why.
 *
 * Never writes. Never relaxes the join itself — only measures.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/postgres-fts-identity-coverage-v1.json');

// Frozen query set — 6 real symbol names sampled from codebase_chunk_index
// (2026-08-26) + 2 generic natural-language queries. Hardcoded so replay is
// deterministic; do not re-sample randomly on each run.
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

const report = {
  schema: 'atlas.postgres-fts-identity-coverage.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  baseCoverage: null,
  frozenQueries: FROZEN_QUERIES,
  perQueryResults: [],
  summary: null,
  recommendation: null,
};

try {
  await pool.query('BEGIN READ ONLY');

  // ---- Base (query-independent) join coverage ----
  const base = await pool.query(`
    WITH chunks AS (
      SELECT id, source_ref, content_hash
      FROM public.codebase_chunk_index
      WHERE source_ref IS NOT NULL AND content_hash IS NOT NULL
    ),
    exact_match AS (
      SELECT c.id
      FROM chunks c
      JOIN public.atlas_packets p
        ON p.source_ref = c.source_ref AND p.content_hash = c.content_hash
    ),
    source_ref_only_match AS (
      SELECT c.id
      FROM chunks c
      JOIN public.atlas_packets p ON p.source_ref = c.source_ref
      WHERE c.id NOT IN (SELECT id FROM exact_match)
    ),
    ambiguous_source_ref AS (
      SELECT p.source_ref, count(*) AS packet_count
      FROM public.atlas_packets p
      WHERE p.source_ref IS NOT NULL
      GROUP BY p.source_ref
      HAVING count(*) > 1
    )
    SELECT
      (SELECT count(*) FROM chunks) AS chunks_with_ref_and_hash,
      (SELECT count(*) FROM exact_match) AS exact_source_ref_content_hash_matches,
      (SELECT count(*) FROM source_ref_only_match) AS source_ref_only_matches_no_hash_agreement,
      (SELECT count(*) FROM chunks c WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_packets p WHERE p.source_ref = c.source_ref
      )) AS unmatched_no_source_ref_at_all,
      (SELECT count(*) FROM public.atlas_packets WHERE content_hash IS NOT NULL) AS atlas_packets_content_hash_populated,
      (SELECT count(*) FROM public.atlas_packets) AS atlas_packets_total,
      (SELECT count(*) FROM ambiguous_source_ref) AS ambiguous_source_ref_groups,
      (SELECT coalesce(sum(packet_count), 0) FROM ambiguous_source_ref) AS ambiguous_source_ref_packet_rows
  `);
  report.baseCoverage = Object.fromEntries(
    Object.entries(base.rows[0]).map(([k, v]) => [k, Number(v)]),
  );

  // Existing chunk-to-packet bridge is measured separately. It is a
  // rebuildable identity aid, not a replacement for the hash-qualified join.
  const bridge = await pool.query(`
    SELECT
      (SELECT count(*) FROM public.atlas_chunk_packet_identity_links) AS bridge_rows,
      (SELECT count(*) FROM public.atlas_chunk_packet_identity_links
        WHERE match_method = 'EXACT_CANONICAL_ID') AS exact_bridge_rows,
      (SELECT count(*) FROM public.codebase_chunk_index ci
        WHERE ci.source_ref IS NOT NULL AND ci.content_hash IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.atlas_chunk_packet_identity_links l
            JOIN public.atlas_packets p ON p.packet_key = l.canonical_packet_key
            WHERE l.chunk_index_id = ci.id
          )) AS eligible_chunks_with_packet_bridge,
      (SELECT count(*) FROM public.codebase_chunk_index
        WHERE source_ref IS NOT NULL AND content_hash IS NOT NULL) AS eligible_chunks
  `);
  report.identityBridge = Object.fromEntries(
    Object.entries(bridge.rows[0]).map(([k, v]) => [k, Number(v)]),
  );

  // ---- Per-frozen-query: raw lexical hits vs canonical-joined hits ----
  for (const query of FROZEN_QUERIES) {
    const lexical = await pool.query(
      `SELECT count(*)::int AS n FROM public.codebase_chunk_index ci
       WHERE ci.search_vector @@ websearch_to_tsquery('english', $1)`,
      [query],
    );
    const canonical = await pool.query(`
      WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq),
      lexical AS (
        SELECT ci.id::text AS lexical_id, ci.source_ref, ci.content_hash,
               ts_rank_cd(ci.search_vector, q.tsq, 32)::double precision AS lexical_score
        FROM public.codebase_chunk_index AS ci
        CROSS JOIN q
        WHERE ci.search_vector @@ q.tsq
          AND ci.content_hash IS NOT NULL AND ci.source_ref IS NOT NULL
        ORDER BY lexical_score DESC, ci.id
        LIMIT 100
      ),
      canonical AS (
        SELECT p.packet_key,
               count(*) OVER (PARTITION BY l.lexical_id) AS identity_match_count,
               row_number() OVER (PARTITION BY p.packet_key ORDER BY l.lexical_score DESC) AS packet_rank
        FROM lexical AS l
        JOIN public.atlas_packets AS p
          ON p.source_ref = l.source_ref AND p.content_hash = l.content_hash
        WHERE p.packet_key IS NOT NULL AND p.feature_id IS NOT NULL
      )
      SELECT count(*)::int AS n FROM canonical WHERE identity_match_count = 1 AND packet_rank = 1
    `, [query]);
    report.perQueryResults.push({
      query,
      rawLexicalHits: lexical.rows[0].n,
      canonicalBoundHits: canonical.rows[0].n,
      bindRate: lexical.rows[0].n > 0 ? canonical.rows[0].n / lexical.rows[0].n : null,
    });
  }

  await pool.query('ROLLBACK');

  const bc = report.baseCoverage;
  const totalHits = report.perQueryResults.reduce((s, r) => s + r.rawLexicalHits, 0);
  const totalBound = report.perQueryResults.reduce((s, r) => s + r.canonicalBoundHits, 0);
  report.summary = {
    exactJoinCoverageOfChunks: bc.chunks_with_ref_and_hash > 0
      ? bc.exact_source_ref_content_hash_matches / bc.chunks_with_ref_and_hash : 0,
    atlasPacketsContentHashPopulationRate: bc.atlas_packets_total > 0
      ? bc.atlas_packets_content_hash_populated / bc.atlas_packets_total : 0,
    totalFrozenQueryLexicalHits: totalHits,
    totalFrozenQueryCanonicalBoundHits: totalBound,
    overallBindRate: totalHits > 0 ? totalBound / totalHits : null,
  };
  report.recommendation = report.summary.atlasPacketsContentHashPopulationRate === 0
    ? 'DO_NOT_PROMOTE: atlas_packets.content_hash is 0% populated, so the exact ' +
      '(source_ref, content_hash) join structurally cannot bind any row right now — ' +
      'this is a hash-semantics/population gap in atlas_packets, not a query bug. ' +
      'Per explicit instruction, do NOT relax the join to source_ref-only as a fix — ' +
      'that reintroduces ambiguous-match risk (see ambiguous_source_ref_groups below). ' +
      'The real fix is backfilling atlas_packets.content_hash from its own source of truth ' +
      'before this adapter can bind any canonical packet_key. An existing '
      + 'chunk-to-packet bridge is reported separately, but it is partial and '
      + 'does not replace the hash-qualified staleness check.'
    : report.summary.exactJoinCoverageOfChunks < 0.5
      ? 'LOW_COVERAGE: investigate hash-semantics mismatch before promoting.'
      : 'COVERAGE_ACCEPTABLE_FOR_FURTHER_EVAL';
} catch (error) {
  report.status = 'ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  baseCoverage: report.baseCoverage,
  summary: report.summary,
  recommendation: report.recommendation,
  reportPath: path.relative(REPO_ROOT, REPORT_PATH).replaceAll('\\', '/'),
}, null, 2));
