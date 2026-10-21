#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const outputDir = path.join(root, '.tmp', 'atlas');
const collection = 'codebase_chunks_768_v2';
const env = loadRepoEnv(process.env);
const qdrantUrl = (env.QDRANT_URL || `http://${env.QDRANT_HOST || '127.0.0.1'}:${env.QDRANT_PORT || '6333'}`).replace(/\/$/, '');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, statement_timeout: 60000 });

function validRevision(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/i.test(value.trim());
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function pointLookupKeys(point) {
  const payload = point?.payload ?? {};
  return [
    ['postgres_id', payload.postgres_id],
    ['chunk_id', payload.chunk_id],
  ].filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([field, value]) => `${field}:${String(value)}`);
}

async function qdrant(pathname, body) {
  const response = await fetch(`${qdrantUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`QDRANT_HTTP_${response.status}:${text.slice(0, 500)}`);
  const parsed = JSON.parse(text);
  return parsed.result ?? parsed;
}

async function scrollPoints(withVectorFilter = false) {
  const points = new Map();
  let offset = null;
  const seenOffsets = new Set();
  while (true) {
    const result = await qdrant(`/collections/${encodeURIComponent(collection)}/points/scroll`, {
      limit: 512,
      ...(offset == null ? {} : { offset }),
      ...(withVectorFilter ? { filter: { must: [{ has_vector: 'content' }] } } : {}),
      with_payload: !withVectorFilter,
      with_vector: false,
    });
    for (const point of result.points ?? []) {
      const id = String(point.id);
      const current = points.get(id) ?? { id, payload: point.payload ?? null, hasContentVector: false };
      if (withVectorFilter) current.hasContentVector = true;
      points.set(id, current);
    }
    const next = result.next_page_offset ?? null;
    if (next == null || !(result.points ?? []).length) break;
    const nextKey = String(next);
    if (seenOffsets.has(nextKey)) throw new Error(`QDRANT_SCROLL_CURSOR_REPEATED:${nextKey}`);
    seenOffsets.add(nextKey);
    offset = next;
  }
  return points;
}

function classify(row, pointById, payloadIndex, idCollisionSet) {
  const expectedId = row.qdrantId == null ? null : String(row.qdrantId);
  const point = expectedId ? pointById.get(expectedId) : null;
  const payloadMatches = [...new Set([
    ...(payloadIndex.get(`postgres_id:${row.postgresRowId}`) ?? []),
    ...(row.canonicalChunkId ? payloadIndex.get(`chunk_id:${row.canonicalChunkId}`) ?? [] : []),
  ])];
  const reasons = [];
  if (!validRevision(row.chunkSourceRevision)) reasons.push('CHUNK_SOURCE_REVISION_UNKNOWN');
  if (!validRevision(row.lineageSourceRevision)) reasons.push('LINEAGE_SOURCE_REVISION_UNKNOWN');
  if (!validRevision(row.packetSourceRevision)) reasons.push('PACKET_SOURCE_REVISION_UNKNOWN');
  if (!validRevision(row.packetWorkspaceRevision)) reasons.push('PACKET_WORKSPACE_REVISION_UNKNOWN');
  if (row.qdrantId == null) reasons.push('POSTGRES_QDRANT_ID_MISSING');
  if (expectedId && idCollisionSet.has(expectedId)) reasons.push('POSTGRES_QDRANT_ID_COLLISION');

  let comparison = 'UNKNOWN';
  if (validRevision(row.chunkSourceRevision) && validRevision(row.lineageSourceRevision) && validRevision(row.packetSourceRevision)) {
    comparison = row.chunkSourceRevision === row.lineageSourceRevision && row.lineageSourceRevision === row.packetSourceRevision
      ? 'MATCH'
      : 'CONFLICT';
  }

  if (payloadMatches.length > 1) return { classification: 'AMBIGUOUS', point, payloadMatches, reasons: [...reasons, 'MULTIPLE_QDRANT_PAYLOAD_MATCHES'], revisionComparison: comparison };
  if (point) {
    const payload = point.payload ?? {};
    const strongIdentity = String(payload.postgres_id ?? '') === row.postgresRowId
      || (row.canonicalChunkId && String(payload.chunk_id ?? '') === row.canonicalChunkId);
    const sourceMatches = String(payload.source_ref ?? '') === row.chunkSourceRef;
    if (!strongIdentity || !sourceMatches) return { classification: 'PAYLOAD_MISMATCH', point, payloadMatches, reasons: [...reasons, ...(!strongIdentity ? ['STRONG_CHUNK_IDENTITY_MISSING_OR_MISMATCHED'] : []), ...(!sourceMatches ? ['SOURCE_REF_MISMATCH'] : [])], revisionComparison: comparison };
    if (!point.hasContentVector) return { classification: 'VECTOR_UNVERIFIED', point, payloadMatches, reasons: [...reasons, 'CONTENT_VECTOR_ABSENT_OR_UNVERIFIED'], revisionComparison: comparison };
    if (comparison === 'UNKNOWN') return { classification: 'REVISION_UNKNOWN', point, payloadMatches, reasons, revisionComparison: comparison };
    if (comparison === 'CONFLICT') return { classification: 'REVISION_UNKNOWN', point, payloadMatches, reasons: [...reasons, 'SOURCE_REVISION_CONFLICT'], revisionComparison: comparison };
    return { classification: 'PRESENT_VALID', point, payloadMatches, reasons, revisionComparison: comparison };
  }
  if (payloadMatches.length === 1) {
    return {
      classification: 'PAYLOAD_MISMATCH',
      point: null,
      payloadMatches,
      reasons: [...reasons, 'POINT_ID_MISSING_BUT_PAYLOAD_IDENTITY_EXISTS'],
      revisionComparison: comparison,
    };
  }
  if (comparison !== 'MATCH') return { classification: 'REVISION_UNKNOWN', point: null, payloadMatches, reasons, revisionComparison: comparison };
  return { classification: 'MISSING', point: null, payloadMatches, reasons, revisionComparison: comparison };
}

let client;
try {
  client = await pool.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '60000ms'");
  const admittedCount = await client.query(`
    SELECT count(*)::int AS count
    FROM public.atlas_packets
    WHERE workspace_revision_key ~* '^sha256:[0-9a-f]{64}$'
      AND source_revision ~* '^sha256:[0-9a-f]{64}$'
  `);
  const dbRows = await client.query(`
    WITH admitted_packets AS (
      SELECT packet_key, source_ref, source_revision, workspace_revision_key
      FROM public.atlas_packets
      WHERE workspace_revision_key ~* '^sha256:[0-9a-f]{64}$'
        AND source_revision ~* '^sha256:[0-9a-f]{64}$'
    )
    SELECT l.packet_key, l.canonical_chunk_id, l.chunk_row_id::text AS postgres_row_id,
           l.source_ref AS lineage_source_ref, l.source_revision AS lineage_source_revision,
           p.source_ref AS packet_source_ref, p.source_revision AS packet_source_revision,
           p.workspace_revision_key AS packet_workspace_revision,
           c.chunk_id AS physical_chunk_id, c.source_ref AS chunk_source_ref,
           c.source_revision AS chunk_source_revision, c.workspace_revision AS chunk_workspace_revision,
           c.content_hash, c.content_hash_algorithm, c.embedding_model, c.embedding_version,
           c.encoder_id, c.representation_revision,
           CASE WHEN c.content_embedding_768 IS NULL THEN NULL ELSE vector_dims(c.content_embedding_768) END AS embedding_dimensions,
           c.qdrant_id::text AS qdrant_id
    FROM admitted_packets p
    JOIN public.atlas_packet_chunk_lineage l ON l.packet_key = p.packet_key
    LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
    ORDER BY l.chunk_row_id, l.packet_key, l.canonical_chunk_id
  `);
  const constraintRows = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'codebase_chunk_index'
      AND indexdef ILIKE '%qdrant_id%'
    ORDER BY indexname
  `);
  await client.query('ROLLBACK');
  client.release();
  client = null;

  const pointById = await scrollPoints(false);
  const vectorPoints = await scrollPoints(true);
  for (const id of vectorPoints.keys()) {
    const point = pointById.get(id);
    if (point) point.hasContentVector = true;
  }
  const payloadIndex = new Map();
  for (const point of pointById.values()) {
    for (const key of pointLookupKeys(point)) {
      const values = payloadIndex.get(key) ?? [];
      values.push(point.id);
      payloadIndex.set(key, values);
    }
  }

  const rowsByChunk = new Map();
  for (const raw of dbRows.rows) {
    const key = raw.postgres_row_id ?? `missing:${raw.canonical_chunk_id}`;
    const row = {
      packetKey: raw.packet_key,
      canonicalChunkId: raw.canonical_chunk_id,
      postgresRowId: raw.postgres_row_id,
      lineageSourceRef: raw.lineage_source_ref,
      lineageSourceRevision: raw.lineage_source_revision,
      packetSourceRef: raw.packet_source_ref,
      packetSourceRevision: raw.packet_source_revision,
      packetWorkspaceRevision: raw.packet_workspace_revision,
      physicalChunkId: raw.physical_chunk_id,
      chunkSourceRef: raw.chunk_source_ref,
      chunkSourceRevision: raw.chunk_source_revision,
      chunkWorkspaceRevision: raw.chunk_workspace_revision,
      contentHash: raw.content_hash,
      contentHashAlgorithm: raw.content_hash_algorithm,
      embeddingModel: raw.embedding_model,
      embeddingVersion: raw.embedding_version,
      encoderId: raw.encoder_id,
      representationRevision: raw.representation_revision,
      embeddingDimensions: raw.embedding_dimensions == null ? null : Number(raw.embedding_dimensions),
      qdrantId: raw.qdrant_id,
    };
    const list = rowsByChunk.get(key) ?? [];
    list.push(row);
    rowsByChunk.set(key, list);
  }

  const idCounts = new Map();
  for (const rows of rowsByChunk.values()) {
    const id = rows[0]?.qdrantId;
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const collisions = new Set([...idCounts].filter(([, count]) => count > 1).map(([id]) => id));
  const classifications = [];
  const provenanceLines = [];
  const missingLines = [];
  let ambiguousLineageChunks = 0;
  for (const [chunkKey, rows] of rowsByChunk) {
    const uniquePackets = [...new Set(rows.map((row) => row.packetKey))];
    const row = rows[0];
    if (uniquePackets.length > 1) ambiguousLineageChunks++;
    const result = uniquePackets.length > 1
      ? { classification: 'AMBIGUOUS', point: null, reasons: ['CHUNK_LINKED_TO_MULTIPLE_ADMITTED_PACKETS'], revisionComparison: 'UNKNOWN' }
      : classify(row, pointById, payloadIndex, collisions);
    const record = {
      postgresRowId: row.postgresRowId,
      canonicalChunkId: row.canonicalChunkId,
      physicalChunkId: row.physicalChunkId,
      packetKeys: uniquePackets,
      sourceRef: row.chunkSourceRef ?? row.lineageSourceRef ?? row.packetSourceRef,
      intendedQdrantPointId: row.qdrantId,
      observedQdrantPointId: result.point?.id ?? null,
      pointPresentByExpectedId: Boolean(result.point),
      hasContentVector: Boolean(result.point?.hasContentVector),
      classification: result.classification,
      revisionComparison: result.revisionComparison,
      sourceRevision: {
        chunk: row.chunkSourceRevision,
        lineage: row.lineageSourceRevision,
        packet: row.packetSourceRevision,
      },
      workspaceRevision: {
        chunk: row.chunkWorkspaceRevision,
        packet: row.packetWorkspaceRevision,
      },
      embedding: {
        dimensions: row.embeddingDimensions,
        contentHash: row.contentHash,
        contentHashAlgorithm: row.contentHashAlgorithm,
        model: row.embeddingModel,
        version: row.embeddingVersion,
        encoderId: row.encoderId,
        representationRevision: row.representationRevision,
        databaseVectorPresent: row.embeddingDimensions != null,
      },
      exclusionReasons: result.reasons,
    };
    classifications.push(record);
    provenanceLines.push(JSON.stringify({
      postgresRowId: row.postgresRowId,
      canonicalChunkId: row.canonicalChunkId,
      packetKey: uniquePackets.length === 1 ? uniquePackets[0] : null,
      sourceRef: record.sourceRef,
      chunkSourceRevision: row.chunkSourceRevision,
      lineageSourceRevision: row.lineageSourceRevision,
      packetSourceRevision: row.packetSourceRevision,
      comparison: result.revisionComparison,
      reason: result.revisionComparison === 'UNKNOWN' ? 'CHUNK_OR_LINEAGE_SOURCE_REVISION_MISSING' : null,
      workspaceRevision: row.chunkWorkspaceRevision,
      packetWorkspaceRevision: row.packetWorkspaceRevision,
    }));
    if (!result.point) {
      missingLines.push(JSON.stringify({
        canonicalChunkId: row.canonicalChunkId,
        postgresRowId: row.postgresRowId,
        sourceRef: record.sourceRef,
        embeddingMetadata: record.embedding,
        intendedQdrantPointId: row.qdrantId,
        classification: result.classification,
        exclusionReasons: result.reasons,
        eligibleForFutureWrite: result.classification === 'MISSING'
          && row.embeddingDimensions === 768
          && validRevision(row.chunkSourceRevision)
          && validRevision(row.chunkWorkspaceRevision),
      }));
    }
  }

  const counts = Object.fromEntries(['PRESENT_VALID', 'MISSING', 'PAYLOAD_MISMATCH', 'VECTOR_UNVERIFIED', 'REVISION_UNKNOWN', 'AMBIGUOUS'].map((name) => [name, classifications.filter((row) => row.classification === name).length]));
  const qdrantPointIds = classifications.map((row) => row.intendedQdrantPointId).filter(Boolean);
  const uniqueIntendedIds = new Set(qdrantPointIds);
  const census = {
    schema: 'atlas.qdrant-v2-admitted-mirror-census.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_CENSUS',
    status: 'READ_ONLY_CENSUS_COMPLETE',
    canonicalAuthority: false,
    writesPerformed: { postgres: false, qdrant: false, redisValkey: false, graph: false, gpu: false },
    cohort: {
      admittedPacketPredicate: 'atlas_packets.workspace_revision_key and source_revision are valid sha256 digests',
      admittedPacketRows: Number(admittedCount.rows[0]?.count ?? 0),
      admittedPacketsWithLineage: new Set(dbRows.rows.map((row) => row.packet_key)).size,
      lineageRows: dbRows.rows.length,
      distinctLineageChunks: rowsByChunk.size,
      chunksWithPostgresRows: [...rowsByChunk.values()].filter((rows) => rows[0]?.postgresRowId).length,
      ambiguousLineageChunks,
      chunksWithDatabase768Vector: [...rowsByChunk.values()].filter((rows) => Number(rows[0]?.embeddingDimensions) === 768).length,
      chunksWithUnknownSourceRevision: [...rowsByChunk.values()].filter((rows) => !validRevision(rows[0]?.chunkSourceRevision)).length,
      chunksWithUnknownWorkspaceRevision: [...rowsByChunk.values()].filter((rows) => !validRevision(rows[0]?.chunkWorkspaceRevision)).length,
    },
    qdrant: {
      collection,
      url: qdrantUrl,
      scrollPointCount: pointById.size,
      contentVectorPointCount: vectorPoints.size,
      intendedIdsPresentInPostgres: qdrantPointIds.length,
      uniqueIntendedPointIds: uniqueIntendedIds.size,
      postgresQdrantIdCollisions: collisions.size,
      expectedPointIdsFound: classifications.filter((row) => row.pointPresentByExpectedId).length,
      payloadChunkIdentityFound: classifications.filter((row) => row.classification === 'PAYLOAD_MISMATCH' && row.exclusionReasons.includes('POINT_ID_MISSING_BUT_PAYLOAD_IDENTITY_EXISTS')).length,
      expectedPointsWithContentVector: classifications.filter((row) => row.hasContentVector).length,
      expectedPointIdsMissing: classifications.filter((row) => !row.pointPresentByExpectedId).length,
      postgresQdrantIndexes: constraintRows.rows,
      pointIdMapping: 'Uses the existing codebase_chunk_index.qdrant_id value; this audit does not derive or mint point IDs.',
      pointIdGenerationDeterminism: 'NOT_PROVEN_BY_THIS_CENSUS',
      classificationCounts: counts,
    },
    firstBlocker: 'CHUNK_SOURCE_REVISION_UNKNOWN',
    mirrorWriteStatus: 'MIRROR_WRITE_NOT_AUTHORIZED',
    proposedWriteGate: 'Only rows with verified chunk source/workspace revisions, a 768-D PostgreSQL vector, deterministic existing qdrant_id, and exact source/chunk payload readback may enter a separately approved write proposal.',
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'qdrant-v2-admitted-mirror-census.json'), `${JSON.stringify(census, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'qdrant-v2-missing-points.jsonl'), `${missingLines.join('\n')}${missingLines.length ? '\n' : ''}`);
  await fs.writeFile(path.join(outputDir, 'chunk-source-revision-provenance.jsonl'), `${provenanceLines.join('\n')}${provenanceLines.length ? '\n' : ''}`);
  const markdown = [
    '# Qdrant v2 admitted mirror dry-run',
    '',
    `Generated: ${census.generatedAt}`,
    '',
    '- Mode: read-only; no PostgreSQL, Qdrant, cache, graph, or GPU writes.',
    `- Admitted packets: ${census.cohort.admittedPacketRows}`,
    `- Distinct lineage chunks: ${census.cohort.distinctLineageChunks}`,
    `- Chunks with PostgreSQL 768-D vectors: ${census.cohort.chunksWithDatabase768Vector}`,
    `- Chunks with unknown source revisions: ${census.cohort.chunksWithUnknownSourceRevision}`,
    `- Qdrant v2 points scanned: ${census.qdrant.scrollPointCount}; content-vector points: ${census.qdrant.contentVectorPointCount}`,
    `- Point classifications: ${JSON.stringify(counts)}`,
    `- Postgres qdrant_id collisions: ${census.qdrant.postgresQdrantIdCollisions}; indexes: ${JSON.stringify(constraintRows.rows)}`,
    `- Expected point IDs found: ${census.qdrant.expectedPointIdsFound}; expected IDs missing: ${census.qdrant.expectedPointIdsMissing}`,
    `- Rows with payload chunk identity under a different point ID: ${census.qdrant.payloadChunkIdentityFound}`,
    '- Revision comparisons use MATCH / CONFLICT / UNKNOWN; missing revisions are UNKNOWN.',
    '- Point presence does not qualify a chunk for ACE while source/workspace revisions remain unknown.',
    '- Mirror write status: MIRROR_WRITE_NOT_AUTHORIZED.',
    '',
    'The point-ID mapping is read from `codebase_chunk_index.qdrant_id`; this run does not invent IDs. `PRESENT_VALID` requires a matching expected point ID, strong payload chunk identity, matching source_ref, a stored `content` vector, and matching chunk/lineage/packet source revisions.',
  ].join('\n');
  await fs.writeFile(path.join(outputDir, 'qdrant-v2-dry-run-report.md'), `${markdown}\n`);
  console.log(JSON.stringify({
    status: census.status,
    outputDir: path.relative(root, outputDir),
    cohort: census.cohort,
    qdrant: census.qdrant,
    classificationCounts: counts,
    mirrorWriteStatus: census.mirrorWriteStatus,
  }, null, 2));
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode ??= 0;
}
