#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const ledgerPath = process.argv.find((arg) => arg.startsWith('--ledger='))?.slice('--ledger='.length)
  || '.tmp/qdrant-identity-final.ndjson';
const reportPath = process.argv.find((arg) => arg.startsWith('--report='))?.slice('--report='.length)
  || 'docs/reports/qdrant-postgres-parity-manifest-v1.json';
const databaseUrl = process.env.DATABASE_URL
  || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function checksum(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

if (!existsSync(ledgerPath)) {
  throw new Error(`PARITY_MANIFEST_REQUIRES_COMPLETED_LEDGER:${ledgerPath}`);
}

const entries = readFileSync(ledgerPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const laneCounts = {};
const exceptions = [];
for (const entry of entries) {
  laneCounts[entry.classification_lane] = (laneCounts[entry.classification_lane] || 0) + 1;
  if (!['EXACT_ATLAS_PACKET_KEY', 'EXACT_CHUNK_QDRANT_ID'].includes(entry.classification_lane)) {
    exceptions.push({
      qdrantPointId: entry.qdrant_point_id,
      lane: entry.classification_lane,
      matchType: entry.match_type,
      payloadPacketKey: entry.payload_packet_key,
      payloadSourceRef: entry.payload_source_ref,
      evidence: entry.evidence,
      disposition: entry.classification_lane === 'AMBIGUOUS_SOURCE_REF'
        ? 'RETAIN_UNRESOLVED_CROSS_TABLE_SOURCE'
        : 'RETAIN_UNRESOLVED_NONCANONICAL_PROJECTION',
      safeToRepair: false,
    });
  }
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM atlas_packets) AS atlas_packets,
      (SELECT count(DISTINCT packet_key)::int FROM atlas_packets WHERE packet_key IS NOT NULL) AS distinct_packet_keys,
      (SELECT count(*)::int FROM atlas_packets WHERE qdrant_point_id IS NOT NULL) AS atlas_packets_with_qdrant_id,
      (SELECT count(DISTINCT qdrant_point_id)::int FROM atlas_packets WHERE qdrant_point_id IS NOT NULL) AS distinct_packet_qdrant_ids,
      (SELECT count(*)::int FROM codebase_chunk_index) AS codebase_chunks,
      (SELECT count(DISTINCT qdrant_id)::int FROM codebase_chunk_index WHERE qdrant_id IS NOT NULL) AS distinct_chunk_qdrant_ids,
      (SELECT count(*)::int FROM atlas_packets a JOIN codebase_chunk_index c ON c.qdrant_id = a.qdrant_point_id) AS packet_chunk_qdrant_overlap,
      (SELECT count(*)::int FROM atlas_packets WHERE qdrant_point_id IS NOT NULL)
        - (SELECT count(DISTINCT qdrant_point_id)::int FROM atlas_packets WHERE qdrant_point_id IS NOT NULL) AS duplicate_packet_qdrant_rows,
      (SELECT count(*)::int FROM (
        SELECT qdrant_point_id FROM atlas_packets
        WHERE qdrant_point_id IS NOT NULL
        GROUP BY qdrant_point_id HAVING count(*) > 1
      ) duplicate_groups) AS duplicate_packet_qdrant_groups
  `);
  const db = result.rows[0];
  const manifest = {
    schema: 'atlas.qdrant-postgres-parity-manifest.v1',
    generatedAt: new Date().toISOString(),
    ledger: ledgerPath,
    qdrantCollection: 'codebase_chunks_768',
    readOnly: true,
    census: {
      auditedPoints: entries.length,
      laneCounts,
      exactIdentityCount: (laneCounts.EXACT_ATLAS_PACKET_KEY || 0) + (laneCounts.EXACT_CHUNK_QDRANT_ID || 0),
      exceptionalIdentityCount: exceptions.length,
    },
    postgres: {
      atlasPackets: db.atlas_packets,
      distinctPacketKeys: db.distinct_packet_keys,
      atlasPacketsWithQdrantId: db.atlas_packets_with_qdrant_id,
      distinctPacketQdrantIds: db.distinct_packet_qdrant_ids,
      codebaseChunks: db.codebase_chunks,
      distinctChunkQdrantIds: db.distinct_chunk_qdrant_ids,
    },
    reconciliation: {
      packetChunkQdrantOverlap: db.packet_chunk_qdrant_overlap,
      packetOnlyQdrantIds: db.distinct_packet_qdrant_ids - db.packet_chunk_qdrant_overlap,
      chunkOnlyQdrantIds: db.distinct_chunk_qdrant_ids - db.packet_chunk_qdrant_overlap,
      duplicatePacketQdrantRows: db.duplicate_packet_qdrant_rows,
      duplicatePacketQdrantGroups: db.duplicate_packet_qdrant_groups,
      policy: 'PRESERVE_PACKET_AND_CHUNK_IDENTITIES_SEPARATELY; RECONCILE_ONLY_BY_EXACT_REVISION_QUALIFIED_LINEAGE',
    },
    exceptions,
    promotion: {
      eligible: false,
      reason: exceptions.length === 0
        ? 'POPULATION_SPLIT_REQUIRES_EXPLICIT_PARITY_POLICY'
        : 'UNRESOLVED_QDRANT_IDENTITY_EXCEPTIONS',
      writesPerformed: false,
    },
  };
  manifest.manifestChecksum = checksum(manifest);
  writeFileSync(reportPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    reportPath,
    auditedPoints: manifest.census.auditedPoints,
    exactIdentityCount: manifest.census.exactIdentityCount,
    exceptionalIdentityCount: manifest.census.exceptionalIdentityCount,
    promotionEligible: manifest.promotion.eligible,
    writesPerformed: manifest.promotion.writesPerformed,
    manifestChecksum: manifest.manifestChecksum,
  }, null, 2));
} finally {
  await pool.end();
}
