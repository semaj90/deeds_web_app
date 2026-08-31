#!/usr/bin/env node
/**
 * QDRANT-PROJECTION-ID-OWNER-02
 *
 * Read-only actual-point-ID ownership audit for the mixed semantic_768
 * collection. This gate compares real Qdrant point.id values with the durable
 * Postgres row UUID, codebase_chunk_index.qdrant_id, packet_qdrant_bridge and
 * atlas_packets bindings. Payload qdrant_point_id is evidence only and never
 * substitutes for actual point.id.
 *
 * No Postgres/Qdrant writes are performed.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const DEFAULT_COLLECTION = 'codebase_chunks_768';
const DEFAULT_LIMIT = 15;
const DEFAULT_CANDIDATE_MAP = path.join(REPO_ROOT, 'docs', 'reports', 'lineage-qualified-current-candidate-map-v2.json');
const DEFAULT_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-projection-id-owner-v2.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function argValue(argv, name, fallback) {
  const direct = argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? fallback : fallback;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

function f32leChecksum(vector) {
  if (!Array.isArray(vector) || vector.length !== 768) return null;
  const bytes = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i += 1) {
    const value = Number(vector[i]);
    if (!Number.isFinite(value)) return null;
    bytes.writeFloatLE(value, i * 4);
  }
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function normalizeVector(point) {
  if (Array.isArray(point?.vector)) return point.vector;
  if (!point?.vector || typeof point.vector !== 'object') return null;
  if (Array.isArray(point.vector.content)) return point.vector.content;
  if (Array.isArray(point.vector.semantic_768)) return point.vector.semantic_768;
  const candidates = Object.values(point.vector).filter(Array.isArray);
  return candidates.length === 1 ? candidates[0] : null;
}

function normalizePointId(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return { kind: 'uint64', text: String(value) };
  if (typeof value === 'string' && UUID_RE.test(value)) return { kind: 'uuid', text: value.toLowerCase() };
  return { kind: 'other', text: String(value) };
}

function sameId(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function payloadValue(payload, ...keys) {
  for (const key of keys) {
    if (payload && payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return null;
}

function lineageEnvelope(payload) {
  return {
    postgresId: payloadValue(payload, 'postgres_id', 'postgresId', 'codebase_chunk_id', 'codebaseChunkId'),
    packetKey: payloadValue(payload, 'packet_key', 'packetKey'),
    sourceRef: payloadValue(payload, 'source_ref', 'sourceRef'),
    sourceRevision: payloadValue(payload, 'source_revision', 'sourceRevision'),
    workspaceRevision: payloadValue(payload, 'workspace_revision', 'workspaceRevision'),
    representationId: payloadValue(payload, 'representation_id', 'representationId'),
    representationRevision: payloadValue(payload, 'representation_revision', 'representationRevision'),
    modelRevision: payloadValue(payload, 'model_revision', 'modelRevision'),
    payloadQdrantPointId: payloadValue(payload, 'qdrant_point_id', 'qdrantPointId'),
  };
}

function completeLineage(lineage) {
  return Boolean(
    lineage.postgresId && lineage.sourceRef && lineage.sourceRevision && lineage.workspaceRevision &&
    lineage.representationId && lineage.representationRevision,
  );
}

function extractCandidateRows(document) {
  const arrays = Array.isArray(document)
    ? [document]
    : ['candidates', 'rows', 'candidateMap', 'candidate_map', 'entries', 'items']
        .map((key) => document?.[key])
        .filter(Array.isArray);
  const source = arrays[0] ?? [];
  return source.flatMap((item) => {
    const id = item?.codebaseChunkId ?? item?.codebase_chunk_id ?? item?.postgresId ?? item?.postgres_id ?? item?.chunkStorageId ?? item?.id;
    if (!id || !UUID_RE.test(String(id))) return [];
    return [{
      codebaseChunkId: String(id),
      packetKey: item?.packetKey ?? item?.packet_key ?? null,
      candidateOrdinal: Number.isInteger(item?.candidateOrdinal)
        ? item.candidateOrdinal
        : Number.isInteger(item?.candidate_ordinal)
          ? item.candidate_ordinal
          : null,
    }];
  });
}

async function qdrantPost(baseUrl, collection, endpoint, body) {
  const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`QDRANT_HTTP_${response.status}:${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function retrieveByIds(baseUrl, collection, ids) {
  if (ids.length === 0) return [];
  const body = await qdrantPost(baseUrl, collection, '/points', { ids, with_payload: true, with_vector: true });
  return body.result ?? [];
}

async function scrollByPostgresId(baseUrl, collection, postgresId) {
  for (const key of ['postgres_id', 'postgresId', 'codebase_chunk_id', 'codebaseChunkId']) {
    const body = await qdrantPost(baseUrl, collection, '/points/scroll', {
      limit: 16,
      with_payload: true,
      with_vector: true,
      filter: { must: [{ key, match: { value: postgresId } }] },
    });
    const points = body.result?.points ?? [];
    if (points.length > 0) return { key, points };
  }
  return { key: null, points: [] };
}

function dedupePoints(points) {
  const byId = new Map();
  for (const point of points) byId.set(`${typeof point.id}:${String(point.id)}`, point);
  return [...byId.values()];
}

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${table}`]);
  return Boolean(rows[0]?.exists);
}

async function loadBindings(client, packetKey, qdrantId) {
  let bridge = null;
  let packet = null;

  if (await tableExists(client, 'packet_qdrant_bridge')) {
    if (packetKey) {
      const { rows } = await client.query(
        'SELECT packet_key, qdrant_point_id::text AS qdrant_point_id FROM packet_qdrant_bridge WHERE packet_key = $1 LIMIT 2',
        [packetKey],
      );
      if (rows.length === 1) bridge = rows[0];
    }
    if (!bridge && qdrantId) {
      const { rows } = await client.query(
        'SELECT packet_key, qdrant_point_id::text AS qdrant_point_id FROM packet_qdrant_bridge WHERE qdrant_point_id::text = $1 LIMIT 2',
        [String(qdrantId)],
      );
      if (rows.length === 1) bridge = rows[0];
    }
  }

  if (await tableExists(client, 'atlas_packets')) {
    const resolvedPacketKey = packetKey ?? bridge?.packet_key ?? null;
    if (resolvedPacketKey) {
      const { rows } = await client.query(
        'SELECT packet_key, qdrant_point_id::text AS qdrant_point_id FROM atlas_packets WHERE packet_key = $1 LIMIT 2',
        [resolvedPacketKey],
      );
      if (rows.length === 1) packet = rows[0];
    }
  }

  return { bridge, packet };
}

export function classifyOwnershipEvidence(row) {
  const uuidPoint = row.points.find((point) => sameId(point.id, row.codebaseChunkId)) ?? null;
  const numericPoints = row.points.filter((point) => typeof point.id === 'number' && Number.isInteger(point.id));
  const numericPoint = numericPoints.length === 1 ? numericPoints[0] : null;
  const numericLineage = lineageEnvelope(numericPoint?.payload ?? null);
  const uuidLineage = lineageEnvelope(uuidPoint?.payload ?? null);
  const numericVectorChecksum = f32leChecksum(normalizeVector(numericPoint));
  const uuidVectorChecksum = f32leChecksum(normalizeVector(uuidPoint));

  return {
    codebaseChunkId: row.codebaseChunkId,
    candidateOrdinal: row.candidateOrdinal,
    packetKey: row.packetKey,
    codebaseChunkQdrantId: row.codebaseChunkQdrantId,
    actualPointIds: row.points.map((point) => point.id),
    actualPointKinds: row.points.map((point) => normalizePointId(point.id).kind),
    numericPointCount: numericPoints.length,
    numericPointId: numericPoint?.id ?? null,
    uuidPointId: uuidPoint?.id ?? null,
    uuidPointEqualsChunkId: Boolean(uuidPoint),
    numericPointEqualsQdrantId: numericPoint ? sameId(numericPoint.id, row.codebaseChunkQdrantId) : false,
    bridgeQdrantPointId: row.bridgeQdrantPointId,
    atlasPacketQdrantPointId: row.atlasPacketQdrantPointId,
    bridgeMatchesNumeric: numericPoint ? sameId(row.bridgeQdrantPointId, numericPoint.id) : false,
    atlasPacketsMatchesNumeric: numericPoint ? sameId(row.atlasPacketQdrantPointId, numericPoint.id) : false,
    numericLineage,
    uuidLineage,
    numericLineageComplete: completeLineage(numericLineage),
    uuidLineageComplete: completeLineage(uuidLineage),
    numericPayloadPointsAtActualId: numericPoint ? sameId(numericLineage.payloadQdrantPointId, numericPoint.id) : false,
    uuidPayloadPointsAtActualId: uuidPoint ? sameId(uuidLineage.payloadQdrantPointId, uuidPoint.id) : false,
    numericVectorChecksum,
    uuidVectorChecksum,
    vectorParity: Boolean(numericVectorChecksum && uuidVectorChecksum && numericVectorChecksum === uuidVectorChecksum),
    payloadRevisionParity: canonicalJson({
      sourceRevision: numericLineage.sourceRevision,
      workspaceRevision: numericLineage.workspaceRevision,
      representationId: numericLineage.representationId,
      representationRevision: numericLineage.representationRevision,
      modelRevision: numericLineage.modelRevision,
    }) === canonicalJson({
      sourceRevision: uuidLineage.sourceRevision,
      workspaceRevision: uuidLineage.workspaceRevision,
      representationId: uuidLineage.representationId,
      representationRevision: uuidLineage.representationRevision,
      modelRevision: uuidLineage.modelRevision,
    }),
    pattern:
      numericPoints.length > 1 ? 'MULTIPLE_NUMERIC' :
      numericPoint && uuidPoint ? 'DUAL_NUMERIC_UUID' :
      numericPoint ? 'NUMERIC_ONLY' :
      uuidPoint ? 'UUID_ONLY' : 'NO_POINT',
  };
}

export function summarizeOwnership(evidence, frozenCohort) {
  const n = evidence.length;
  const count = (fn) => evidence.filter(fn).length;
  const all = (fn) => n > 0 && evidence.every(fn);

  const coreOwnerProven =
    frozenCohort && n === 15 &&
    all((row) => row.pattern === 'DUAL_NUMERIC_UUID') &&
    all((row) => row.uuidPointEqualsChunkId) &&
    all((row) => row.numericPointEqualsQdrantId) &&
    all((row) => row.bridgeMatchesNumeric) &&
    all((row) => row.atlasPacketsMatchesNumeric) &&
    all((row) => row.vectorParity);

  const lineageComplete =
    coreOwnerProven &&
    all((row) => row.numericLineageComplete) &&
    all((row) => row.payloadRevisionParity);

  const ownerDecision = !coreOwnerProven
    ? 'QDRANT_PROJECTION_ID_OWNER_BLOCKED'
    : lineageComplete
      ? 'QDRANT_PROJECTION_ID_OWNER_PROVEN'
      : 'QDRANT_PROJECTION_ID_OWNER_PROVEN_LINEAGE_BLOCKED';

  return {
    candidateCount: n,
    frozenCohort,
    dualGeneration: count((row) => row.pattern === 'DUAL_NUMERIC_UUID'),
    uuidEqualsPostgresChunkId: count((row) => row.uuidPointEqualsChunkId),
    numericEqualsPostgresQdrantId: count((row) => row.numericPointEqualsQdrantId),
    bridgeMatchesNumeric: count((row) => row.bridgeMatchesNumeric),
    atlasPacketsMatchesNumeric: count((row) => row.atlasPacketsMatchesNumeric),
    vectorParity: count((row) => row.vectorParity),
    payloadRevisionParity: count((row) => row.payloadRevisionParity),
    completeNumericLineage: count((row) => row.numericLineageComplete),
    multipleNumeric: count((row) => row.pattern === 'MULTIPLE_NUMERIC'),
    ownerDecision,
    ownerProven: coreOwnerProven,
    projectionIdPolicy: coreOwnerProven
      ? { source: 'codebase_chunk_index.qdrant_id', pointIdType: 'uint64', canonicalAuthority: false }
      : null,
    competingGeneration: {
      writer: 'scripts/atlas/phase109-qdrant-pointwise-backfill.mts',
      pointIdSource: 'codebase_chunk_index.id',
      status: 'CONFLICTING_GENERATION_IN_CODE',
    },
    promotionEligible: lineageComplete,
  };
}

async function main() {
  await loadAtlasEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const argv = process.argv.slice(2);
  const limit = Number.parseInt(argValue(argv, '--limit', String(DEFAULT_LIMIT)), 10) || DEFAULT_LIMIT;
  const collection = argValue(argv, '--collection', process.env.QDRANT_COLLECTION ?? DEFAULT_COLLECTION);
  const qdrantUrl = String(argValue(argv, '--qdrant-url', process.env.QDRANT_URL ?? 'http://127.0.0.1:6333')).replace(/^0\.0\.0\.0/, '127.0.0.1').replace(/\/$/, '');
  const candidateMapPath = path.resolve(argValue(argv, '--candidate-map', DEFAULT_CANDIDATE_MAP));
  const reportPath = path.resolve(argValue(argv, '--out', DEFAULT_REPORT));

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const candidateDoc = JSON.parse(await readFile(candidateMapPath, 'utf8'));
    const candidates = extractCandidateRows(candidateDoc).slice(0, limit);
    const frozenCohort = limit === 15 && candidates.length === 15;
    if (!candidates.length) throw new Error('QDRANT_OWNER_COHORT_EMPTY');

    const evidence = [];
    for (const candidate of candidates) {
      const { rows } = await client.query(
        `SELECT id::text AS id, qdrant_id::text AS qdrant_id, source_ref, relative_path, content_hash
           FROM codebase_chunk_index
          WHERE id = $1::uuid
            AND content_embedding IS NOT NULL`,
        [candidate.codebaseChunkId],
      );
      if (rows.length !== 1) {
        evidence.push({ codebaseChunkId: candidate.codebaseChunkId, candidateOrdinal: candidate.candidateOrdinal, state: 'POSTGRES_ROW_NOT_EXACT' });
        continue;
      }
      const pgRow = rows[0];
      const bindings = await loadBindings(client, candidate.packetKey, pgRow.qdrant_id);
      const directIds = [candidate.codebaseChunkId];
      if (pgRow.qdrant_id && /^\d+$/.test(String(pgRow.qdrant_id))) directIds.push(Number(pgRow.qdrant_id));
      const [direct, payloadMatch] = await Promise.all([
        retrieveByIds(qdrantUrl, collection, directIds),
        scrollByPostgresId(qdrantUrl, collection, candidate.codebaseChunkId),
      ]);
      const points = dedupePoints([...direct, ...payloadMatch.points]);
      evidence.push(classifyOwnershipEvidence({
        ...candidate,
        codebaseChunkQdrantId: pgRow.qdrant_id,
        bridgeQdrantPointId: bindings.bridge?.qdrant_point_id ?? null,
        atlasPacketQdrantPointId: bindings.packet?.qdrant_point_id ?? null,
        points,
      }));
    }

    await client.query('COMMIT');

    const comparableEvidence = evidence.filter((row) => !row.state);
    const ownership = summarizeOwnership(comparableEvidence, frozenCohort && comparableEvidence.length === 15);
    const body = {
      schema: 'atlas.qdrant-projection-id-owner-receipt.v2',
      generatedAt: new Date().toISOString(),
      collection,
      candidateMapPath: path.relative(REPO_ROOT, candidateMapPath).replace(/\\/g, '/'),
      readIsolation: 'REPEATABLE_READ_READ_ONLY',
      evidence,
      ownership,
      writesPerformed: false,
      canonicalAuthority: false,
      nextGate:
        ownership.ownerDecision === 'QDRANT_PROJECTION_ID_OWNER_PROVEN'
          ? 'QDRANT-BG-02_FREEZE_PROJECTION_SNAPSHOT'
          : ownership.ownerDecision === 'QDRANT_PROJECTION_ID_OWNER_PROVEN_LINEAGE_BLOCKED'
            ? 'QDRANT-SEMANTIC-PROJECTION-LINEAGE-01'
            : 'QDRANT-PROJECTION-ID-PROVENANCE-RECONCILE-01',
    };
    const report = { ...body, receiptChecksum: `sha256:${sha256(body)}` };
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[QDRANT-PROJECTION-ID-OWNER-02] ${error?.stack ?? error}`);
  process.exitCode = 1;
});
