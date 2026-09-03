#!/usr/bin/env node
/**
 * BRIDGE-RECON-DRY-04 -- fail-closed, read-only Qdrant lineage reconciliation.
 *
 * The only identity input is atlas_packet_chunk_lineage.  Its chunk_row_id is
 * resolved through the already-proven physical projection owner used by the
 * Qdrant D-identity canary; source_ref/content_hash and packet grouping are
 * never used to discover or select a point.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const artifactArg = process.argv.find((arg) => arg.startsWith('--artifact-path='));
const reportPath = path.resolve(root, artifactArg?.split('=').slice(1).join('=') || 'docs/reports/bridge-recon-dry-04-v1.json');
const collection = process.env.ATLAS_QDRANT_LINEAGE_COLLECTION ?? 'codebase_chunks_768_v2';
const vectorName = process.env.ATLAS_QDRANT_LINEAGE_VECTOR ?? 'content';
const qdrantUrl = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, statement_timeout: 120000 });

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());
const payloadChecksum = (value) => sha256(stable(value ?? {}));

function vectorFingerprint(point) {
  const vector = point?.vector;
  const selected = vector && typeof vector === 'object' && !Array.isArray(vector)
    ? vector[vectorName]
    : vector;
  return {
    present: Array.isArray(selected),
    dimension: Array.isArray(selected) ? selected.length : null,
    checksum: Array.isArray(selected) ? sha256(JSON.stringify(selected)) : null,
  };
}

async function retrieve(ids) {
  const points = new Map();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ids.slice(offset, offset + 200), with_payload: true, with_vector: true }),
    });
    if (!response.ok) throw new Error(`QDRANT_RETRIEVE_FAILED:${response.status}:${offset}`);
    for (const point of (await response.json()).result ?? []) points.set(String(point.id), point);
  }
  return points;
}

const { rows } = await pool.query(`
  SELECT packet_key, canonical_chunk_id, chunk_row_id::text AS chunk_row_id,
         source_namespace, source_revision
    FROM atlas_packet_chunk_lineage
   ORDER BY packet_key, canonical_chunk_id, chunk_row_id
`);
await pool.end();

const duplicateMemberships = rows.length - new Set(rows.map((r) => `${r.packet_key}\0${r.canonical_chunk_id}`)).size;
const pointIds = [...new Set(rows.map((r) => r.chunk_row_id))];
const points = await retrieve(pointIds);
const classifications = [];
const patches = [];
const counts = Object.fromEntries([
  'ALREADY_RECONCILED', 'EXACT_PATCH_REQUIRED', 'QDRANT_POINT_MISSING',
  'PREIMAGE_DRIFT', 'IDENTITY_CONFLICT', 'REVISION_MISMATCH', 'FOREIGN_CHUNK',
].map((key) => [key, 0]));

for (const row of rows) {
  const point = points.get(row.chunk_row_id);
  const expectedPatch = {
    packet_key: row.packet_key,
    canonical_chunk_id: row.canonical_chunk_id,
    ...(row.source_namespace ? { source_namespace: row.source_namespace } : {}),
    ...(row.source_revision ? { source_revision: row.source_revision } : {}),
  };
  let classification = 'QDRANT_POINT_MISSING';
  let currentPayload = null;
  let currentVector = null;
  if (point) {
    currentPayload = point.payload ?? {};
    currentVector = vectorFingerprint(point);
    const postgresId = currentPayload.postgres_id == null ? null : String(currentPayload.postgres_id);
    const pointPacket = currentPayload.packet_key == null ? null : String(currentPayload.packet_key);
    const pointChunk = currentPayload.canonical_chunk_id == null ? null : String(currentPayload.canonical_chunk_id);
    const pointRevision = currentPayload.source_revision ?? currentPayload.sourceRevision ?? null;
    if (String(point.id) !== row.chunk_row_id || (postgresId && postgresId !== row.chunk_row_id)) {
      classification = 'IDENTITY_CONFLICT';
    } else if (pointPacket && pointPacket !== row.packet_key || pointChunk && pointChunk !== row.canonical_chunk_id) {
      classification = 'FOREIGN_CHUNK';
    } else if (pointRevision && row.source_revision && pointRevision !== row.source_revision) {
      classification = 'REVISION_MISMATCH';
    } else {
      const proposedPayload = { ...currentPayload, ...expectedPatch };
      classification = stable(currentPayload) === stable(proposedPayload)
        ? 'ALREADY_RECONCILED'
        : 'EXACT_PATCH_REQUIRED';
      if (classification === 'EXACT_PATCH_REQUIRED') {
        patches.push({
          collection, vectorName, physicalPointId: row.chunk_row_id,
          packetKey: row.packet_key, canonicalChunkId: row.canonical_chunk_id,
          sourceNamespace: row.source_namespace ?? null, sourceRevision: row.source_revision ?? null,
          currentPayloadChecksum: payloadChecksum(currentPayload),
          proposedPayloadChecksum: payloadChecksum(proposedPayload),
          vectorFingerprint: currentVector,
          payloadPatch: expectedPatch,
          preimagePayload: currentPayload,
          evidenceRefs: ['atlas_packet_chunk_lineage', 'QDRANT-D-IDENTITY-01'],
        });
      }
    }
  }
  counts[classification] += 1;
  classifications.push({
    packetKey: row.packet_key,
    canonicalChunkId: row.canonical_chunk_id,
    canonicalChunkRowId: row.chunk_row_id,
    physicalPointId: point ? String(point.id) : null,
    classification,
    currentPayloadChecksum: point ? payloadChecksum(currentPayload) : null,
    proposedPayloadChecksum: point ? payloadChecksum({ ...currentPayload, ...expectedPatch }) : null,
    vectorFingerprint: currentVector,
    evidenceRefs: ['atlas_packet_chunk_lineage', 'QDRANT-D-IDENTITY-01'],
  });
}

const targetPointSetChecksum = sha256(JSON.stringify(patches.map((p) => p.physicalPointId).sort()));
const proposedPatchSetChecksum = sha256(JSON.stringify(patches.slice().sort((a, b) => a.physicalPointId.localeCompare(b.physicalPointId))));
const preimageEntries = patches.map((p) => ({
  physicalPointId: p.physicalPointId,
  currentPayloadChecksum: p.currentPayloadChecksum,
  vectorFingerprint: p.vectorFingerprint,
})).sort((a, b) => a.physicalPointId.localeCompare(b.physicalPointId));
const rollbackEntries = patches.map((p) => ({
  physicalPointId: p.physicalPointId,
  restorePayload: p.preimagePayload,
})).sort((a, b) => a.physicalPointId.localeCompare(b.physicalPointId));
const preimageChecksum = sha256(JSON.stringify(preimageEntries));
const rollbackChecksum = sha256(JSON.stringify(rollbackEntries));
const blockingCount = counts.PREIMAGE_DRIFT + counts.IDENTITY_CONFLICT + counts.REVISION_MISMATCH + counts.FOREIGN_CHUNK + duplicateMemberships;
const report = {
  schema: 'atlas.bridge-recon-dry-04.v1',
  task: 'BRIDGE-RECON-DRY-04',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_FAIL_CLOSED_RECONCILIATION',
  inputAuthority: 'atlas_packet_chunk_lineage(packet_key, canonical_chunk_id, chunk_row_id) only',
  collection, vectorName,
  lineageMembershipCount: rows.length,
  distinctPhysicalPointIdCount: pointIds.length,
  qdrantPointsFound: points.size,
  duplicateMembershipCount: duplicateMemberships,
  counts,
  targetPointSetChecksum,
  proposedPatchSetChecksum,
  proposalArtifact: {
    proposalChecksum: proposedPatchSetChecksum,
    targetPointSetChecksum,
    patchCount: patches.length,
  },
  preimageArtifact: {
    entryCount: preimageEntries.length,
    checksum: preimageChecksum,
  },
  rollbackArtifact: {
    entryCount: rollbackEntries.length,
    checksum: rollbackChecksum,
    supported: true,
  },
  proposedPatchCount: patches.length,
  missingPhysicalPointCount: counts.QDRANT_POINT_MISSING,
  blockingCount,
  verdict: blockingCount === 0 ? 'READY_FOR_FULL_RECONCILIATION_APPLY' : 'STOP_NO_APPLY',
  writesPerformed: false,
  canonicalAuthority: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  classifications,
  proposedPatches: patches,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, counts, proposedPatchCount: patches.length, blockingCount, verdict: report.verdict, writesPerformed: false }, null, 2));
