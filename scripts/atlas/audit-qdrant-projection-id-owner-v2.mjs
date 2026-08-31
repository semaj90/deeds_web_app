#!/usr/bin/env node

/**
 * QDRANT-PROJECTION-ID-OWNER-02
 *
 * Read-only projection-owner audit for the frozen lineage cohort.
 *
 * Important distinctions:
 * - codebase_chunk_index.id is the canonical PostgreSQL row identity.
 * - Qdrant point.id is the actual Qdrant storage/upsert coordinate.
 * - payload.qdrant_point_id is payload metadata only.
 * - codebase_chunk_index.qdrant_id is a recorded projection reference whose
 *   relationship to actual Qdrant point.id must be proven, never assumed.
 *
 * This v2 audit deliberately retrieves the cohort through payload.postgres_id,
 * because both historical writers in current main write postgres_id while the
 * Phase109 UUID writer does not write packet_key. Filtering only by packet_key
 * can therefore silently omit a projection generation.
 *
 * No PostgreSQL writes, Qdrant writes, deletes, alias changes, or migrations.
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
  env.ATLAS_QDRANT_PROJECTION_OWNER_REPORT_V2 ??
    path.join(root, 'docs/reports/qdrant-projection-id-owner-v2.json')
);
const qdrantUrl = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const collection = String(env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UINT_RE = /^\d+$/;
const clean = (value) => String(value ?? '').trim();
const nullable = (value) => {
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

function hashVectorF32(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return null;
  const bytes = Buffer.allocUnsafe(vector.length * 4);
  for (let index = 0; index < vector.length; index += 1) {
    const value = Number(vector[index]);
    if (!Number.isFinite(value)) return null;
    bytes.writeFloatLE(value, index * 4);
  }
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parsePgVectorText(text) {
  if (typeof text !== 'string') return null;
  const body = text.trim();
  if (!body.startsWith('[') || !body.endsWith(']')) return null;
  try {
    const values = JSON.parse(body);
    if (!Array.isArray(values) || values.length !== 768) return null;
    return values.every((value) => Number.isFinite(Number(value)))
      ? values.map((value) => Number(value))
      : null;
  } catch {
    return null;
  }
}

function classifyPointId(value) {
  const text = clean(value);
  if (UINT_RE.test(text)) return 'UINT64';
  if (UUID_RE.test(text)) return 'UUID';
  return 'OTHER';
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

function value(payload, ...keys) {
  for (const key of keys) {
    if (payload?.[key] !== undefined && payload?.[key] !== null) return payload[key];
  }
  return null;
}

function semanticPayload(payload) {
  return {
    postgresId: nullable(value(payload, 'postgres_id', 'postgresId')),
    packetKey: nullable(value(payload, 'packet_key', 'packetKey')),
    sourceRef: nullable(value(payload, 'source_ref', 'sourceRef', 'relative_path', 'file_path')),
    sourceRevision: nullable(value(payload, 'source_revision', 'sourceRevision')),
    workspaceRevision: nullable(value(payload, 'workspace_revision', 'workspaceRevision')),
    contentHash: nullable(value(payload, 'content_hash', 'contentHash')),
    representationId: nullable(value(payload, 'representation_id', 'representationId')),
    representationRevision: nullable(
      value(payload, 'representation_revision', 'representationRevision')
    ),
    modelRevision: nullable(value(payload, 'model_revision', 'modelRevision', 'embedding_model')),
    dimension:
      value(payload, 'dimension', 'embedding_dimension', 'embeddingDimension', 'qdrant_vector_dim') ?? null
  };
}

function lineageComplete(payload) {
  return Boolean(
    payload.postgresId &&
      payload.sourceRef &&
      payload.sourceRevision &&
      payload.workspaceRevision &&
      payload.contentHash &&
      payload.representationId === 'semantic_768' &&
      payload.representationRevision &&
      payload.modelRevision &&
      Number(payload.dimension) === 768
  );
}

function chunkHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((entry) => String(entry).startsWith('chunk:'));
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
    map.set(clean(row.packet_key), nullable(row.qdrant_point_id));
  }
  return { available: true, map };
}

async function scrollByPostgresId(codebaseChunkId) {
  const response = await fetch(
    `${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'postgres_id', match: { value: codebaseChunkId } }]
        },
        limit: 16,
        with_payload: true,
        with_vector: true
      })
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QDRANT_POSTGRES_ID_SCROLL_HTTP_${response.status}:${text.slice(0, 300)}`);
  }
  const body = await response.json();
  return Array.isArray(body.result?.points) ? body.result.points : [];
}

function numericProvenance({ pointId, postgresQdrantId, atlasPacketId, bridgeId }) {
  const evidence = [];
  if (postgresQdrantId && pointId === postgresQdrantId) evidence.push('POSTGRES_QDRANT_ID');
  if (atlasPacketId && pointId === atlasPacketId) evidence.push('EXISTING_ATLAS_PACKET_ID');
  if (bridgeId && pointId === bridgeId) evidence.push('PACKET_BRIDGE_ID');
  if (UINT_RE.test(pointId) && Number(pointId) >= 1002) evidence.push('LEGACY_SEQUENCE_ID');

  const bindings = evidence.filter((entry) => entry !== 'LEGACY_SEQUENCE_ID');
  if (bindings.length > 1) return { classification: 'MULTIPLE_AGREE', evidence };
  if (bindings.length === 1) return { classification: bindings[0], evidence };
  if (evidence.includes('LEGACY_SEQUENCE_ID')) return { classification: 'LEGACY_SEQUENCE_ID', evidence };
  return { classification: 'UNKNOWN', evidence };
}

function increment(object, key) {
  object[key] = (object[key] ?? 0) + 1;
}

async function main() {
  const candidateMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(candidateMap.candidates) ? candidateMap.candidates : [];
  if (!candidates.length) throw new Error('QDRANT_PROJECTION_OWNER_CANDIDATE_MAP_EMPTY');

  const packetKeys = candidates.map((candidate) => clean(candidate.packetKey));
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    application_name: 'atlas-qdrant-projection-owner-v2-audit'
  });

  const report = {
    schema: 'atlas.qdrant-projection-id-owner-receipt.v2',
    mode: 'READ_ONLY',
    collection,
    candidateSnapshotRevision:
      candidateMap.candidateSnapshotRevision ?? candidateMap.snapshotRevision ?? null,
    candidateCount: candidates.length,
    postgresVectorSource: 'codebase_chunk_index.content_embedding',
    qdrantLookupIdentity: 'payload.postgres_id',
    pointKinds: { numeric: 0, uuid: 0, other: 0 },
    counts: {
      candidatePostgresRowsResolved: 0,
      exactlyOneNumericAndOneUuid: 0,
      uuidEqualsPostgresChunkId: 0,
      numericEqualsPostgresQdrantId: 0,
      numericEqualsAtlasPacketPointId: 0,
      numericEqualsBridgePointId: 0,
      bridgeEqualsPostgresQdrantId: 0,
      atlasPacketEqualsPostgresQdrantId: 0,
      numericVectorEqualsPostgres: 0,
      uuidVectorEqualsPostgres: 0,
      vectorParityCompared: 0,
      vectorParityPassed: 0,
      semanticPayloadParityCompared: 0,
      semanticPayloadParityPassed: 0,
      numericLineageComplete: 0,
      uuidLineageComplete: 0
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
    ownerCandidates: [],
    ownerEvidence: [],
    ownerDecision: 'UNRESOLVED',
    owner: null,
    candidates: [],
    conflictingWriters: [
      {
        writer: 'sveltekit-frontend/scripts/atlas/backfill-qdrant-768-keyset.mjs',
        actualPointIdSource: 'LOCAL_INCREMENTING_UINT64_SEQUENCE',
        status: 'HISTORICAL_WRITER'
      },
      {
        writer: 'scripts/atlas/phase109-qdrant-pointwise-backfill.mts',
        actualPointIdSource: 'codebase_chunk_index.id',
        status: 'HISTORICAL_WRITER'
      }
    ],
    ownerProven: false,
    promotionEligible: false,
    writesPerformed: false,
    status: 'QDRANT_PROJECTION_ID_OWNER_BLOCKED',
    nextGate: 'QDRANT_PROJECTION_ID_PROVENANCE_RECONCILIATION'
  };

  try {
    const pgResult = await pool.query(
      `SELECT
         id::text AS codebase_chunk_id,
         qdrant_id::text AS qdrant_id,
         source_ref,
         content_hash,
         content_embedding::text AS embedding_text
       FROM public.codebase_chunk_index
       WHERE source_ref = ANY($1::text[])
         AND content_embedding IS NOT NULL`,
      [candidates.map((candidate) => candidate.sourceRef)]
    );

    const pgBySourceHash = new Map(
      pgResult.rows.map((row) => [
        `${clean(row.source_ref)}\0${clean(row.content_hash).toLowerCase()}`,
        row
      ])
    );

    const atlasPackets = await loadOwnershipMap(pool, 'atlas_packets', packetKeys);
    const bridge = await loadOwnershipMap(pool, 'packet_qdrant_bridge', packetKeys);
    report.optionalOwnershipSources.atlasPackets = atlasPackets.available;
    report.optionalOwnershipSources.packetQdrantBridge = bridge.available;

    for (const candidate of candidates) {
      const packetKey = clean(candidate.packetKey);
      const pgRow =
        pgBySourceHash.get(`${clean(candidate.sourceRef)}\0${chunkHash(candidate)}`) ?? null;
      const codebaseChunkId = nullable(pgRow?.codebase_chunk_id);
      const postgresQdrantId = nullable(pgRow?.qdrant_id);
      const postgresVector = parsePgVectorText(pgRow?.embedding_text);
      const postgresVectorChecksum = hashVectorF32(postgresVector);
      const atlasPacketQdrantPointId = atlasPackets.map.get(packetKey) ?? null;
      const bridgeQdrantPointId = bridge.map.get(packetKey) ?? null;

      if (!codebaseChunkId) {
        report.candidates.push({
          candidateOrdinal: candidate.candidateOrdinal,
          packetKey,
          sourceRef: candidate.sourceRef,
          status: 'POSTGRES_ROW_NOT_RESOLVED'
        });
        continue;
      }
      report.counts.candidatePostgresRowsResolved += 1;

      const points = await scrollByPostgresId(codebaseChunkId);
      const pointFacts = points.map((point) => {
        const actualPointId = String(point.id);
        const actualPointIdKind = classifyPointId(actualPointId);
        increment(
          report.pointKinds,
          actualPointIdKind === 'UINT64'
            ? 'numeric'
            : actualPointIdKind === 'UUID'
              ? 'uuid'
              : 'other'
        );
        const payload = point.payload ?? {};
        const projectedPayload = semanticPayload(payload);
        const vector = extractVector(point);
        const vectorChecksum = hashVectorF32(vector);
        return {
          actualPointId,
          actualPointIdKind,
          payloadPostgresId: projectedPayload.postgresId,
          payloadQdrantPointId: nullable(value(payload, 'qdrant_point_id', 'qdrantPointId')),
          payloadPacketKey: projectedPayload.packetKey,
          payloadSourceRef: projectedPayload.sourceRef,
          payloadSourceRevision: projectedPayload.sourceRevision,
          payloadWorkspaceRevision: projectedPayload.workspaceRevision,
          payloadContentHash: projectedPayload.contentHash,
          representationId: projectedPayload.representationId,
          representationRevision: projectedPayload.representationRevision,
          modelRevision: projectedPayload.modelRevision,
          vectorDimension: Array.isArray(vector) ? vector.length : null,
          vectorChecksum,
          vectorEqualsPostgres: Boolean(
            vectorChecksum && postgresVectorChecksum && vectorChecksum === postgresVectorChecksum
          ),
          semanticPayloadChecksum: sha256Json(projectedPayload),
          lineageComplete: lineageComplete(projectedPayload),
          actualIdEqualsChunkId: actualPointId === codebaseChunkId,
          actualIdEqualsPostgresQdrantId: Boolean(
            postgresQdrantId && actualPointId === postgresQdrantId
          ),
          actualIdEqualsAtlasPacketPointId: Boolean(
            atlasPacketQdrantPointId && actualPointId === atlasPacketQdrantPointId
          ),
          actualIdEqualsBridgePointId: Boolean(
            bridgeQdrantPointId && actualPointId === bridgeQdrantPointId
          ),
          payloadQdrantIdEqualsPostgresQdrantId: Boolean(
            postgresQdrantId &&
              nullable(value(payload, 'qdrant_point_id', 'qdrantPointId')) === postgresQdrantId
          )
        };
      });

      const numericPoints = pointFacts.filter((point) => point.actualPointIdKind === 'UINT64');
      const uuidPoints = pointFacts.filter((point) => point.actualPointIdKind === 'UUID');
      if (numericPoints.length === 1 && uuidPoints.length === 1) {
        report.counts.exactlyOneNumericAndOneUuid += 1;
      }
      const numericPoint = numericPoints.length === 1 ? numericPoints[0] : null;
      const uuidPoint = uuidPoints.length === 1 ? uuidPoints[0] : null;

      if (uuidPoint?.actualIdEqualsChunkId) report.counts.uuidEqualsPostgresChunkId += 1;
      if (numericPoint?.actualIdEqualsPostgresQdrantId) {
        report.counts.numericEqualsPostgresQdrantId += 1;
      }
      if (numericPoint?.actualIdEqualsAtlasPacketPointId) {
        report.counts.numericEqualsAtlasPacketPointId += 1;
      }
      if (numericPoint?.actualIdEqualsBridgePointId) {
        report.counts.numericEqualsBridgePointId += 1;
      }
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
      if (numericPoint?.vectorEqualsPostgres) report.counts.numericVectorEqualsPostgres += 1;
      if (uuidPoint?.vectorEqualsPostgres) report.counts.uuidVectorEqualsPostgres += 1;
      if (numericPoint?.lineageComplete) report.counts.numericLineageComplete += 1;
      if (uuidPoint?.lineageComplete) report.counts.uuidLineageComplete += 1;

      let vectorParityAcrossGenerations = null;
      let semanticPayloadParityAcrossGenerations = null;
      if (numericPoint && uuidPoint) {
        report.counts.vectorParityCompared += 1;
        vectorParityAcrossGenerations = Boolean(
          numericPoint.vectorChecksum &&
            uuidPoint.vectorChecksum &&
            numericPoint.vectorChecksum === uuidPoint.vectorChecksum
        );
        if (vectorParityAcrossGenerations) report.counts.vectorParityPassed += 1;

        report.counts.semanticPayloadParityCompared += 1;
        semanticPayloadParityAcrossGenerations =
          numericPoint.semanticPayloadChecksum === uuidPoint.semanticPayloadChecksum;
        if (semanticPayloadParityAcrossGenerations) {
          report.counts.semanticPayloadParityPassed += 1;
        }
      }

      const provenance = numericPoint
        ? numericProvenance({
            pointId: numericPoint.actualPointId,
            postgresQdrantId,
            atlasPacketId: atlasPacketQdrantPointId,
            bridgeId: bridgeQdrantPointId
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
        postgresVectorChecksum,
        numericActualPointId: numericPoint?.actualPointId ?? null,
        uuidActualPointId: uuidPoint?.actualPointId ?? null,
        numericIdProvenance: provenance.classification,
        numericIdProvenanceEvidence: provenance.evidence,
        vectorParityAcrossGenerations,
        semanticPayloadParityAcrossGenerations,
        pointFacts
      });
    }

    const total = candidates.length;
    const counts = report.counts;
    const numericSignals = [];
    const uuidSignals = [];

    if (counts.numericEqualsPostgresQdrantId === total) {
      numericSignals.push('codebase_chunk_index.qdrant_id');
    }
    if (atlasPackets.available && counts.numericEqualsAtlasPacketPointId === total) {
      numericSignals.push('atlas_packets.qdrant_point_id');
    }
    if (bridge.available && counts.numericEqualsBridgePointId === total) {
      numericSignals.push('packet_qdrant_bridge.qdrant_point_id');
    }
    if (
      atlasPackets.available &&
      report.candidates.every(
        (candidate) =>
          candidate.uuidActualPointId &&
          candidate.uuidActualPointId === candidate.atlasPacketQdrantPointId
      )
    ) {
      uuidSignals.push('atlas_packets.qdrant_point_id');
    }
    if (
      bridge.available &&
      report.candidates.every(
        (candidate) =>
          candidate.uuidActualPointId && candidate.uuidActualPointId === candidate.bridgeQdrantPointId
      )
    ) {
      uuidSignals.push('packet_qdrant_bridge.qdrant_point_id');
    }

    report.ownerCandidates = [
      ...(numericSignals.length
        ? [{ representation: 'uint64', agreeingSources: numericSignals }]
        : []),
      ...(uuidSignals.length ? [{ representation: 'UUID', agreeingSources: uuidSignals }] : [])
    ];
    report.ownerEvidence = [
      `uuidActualIdEqualsChunkId=${counts.uuidEqualsPostgresChunkId}/${total}`,
      `numericActualIdEqualsChunkQdrantId=${counts.numericEqualsPostgresQdrantId}/${total}`,
      `numericActualIdEqualsAtlasPacket=${counts.numericEqualsAtlasPacketPointId}/${total}`,
      `numericActualIdEqualsBridge=${counts.numericEqualsBridgePointId}/${total}`,
      `vectorParity=${counts.vectorParityPassed}/${counts.vectorParityCompared}`,
      `semanticPayloadParity=${counts.semanticPayloadParityPassed}/${counts.semanticPayloadParityCompared}`,
      `numericLineageComplete=${counts.numericLineageComplete}/${total}`,
      `uuidLineageComplete=${counts.uuidLineageComplete}/${total}`
    ];

    if (numericSignals.length > 0 && uuidSignals.length === 0) {
      report.ownerDecision = 'UINT64_PROJECTION_ID';
      report.owner = {
        representation: 'uint64',
        source: numericSignals.length === 1 ? numericSignals[0] : 'MULTIPLE_AGREE',
        agreeingSources: numericSignals,
        canonicalAuthority: false
      };
    } else if (uuidSignals.length > 0 && numericSignals.length === 0) {
      report.ownerDecision = 'UUID_PROJECTION_ID';
      report.owner = {
        representation: 'UUID',
        source: uuidSignals.length === 1 ? uuidSignals[0] : 'MULTIPLE_AGREE',
        agreeingSources: uuidSignals,
        canonicalAuthority: false
      };
    } else if (numericSignals.length > 0 && uuidSignals.length > 0) {
      report.ownerDecision = 'CONFLICTING_OWNER_SIGNALS';
    }

    report.ownerProven = Boolean(report.owner);
    const fullPostgresResolution = counts.candidatePostgresRowsResolved === total;
    const fullPairCoverage = counts.exactlyOneNumericAndOneUuid === total;
    const vectorParity =
      counts.vectorParityCompared === total && counts.vectorParityPassed === total;
    const semanticPayloadParity =
      counts.semanticPayloadParityCompared === total &&
      counts.semanticPayloadParityPassed === total;
    const revisionQualifiedBothGenerations =
      counts.numericLineageComplete === total && counts.uuidLineageComplete === total;

    report.promotionEligible = Boolean(
      report.ownerProven &&
        fullPostgresResolution &&
        fullPairCoverage &&
        vectorParity &&
        semanticPayloadParity &&
        revisionQualifiedBothGenerations
    );

    report.status = report.ownerProven
      ? report.promotionEligible
        ? 'QDRANT_PROJECTION_ID_OWNER_PROVEN'
        : 'QDRANT_PROJECTION_ID_OWNER_PROVEN_LINEAGE_BLOCKED'
      : 'QDRANT_PROJECTION_ID_OWNER_BLOCKED';
    report.nextGate = report.promotionEligible
      ? 'QDRANT_BG_02_FREEZE_PROJECTION_SNAPSHOT'
      : report.ownerProven
        ? 'QDRANT_BG_PAYLOAD_LINEAGE_POLICY_DECISION'
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
        ownerDecision: report.ownerDecision,
        owner: report.owner,
        ownerProven: report.ownerProven,
        promotionEligible: report.promotionEligible,
        pointKinds: report.pointKinds,
        counts: report.counts,
        numericIdProvenanceDistribution: report.numericIdProvenanceDistribution,
        nextGate: report.nextGate,
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
