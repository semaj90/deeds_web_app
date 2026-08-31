#!/usr/bin/env node

/**
 * Read-only census of Qdrant projection targets for the lineage canary.
 *
 * This audit deliberately separates four identities that older reports could
 * conflate:
 *   - codebase_chunk_index.id              (canonical Postgres chunk row UUID)
 *   - codebase_chunk_index.qdrant_id       (recorded projection/payload UUID)
 *   - Qdrant point.id                      (uint64 or UUID transport coordinate)
 *   - Qdrant payload.qdrant_point_id       (payload metadata, not point.id)
 *
 * No database, Qdrant, bridge, or archive writes are performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const root = REPO_ROOT;
const mapPath = path.resolve(env.ATLAS_CANDIDATE_MAP ?? path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(env.ATLAS_QDRANT_PROJECTION_TARGET_REPORT ?? path.join(root, 'docs/reports/lineage-qdrant-projection-targets-v1.json'));
const qdrantUrl = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const collection = String(env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');

const clean = (value) => String(value ?? '').trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UINT_RE = /^\d+$/;

function chunkHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  return ref ? clean(String(ref).split(':').at(-1)).toLowerCase() : null;
}

function classifyPointId(value) {
  const text = clean(value);
  if (UINT_RE.test(text)) return 'UINT64';
  if (UUID_RE.test(text)) return 'UUID';
  return 'OTHER';
}

async function tableExists(pool, tableName) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS present`,
    [tableName]
  );
  return Boolean(result.rows[0]?.present);
}

async function loadOptionalOwnershipMaps(pool, packetKeys) {
  const atlasPacketByKey = new Map();
  const bridgeByKey = new Map();

  if (await tableExists(pool, 'atlas_packets')) {
    const result = await pool.query(
      `SELECT packet_key, qdrant_point_id::text AS qdrant_point_id
       FROM public.atlas_packets
       WHERE packet_key = ANY($1::text[])`,
      [packetKeys]
    );
    for (const row of result.rows) atlasPacketByKey.set(clean(row.packet_key), clean(row.qdrant_point_id) || null);
  }

  if (await tableExists(pool, 'packet_qdrant_bridge')) {
    const result = await pool.query(
      `SELECT packet_key, qdrant_point_id::text AS qdrant_point_id
       FROM public.packet_qdrant_bridge
       WHERE packet_key = ANY($1::text[])`,
      [packetKeys]
    );
    for (const row of result.rows) bridgeByKey.set(clean(row.packet_key), clean(row.qdrant_point_id) || null);
  }

  return { atlasPacketByKey, bridgeByKey };
}

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (!candidates.length) throw new Error('QDRANT_PROJECTION_TARGET_CANDIDATE_MAP_EMPTY');

  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    application_name: 'atlas-qdrant-projection-target-audit'
  });

  const report = {
    schema: 'atlas.lineage-qdrant-projection-targets.v2',
    mode: 'READ_ONLY',
    collection,
    candidateCount: candidates.length,
    counts: {
      exactSingleTarget: 0,
      duplicateSameCollection: 0,
      projectionIdMismatch: 0,
      noTarget: 0,
      uuidPointEqualsChunkId: 0,
      pointIdEqualsPostgresQdrantId: 0,
      payloadQdrantIdEqualsPostgresQdrantId: 0,
      numericPointCount: 0,
      uuidPointCount: 0,
      bridgeMatchesNumericPoint: 0,
      bridgeMatchesUuidPoint: 0,
      atlasPacketMatchesNumericPoint: 0,
      atlasPacketMatchesUuidPoint: 0
    },
    identityInterpretation: {
      postgresChunkId: 'CANONICAL_POSTGRES_ROW_ID',
      postgresQdrantId: 'RECORDED_PROJECTION_REFERENCE_UNRESOLVED',
      qdrantPointId: 'QDRANT_PROJECTION_COORDINATE',
      payloadQdrantPointId: 'PAYLOAD_METADATA_NOT_POINT_ID'
    },
    candidates: [],
    writes: { postgres: false, qdrant: false, deletes: false },
    status: 'FAIL',
    nextGate: 'QDRANT_PROJECTION_ID_OWNER_DECISION'
  };

  try {
    const pgRows = await pool.query(
      `SELECT
         id::text AS codebase_chunk_id,
         source_ref,
         content_hash,
         qdrant_id::text AS qdrant_id
       FROM public.codebase_chunk_index
       WHERE source_ref = ANY($1::text[])`,
      [candidates.map((candidate) => candidate.sourceRef)]
    );
    const pgByKey = new Map(
      pgRows.rows.map((row) => [
        `${clean(row.source_ref)}\0${clean(row.content_hash).toLowerCase()}`,
        row
      ])
    );

    const packetKeys = candidates.map((candidate) => candidate.packetKey);
    const { atlasPacketByKey, bridgeByKey } = await loadOptionalOwnershipMaps(pool, packetKeys);

    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }] },
        limit: Math.max(100, candidates.length * 4),
        with_payload: true,
        with_vector: false
      })
    });
    if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);

    const body = await response.json();
    const byPacket = new Map();
    for (const point of body.result?.points ?? []) {
      const key = clean(point.payload?.packet_key);
      if (!key) continue;
      byPacket.set(key, [...(byPacket.get(key) ?? []), point]);
    }

    for (const candidate of candidates) {
      const pgRow = pgByKey.get(`${clean(candidate.sourceRef)}\0${chunkHash(candidate)}`);
      const points = byPacket.get(candidate.packetKey) ?? [];
      const codebaseChunkId = clean(pgRow?.codebase_chunk_id) || null;
      const postgresQdrantId = clean(pgRow?.qdrant_id) || null;
      const bridgeQdrantPointId = bridgeByKey.get(candidate.packetKey) ?? null;
      const atlasPacketQdrantPointId = atlasPacketByKey.get(candidate.packetKey) ?? null;

      const pointFacts = points.map((point) => {
        const pointId = String(point.id);
        const pointIdKind = classifyPointId(pointId);
        const payloadQdrantPointId = clean(point.payload?.qdrant_point_id) || null;
        const payloadPostgresId = clean(point.payload?.postgres_id) || null;
        const fact = {
          pointId,
          pointIdKind,
          payloadQdrantPointId,
          payloadPostgresId,
          pointIdEqualsChunkId: codebaseChunkId !== null && pointId === codebaseChunkId,
          pointIdEqualsPostgresQdrantId: postgresQdrantId !== null && pointId === postgresQdrantId,
          payloadQdrantIdEqualsPostgresQdrantId:
            postgresQdrantId !== null && payloadQdrantPointId === postgresQdrantId,
          bridgeMatchesPointId: bridgeQdrantPointId !== null && bridgeQdrantPointId === pointId,
          atlasPacketMatchesPointId:
            atlasPacketQdrantPointId !== null && atlasPacketQdrantPointId === pointId
        };

        if (pointIdKind === 'UINT64') report.counts.numericPointCount += 1;
        if (pointIdKind === 'UUID') report.counts.uuidPointCount += 1;
        if (fact.pointIdEqualsChunkId && pointIdKind === 'UUID') report.counts.uuidPointEqualsChunkId += 1;
        if (fact.pointIdEqualsPostgresQdrantId) report.counts.pointIdEqualsPostgresQdrantId += 1;
        if (fact.payloadQdrantIdEqualsPostgresQdrantId) report.counts.payloadQdrantIdEqualsPostgresQdrantId += 1;
        if (fact.bridgeMatchesPointId && pointIdKind === 'UINT64') report.counts.bridgeMatchesNumericPoint += 1;
        if (fact.bridgeMatchesPointId && pointIdKind === 'UUID') report.counts.bridgeMatchesUuidPoint += 1;
        if (fact.atlasPacketMatchesPointId && pointIdKind === 'UINT64') report.counts.atlasPacketMatchesNumericPoint += 1;
        if (fact.atlasPacketMatchesPointId && pointIdKind === 'UUID') report.counts.atlasPacketMatchesUuidPoint += 1;
        return fact;
      });

      const directMatches = pointFacts.filter(
        (fact) => fact.pointIdEqualsPostgresQdrantId || fact.bridgeMatchesPointId || fact.atlasPacketMatchesPointId
      );
      const payloadMatches = pointFacts.filter((fact) => fact.payloadQdrantIdEqualsPostgresQdrantId);
      const hasAnyRecordedMatch = directMatches.length > 0 || payloadMatches.length > 0;
      const classification =
        points.length === 0
          ? 'NO_TARGET'
          : points.length === 1 && hasAnyRecordedMatch
            ? 'EXACT_SINGLE_TARGET'
            : points.length > 1 && hasAnyRecordedMatch
              ? 'DUPLICATE_SAME_COLLECTION'
              : 'PROJECTION_ID_MISMATCH';

      report.counts[
        classification === 'EXACT_SINGLE_TARGET'
          ? 'exactSingleTarget'
          : classification === 'DUPLICATE_SAME_COLLECTION'
            ? 'duplicateSameCollection'
            : classification === 'NO_TARGET'
              ? 'noTarget'
              : 'projectionIdMismatch'
      ] += 1;

      report.candidates.push({
        candidateOrdinal: candidate.candidateOrdinal,
        packetKey: candidate.packetKey,
        sourceRef: candidate.sourceRef,
        codebaseChunkId,
        postgresQdrantId,
        bridgeQdrantPointId,
        atlasPacketQdrantPointId,
        pointCount: points.length,
        pointFacts,
        classification
      });
    }

    const c = report.counts;
    const everyCandidateHasOneNumericAndOneUuid =
      c.numericPointCount === candidates.length && c.uuidPointCount === candidates.length;
    const uuidGenerationProven = c.uuidPointEqualsChunkId === candidates.length;
    const postgresQdrantIdIsPayloadMetadata =
      c.pointIdEqualsPostgresQdrantId === 0 &&
      c.payloadQdrantIdEqualsPostgresQdrantId === candidates.length;

    report.ownerEvidence = {
      everyCandidateHasOneNumericAndOneUuid,
      uuidPointGenerationFromCodebaseChunkId: uuidGenerationProven,
      postgresQdrantIdActsAsPayloadMetadataForCanary: postgresQdrantIdIsPayloadMetadata,
      bridgePrefersNumericPoint:
        c.bridgeMatchesNumericPoint === candidates.length && c.bridgeMatchesUuidPoint === 0,
      atlasPacketsPreferNumericPoint:
        c.atlasPacketMatchesNumericPoint === candidates.length && c.atlasPacketMatchesUuidPoint === 0
    };

    report.status =
      report.counts.noTarget === 0 && report.counts.projectionIdMismatch === 0
        ? 'QDRANT_PROJECTION_ID_GENERATIONS_CENSUSED'
        : 'QDRANT_PROJECTION_TARGETS_BLOCKED';
    report.nextGate =
      report.status === 'QDRANT_PROJECTION_ID_GENERATIONS_CENSUSED'
        ? 'QDRANT_PROJECTION_ID_OWNER_DECISION'
        : 'PROJECTION_ID_RECONCILIATION';
  } finally {
    await pool.end();
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        status: report.status,
        counts: report.counts,
        ownerEvidence: report.ownerEvidence,
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
