#!/usr/bin/env node
/**
 * QDRANT-PROJECTION-ID-OWNER-01
 *
 * Read-only proof gate for the mixed point-ID generations in
 * `codebase_chunks_768`.
 *
 * This script does not assume that UUID or numeric IDs are authoritative.
 * It compares, for the same bounded candidate cohort:
 *
 *   codebase_chunk_index.id                (Postgres row UUID)
 *   codebase_chunk_index.qdrant_id         (legacy projection coordinate)
 *   atlas_packets.qdrant_point_id
 *   packet_qdrant_bridge.qdrant_point_id
 *   numeric Qdrant point(s)
 *   UUID Qdrant point
 *
 * It also records vector and payload-revision parity. No Postgres or Qdrant
 * writes are performed.
 *
 * Preferred usage (same frozen 15-candidate cohort):
 *   node scripts/atlas/audit-qdrant-projection-id-owner.mjs \
 *     --candidate-map=../docs/reports/lineage-qualified-current-candidate-map-v2.json \
 *     --limit=15
 *
 * Fallback usage is allowed for diagnosis, but is never promotion eligible:
 *   node scripts/atlas/audit-qdrant-projection-id-owner.mjs --limit=15
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const DEFAULT_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-projection-id-owner-v1.json');
const DEFAULT_CANDIDATE_MAP = path.join(REPO_ROOT, 'docs', 'reports', 'lineage-qualified-current-candidate-map-v2.json');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_FIELDS = [
  ['representationRevision', 'representation_revision'],
  ['sourceRevision', 'source_revision'],
  ['workspaceRevision', 'workspace_revision'],
  ['modelRevision', 'model_revision'],
  ['representationId', 'representation_id'],
];

function argValue(argv, name, fallback = null) {
  const direct = argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1] ?? fallback;
  return fallback;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
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

function sha256Hex(bytesOrText) {
  return createHash('sha256').update(bytesOrText).digest('hex');
}

export function f32leVectorChecksum(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return null;
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  for (let index = 0; index < vector.length; index += 1) {
    const value = Number(vector[index]);
    if (!Number.isFinite(value)) return null;
    buffer.writeFloatLE(value, index * 4);
  }
  return `sha256:${sha256Hex(buffer)}`;
}

function unwrapVector(point) {
  const vector = point?.vector;
  if (Array.isArray(vector)) return vector;
  if (!vector || typeof vector !== 'object') return null;
  for (const preferred of ['content', 'semantic_768']) {
    if (Array.isArray(vector[preferred])) return vector[preferred];
  }
  const arrays = Object.values(vector).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : null;
}

function payloadValue(payload, snake, camel) {
  if (!payload || typeof payload !== 'object') return null;
  return payload[snake] ?? payload[camel] ?? null;
}

function revisionEnvelope(payload) {
  const out = {};
  for (const [camel, snake] of REVISION_FIELDS) out[camel] = payloadValue(payload, snake, camel);
  return out;
}

function revisionEnvelopePresent(envelope) {
  return Object.values(envelope).every((value) => value !== null && value !== undefined && value !== '');
}

function safeNumericPointId(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  if (!/^\d+$/.test(raw)) return null;
  const integer = BigInt(raw);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(integer);
}

function pointIdEquals(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

function extractSeedArray(document) {
  if (Array.isArray(document)) return document;
  if (!document || typeof document !== 'object') return [];
  for (const key of ['candidates', 'rows', 'candidateMap', 'candidate_map', 'entries', 'items']) {
    if (Array.isArray(document[key])) return document[key];
  }
  return [];
}

export function extractCandidateSeeds(document) {
  const seeds = [];
  for (const item of extractSeedArray(document)) {
    if (!item || typeof item !== 'object') continue;
    const codebaseChunkId =
      item.codebaseChunkId ?? item.codebase_chunk_id ?? item.postgresId ?? item.postgres_id ?? item.chunkStorageId ?? item.id ?? null;
    if (!isUuid(String(codebaseChunkId ?? ''))) continue;
    seeds.push({
      codebaseChunkId: String(codebaseChunkId),
      packetKey: item.packetKey ?? item.packet_key ?? null,
      candidateOrdinal: item.candidateOrdinal ?? item.candidate_ordinal ?? null,
    });
  }
  return seeds;
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadCandidateMap(candidateMapPath, limit) {
  if (!(await fileExists(candidateMapPath))) return null;
  const document = JSON.parse(await readFile(candidateMapPath, 'utf8'));
  const seeds = extractCandidateSeeds(document).slice(0, limit);
  return seeds.length > 0 ? seeds : null;
}

async function tableColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function loadFallbackSeeds(pool, limit) {
  const result = await pool.query(
    `SELECT id::text AS codebase_chunk_id
       FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
        AND qdrant_id IS NOT NULL
      ORDER BY id
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({ codebaseChunkId: row.codebase_chunk_id, packetKey: null, candidateOrdinal: null }));
}

async function loadChunkRow(pool, codebaseChunkId, columns) {
  const optional = (name, sql = name) => columns.has(name) ? `${sql} AS ${name}` : `NULL AS ${name}`;
  const result = await pool.query(
    `SELECT
       id::text AS codebase_chunk_id,
       qdrant_id::text AS codebase_chunk_qdrant_id,
       ${optional('source_ref')},
       ${optional('relative_path')},
       ${optional('content_hash')},
       ${optional('packet_key')},
       ${optional('source_revision')},
       ${optional('workspace_revision')},
       ${optional('representation_revision')},
       ${optional('embedding_model')}
     FROM codebase_chunk_index
     WHERE id = $1::uuid`,
    [codebaseChunkId],
  );
  return result.rows[0] ?? null;
}

async function resolvePacketBindings(pool, chunkRow, seed, bridgeColumns, packetColumns) {
  let packetKey = seed.packetKey ?? chunkRow.packet_key ?? null;
  let bridgeRows = [];
  let packetRows = [];

  if (bridgeColumns.size > 0) {
    if (packetKey && bridgeColumns.has('packet_key')) {
      const result = await pool.query(
        `SELECT packet_key, qdrant_point_id::text AS qdrant_point_id
           FROM packet_qdrant_bridge WHERE packet_key = $1 LIMIT 3`,
        [packetKey],
      );
      bridgeRows = result.rows;
    } else if (chunkRow.codebase_chunk_qdrant_id && bridgeColumns.has('qdrant_point_id')) {
      const result = await pool.query(
        `SELECT packet_key, qdrant_point_id::text AS qdrant_point_id
           FROM packet_qdrant_bridge WHERE qdrant_point_id::text = $1 LIMIT 3`,
        [chunkRow.codebase_chunk_qdrant_id],
      );
      bridgeRows = result.rows;
      if (bridgeRows.length === 1) packetKey = bridgeRows[0].packet_key;
    }
  }

  if (packetColumns.size > 0) {
    if (packetKey && packetColumns.has('packet_key')) {
      const result = await pool.query(
        `SELECT packet_key, qdrant_point_id::text AS qdrant_point_id
           FROM atlas_packets WHERE packet_key = $1 LIMIT 3`,
        [packetKey],
      );
      packetRows = result.rows;
    } else if (chunkRow.codebase_chunk_qdrant_id && packetColumns.has('qdrant_point_id')) {
      const result = await pool.query(
        `SELECT packet_key, qdrant_point_id::text AS qdrant_point_id
           FROM atlas_packets WHERE qdrant_point_id::text = $1 LIMIT 3`,
        [chunkRow.codebase_chunk_qdrant_id],
      );
      packetRows = result.rows;
      if (!packetKey && packetRows.length === 1) packetKey = packetRows[0].packet_key;
    }
  }

  return {
    packetKey,
    bridgeQdrantPointId: bridgeRows.length === 1 ? bridgeRows[0].qdrant_point_id : null,
    atlasPacketQdrantPointId: packetRows.length === 1 ? packetRows[0].qdrant_point_id : null,
    bridgeBindingState: bridgeRows.length === 0 ? 'MISSING' : bridgeRows.length === 1 ? 'EXACT' : 'AMBIGUOUS',
    atlasPacketBindingState: packetRows.length === 0 ? 'MISSING' : packetRows.length === 1 ? 'EXACT' : 'AMBIGUOUS',
  };
}

async function qdrantRequest(qdrantUrl, collection, endpoint, body) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Qdrant ${endpoint} failed: HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function retrieveDirectPoints(qdrantUrl, collection, ids) {
  if (ids.length === 0) return [];
  const data = await qdrantRequest(qdrantUrl, collection, '/points', {
    ids,
    with_payload: true,
    with_vector: true,
  });
  return data.result ?? [];
}

async function scrollByPayloadIdentity(qdrantUrl, collection, codebaseChunkId) {
  for (const key of ['postgres_id', 'codebaseChunkId', 'codebase_chunk_id']) {
    const data = await qdrantRequest(qdrantUrl, collection, '/points/scroll', {
      limit: 16,
      with_payload: true,
      with_vector: true,
      filter: { must: [{ key, match: { value: codebaseChunkId } }] },
    });
    const points = data.result?.points ?? [];
    if (points.length > 0) return { matchedBy: key, points };
  }
  return { matchedBy: null, points: [] };
}

function uniquePoints(points) {
  const seen = new Set();
  const out = [];
  for (const point of points) {
    const key = `${typeof point.id}:${String(point.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(point);
  }
  return out;
}

export function classifyCandidateEvidence(input) {
  const {
    codebaseChunkId,
    codebaseChunkQdrantId,
    packetKey,
    bridgeQdrantPointId,
    atlasPacketQdrantPointId,
    points,
    payloadMatchedBy,
  } = input;

  const uuidPoint = points.find((point) => pointIdEquals(point.id, codebaseChunkId)) ?? null;
  const numericPoints = points.filter((point) => typeof point.id === 'number');
  const numericPoint = numericPoints.length === 1 ? numericPoints[0] : null;

  const numericVector = numericPoint ? unwrapVector(numericPoint) : null;
  const uuidVector = uuidPoint ? unwrapVector(uuidPoint) : null;
  const numericVectorChecksum = f32leVectorChecksum(numericVector);
  const uuidVectorChecksum = f32leVectorChecksum(uuidVector);
  const numericRevision = revisionEnvelope(numericPoint?.payload ?? null);
  const uuidRevision = revisionEnvelope(uuidPoint?.payload ?? null);

  return {
    packetKey,
    codebaseChunkId,
    codebaseChunkQdrantId,
    atlasPacketQdrantPointId,
    packetBridgeQdrantPointId: bridgeQdrantPointId,
    payloadMatchedBy,
    projectionPointIds: points.map((point) => point.id),
    numericPointCount: numericPoints.length,
    numericPointId: numericPoint?.id ?? null,
    uuidPointId: uuidPoint?.id ?? null,
    uuidPointEqualsChunkId: Boolean(uuidPoint),
    numericPointEqualsQdrantId: numericPoint ? pointIdEquals(numericPoint.id, codebaseChunkQdrantId) : false,
    bridgeMatchesNumeric: numericPoint ? pointIdEquals(bridgeQdrantPointId, numericPoint.id) : false,
    atlasPacketsMatchesNumeric: numericPoint ? pointIdEquals(atlasPacketQdrantPointId, numericPoint.id) : false,
    numericPayloadPostgresId: payloadValue(numericPoint?.payload, 'postgres_id', 'postgresId'),
    uuidPayloadPostgresId: payloadValue(uuidPoint?.payload, 'postgres_id', 'postgresId'),
    numericVectorChecksum,
    uuidVectorChecksum,
    vectorParity: Boolean(numericVectorChecksum && uuidVectorChecksum && numericVectorChecksum === uuidVectorChecksum),
    numericPayloadRevision: numericRevision,
    uuidPayloadRevision: uuidRevision,
    numericPayloadRevisionComplete: revisionEnvelopePresent(numericRevision),
    uuidPayloadRevisionComplete: revisionEnvelopePresent(uuidRevision),
    payloadRevisionParity: canonicalJson(numericRevision) === canonicalJson(uuidRevision),
    projectionPattern:
      numericPoints.length > 1 ? 'MULTIPLE_NUMERIC' :
      numericPoint && uuidPoint ? 'DUAL_NUMERIC_UUID' :
      numericPoint ? 'NUMERIC_ONLY' :
      uuidPoint ? 'UUID_ONLY' : 'NO_POINT',
    numericGeneration:
      numericPoint && pointIdEquals(numericPoint.id, codebaseChunkQdrantId)
        ? 'POSTGRES_QDRANT_ID'
        : numericPoint
          ? 'SEQUENTIAL_OR_OTHER_NUMERIC'
          : 'NONE',
  };
}

export function summarizeOwnerEvidence(candidates, sameFrozenCohort) {
  const candidateCount = candidates.length;
  const count = (predicate) => candidates.filter(predicate).length;
  const all = (predicate) => candidateCount > 0 && candidates.every(predicate);

  const summary = {
    candidateCount,
    sameFrozenCohort,
    dualGenerationCandidates: count((row) => row.projectionPattern === 'DUAL_NUMERIC_UUID'),
    uuidEqualsPostgresChunkId: count((row) => row.uuidPointEqualsChunkId),
    numericEqualsPostgresQdrantId: count((row) => row.numericPointEqualsQdrantId),
    bridgeMatchesNumeric: count((row) => row.bridgeMatchesNumeric),
    atlasPacketsMatchesNumeric: count((row) => row.atlasPacketsMatchesNumeric),
    vectorParity: count((row) => row.vectorParity),
    payloadRevisionParity: count((row) => row.payloadRevisionParity),
    payloadRevisionCompleteBoth: count((row) => row.numericPayloadRevisionComplete && row.uuidPayloadRevisionComplete),
    multipleNumericCandidates: count((row) => row.projectionPattern === 'MULTIPLE_NUMERIC'),
    sequentialOrOtherNumericCandidates: count((row) => row.numericGeneration === 'SEQUENTIAL_OR_OTHER_NUMERIC'),
  };

  const numericOwnerProven =
    candidateCount === 15 &&
    sameFrozenCohort &&
    all((row) => row.projectionPattern === 'DUAL_NUMERIC_UUID') &&
    all((row) => row.uuidPointEqualsChunkId) &&
    all((row) => row.numericPointEqualsQdrantId) &&
    all((row) => row.bridgeMatchesNumeric) &&
    all((row) => row.atlasPacketsMatchesNumeric) &&
    all((row) => row.vectorParity) &&
    all((row) => row.payloadRevisionParity);

  return {
    ...summary,
    owner: numericOwnerProven
      ? {
          source: 'codebase_chunk_index.qdrant_id',
          representation: 'uint64',
          canonicalIdentityOwner: false,
          status: 'CURRENT_PROJECTION_ID_OWNER_PROVEN',
        }
      : {
          source: 'UNRESOLVED',
          representation: null,
          canonicalIdentityOwner: false,
          status: 'PROJECTION_ID_OWNER_NOT_PROVEN',
        },
    competingWriter: {
      script: 'scripts/atlas/phase109-qdrant-pointwise-backfill.mts',
      pointIdSource: 'codebase_chunk_index.id',
      status: 'CONFLICTING_GENERATION_CONFIRMED_IN_CODE',
    },
    promotionEligible: numericOwnerProven,
  };
}

async function run() {
  await loadAtlasEnv();
  const argv = process.argv.slice(2);
  const limit = positiveInt(argValue(argv, '--limit', '15'), 15);
  const collection = argValue(argv, '--collection', process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768');
  const qdrantUrl = String(argValue(argv, '--qdrant-url', process.env.QDRANT_URL ?? 'http://127.0.0.1:6333')).replace(/^0\.0\.0\.0/, '127.0.0.1').replace(/\/$/, '');
  const candidateMapPath = path.resolve(argValue(argv, '--candidate-map', DEFAULT_CANDIDATE_MAP));
  const reportPath = path.resolve(argValue(argv, '--out', DEFAULT_REPORT));
  const jsonOnly = argv.includes('--json');

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const chunkColumns = await tableColumns(pool, 'codebase_chunk_index');
    if (!chunkColumns.has('id') || !chunkColumns.has('qdrant_id')) {
      throw new Error('QDRANT_PROJECTION_ID_OWNER_SCHEMA_MISSING_ID_OR_QDRANT_ID');
    }

    const bridgeColumns = await tableColumns(pool, 'packet_qdrant_bridge');
    const packetColumns = await tableColumns(pool, 'atlas_packets');

    const candidateMapSeeds = await loadCandidateMap(candidateMapPath, limit);
    const sameFrozenCohort = Boolean(candidateMapSeeds && candidateMapSeeds.length === 15 && limit === 15);
    const seeds = candidateMapSeeds ?? await loadFallbackSeeds(pool, limit);
    const cohortSource = candidateMapSeeds ? candidateMapPath : 'POSTGRES_DETERMINISTIC_FALLBACK';

    const candidates = [];
    for (const seed of seeds) {
      const chunk = await loadChunkRow(pool, seed.codebaseChunkId, chunkColumns);
      if (!chunk) {
        candidates.push({
          packetKey: seed.packetKey,
          codebaseChunkId: seed.codebaseChunkId,
          state: 'POSTGRES_CHUNK_MISSING',
        });
        continue;
      }

      const packetBinding = await resolvePacketBindings(pool, chunk, seed, bridgeColumns, packetColumns);
      const numericId = safeNumericPointId(chunk.codebase_chunk_qdrant_id);
      const directIds = [chunk.codebase_chunk_id];
      if (numericId !== null) directIds.push(numericId);
      const [direct, byPayload] = await Promise.all([
        retrieveDirectPoints(qdrantUrl, collection, directIds),
        scrollByPayloadIdentity(qdrantUrl, collection, chunk.codebase_chunk_id),
      ]);
      const points = uniquePoints([...direct, ...byPayload.points]);

      candidates.push(classifyCandidateEvidence({
        codebaseChunkId: chunk.codebase_chunk_id,
        codebaseChunkQdrantId: chunk.codebase_chunk_qdrant_id,
        packetKey: packetBinding.packetKey,
        bridgeQdrantPointId: packetBinding.bridgeQdrantPointId,
        atlasPacketQdrantPointId: packetBinding.atlasPacketQdrantPointId,
        points,
        payloadMatchedBy: byPayload.matchedBy,
      }));
    }

    const ownership = summarizeOwnerEvidence(candidates.filter((row) => !row.state), sameFrozenCohort);
    const reportBody = {
      schema: 'atlas.qdrant-projection-id-owner-receipt.v1',
      generatedAt: new Date().toISOString(),
      collection,
      cohortSource,
      sameFrozenCohort,
      candidateLimit: limit,
      candidates,
      ownership,
      writesPerformed: false,
      canonicalAuthority: false,
      notes: [
        'Qdrant point IDs are projection coordinates only; Postgres chunk UUID remains canonical row identity.',
        'CandidateOrdinal is intentionally out of scope: it is snapshot-relative execution identity, not Qdrant point identity.',
        'The legacy keyset writer used sequential numeric Qdrant IDs; this receipt tests whether live numeric IDs nevertheless align with codebase_chunk_index.qdrant_id.',
      ],
    };
    const receiptChecksum = `sha256:${sha256Hex(canonicalJson(reportBody))}`;
    const report = { ...reportBody, receiptChecksum };

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    if (jsonOnly) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      console.log('QDRANT-PROJECTION-ID-OWNER-01');
      console.log(`  collection: ${collection}`);
      console.log(`  cohort: ${cohortSource}`);
      console.log(`  same frozen 15: ${sameFrozenCohort}`);
      console.log(`  candidates: ${ownership.candidateCount}`);
      console.log(`  dual numeric+uuid: ${ownership.dualGenerationCandidates}`);
      console.log(`  uuid == chunk.id: ${ownership.uuidEqualsPostgresChunkId}`);
      console.log(`  numeric == chunk.qdrant_id: ${ownership.numericEqualsPostgresQdrantId}`);
      console.log(`  bridge == numeric: ${ownership.bridgeMatchesNumeric}`);
      console.log(`  atlas_packets == numeric: ${ownership.atlasPacketsMatchesNumeric}`);
      console.log(`  vector parity: ${ownership.vectorParity}`);
      console.log(`  payload revision parity: ${ownership.payloadRevisionParity}`);
      console.log(`  sequential/other numeric: ${ownership.sequentialOrOtherNumericCandidates}`);
      console.log(`  owner: ${ownership.owner.status} (${ownership.owner.source})`);
      console.log(`  promotion eligible: ${ownership.promotionEligible}`);
      console.log(`  writes: false`);
      console.log(`  report: ${reportPath}`);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().catch((error) => {
    console.error(`[QDRANT-PROJECTION-ID-OWNER-01] ${error?.stack ?? error}`);
    process.exitCode = 1;
  });
}
