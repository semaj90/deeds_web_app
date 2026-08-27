#!/usr/bin/env node
/**
 * Read-only failure-reason census for rejected PostgreSQL FTS candidates.
 * It deliberately preserves the canonical hash and EXACT_CANONICAL_ID rules.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const reportPath = path.join(REPO_ROOT, 'docs/reports/postgres-fts-rejection-reasons-v1.json');
const queries = [
  'IngestionJobStatus', 'GpuConfig', 'SystemStatus', 'ErrorPatchLogInsert',
  'extractLegalEntities', 'CourtroomScene', 'embedding search', 'packet identity',
];
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: Number(process.env.ATLAS_FTS_AUDIT_TIMEOUT_MS || 60000),
});

const report = {
  schema: 'atlas.postgres-fts-rejection-reasons.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  queries,
  classificationRules: {
    MISSING_PACKET_SOURCE_REF: 'No atlas_packets row has the lexical source_ref.',
    HASH_SCOPE_MISMATCH: 'A packet shares source_ref but not the lexical content_hash.',
    MISSING_CHUNK_PACKET_BRIDGE: 'No identity-link row exists for the lexical chunk.',
    AMBIGUOUS_BRIDGE: 'An identity-link row is marked AMBIGUOUS.',
    UNRESOLVED_BRIDGE: 'An identity-link row is marked UNRESOLVED.',
    PACKET_NOT_CANONICAL: 'A candidate packet exists but lacks required canonical fields.',
  },
  counts: {},
  byQuery: [],
  uniqueChunkCount: 0,
};
const uniqueReasons = new Map();
const reasonPriority = new Map([
  ['HASH_EXACT_BOUND', 4],
  ['BRIDGE_EXACT_BOUND', 3],
  ['PACKET_NOT_CANONICAL', 2],
  ['HASH_SCOPE_MISMATCH', 2],
  ['MISSING_PACKET_SOURCE_REF', 1],
  ['AMBIGUOUS_BRIDGE', 1],
  ['UNRESOLVED_BRIDGE', 0],
]);

try {
  await pool.query('BEGIN READ ONLY');
  for (const query of queries) {
    const result = await pool.query(`
      WITH lexical AS (
        SELECT ci.id::text AS chunk_id, ci.source_ref, ci.content_hash
        FROM public.codebase_chunk_index ci
        WHERE ci.search_vector @@ websearch_to_tsquery('english', $1)
          AND ci.source_ref IS NOT NULL AND ci.content_hash IS NOT NULL
        ORDER BY ci.id
        LIMIT 100
      ), packet_stats AS (
        SELECT l.chunk_id,
          count(p.packet_key)::int AS source_ref_packet_count,
          count(p.packet_key) FILTER (WHERE p.content_hash = l.content_hash)::int AS exact_packet_count,
          count(p.packet_key) FILTER (WHERE p.packet_key IS NOT NULL AND p.feature_id IS NOT NULL)::int AS usable_packet_count
        FROM lexical l
        LEFT JOIN public.atlas_packets p ON p.source_ref = l.source_ref
        GROUP BY l.chunk_id
      ), links AS (
        SELECT l.chunk_id,
          count(link.id)::int AS link_count,
          bool_or(link.match_method = 'AMBIGUOUS') AS has_ambiguous,
          bool_or(link.match_method = 'UNRESOLVED') AS has_unresolved,
          bool_or(link.match_method = 'EXACT_CANONICAL_ID' AND p.packet_key IS NOT NULL AND p.feature_id IS NOT NULL) AS has_exact_bridge
        FROM lexical l
        LEFT JOIN public.atlas_chunk_packet_identity_links link ON link.chunk_index_id = l.chunk_id::uuid
        LEFT JOIN public.atlas_packets p ON p.packet_key = link.canonical_packet_key
        GROUP BY l.chunk_id
      ), classified AS (
        SELECT l.chunk_id,
          CASE
            WHEN ps.exact_packet_count > 0 THEN 'HASH_EXACT_BOUND'
            WHEN lk.has_exact_bridge THEN 'BRIDGE_EXACT_BOUND'
            WHEN lk.has_ambiguous THEN 'AMBIGUOUS_BRIDGE'
            WHEN lk.has_unresolved THEN 'UNRESOLVED_BRIDGE'
            WHEN ps.source_ref_packet_count = 0 THEN 'MISSING_PACKET_SOURCE_REF'
            WHEN ps.usable_packet_count = 0 THEN 'PACKET_NOT_CANONICAL'
            ELSE 'HASH_SCOPE_MISMATCH'
          END AS reason
        FROM lexical l
        JOIN packet_stats ps USING (chunk_id)
        JOIN links lk USING (chunk_id)
      )
      SELECT chunk_id, reason
      FROM classified
      ORDER BY chunk_id
    `, [query]);
    const counts = {};
    for (const row of result.rows) {
      counts[row.reason] = (counts[row.reason] || 0) + 1;
      const previous = uniqueReasons.get(row.chunk_id);
      // A bound result wins over a rejection; otherwise retain the strongest
      // rejection so repeated query matches cannot inflate the census.
      if (!previous || (reasonPriority.get(row.reason) || 0) > (reasonPriority.get(previous) || 0)) {
        uniqueReasons.set(row.chunk_id, row.reason);
      }
    }
    report.byQuery.push({ query, counts });
  }
  report.uniqueChunkCount = uniqueReasons.size;
  for (const reason of uniqueReasons.values()) report.counts[reason] = (report.counts[reason] || 0) + 1;
  await pool.query('ROLLBACK');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, counts: report.counts, reportPath }, null, 2));
} finally {
  await pool.end();
}
