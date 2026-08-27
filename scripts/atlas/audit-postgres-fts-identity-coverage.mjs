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

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/postgres-fts-canonical-coverage-v2.json');

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
const statementTimeoutMs = Number(process.env.ATLAS_FTS_AUDIT_TIMEOUT_MS || 60000);
const maxQueries = Math.max(1, Math.min(FROZEN_QUERIES.length,
  Number(process.env.ATLAS_FTS_AUDIT_MAX_QUERIES || FROZEN_QUERIES.length)));
const auditQueries = FROZEN_QUERIES.slice(0, maxQueries);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: statementTimeoutMs,
});

const report = {
  schema: 'atlas.postgres-fts-canonical-coverage.v2',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  baseCoverage: null,
  frozenQueries: FROZEN_QUERIES,
  queriesRequested: auditQueries,
  statementTimeoutMs,
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

  // ---- Per-frozen-query: one lexical lane, two alternative identity lanes ----
  for (const query of auditQueries) {
    try {
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
      exact AS (
        SELECT l.lexical_id, p.packet_key
        FROM lexical l
        JOIN public.atlas_packets AS p
          ON p.source_ref = l.source_ref AND p.content_hash = l.content_hash
        WHERE p.packet_key IS NOT NULL AND p.feature_id IS NOT NULL
      ),
      bridge AS (
        SELECT l.lexical_id, p.packet_key
        FROM lexical l
        JOIN public.atlas_chunk_packet_identity_links link
          ON link.chunk_index_id = l.lexical_id::uuid
         AND link.match_method = 'EXACT_CANONICAL_ID'
        JOIN public.atlas_packets p ON p.packet_key = link.canonical_packet_key
        WHERE p.packet_key IS NOT NULL AND p.feature_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM exact e WHERE e.lexical_id = l.lexical_id
          )
      ),
      resolved AS (
        SELECT lexical_id, packet_key FROM exact
        UNION
        SELECT lexical_id, packet_key FROM bridge
      ),
      rejected AS (
        SELECT DISTINCT l.lexical_id, link.match_method
        FROM lexical l
        JOIN public.atlas_chunk_packet_identity_links link
          ON link.chunk_index_id = l.lexical_id::uuid
        WHERE link.match_method IN ('AMBIGUOUS', 'UNRESOLVED')
      )
      SELECT
        (SELECT count(*)::int FROM lexical) AS raw_lexical_hits,
        (SELECT count(DISTINCT lexical_id)::int FROM exact) AS hash_exact_hits,
        (SELECT count(DISTINCT lexical_id)::int FROM bridge) AS bridge_exact_canonical_hits,
        (SELECT count(DISTINCT e.lexical_id)::int FROM exact e JOIN bridge b USING (lexical_id)) AS overlap_between_lanes,
        (SELECT count(DISTINCT packet_key)::int FROM resolved) AS deduplicated_canonical_hits,
        (SELECT count(DISTINCT lexical_id)::int FROM rejected WHERE match_method = 'AMBIGUOUS') AS ambiguous_rejected,
        (SELECT count(DISTINCT lexical_id)::int FROM rejected WHERE match_method = 'UNRESOLVED') AS unresolved_rejected
    `, [query]);
      const row = canonical.rows[0];
      const result = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
      report.perQueryResults.push({
        query,
        rawLexicalHits: result.raw_lexical_hits,
        hashExactHits: result.hash_exact_hits,
        bridgeExactCanonicalHits: result.bridge_exact_canonical_hits,
        overlapBetweenLanes: result.overlap_between_lanes,
        deduplicatedCanonicalHits: result.deduplicated_canonical_hits,
        ambiguousRejected: result.ambiguous_rejected,
        unresolvedRejected: result.unresolved_rejected,
        bindRate: result.raw_lexical_hits > 0 ? result.deduplicated_canonical_hits / result.raw_lexical_hits : null,
      });
    } catch (error) {
      report.perQueryResults.push({
        query,
        status: 'QUERY_TIMEOUT_OR_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await pool.query('ROLLBACK');

  const bc = report.baseCoverage;
  const successfulQueries = report.perQueryResults.filter((r) => Number.isFinite(r.rawLexicalHits));
  const totalHits = successfulQueries.reduce((s, r) => s + r.rawLexicalHits, 0);
  const totalHashExact = successfulQueries.reduce((s, r) => s + r.hashExactHits, 0);
  const totalBridgeExact = successfulQueries.reduce((s, r) => s + r.bridgeExactCanonicalHits, 0);
  const totalOverlap = successfulQueries.reduce((s, r) => s + r.overlapBetweenLanes, 0);
  const totalBound = successfulQueries.reduce((s, r) => s + r.deduplicatedCanonicalHits, 0);
  const ambiguousRejected = successfulQueries.reduce((s, r) => s + r.ambiguousRejected, 0);
  const unresolvedRejected = successfulQueries.reduce((s, r) => s + r.unresolvedRejected, 0);
  report.summary = {
    exactJoinCoverageOfChunks: bc.chunks_with_ref_and_hash > 0
      ? bc.exact_source_ref_content_hash_matches / bc.chunks_with_ref_and_hash : 0,
    atlasPacketsContentHashPopulationRate: bc.atlas_packets_total > 0
      ? bc.atlas_packets_content_hash_populated / bc.atlas_packets_total : 0,
    successfulFrozenQueries: successfulQueries.length,
    timedOutOrFailedFrozenQueries: report.perQueryResults.length - successfulQueries.length,
    rawLexicalHits: totalHits,
    hashExactHits: totalHashExact,
    bridgeExactCanonicalHits: totalBridgeExact,
    overlapBetweenLanes: totalOverlap,
    deduplicatedCanonicalHits: totalBound,
    ambiguousRejected,
    unresolvedRejected,
    overallBindRate: totalHits > 0 ? totalBound / totalHits : null,
  };
  report.recommendation = report.summary.timedOutOrFailedFrozenQueries > 0
    ? 'DO_NOT_PROMOTE: combined coverage is partial because one or more frozen queries timed out or failed; rerun with a bounded query set.'
    : totalBound > 0
      ? 'CONTINUE_REVIEW: hash-exact and exact-canonical bridge are alternative identity lanes in one lexical result set; do not count them as separate relevance votes.'
      : 'DO_NOT_PROMOTE: no canonical candidates were bound; preserve strict identity rejection.';
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
