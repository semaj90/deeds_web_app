#!/usr/bin/env node
/**
 * PKT-LINEAGE-10 (BRIDGE-RECON-DRY-03) -- READ ONLY.
 *
 * Reconciles the now-canonical `atlas_packet_chunk_lineage` (packet_key, canonical_chunk_id,
 * chunk_row_id) rows against live Qdrant `codebase_chunks_768_v2` points. Consumes ONLY the
 * physical canonical rows from atlas_packet_chunk_lineage -- never `packet.source_ref -> all
 * chunks with same file path` fanout. Each row's `chunk_row_id` (codebase_chunk_index.id, a UUID)
 * is the join key into Qdrant, per the proven `physicalPointId === canonicalPacketIdentity`
 * mapping (QDRANT-D-IDENTITY-01).
 *
 * ZERO writes to Qdrant, Postgres, Neo4j, or Redis. Outputs an exact proposed Qdrant mutation set
 * (payload patches only) without applying any of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const REPORT_PATH = path.resolve(root, 'docs/reports/bridge-recon-dry-03-v1.json');
const QDRANT_COLLECTION = 'codebase_chunks_768_v2';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function fetchQdrantPointsBatch(ids) {
  const map = new Map();
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: slice, with_payload: true, with_vector: false }),
    });
    if (!res.ok) throw new Error(`Qdrant points retrieve failed HTTP ${res.status} for batch starting at ${i}`);
    const data = await res.json();
    for (const point of data.result ?? []) map.set(String(point.id), point);
  }
  return map;
}

// ---- Load canonical lineage rows (the ONLY input to this reconciliation) ----
const { rows: lineageRows } = await pool.query(`
  SELECT packet_key, canonical_chunk_id, chunk_row_id::text AS chunk_row_id, source_ref,
         source_namespace, source_revision
  FROM atlas_packet_chunk_lineage
  ORDER BY packet_key, canonical_chunk_id
`);
await pool.end();

const distinctChunkRowIds = [...new Set(lineageRows.map((r) => r.chunk_row_id))];
const qdrantPoints = await fetchQdrantPointsBatch(distinctChunkRowIds);

const classifications = [];
const counts = {
  EXACT_CANONICAL_MEMBERSHIP: 0,
  ALREADY_RECONCILED: 0,
  QDRANT_POINT_MISSING: 0,
  PROJECTION_REGISTRY_MISSING: 0,
  PAYLOAD_IDENTITY_CONFLICT: 0,
  REVISION_MISMATCH: 0,
  FOREIGN_CHUNK: 0,
};
const proposedMutations = [];

for (const row of lineageRows) {
  const point = qdrantPoints.get(row.chunk_row_id);
  let classification;
  let mutation = null;

  if (!point) {
    classification = 'QDRANT_POINT_MISSING';
  } else {
    const payload = point.payload ?? {};
    const payloadPostgresId = typeof payload.postgres_id === 'string' ? payload.postgres_id : null;
    const payloadPacketKey = typeof payload.packet_key === 'string' ? payload.packet_key : null;
    const payloadCanonicalChunkId = typeof payload.canonical_chunk_id === 'string' ? payload.canonical_chunk_id : null;
    const payloadSourceRevision = typeof payload.source_revision === 'string' ? payload.source_revision
      : (typeof payload.sourceRevision === 'string' ? payload.sourceRevision : null);

    if (payloadPostgresId !== null && payloadPostgresId !== row.chunk_row_id) {
      // The point exists at the expected coordinate but disagrees about which canonical Postgres
      // row it represents -- fail closed, do not propose a mutation.
      classification = 'PAYLOAD_IDENTITY_CONFLICT';
    } else if (payloadPacketKey !== null && payloadPacketKey !== row.packet_key) {
      // The point is self-consistent about its own Postgres row, but Qdrant's payload already
      // attributes it to a DIFFERENT packet than our canonical lineage table does.
      classification = 'FOREIGN_CHUNK';
    } else if (payloadSourceRevision !== null && row.source_revision !== null && payloadSourceRevision !== row.source_revision) {
      classification = 'REVISION_MISMATCH';
    } else if (payloadPacketKey === row.packet_key && payloadCanonicalChunkId === row.canonical_chunk_id) {
      classification = 'ALREADY_RECONCILED';
      counts.ALREADY_RECONCILED += 1;
    } else {
      classification = 'EXACT_CANONICAL_MEMBERSHIP';
      mutation = {
        collection: QDRANT_COLLECTION,
        pointId: row.chunk_row_id,
        op: 'set_payload',
        payloadPatch: {
          packet_key: row.packet_key,
          canonical_chunk_id: row.canonical_chunk_id,
          source_namespace: row.source_namespace,
          ...(row.source_revision ? { source_revision: row.source_revision } : {}),
        },
      };
      proposedMutations.push(mutation);
    }
  }

  counts[classification] += 1;
  classifications.push({
    packetKey: row.packet_key,
    canonicalChunkId: row.canonical_chunk_id,
    chunkRowId: row.chunk_row_id,
    classification,
  });
}

const proposedMutationSetChecksum = sha256(
  JSON.stringify([...proposedMutations].sort((a, b) => a.pointId.localeCompare(b.pointId)))
);

const report = {
  schema: 'atlas.bridge-recon-dry-03.v1',
  task: 'PKT-LINEAGE-10-BRIDGE-RECON-DRY-03',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_BRIDGE_RECONCILIATION',
  readOnly: true,
  writesPerformed: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  inputAuthority: 'atlas_packet_chunk_lineage (packet_key, canonical_chunk_id, chunk_row_id) only -- no source_ref fanout',
  qdrantCollection: QDRANT_COLLECTION,
  lineageRowCount: lineageRows.length,
  distinctChunkRowIdCount: distinctChunkRowIds.length,
  qdrantPointsFound: qdrantPoints.size,
  counts,
  proposedMutationCount: proposedMutations.length,
  proposedMutationSetChecksum: `sha256:${proposedMutationSetChecksum}`,
  classifications,
  proposedMutations,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: REPORT_PATH, lineageRowCount: lineageRows.length, counts, proposedMutationCount: proposedMutations.length, writesPerformed: false }, null, 2));
