#!/usr/bin/env node
/**
 * PACKET-CHUNK-LINEAGE-CONTRACT-01A -- read-only granularity proof.
 *
 * Question: is atlas_packets truly FILE granularity (one row per source_ref)
 * across live writers, or do different writers disagree (mixed granularity)?
 * Must not assume the answer from register-orphaned-chunks.mjs's design alone.
 *
 * Usage: npx tsx scripts/atlas/packet-chunk-lineage-contract-01a.mts
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 1. source_kind distribution -- a strong proxy for "which writer produced this row"
  const { rows: sourceKindDist } = await pool.query(`
    SELECT COALESCE(source_kind, '(null)') AS source_kind, count(*)::int AS n
    FROM atlas_packets
    GROUP BY source_kind
    ORDER BY n DESC
  `);

  // 2. Within source_kind='codebase_chunk' (register-orphaned-chunks.mjs's own marker),
  //    is packet_key truly unique per source_ref (file-level), or does it vary per chunk?
  const { rows: codebaseChunkGranularity } = await pool.query(`
    SELECT
      count(*)::int AS total_rows,
      count(DISTINCT source_ref)::int AS distinct_source_refs,
      count(DISTINCT packet_key)::int AS distinct_packet_keys,
      count(*) FILTER (WHERE packet_key IS NULL)::int AS null_packet_key
    FROM atlas_packets
    WHERE source_kind = 'codebase_chunk'
  `);

  // 3. Does any source_ref have MULTIPLE atlas_packets rows (would indicate
  //    per-chunk packet creation somewhere, contradicting file-level assumption)?
  const { rows: multiPacketPerSourceRef } = await pool.query(`
    SELECT source_ref, count(*)::int AS packet_count, array_agg(DISTINCT source_kind) AS source_kinds
    FROM atlas_packets
    WHERE source_ref IS NOT NULL
    GROUP BY source_ref
    HAVING count(*) > 1
    ORDER BY packet_count DESC
    LIMIT 20
  `);
  const { rows: multiPacketPerSourceRefTotal } = await pool.query(`
    SELECT count(*)::int AS source_refs_with_multiple_packets
    FROM (
      SELECT source_ref FROM atlas_packets WHERE source_ref IS NOT NULL
      GROUP BY source_ref HAVING count(*) > 1
    ) x
  `);

  // 4. Chunks-per-source_ref distribution on the codebase_chunk_index side,
  //    bucketed, to characterize the real fan-out shape (not just count it).
  const { rows: chunkFanoutBuckets } = await pool.query(`
    WITH per_source AS (
      SELECT relative_path AS source_ref, count(*)::int AS chunk_count
      FROM codebase_chunk_index
      WHERE NULLIF(btrim(relative_path), '') IS NOT NULL
      GROUP BY relative_path
    )
    SELECT
      count(*) FILTER (WHERE chunk_count = 1)::int AS "1",
      count(*) FILTER (WHERE chunk_count BETWEEN 2 AND 5)::int AS "2_5",
      count(*) FILTER (WHERE chunk_count BETWEEN 6 AND 20)::int AS "6_20",
      count(*) FILTER (WHERE chunk_count > 20)::int AS "20_plus",
      count(*)::int AS total_source_refs,
      max(chunk_count)::int AS max_chunks_for_one_source
    FROM per_source
  `);

  // 5. Does every atlas_packets row with source_kind='codebase_chunk' have
  //    EXACTLY ONE corresponding source_ref match, confirming 1-packet-per-file
  //    intent (not 1-packet-per-chunk elsewhere)?
  const { rows: packetKeyUniquenessPerSourceRef } = await pool.query(`
    SELECT count(*)::int AS violating_source_refs
    FROM (
      SELECT source_ref, count(DISTINCT packet_key)::int AS distinct_keys
      FROM atlas_packets
      WHERE source_kind = 'codebase_chunk' AND source_ref IS NOT NULL
      GROUP BY source_ref
      HAVING count(DISTINCT packet_key) > 1
    ) v
  `);

  const report = {
    schema: 'atlas.packet-chunk-lineage-contract-01a.v1',
    task: 'PACKET-CHUNK-LINEAGE-CONTRACT-01A',
    readOnly: true,
    writesPerformed: false,
    purpose: 'Prove whether atlas_packets is uniformly FILE-granularity across live writers, or whether granularity is mixed/disputed, before freezing PacketChunkMembershipV1.',
    sourceKindDistribution: sourceKindDist,
    codebaseChunkWriterGranularity: {
      ...codebaseChunkGranularity[0],
      interpretation: 'If distinct_packet_keys ~= distinct_source_refs (both roughly equal to total_rows), register-orphaned-chunks.mjs is confirmed strictly file-granularity: one packet per source_ref, no per-chunk packet creation from this writer.',
    },
    multiPacketPerSourceRef: {
      totalSourceRefsWithMultiplePackets: multiPacketPerSourceRefTotal[0]?.source_refs_with_multiple_packets ?? 0,
      interpretation: multiPacketPerSourceRefTotal[0]?.source_refs_with_multiple_packets > 0
        ? 'NON-ZERO -- at least one source_ref has more than one atlas_packets row. This means granularity is NOT uniformly file-level across all writers -- some writer(s) create multiple packets for the same file (possibly chunk-level or feature-level splits). Must be investigated before assuming FILE-only granularity.'
        : 'ZERO -- no source_ref has more than one atlas_packets row anywhere in the corpus. Strong evidence that FILE granularity is a REPO-WIDE INVARIANT, not just this one writer\'s local design choice.',
      samples: multiPacketPerSourceRef,
    },
    packetKeyUniquenessPerSourceRefViolations: packetKeyUniquenessPerSourceRef[0]?.violating_source_refs ?? 0,
    chunkFanoutShape: chunkFanoutBuckets[0],
  };

  console.log(JSON.stringify(report, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-lineage-contract-01a-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
