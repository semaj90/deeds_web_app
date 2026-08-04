#!/usr/bin/env node
/**
 * READ-ONLY audit of the existing codebase_chunk_index.metadata->>'packet_key'
 * corpus. Does NOT derive or write new packet_key values — it classifies
 * whether the existing 14,643 populated keys are usable as ground truth
 * for a future derivation formula.
 *
 * No mutation anywhere. No candidate derivation is proposed here — see
 * report Recommendation section for why.
 */
import { writeFileSync } from 'node:fs';
import pg from 'pg';

const OUT = 'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-key-grain-audit-2026-08-04.json';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 4,
});

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const [total] = await q(`SELECT COUNT(*)::int AS n FROM codebase_chunk_index`);
const [withKey] = await q(`SELECT COUNT(*)::int AS n FROM codebase_chunk_index WHERE metadata->>'packet_key' IS NOT NULL`);
const [distinctKeys] = await q(`SELECT COUNT(DISTINCT metadata->>'packet_key')::int AS n FROM codebase_chunk_index WHERE metadata->>'packet_key' IS NOT NULL`);

// Lane classification of existing keys
const [uuidPassthroughQdrant] = await q(
  `SELECT COUNT(*)::int AS n FROM codebase_chunk_index WHERE metadata->>'packet_key' = qdrant_id::text`
);
const [uuidPassthroughSelfId] = await q(
  `SELECT COUNT(*)::int AS n FROM codebase_chunk_index WHERE metadata->>'packet_key' = id::text`
);
const [sha256Lane] = await q(
  `SELECT COUNT(*)::int AS n FROM codebase_chunk_index WHERE metadata->>'packet_key' LIKE 'sha256:%'`
);
const [otherFormat] = await q(
  `SELECT COUNT(*)::int AS n FROM codebase_chunk_index
   WHERE metadata->>'packet_key' IS NOT NULL
     AND metadata->>'packet_key' NOT LIKE 'sha256:%'
     AND metadata->>'packet_key' != qdrant_id::text`
);

// Does the UUID lane match any other plausible canonical registry?
const [matchAtlasPacketKey] = await q(
  `SELECT COUNT(*)::int AS n FROM codebase_chunk_index c JOIN atlas_packets a ON a.packet_key = c.metadata->>'packet_key'`
);
const [matchAtlasPacketId] = await q(
  `SELECT COUNT(*)::int AS n FROM codebase_chunk_index c JOIN atlas_packets a ON a.packet_id = c.metadata->>'packet_key'`
);
const [matchOtherChunkId] = await q(
  `SELECT COUNT(*)::int AS n FROM codebase_chunk_index c1 JOIN codebase_chunk_index c2 ON c2.id::text = c1.metadata->>'packet_key' WHERE c1.metadata->>'packet_key' IS NOT NULL`
);

// Multi-row-same-key (collisions within the existing corpus)
const multiRowGroups = await q(
  `SELECT metadata->>'packet_key' AS pk, COUNT(*)::int AS n
   FROM codebase_chunk_index WHERE metadata->>'packet_key' IS NOT NULL
   GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 10`
);
const [multiRowTotal] = await q(
  `SELECT COUNT(*)::int AS n FROM (
     SELECT metadata->>'packet_key' FROM codebase_chunk_index WHERE metadata->>'packet_key' IS NOT NULL
     GROUP BY 1 HAVING COUNT(*) > 1
   ) x`
);

// Sample sha256-lane collision: are colliding rows genuinely same-content
// duplicates (same source_ref, empty content_hash — the known re-index dup bug)?
const sha256Sample = multiRowGroups.length
  ? await q(
      `SELECT DISTINCT source_ref, content_hash FROM codebase_chunk_index
       WHERE metadata->>'packet_key' = $1 LIMIT 5`,
      [multiRowGroups.find((g) => g.pk.startsWith('sha256:'))?.pk ?? multiRowGroups[0].pk]
    )
  : [];

const [emptyContentHash] = await q(`SELECT COUNT(*)::int AS n FROM codebase_chunk_index WHERE content_hash IS NULL OR content_hash = ''`);

await pool.end();

const report = {
  report: 'packet-key-grain-audit',
  date: '2026-08-04',
  read_only: true,
  mutation_performed: false,
  corpus: {
    total_rows: total.n,
    rows_with_packet_key: withKey.n,
    coverage_percent: Number(((withKey.n / total.n) * 100).toFixed(1)),
    distinct_key_values: distinctKeys.n,
  },
  lane_classification: {
    uuid_equals_qdrant_id_passthrough: uuidPassthroughQdrant.n,
    uuid_equals_own_row_id: uuidPassthroughSelfId.n,
    sha256_content_hash_lane: sha256Lane.n,
    other_unclassified_format: otherFormat.n,
  },
  cross_reference: {
    // "canonical" candidacy checks — does the UUID lane point at any real registry?
    matches_atlas_packets_packet_key: matchAtlasPacketKey.n,
    matches_atlas_packets_packet_id: matchAtlasPacketId.n,
    matches_another_chunk_rows_id: matchOtherChunkId.n,
  },
  collisions: {
    MULTI_ROW_SAME_KEY: multiRowTotal.n,
    top_colliding_keys: multiRowGroups,
    sha256_collision_sample_rows: sha256Sample,
  },
  data_quality_context: {
    empty_content_hash_rows: emptyContentHash.n,
    empty_content_hash_percent: Number(((emptyContentHash.n / total.n) * 100).toFixed(1)),
    note: 'content_hash emptiness correlates with the duplicate-row re-indexing defect fixed in canonical-join-missing-root-cause-2026-08-04.md',
  },
  metrics: {
    EXISTING_KEY_MATCH_RATE: 'NOT_COMPUTABLE — the UUID lane (90.5% of populated keys) is a qdrant_id passthrough, not an independently-derived identity; there is no third-party ground truth to compare a new formula against for this lane',
    DERIVATION_COLLISIONS: 'NOT_APPLICABLE — no derivation formula was run against the corpus (see recommendation)',
    MULTI_ROW_SAME_KEY: multiRowTotal.n,
    MULTI_KEY_SAME_LOGICAL_PACKET: 'NOT_PROVEN — cannot assess without a proven logical-packet definition',
    UNRESOLVED_INPUT_FIELDS: ['repository_id (not present in schema)', 'workspace_revision (present but 0% populated on chunk rows per session-183/188)', 'chunk ordinal / exact span (not present as columns)'],
  },
  promotion_gate: {
    collision_count_zero: false,
    non_deterministic_keys_zero: 'NOT_PROVEN',
    grain_alignment: 'FAIL',
    result: 'FAIL — do not proceed to backfill',
  },
  recommendation: [
    "90.5% of existing packet_key values (13,251/14,643) are byte-identical to metadata->>'packet_key' = qdrant_id::text — this is NOT a derived canonical packet identity, it is qdrant_id copied into a differently-named field. It carries zero additional semantic grain (no file/chunk/symbol distinction) and does not match atlas_packets by packet_key, packet_id, or any other chunk row's id.",
    '9.5% (1,392/14,643) are sha256:<hex> content-hash keys. These collide across up to 9 rows for the same key; the colliding rows share source_ref and have EMPTY content_hash — consistent with the same duplicate-row re-indexing defect just fixed in hydrate-candidates.ts, not a derivation bug. This lane is a plausible seed for a real content-addressed grain but is entangled with the duplicate-row problem and needs de-duplication upstream first.',
    'CONCLUSION: the existing 14,643-key corpus cannot serve as a training/validation set for a new derivation formula as-is. Recommend: (1) do not backfill the missing 37,774 rows from either existing lane, (2) fix upstream duplicate-row insertion first (same root cause as canonical_join_missing), (3) then design the packet_key grain (file vs chunk vs symbol) as an explicit architectural decision — not inferable from this data — before any derivation or backfill proceeds.',
  ],
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ corpus: report.corpus, lane_classification: report.lane_classification, cross_reference: report.cross_reference, collisions: { MULTI_ROW_SAME_KEY: report.collisions.MULTI_ROW_SAME_KEY }, promotion_gate: report.promotion_gate }, null, 2));
console.log('Report:', OUT);
