#!/usr/bin/env node

/**
 * QDRANT-PROJECTION-ID-OWNER-01
 *
 * Read-only owner audit for the frozen lineage canary. This script deliberately
 * distinguishes Postgres row identity, Postgres qdrant_id metadata, Qdrant's
 * actual point.id, and payload qdrant_point_id metadata.
 *
 * It performs no Postgres writes, Qdrant writes, deletes, or alias operations.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const root = REPO_ROOT;
const mapPath = path.resolve(
  env.ATLAS_CANDIDATE_MAP ?? path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json')
);
const reportPath = path.resolve(
  env.ATLAS_QDRANT_PROJECTION_OWNER_REPORT ?? path.join(root, 'docs/reports/qdrant-projection-id-owner-v1.json')
);
const qdrantUrl = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const collection = String(env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UINT_RE = /^\d+$/;
const clean = (value) => String(value ?? '').trim();
const normalizeNullable = (value) => {
  const text = clean(value);
  return text.length ? text : null;
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function classifyPointId(value) {
  const text = clean(value);
  if (UINT_RE.test(text)) return 'UINT64';
  if (UUID_RE.test(text)) return 'UUID';
  return 'OTHER';
}

function hashVectorF32(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return null;
  const bytes = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i += 1) {
    const value = Number(vector[i]);
    if (!Number.isFinite(value)) return null;
    bytes.writeFloatLE(value, i * 4);
  }
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function extractVector(point) {
  const vector = point?.vector;
  if (Array.isArray(vector)) return vector;
  if (vector && typeof vector === 'object') {
    if (Array.isArray(vector.content)) return vector.content;
    if (Array.isArray(vector.semantic_768)) return vector.semantic_768;
  }
  return null;
}

function payloadValue(payload, snake, camel = null) {
  return payload?.[snake] ?? (camel ? payload?.[camel] : undefined) ?? null;
}

function semanticPayloadProjection(payload) {
  return {
    postgresId: normalizeNullable(payloadValue(payload, 'postgres_id', 'postgresId')),
    packetKey: normalizeNullable(payloadValue(payload, 'packet_key', 'packetKey')),
    sourceRef: normalizeNullable(payloadValue(payload, 'source_ref', 'sourceRef')),
    sourceRevision: normalizeNullable(payloadValue(payload, 'source_revision', 'sourceRevision')),
    workspaceRevision: normalizeNullable(payloadValue(payload, 'workspace_revision', 'workspaceRevision')),
    contentHash: normalizeNullable(payloadValue(payload, 'content_hash', 'contentHash')),
    representationId: normalizeNullable(payloadValue(payload, 'representation_id', 'representationId')),
    representationRevision: normalizeNullable(
      payloadValue(payload, 'representation_revision', 'representationRevision')
    ),
    modelRevision: normalizeNullable(payloadValue(payload, 'model_revision', 'modelRevision')),
    dimension: payloadValue(payload, 'dimension') ?? payloadValue(payload, 'embedding_dimension', 'embeddingDimension') ?? null
  };
}

function chunkHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  return ref ? clean(String(ref).split(':').at(-1)).toLowerCase() : null;
}

async function tableExists(pool, tableName) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS present`,
    [tableName]
  );
  return Boolean(result.rows[0]?.present);
}

async function columnExists(pool, tableName, columnName) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS present`,
    [tableName, columnName]
  );
  return Boolean(result.rows[0]?.present);
}

async function loadOwnershipMap(pool, tableName, packetKeys) {
  const map = new Map();
  if (!(await tableExists(pool, tableName))) return { available: false, map };
  if (!(await columnExists(pool, tableName, 'packet_key'))) return { available: false, map };
  if (!(await columnExists(pool, tableName, 'qdrant_point_id'))) return { available: false, map };

  const result = await pool.query(
    `SELECT packet_key, qdrant_point_id::text AS qdrant_point_id
     FROM public.${tableName}
     WHERE packet_key = ANY($1::text[])`,
    [packetKeys]
  );
  for (const row of result.rows) {
    map.set(clean(row.packet_key), normalizeNullable(row.qdrant_point_id));
  }
  return { available: true, map };
}

function numericProvenance({ pointId, postgresQdrantId, atlasPacketQdrantPointId, bridgeQdrantPointId }) {
  const evidence = [];
  if (postgresQdrantId && pointId === postgresQdrantId) evidence.push('POSTGRES_QDRANT_ID');
  if (atlasPacketQdrantPointId && pointId === atlasPacketQdrantPointId) {
    evidence.push('EXISTING_ATLAS_PACKET_ID');
  }
  if (bridgeQdrantPointId && pointId === bridgeQdrantPointId) evidence.push('PACKET_BRIDGE_ID');
  if (UINT_RE.test(pointId) && Number(pointId) >= 1002) evidence.push('LEGACY_SEQUENCE_ID');

  const authoritative = evidence.filter((item) => item !== 'LEGACY_SEQUENCE_ID');
  if (authoritative.length > 1) return { classification: 'MULTIPLE_AGREE', evidence };
  if (authoritative.length === 1) return { classification: authoritative[0], evidence };
  if (evidence.includes('LEGACY_SEQUENCE_ID')) return { classification: 'LEGACY_SEQUENCE_ID', evidence };
  return { classification: 'UNKNOWN', evidence };
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

async function main() {
  const candidateMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(candidateMap.candidates) ? candidateMap.candidates : [];
  if (!candidates.length) throw new Error('QDRANT_PROJECTION_OWNER_CANDIDATE_MAP_EMPTY');

  const packetKeys = candidates.map((candidate) => clean(candidate.packetKey));
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    application_name: 'atlas-qdrant-projection-owner-audit'
  });

  const report = {
    schema: 'atlas.qdrant-projection-id-owner-receipt.v1',
    mode: 'READ_ONLY',
    collection,
    candidateSnapshotRevision: candidateMap.candidateSnapshotRevision ?? candidateMap.snapshotRevision ?? null,
    candidateCount: candidates.length,
    postgresVectorColumn: 'content_embedding',
    pointKinds: { numeric: 0, uuid: 0, other: 0 },
    counts: {
      uuidEqualsPostgresChunkId: 0,
      numericEqualsPostgresQdrantId: 0,
      numericEqualsAtlasPacketPointId: 0,
      numericEqualsBridgePointId: 0,
      bridgeEqualsPostgresQdrantId: 0,
      atlasPacketEqualsPostgresQdrantId: 0,
      vectorParityCompared: 0,
      vectorParityPassed: 0,
      revisionParityCompared: 0,
      revisionParityPassed: 0,
      exactlyOneNumericAndOneUuid: 0
    },
    optionalOwnershipSources: {
      atlasPackets: false,
      packetQdrantBridge: false
    },
    numericIdProvenanceDistribution: {
      POSTGRES_QDRANT_ID: 0,
      EXISTING_ATLAS_PACKET_ID: 0,
      PACKET_BRIDGE_ID: 0,
      LEGACY_SEQUENCE_ID: 0,
      MULTIPLE_AGREE: 0,
      UNKNOWN: 0
    },
    candidates: [],
    owner: null,
    conflictingWriters: [
      {
        writer: 'sveltekit-frontend/scripts/atlas/backfill-qdrant-768-keyset.mjs',
        pointIdSource: 'LOCAL_INCREMENTING_UINT64_SEQUENCE',
        status: 'HISTORICAL_WRITER_REQUIRES_OWNER_DECISION'
      },
      {
        writer: 'scripts/atlas/phase109-qdrant-pointwise-backfill.mts',
        pointIdSource: 'codebase_chunk_index.id',
        status: 'HISTORICAL_WRITER_REQUIRES_OWNER_DECISION'
      }
    ],
    promotionEligible: false,
    writesPerformed: false,
    status: 'FAIL',
    nextGate: 'QDRANT_PROJECTION_ID_OWNER_DECISION'
  };

  try {
    const pgRows = await pool.query(
      `SELECT
         id::text AS codebase_chunk_id,
         qdrant_id::text AS qdrant_id,
         source_ref,
         content_hash
       FROM public.codebase_chunk_index
       WHERE source_ref = ANY($1::text[])
         AND content_embedding IS NOT NULL`,
      [candidates.map((candidate) => candidate.sourceRef)]
    );
    const pgByKey = new Map(
      pgRows.rows.map((row) => [
        `${clean(row.source_ref)}\0${clean(row.content_hash).toLowerCase()}`,
        row
      ])
    );

    const atlasPackets = await loadOwnershipMap(pool, 'atlas_packets', packetKeys);
    const bridge = await loadOwnershipMap(pool, 'packet_qdrant_bridge', packetKeys);
    report.optionalOwnershipSources.atlasPackets = atlasPackets.available;
    report.optionalOwnershipSources.packetQdrantBridge = bridge.available;

    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }] },
        limit: Math.max(100, candidates.length * 4),
        with_payload: true,
        with_vector: true
      })
    });
    if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
    const body = await response.json();

    const byPacket = new Map();
    for (const point of body.result?.points ?? []) {
      const packetKey = clean(payloadValue(point.payload, 'packet_key', 'packetKey'));
      if (!packetKey) continue;
      byPacket.set(packetKey, [...(byPacket.get(packetKey) ?? []), point]);
    }

    for (const candidate of candidates) {
      const packetKey = clean(candidate.packetKey);
      const pgRow = pgByKey.get(`${clean(candidate.sourceRef)}\0${chunkHash(candidate)}`) ?? null;
      const codebaseChunkId = normalizeNullable(pgRow?.codebase_chunk_id);
      const postgresQdrantId = normalizeNullable(pgRow?.qdrant_id);
      const atlasPacketQdrantPointId = atlasPackets.map.get(packetKey) ?? null;
      const bridgeQdrantPointId = bridge.map.get(packetKey) ?? null;
      const points = byPacket.get(packetKey) ?? [];

      const pointFacts = points.map((point) => {
        const pointId = String(point.id);
        const pointIdKind = classifyPointId(pointId);
        const vector = extractVector(point);
        const payload = point.payload ?? {};
        const semanticPayload = semanticPayloadProjection(payload);
        const fact = {
          pointId,
          pointIdKind,
          payloadPostgresId: semanticPayload.postgresId,
          payloadQdrantPointId: normalizeNullable(payloadValue(payload, 'qdrant_point_id', 'qdrantPointId')),
          payloadPacketKey: semanticPayload.packetKey,
          payloadSourceRef: semanticPayload.sourceRef,
          payloadSourceRevision: semanticPayload.sourceRevision,
          payloadWorkspaceRevision: semanticPayload.workspaceRevision,
          payloadRepresentationId: semanticPayload.representationId,
          payloadRepresentationRevision: semanticPayload.representationRevision,
          payloadModelRevision: semanticPayload.modelRevision,
          vectorDimension: Array.isArray(vector) ? vector.length : null,
          vectorChecksum: hashVectorF32(vector),
          rawPayloadChecksum: sha256Json(payload),
          semanticPayloadChecksum: sha256Json(semanticPayload),
          pointIdEqualsChunkId: Boolean(codebaseChunkId && pointId === codebaseChunkId),
          pointIdEqualsPostgresQdrantId: Boolean(postgresQdrantId && pointId === postgresQdrantId),
          pointIdEqualsAtlasPacketPointId: Boolean(
            atlasPacketQdrantPointId && pointId === atlasPacketQdrantPointId
          ),
          pointIdEqualsBridgePointId: Boolean(bridgeQdrantPointId && pointId === bridgeQdrantPointId)
        };
        increment(report.pointKinds, pointIdKind === 'UINT64' ? 'numeric' : pointIdKind === 'UUID' ? 'uuid' : 'other');
        return fact;
      });

      const numericPoints = pointFacts.filter((point) => point.pointIdKind === 'UINT64');
      const uuidPoints = pointFacts.filter((point) => point.pointIdKind === 'UUID');
      if (numericPoints.length === 1 && uuidPoints.length === 1) {
        report.counts.exactlyOneNumericAndOneUuid += 1;
      }

      const numericPoint = numericPoints.length === 1 ? numericPoints[0] : null;
      const uuidPoint = uuidPoints.length === 1 ? uuidPoints[0] : null;

      if (uuidPoint?.pointIdEqualsChunkId) report.counts.uuidEqualsPostgresChunkId += 1;
      if (numericPoint?.pointIdEqualsPostgresQdrantId) report.counts.numericEqualsPostgresQdrantId += 1;
      if (numericPoint?.pointIdEqualsAtlasPacketPointId) report.counts.numericEqualsAtlasPacketPointId += 1;
      if (numericPoint?.pointIdEqualsBridgePointId) report.counts.numericEqualsBridgePointId += 1;
      if (bridgeQdrantPointId && postgresQdrantId && bridgeQdrantPointId === postgresQdrantId) {
        report.counts.bridgeEqualsPostgresQdrantId += 1;
      }
      if (
        atlasPacketQdrantPointId &&
        postgresQdrantId &&
        atlasPacketQdrantPointId === postgresQdrantId
      ) {
        report.counts.atlasPacketEqualsPostgresQdrantId += 1;
      }

      let vectorParity = null;
      let revisionParity = null;
      if (numericPoint && uuidPoint) {
        report.counts.vectorParityCompared += 1;
        vectorParity = Boolean(
          numericPoint.vectorChecksum &&
          uuidPoint.vectorChecksum &&
          numericPoint.vectorChecksum === uuidPoint.vectorChecksum
        );
        if (vectorParity) report.counts.vectorParityPassed += 1;

        report.counts.revisionParityCompared += 1;
        revisionParity = numericPoint.semanticPayloadChecksum === uuidPoint.semanticPayloadChecksum;
        if (revisionParity) report.counts.revisionParityPassed += 1;
      }

      const provenance = numericPoint
        ? numericProvenance({
            pointId: numericPoint.pointId,
            postgresQdrantId,
            atlasPacketQdrantPointId,
            bridgeQdrantPointId
          })
        : { classification: 'UNKNOWN', evidence: [] };
      increment(report.numericIdProvenanceDistribution, provenance.classification);

      report.candidates.push({
        candidateOrdinal: candidate.candidateOrdinal,
        packetKey,
        sourceRef: candidate.sourceRef,
        sourceRevision: candidate.sourceRevision ?? null,
        workspaceRevision: candidate.workspaceRevision ?? null,
        codebaseChunkId,
        codebaseChunkQdrantId: postgresQdrantId,
        atlasPacketQdrantPointId,
        bridgeQdrantPointId,
        numericPointId: numericPoint?.pointId ?? null,
        uuidPointId: uuidPoint?.pointId ?? null,
        uuidPointEqualsChunkId: uuidPoint?.pointIdEqualsChunkId ?? false,
        numericPointEqualsChunkQdrantId: numericPoint?.pointIdEqualsPostgresQdrantId ?? false,
        numericPointEqualsAtlasPacketPointId: numericPoint?.pointIdEqualsAtlasPacketPointId ?? false,
        numericPointEqualsBridgePointId: numericPoint?.pointIdEqualsBridgePointId ?? false,
        numericIdProvenance: provenance.classification,
        numericIdProvenanceEvidence: provenance.evidence,
        vectorParityNumericVsUuid: vectorParity,
        revisionParityNumericVsUuid: revisionParity,
        pointFacts
      });
    }

    const n = candidates.length;
    const c = report.counts;
    const numericSignals = [];
    const uuidSignals = [];

    if (c.numericEqualsPostgresQdrantId === n) numericSignals.push('codebase_chunk_index.qdrant_id');
    if (atlasPackets.available && c.numericEqualsAtlasPacketPointId === n) {
      numericSignals.push('atlas_packets.qdrant_point_id');
    }
    if (bridge.available && c.numericEqualsBridgePointId === n) {
      numericSignals.push('packet_qdrant_bridge.qdrant_point_id');
    }

    if (
      atlasPackets.available &&
      report.candidates.every((candidate) => candidate.uuidPointId === candidate.atlasPacketQdrantPointId)
    ) {
      uuidSignals.push('atlas_packets.qdrant_point_id');
    }
    if (
      bridge.available &&
      report.candidates.every((candidate) => candidate.uuidPointId === candidate.bridgeQdrantPointId)
    ) {
      uuidSignals.push('packet_qdrant_bridge.qdrant_point_id');
    }

    if (numericSignals.length > 0 && uuidSignals.length === 0) {
      report.owner = {
        source: numericSignals.length === 1 ? numericSignals[0] : 'MULTIPLE_AGREE',
        agreeingSources: numericSignals,
        representation: 'uint64',
        canonicalAuthority: false
      };
    } else if (uuidSignals.length > 0 && numericSignals.length === 0) {
      report.owner = {
        source: uuidSignals.length === 1 ? uuidSignals[0] : 'MULTIPLE_AGREE',
        agreeingSources: uuidSignals,
        representation: 'UUID',
        canonicalAuthority: false
      };
    }

    const fullPairCoverage = c.exactlyOneNumericAndOneUuid === n;
    const vectorParityPassed = c.vectorParityCompared === n && c.vectorParityPassed === n;
    const revisionParityPassed = c.revisionParityCompared === n && c.revisionParityPassed === n;
    report.promotionEligible = Boolean(
      report.owner && fullPairCoverage && vectorParityPassed && revisionParityPassed
    );
    report.status = report.promotionEligible
      ? 'QDRANT_PROJECTION_ID_OWNER_PROVEN'
      : 'QDRANT_PROJECTION_ID_OWNER_BLOCKED';
    report.nextGate = report.promotionEligible
      ? 'QDRANT_BG_02_FREEZE_PROJECTION_SNAPSHOT'
      : 'QDRANT_PROJECTION_ID_PROVENANCE_RECONCILIATION';
  } finally {
    await pool.end();
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        status: report.status,
        candidateCount: report.candidateCount,
        owner: report.owner,
        promotionEligible: report.promotionEligible,
        pointKinds: report.pointKinds,
        counts: report.counts,
        numericIdProvenanceDistribution: report.numericIdProvenanceDistribution,
        reportPath
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
