#!/usr/bin/env tsx
/**
 * Read-only reconciliation audit for codebase_chunks_768 after a partial or
 * uncertain projection run.
 *
 * This script does not write to Postgres or Qdrant.
 * It:
 * - snapshots live collection metadata
 * - scrolls every Qdrant point
 * - loads Postgres identity rows
 * - classifies point identity matches / ambiguities / misses
 * - samples vectors for numeric parity checks
 * - runs one real search probe against a known Postgres vector
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { QdrantClient } from '@qdrant/js-client-rest';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ path: path.resolve(process.cwd(), '.env') });

import {
  detectQdrantVectorTarget,
  isUuid,
  parseHalfvecText,
  sanitizeMetadata,
  vectorNorm,
} from './phase109-qdrant-pointwise-backfill.mts';

type JsonRecord = Record<string, unknown>;

interface ColumnInfo {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
}

interface PostgresIdentityRow {
  id: string;
  qdrantId: string | null;
  relativePath: string;
  chunkId: string | null;
  contentHash: string | null;
  embeddingModel: string | null;
  embeddingNormalized: boolean | null;
  updatedAt: string | null;
}

interface PostgresEmbeddingRow {
  id: string;
  embeddingText: string;
  contentHash: string | null;
  embeddingModel: string | null;
  embeddingNormalized: boolean | null;
}

interface QdrantVectorTarget {
  mode: 'named' | 'unnamed';
  vectorName?: string;
  dimension: number;
  distance: string;
}

interface QdrantCollectionInfo {
  status: string;
  optimizerStatus: string | null;
  pointsCount: number;
  indexedVectorsCount: number;
  vectorTarget: QdrantVectorTarget | null;
  rawVectors: unknown;
  payloadSchema: Record<string, unknown>;
}

interface QdrantPoint {
  id: string | number;
  payload?: JsonRecord | null;
  vector?: unknown;
}

type MatchState =
  | 'MATCHED_POSTGRES_ID'
  | 'MATCHED_CHUNK_ID'
  | 'MATCHED_PATH_HASH'
  | 'MATCHED_QDRANT_ID'
  | 'MATCHED_AMBIGUOUS'
  | 'UNMATCHED';

type PointGeneration = 'PREEXISTING_V1' | 'BACKFILL_V2' | 'UUID_POINT_ID' | 'UNKNOWN';

interface PointMatch {
  state: MatchState;
  postgresRows: PostgresIdentityRow[];
  pointGeneration: PointGeneration;
  reason: string;
}

interface VectorSampleStat {
  qdrantId: string;
  postgresId: string;
  maxAbsDifference: number;
  meanAbsDifference: number;
  qdrantNorm: number;
  postgresNorm: number;
}

interface AuditReport {
  schemaVersion: 'phase109-qdrant-reconciliation-audit.v1';
  runId: string;
  startedAt: string;
  completedAt: string | null;
  collection: string;
  corpusRevision: string;
  qdrantSnapshot: {
    name: string | null;
    createdAt: string | null;
    size: number | null;
    checksum: string | null;
  };
  liveCollection: QdrantCollectionInfo | null;
  postgres: {
    totalEligibleRows: number;
    columns: ColumnInfo[];
    hasChunkId: boolean;
    hasContentHash: boolean;
    hasEmbeddingNormalized: boolean;
    hasQdrantId: boolean;
  };
  qdrant: {
    pointsCount: number;
    totalPointsScanned: number;
    uniquePointIds: number;
    numericPointIds: number;
    uuidPointIds: number;
    minNumericPointId: number | null;
    maxNumericPointId: number | null;
    numericIdGaps: number;
    duplicatePointIds: number;
    duplicatePostgresMappings: number;
    duplicateChunkMappings: number;
    duplicateQdrantIdMappings: number;
    unmatchedPoints: number;
    ambiguousPoints: number;
    ambiguityReasonDistribution: Record<string, number>;
    matchedExact: number;
    matchedChunk: number;
    matchedPathHash: number;
    matchedQdrantId: number;
    representationIdDistribution: Record<string, number>;
    modelRevisionDistribution: Record<string, number>;
    packetVersionDistribution: Record<string, number>;
    generationDistribution: Record<PointGeneration, number>;
    payloadFieldDistribution: Record<string, number>;
    oldPointCount: number;
    newPointCount: number;
  };
  vectorParity: {
    sampled: number;
    compared: number;
    failures: number;
    maxAbsoluteDifference: number | null;
    meanAbsoluteDifference: number | null;
    maxObservedQdrantNorm: number | null;
    minObservedQdrantNorm: number | null;
    searchProbe: {
      executed: boolean;
      vectorName: string | null;
      topId: string | null;
      topScore: number | null;
      sourceRowRank: number | null;
      sourceRowInTop10: boolean;
    };
    samples: VectorSampleStat[];
  };
  recommendation: {
    safeForRetrieval: boolean;
    strategy: 'REPAIR_IN_PLACE' | 'REBUILD_NEW_COLLECTION' | 'RECONCILIATION_REQUIRED';
    reason: string;
    blockers: string[];
  };
  samples: Array<{
    qdrantId: string;
    postgresId: string | null;
    state: MatchState;
    generation: PointGeneration;
    payloadKeys: string[];
    payloadPostgresId: string | null;
    payloadQdrantId: string | null;
    payloadChunkId: string | null;
    payloadRepresentationId: string | null;
    payloadModelRevision: string | null;
  }>;
  errors: string[];
}

interface CliOptions {
  batchSize: number;
  sampleSize: number;
  vectorSampleSize: number;
  qdrantCollection: string;
  qdrantUrl: string;
  databaseUrl: string;
  corpusRevision: string;
  json: boolean;
  verbose: boolean;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const REPORT_DIR = path.join(REPO_ROOT, 'log', 'artifacts', 'phase109');
const REPORT_JSON = path.join(REPORT_DIR, 'qdrant-reconciliation-audit-latest.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'phase109-qdrant-reconciliation-audit-latest.md');
const DEFAULT_COLLECTION = 'codebase_chunks_768';
const DEFAULT_QDRANT_URL = 'http://127.0.0.1:6333';
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_SAMPLE_SIZE = 100;

function parseBooleanFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseNumberArg(argv: string[], name: string, defaultValue: number): number {
  const match = argv.find((arg) => arg.startsWith(`${name}=`));
  if (!match) return defaultValue;
  const raw = match.split('=', 2)[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultValue;
}

function parseStringArg(argv: string[], name: string): string | null {
  const idx = argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (idx === -1) return null;
  const arg = argv[idx];
  if (arg.includes('=')) return arg.split('=', 2)[1] ?? null;
  return argv[idx + 1] ?? null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toStringOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

function addMulti<T>(map: Map<string, T[]>, key: string | null, value: T): void {
  if (!key) return;
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}

function pointIdAsString(id: string | number): string {
  return String(id);
}

function pointIdAsNumeric(id: string | number): number | null {
  const value = typeof id === 'number' ? id : Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function determinePointGeneration(id: string | number): PointGeneration {
  const numeric = pointIdAsNumeric(id);
  if (numeric == null) {
    return isUuid(pointIdAsString(id)) ? 'UUID_POINT_ID' : 'UNKNOWN';
  }
  return numeric <= 1001 ? 'PREEXISTING_V1' : 'BACKFILL_V2';
}

function maxAbsoluteDifference(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    max = Math.max(max, Math.abs(a[i] - b[i]));
  }
  return max;
}

function meanAbsoluteDifference(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

function extractVector(point: QdrantPoint): number[] | null {
  const vector = point.vector;
  if (Array.isArray(vector)) {
    return vector.map(Number).filter(Number.isFinite);
  }
  if (!vector || typeof vector !== 'object') return null;
  const record = vector as Record<string, unknown>;
  for (const preferred of ['content', 'semantic_768', 'error', 'signature']) {
    const candidate = record[preferred];
    if (Array.isArray(candidate)) {
      return candidate.map(Number).filter(Number.isFinite);
    }
  }
  for (const candidate of Object.values(record)) {
    if (Array.isArray(candidate)) {
      return candidate.map(Number).filter(Number.isFinite);
    }
  }
  return null;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const parsed = await readJsonResponse(response);
  if (!response.ok) {
    const errorText = typeof parsed === 'object' && parsed && 'raw' in parsed
      ? String((parsed as { raw?: unknown }).raw ?? '')
      : JSON.stringify(parsed);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return parsed;
}

async function loadColumnInfo(pool: pg.Pool): Promise<ColumnInfo[]> {
  const result = await pool.query(`
    SELECT
      column_name,
      data_type,
      udt_name,
      is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'codebase_chunk_index'
    ORDER BY ordinal_position
  `);

  return result.rows.map((row) => ({
    name: String(row.column_name),
    dataType: String(row.data_type),
    udtName: String(row.udt_name),
    isNullable: String(row.is_nullable).toLowerCase() === 'yes',
  }));
}

function buildIdentityQuery(columns: Set<string>): string {
  const selectParts = ['id::text AS id', 'qdrant_id::text AS qdrant_id', 'relative_path'];
  if (columns.has('chunk_id')) selectParts.push('chunk_id::text AS chunk_id');
  if (columns.has('content_hash')) selectParts.push('content_hash');
  if (columns.has('embedding_model')) selectParts.push('embedding_model');
  if (columns.has('embedding_normalized')) selectParts.push('embedding_normalized');
  if (columns.has('updated_at')) selectParts.push('updated_at');
  return `
    SELECT ${selectParts.join(', ')}
    FROM codebase_chunk_index
    WHERE content_embedding_768 IS NOT NULL
    ORDER BY id ASC
  `;
}

function buildEmbeddingQuery(columns: Set<string>): string {
  const selectParts = ['id::text AS id', 'content_embedding_768::text AS embedding_text'];
  if (columns.has('content_hash')) selectParts.push('content_hash');
  if (columns.has('embedding_model')) selectParts.push('embedding_model');
  if (columns.has('embedding_normalized')) selectParts.push('embedding_normalized');
  return `
    SELECT ${selectParts.join(', ')}
    FROM codebase_chunk_index
    WHERE id = ANY($1::uuid[])
    ORDER BY id ASC
  `;
}

function identityBlockersFromColumns(columns: string[]): string[] {
  const blockers: string[] = [];
  if (!columns.includes('id')) blockers.push('MISSING_ID_COLUMN');
  if (!columns.includes('relative_path')) blockers.push('MISSING_RELATIVE_PATH_COLUMN');
  if (!columns.includes('content_embedding_768')) blockers.push('MISSING_CONTENT_EMBEDDING_768_COLUMN');
  if (!columns.includes('embedding_model')) blockers.push('MISSING_EMBEDDING_MODEL_COLUMN');
  return blockers;
}

async function inspectQdrantCollection(qdrantUrl: string, collection: string): Promise<QdrantCollectionInfo> {
  const response = await fetchJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}`);
  const result = (response as { result?: JsonRecord })?.result ?? {};
  const config = (result.config as JsonRecord | undefined) ?? {};
  const params = (config.params as JsonRecord | undefined) ?? {};
  const vectors = params.vectors ?? result.vectors ?? null;
  const vectorTarget = detectQdrantVectorTarget(vectors);

  return {
    status: String(result.status ?? 'unknown'),
    optimizerStatus: toStringOrNull(result.optimizer_status ?? null),
    pointsCount: Number(result.points_count ?? 0),
    indexedVectorsCount: Number(result.indexed_vectors_count ?? 0),
    vectorTarget,
    rawVectors: vectors,
    payloadSchema: ((result.payload_schema as JsonRecord | undefined) ?? {}),
  };
}

async function createQdrantSnapshot(qdrantUrl: string, collection: string): Promise<{ name: string | null; createdAt: string | null; size: number | null; checksum: string | null; }> {
  const response = await fetchJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/snapshots`, {
    method: 'POST',
  });
  const result = (response as { result?: JsonRecord })?.result ?? {};
  return {
    name: toStringOrNull(result.name ?? null),
    createdAt: toStringOrNull(result.creation_time ?? null),
    size: isFiniteNumber(result.size) ? Number(result.size) : null,
    checksum: toStringOrNull(result.checksum ?? null),
  };
}

async function scrollAllPoints(qdrantUrl: string, collection: string, limit = 1000): Promise<QdrantPoint[]> {
  const points: QdrantPoint[] = [];
  let offset: unknown = null;

  while (true) {
    const body: JsonRecord = {
      limit,
      with_payload: true,
      with_vector: false,
    };
    if (offset != null) {
      body.offset = offset;
    }

    const response = await fetchJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const result = (response as { result?: JsonRecord })?.result ?? {};
    const batch = Array.isArray(result.points) ? (result.points as QdrantPoint[]) : [];
    points.push(...batch);
    offset = result.next_page_offset ?? null;
    if (offset == null) break;
  }

  return points;
}

async function retrieveQdrantPoints(qdrantUrl: string, collection: string, ids: Array<string | number>): Promise<QdrantPoint[]> {
  if (ids.length === 0) return [];
  const client = new QdrantClient({ url: qdrantUrl, checkCompatibility: false });
  const response = await client.retrieve(collection, {
    ids,
    with_payload: true,
    with_vector: true,
  });
  return Array.isArray(response) ? (response as QdrantPoint[]) : [];
}

async function searchQdrant(
  qdrantUrl: string,
  collection: string,
  vector: number[],
  vectorTarget: QdrantVectorTarget | null,
): Promise<QdrantPoint[]> {
  const body: JsonRecord = {
    limit: 10,
    with_payload: true,
    with_vector: false,
  };
  if (vectorTarget?.mode === 'named' && vectorTarget.vectorName) {
    body.vector = { name: vectorTarget.vectorName, vector };
  } else {
    body.vector = vector;
  }
  const response = await fetchJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/query`, {
    method: 'POST',
    body: JSON.stringify({ query: Array.isArray(body.vector) ? body.vector : (body.vector as { vector: number[] }).vector, using: vectorTarget?.mode === 'named' ? vectorTarget.vectorName : undefined, limit: body.limit, with_payload: body.with_payload, with_vector: body.with_vector }),
  });
  const result = (response as { result?: { points?: QdrantPoint[] } })?.result?.points ?? [];
  return Array.isArray(result) ? result : [];
}

function resolvePointIdentity(
  point: QdrantPoint,
  byPostgresId: Map<string, PostgresIdentityRow>,
  byChunkId: Map<string, PostgresIdentityRow[]>,
  byPathHash: Map<string, PostgresIdentityRow[]>,
  byPathHashChunk: Map<string, PostgresIdentityRow[]>,
  byQdrantId: Map<string, PostgresIdentityRow[]>,
): PointMatch {
  const payload = (point.payload ?? {}) as JsonRecord;
  const pointId = pointIdAsString(point.id);

  const qdrantId = toStringOrNull(payload.qdrant_id) ?? pointId;
  const postgresId = toStringOrNull(payload.postgres_id);
  const representationId = toStringOrNull(payload.representation_id);
  const chunkId = toStringOrNull(payload.chunk_id);
  const relativePath = toStringOrNull(payload.relative_path ?? payload.source_ref);
  const contentHash = toStringOrNull(payload.content_hash);

  if (postgresId && byPostgresId.has(postgresId)) {
    return { state: 'MATCHED_POSTGRES_ID', postgresRows: [byPostgresId.get(postgresId)!], pointGeneration: determinePointGeneration(point.id), reason: 'payload.postgres_id matched a Postgres row' };
  }

  if (byPostgresId.has(pointId)) {
    return { state: 'MATCHED_POSTGRES_ID', postgresRows: [byPostgresId.get(pointId)!], pointGeneration: determinePointGeneration(point.id), reason: 'Qdrant point id matched a Postgres UUID' };
  }

  if (representationId && byPostgresId.has(representationId)) {
    return { state: 'MATCHED_POSTGRES_ID', postgresRows: [byPostgresId.get(representationId)!], pointGeneration: determinePointGeneration(point.id), reason: 'payload.representation_id matched a Postgres UUID' };
  }

  if (relativePath && contentHash) {
    const qualifiedRows = chunkId
      ? byPathHashChunk.get(`${relativePath}||${contentHash}||${chunkId}`) ?? []
      : [];
    if (qualifiedRows.length === 1) {
      return { state: 'MATCHED_PATH_HASH', postgresRows: qualifiedRows, pointGeneration: determinePointGeneration(point.id), reason: 'relative_path + content_hash + chunk_id mapped uniquely' };
    }
    if (qualifiedRows.length > 1) {
      return { state: 'MATCHED_AMBIGUOUS', postgresRows: qualifiedRows, pointGeneration: determinePointGeneration(point.id), reason: 'relative_path + content_hash + chunk_id matched multiple Postgres rows' };
    }
    const rows = byPathHash.get(`${relativePath}||${contentHash}`) ?? [];
    if (rows.length === 1) {
      return { state: 'MATCHED_PATH_HASH', postgresRows: rows, pointGeneration: determinePointGeneration(point.id), reason: 'relative_path + content_hash mapped uniquely' };
    }
    if (rows.length > 1) {
      return { state: 'MATCHED_AMBIGUOUS', postgresRows: rows, pointGeneration: determinePointGeneration(point.id), reason: 'relative_path + content_hash matched multiple Postgres rows' };
    }
  }

  // chunk_id is not globally unique across revisions. Use it only after the
  // revision-qualified path/hash identity has been exhausted.
  if (chunkId && byChunkId.has(chunkId)) {
    const rows = byChunkId.get(chunkId) ?? [];
    if (rows.length === 1) {
      return { state: 'MATCHED_CHUNK_ID', postgresRows: rows, pointGeneration: determinePointGeneration(point.id), reason: 'unique chunk_id mapped to one Postgres row' };
    }
    return { state: 'MATCHED_AMBIGUOUS', postgresRows: rows, pointGeneration: determinePointGeneration(point.id), reason: 'chunk_id matched multiple Postgres rows without unique path/hash' };
  }

  if (qdrantId && byQdrantId.has(qdrantId)) {
    const rows = byQdrantId.get(qdrantId) ?? [];
    if (rows.length === 1) {
      return { state: 'MATCHED_QDRANT_ID', postgresRows: rows, pointGeneration: determinePointGeneration(point.id), reason: 'payload.qdrant_id mapped uniquely' };
    }
    if (rows.length > 1) {
      return { state: 'MATCHED_AMBIGUOUS', postgresRows: rows, pointGeneration: determinePointGeneration(point.id), reason: 'payload.qdrant_id matched multiple Postgres rows' };
    }
  }

  return { state: 'UNMATCHED', postgresRows: [], pointGeneration: determinePointGeneration(point.id), reason: 'no authoritative Postgres identity matched' };
}

async function loadPostgresIdentities(pool: pg.Pool, columns: Set<string>): Promise<PostgresIdentityRow[]> {
  const result = await pool.query(buildIdentityQuery(columns));
  return result.rows.map((row) => ({
    id: String(row.id),
    qdrantId: row.qdrant_id == null ? null : String(row.qdrant_id),
    relativePath: String(row.relative_path ?? ''),
    chunkId: row.chunk_id == null ? null : String(row.chunk_id),
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    embeddingModel: row.embedding_model == null ? null : String(row.embedding_model),
    embeddingNormalized: row.embedding_normalized == null ? null : Boolean(row.embedding_normalized),
    updatedAt: row.updated_at == null ? null : String(row.updated_at),
  }));
}

async function loadPostgresEmbeddings(pool: pg.Pool, columns: Set<string>, ids: string[]): Promise<PostgresEmbeddingRow[]> {
  if (ids.length === 0) return [];
  const result = await pool.query(buildEmbeddingQuery(columns), [ids]);
  return result.rows.map((row) => ({
    id: String(row.id),
    embeddingText: String(row.embedding_text ?? ''),
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    embeddingModel: row.embedding_model == null ? null : String(row.embedding_model),
    embeddingNormalized: row.embedding_normalized == null ? null : Boolean(row.embedding_normalized),
  }));
}

function buildLookupMaps(rows: PostgresIdentityRow[]) {
  const byPostgresId = new Map<string, PostgresIdentityRow>();
  const byChunkId = new Map<string, PostgresIdentityRow[]>();
  const byPathHash = new Map<string, PostgresIdentityRow[]>();
  const byPathHashChunk = new Map<string, PostgresIdentityRow[]>();
  const byQdrantId = new Map<string, PostgresIdentityRow[]>();

  for (const row of rows) {
    byPostgresId.set(row.id, row);
    addMulti(byChunkId, row.chunkId, row);
    if (row.contentHash) {
      addMulti(byPathHash, `${row.relativePath}||${row.contentHash}`, row);
      addMulti(byPathHashChunk, `${row.relativePath}||${row.contentHash}||${row.chunkId ?? ''}`, row);
    }
    addMulti(byQdrantId, row.qdrantId, row);
  }

  return { byPostgresId, byChunkId, byPathHash, byPathHashChunk, byQdrantId };
}

function countDuplicates(map: Map<string, PostgresIdentityRow[]>): number {
  let count = 0;
  for (const rows of map.values()) {
    if (rows.length > 1) count += 1;
  }
  return count;
}

function createDistribution(): Record<string, number> {
  return {};
}

function incrementDistribution(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function formatReport(report: AuditReport): string {
  const lines: string[] = [
    '# Phase 109 Qdrant 768 Reconciliation Audit',
    '',
    `- Run ID: \`${report.runId}\``,
    `- Collection: \`${report.collection}\``,
    `- Corpus revision: \`${report.corpusRevision}\``,
    `- Completed: \`${report.completedAt ?? 'pending'}\``,
    '',
    '## Qdrant',
    `- points_count: \`${report.qdrant.pointsCount}\``,
    `- total_points_scanned: \`${report.qdrant.totalPointsScanned}\``,
    `- unique_point_ids: \`${report.qdrant.uniquePointIds}\``,
    `- duplicate_point_ids: \`${report.qdrant.duplicatePointIds}\``,
    `- duplicate_postgres_mappings: \`${report.qdrant.duplicatePostgresMappings}\``,
    `- duplicate_chunk_mappings: \`${report.qdrant.duplicateChunkMappings}\``,
    `- duplicate_qdrant_id_mappings: \`${report.qdrant.duplicateQdrantIdMappings}\``,
    `- unmatched_points: \`${report.qdrant.unmatchedPoints}\``,
    `- ambiguous_points: \`${report.qdrant.ambiguousPoints}\``,
    `- ambiguity_reason_distribution: \`${JSON.stringify(report.qdrant.ambiguityReasonDistribution)}\``,
    `- matched_exact: \`${report.qdrant.matchedExact}\``,
    `- matched_chunk: \`${report.qdrant.matchedChunk}\``,
    `- matched_path_hash: \`${report.qdrant.matchedPathHash}\``,
    `- matched_qdrant_id: \`${report.qdrant.matchedQdrantId}\``,
    `- representation_id_distribution: \`${JSON.stringify(report.qdrant.representationIdDistribution)}\``,
    `- model_revision_distribution: \`${JSON.stringify(report.qdrant.modelRevisionDistribution)}\``,
    `- packet_version_distribution: \`${JSON.stringify(report.qdrant.packetVersionDistribution)}\``,
    `- generation_distribution: \`${JSON.stringify(report.qdrant.generationDistribution)}\``,
    '',
    '## Postgres',
    `- eligible_rows: \`${report.postgres.totalEligibleRows}\``,
    `- has_chunk_id: \`${report.postgres.hasChunkId}\``,
    `- has_content_hash: \`${report.postgres.hasContentHash}\``,
    `- has_embedding_normalized: \`${report.postgres.hasEmbeddingNormalized}\``,
    `- has_qdrant_id: \`${report.postgres.hasQdrantId}\``,
    '',
    '## Vector Parity',
    `- sampled: \`${report.vectorParity.sampled}\``,
    `- compared: \`${report.vectorParity.compared}\``,
    `- failures: \`${report.vectorParity.failures}\``,
    `- max_absolute_difference: \`${report.vectorParity.maxAbsoluteDifference ?? 'n/a'}\``,
    `- mean_absolute_difference: \`${report.vectorParity.meanAbsoluteDifference ?? 'n/a'}\``,
    `- search_probe: \`${JSON.stringify(report.vectorParity.searchProbe)}\``,
    '',
    '## Recommendation',
    `- safe_for_retrieval: \`${report.recommendation.safeForRetrieval}\``,
    `- strategy: \`${report.recommendation.strategy}\``,
    `- reason: ${report.recommendation.reason}`,
    '',
    '## Blockers',
    ...(report.recommendation.blockers.length > 0 ? report.recommendation.blockers.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Sample Points',
    ...(report.samples.length > 0
      ? report.samples.slice(0, 20).map((sample) =>
          `- ${sample.qdrantId} -> ${sample.postgresId ?? 'unmatched'} | ${sample.state} | ${sample.generation}`
        )
      : ['- none']),
  ];
  return `${lines.join('\n')}\n`;
}

async function writeReports(report: AuditReport): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_MD, formatReport(report), 'utf8');
}

function resolveOptions(): CliOptions {
  const argv = process.argv.slice(2);
  return {
    batchSize: parseNumberArg(argv, '--batch', DEFAULT_BATCH_SIZE),
    sampleSize: parseNumberArg(argv, '--sample', DEFAULT_SAMPLE_SIZE),
    vectorSampleSize: parseNumberArg(argv, '--vector-sample', 100),
    qdrantCollection: parseStringArg(argv, '--collection') ?? process.env.QDRANT_COLLECTION ?? DEFAULT_COLLECTION,
    qdrantUrl: (parseStringArg(argv, '--qdrant-url') ?? process.env.QDRANT_URL ?? DEFAULT_QDRANT_URL).replace(/\/+$/, ''),
    databaseUrl: parseStringArg(argv, '--database-url') ?? process.env.DATABASE_URL ?? '',
    corpusRevision: parseStringArg(argv, '--corpus-revision') ?? process.env.CORPUS_REVISION ?? process.env.WORKSPACE_REVISION ?? 'unknown',
    json: parseBooleanFlag(argv, '--json'),
    verbose: parseBooleanFlag(argv, '--verbose'),
  };
}

async function main(): Promise<void> {
  const options = resolveOptions();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const report: AuditReport = {
    schemaVersion: 'phase109-qdrant-reconciliation-audit.v1',
    runId,
    startedAt,
    completedAt: null,
    collection: options.qdrantCollection,
    corpusRevision: options.corpusRevision,
    qdrantSnapshot: { name: null, createdAt: null, size: null, checksum: null },
    liveCollection: null,
    postgres: {
      totalEligibleRows: 0,
      columns: [],
      hasChunkId: false,
      hasContentHash: false,
      hasEmbeddingNormalized: false,
      hasQdrantId: false,
    },
    qdrant: {
      pointsCount: 0,
      totalPointsScanned: 0,
      uniquePointIds: 0,
      numericPointIds: 0,
      uuidPointIds: 0,
      minNumericPointId: null,
      maxNumericPointId: null,
      numericIdGaps: 0,
      duplicatePointIds: 0,
      duplicatePostgresMappings: 0,
      duplicateChunkMappings: 0,
      duplicateQdrantIdMappings: 0,
      unmatchedPoints: 0,
      ambiguousPoints: 0,
      ambiguityReasonDistribution: createDistribution(),
      matchedExact: 0,
      matchedChunk: 0,
      matchedPathHash: 0,
      matchedQdrantId: 0,
      representationIdDistribution: createDistribution(),
      modelRevisionDistribution: createDistribution(),
      packetVersionDistribution: createDistribution(),
      generationDistribution: {
        PREEXISTING_V1: 0,
        BACKFILL_V2: 0,
        UUID_POINT_ID: 0,
        UNKNOWN: 0,
      },
      payloadFieldDistribution: createDistribution(),
      oldPointCount: 0,
      newPointCount: 0,
    },
    vectorParity: {
      sampled: 0,
      compared: 0,
      failures: 0,
      maxAbsoluteDifference: null,
      meanAbsoluteDifference: null,
      maxObservedQdrantNorm: null,
      minObservedQdrantNorm: null,
      searchProbe: {
        executed: false,
        vectorName: null,
        topId: null,
        topScore: null,
        sourceRowRank: null,
        sourceRowInTop10: false,
      },
      samples: [],
    },
    recommendation: {
      safeForRetrieval: false,
      strategy: 'RECONCILIATION_REQUIRED',
      reason: 'audit not yet executed',
      blockers: [],
    },
    samples: [],
    errors: [],
  };

  if (!options.databaseUrl.trim()) {
    report.errors.push('DATABASE_URL_REQUIRED');
    report.recommendation.blockers.push('DATABASE_URL_REQUIRED');
    report.recommendation.reason = 'DATABASE_URL was not provided';
    report.completedAt = new Date().toISOString();
    await writeReports(report);
    process.exitCode = 7;
    return;
  }

  const pool = new pg.Pool({
    connectionString: options.databaseUrl,
    max: 4,
  });

  try {
    const columns = await loadColumnInfo(pool);
    report.postgres.columns = columns;
    const columnNames = new Set(columns.map((column) => column.name));
    report.postgres.hasChunkId = columnNames.has('chunk_id');
    report.postgres.hasContentHash = columnNames.has('content_hash');
    report.postgres.hasEmbeddingNormalized = columnNames.has('embedding_normalized');
    report.postgres.hasQdrantId = columnNames.has('qdrant_id');
    const columnBlockers = identityBlockersFromColumns([...columnNames]);
    if (columnBlockers.length > 0) {
      report.recommendation.blockers.push(...columnBlockers);
      throw new Error(`schema mismatch: ${columnBlockers.join(', ')}`);
    }

    report.liveCollection = await inspectQdrantCollection(options.qdrantUrl, options.qdrantCollection);
    if (!report.liveCollection.vectorTarget) {
      report.recommendation.blockers.push('QDRANT_VECTOR_SCHEMA_UNKNOWN');
    } else if (report.liveCollection.vectorTarget.dimension !== 768) {
      report.recommendation.blockers.push(`QDRANT_VECTOR_DIMENSION_${report.liveCollection.vectorTarget.dimension}_EXPECTED_768`);
    }

    try {
      report.qdrantSnapshot = await createQdrantSnapshot(options.qdrantUrl, options.qdrantCollection);
    } catch (error) {
      report.errors.push(`snapshot_failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const postgresRows = await loadPostgresIdentities(pool, columnNames);
    report.postgres.totalEligibleRows = postgresRows.length;
    const lookupMaps = buildLookupMaps(postgresRows);

    const qdrantPoints = await scrollAllPoints(options.qdrantUrl, options.qdrantCollection, options.batchSize);
    report.qdrant.totalPointsScanned = qdrantPoints.length;
    report.qdrant.pointsCount = report.liveCollection?.pointsCount ?? qdrantPoints.length;

    const pointIdCounts = new Map<string, number>();
    const postgresMatchCounts = new Map<string, number>();
    const chunkMatchCounts = new Map<string, number>();
    const qdrantIdMatchCounts = new Map<string, number>();
    const sampleRows: Array<{ qdrantPoint: QdrantPoint; match: PointMatch }> = [];

    for (const point of qdrantPoints) {
      const pointId = pointIdAsString(point.id);
      pointIdCounts.set(pointId, (pointIdCounts.get(pointId) ?? 0) + 1);

      const match = resolvePointIdentity(
        point,
        lookupMaps.byPostgresId,
        lookupMaps.byChunkId,
        lookupMaps.byPathHash,
        lookupMaps.byPathHashChunk,
        lookupMaps.byQdrantId,
      );

      report.qdrant.generationDistribution[match.pointGeneration] += 1;
      if (match.pointGeneration === 'PREEXISTING_V1') report.qdrant.oldPointCount += 1;
      if (match.pointGeneration === 'BACKFILL_V2') report.qdrant.newPointCount += 1;

      const payload = (point.payload ?? {}) as JsonRecord;
      for (const key of Object.keys(payload)) {
        incrementDistribution(report.qdrant.payloadFieldDistribution, key);
      }
      incrementDistribution(report.qdrant.representationIdDistribution, toStringOrNull(payload.representation_id) ?? 'missing');
      incrementDistribution(report.qdrant.modelRevisionDistribution, toStringOrNull(payload.model_revision) ?? 'missing');
      incrementDistribution(report.qdrant.packetVersionDistribution, toStringOrNull(payload.packet_version) ?? 'missing');

      if (match.state === 'MATCHED_POSTGRES_ID' || match.state === 'MATCHED_CHUNK_ID' || match.state === 'MATCHED_PATH_HASH' || match.state === 'MATCHED_QDRANT_ID') {
        const row = match.postgresRows[0];
        if (row) {
          postgresMatchCounts.set(row.id, (postgresMatchCounts.get(row.id) ?? 0) + 1);
          if (match.state === 'MATCHED_CHUNK_ID') chunkMatchCounts.set(row.id, (chunkMatchCounts.get(row.id) ?? 0) + 1);
          if (match.state === 'MATCHED_QDRANT_ID') qdrantIdMatchCounts.set(row.id, (qdrantIdMatchCounts.get(row.id) ?? 0) + 1);
        }
      } else if (match.state === 'MATCHED_AMBIGUOUS') {
        report.qdrant.ambiguousPoints += 1;
        incrementDistribution(report.qdrant.ambiguityReasonDistribution, match.reason);
      } else {
        report.qdrant.unmatchedPoints += 1;
      }

      if (match.state === 'MATCHED_POSTGRES_ID') report.qdrant.matchedExact += 1;
      if (match.state === 'MATCHED_CHUNK_ID') report.qdrant.matchedChunk += 1;
      if (match.state === 'MATCHED_PATH_HASH') report.qdrant.matchedPathHash += 1;
      if (match.state === 'MATCHED_QDRANT_ID') report.qdrant.matchedQdrantId += 1;

      if (report.samples.length < 20) {
        report.samples.push({
          qdrantId: pointId,
          postgresId: match.postgresRows[0]?.id ?? null,
          state: match.state,
          generation: match.pointGeneration,
          payloadKeys: Object.keys(payload).sort(),
          payloadPostgresId: toStringOrNull(payload.postgres_id),
          payloadQdrantId: toStringOrNull(payload.qdrant_id),
          payloadChunkId: toStringOrNull(payload.chunk_id),
          payloadRepresentationId: toStringOrNull(payload.representation_id),
          payloadModelRevision: toStringOrNull(payload.model_revision),
        });
      }

      if (match.state === 'MATCHED_AMBIGUOUS') {
        sampleRows.push({ qdrantPoint: point, match });
      } else if (match.state !== 'UNMATCHED' && sampleRows.length < options.vectorSampleSize) {
        sampleRows.push({ qdrantPoint: point, match });
      }
    }

    report.qdrant.uniquePointIds = pointIdCounts.size;
    report.qdrant.numericPointIds = [...pointIdCounts.keys()].filter((id) => pointIdAsNumeric(id) != null).length;
    report.qdrant.uuidPointIds = [...pointIdCounts.keys()].filter((id) => isUuid(id)).length;

    const numericIds = [...pointIdCounts.keys()]
      .map((id) => pointIdAsNumeric(id))
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b);
    if (numericIds.length > 0) {
      report.qdrant.minNumericPointId = numericIds[0] ?? null;
      report.qdrant.maxNumericPointId = numericIds[numericIds.length - 1] ?? null;
      let gaps = 0;
      for (let index = 1; index < numericIds.length; index += 1) {
        const prev = numericIds[index - 1];
        const current = numericIds[index];
        if (current > prev + 1) gaps += current - prev - 1;
      }
      report.qdrant.numericIdGaps = gaps;
      if (numericIds[0] !== undefined && numericIds[0] <= 1001) {
        report.qdrant.oldPointCount = numericIds.filter((value) => value <= 1001).length;
        report.qdrant.newPointCount = numericIds.filter((value) => value > 1001).length;
      }
    }

    report.qdrant.duplicatePointIds = [...pointIdCounts.values()].filter((count) => count > 1).length;
    report.qdrant.duplicatePostgresMappings = countDuplicates(
      new Map([...postgresMatchCounts.entries()].map(([id, count]) => [id, new Array(count).fill(null).map(() => postgresRows.find((row) => row.id === id)!).filter(Boolean)])),
    );
    report.qdrant.duplicateChunkMappings = countDuplicates(
      new Map([...chunkMatchCounts.entries()].map(([id, count]) => [id, new Array(count).fill(null).map(() => postgresRows.find((row) => row.id === id)!).filter(Boolean)])),
    );
    report.qdrant.duplicateQdrantIdMappings = countDuplicates(
      new Map([...qdrantIdMatchCounts.entries()].map(([id, count]) => [id, new Array(count).fill(null).map(() => postgresRows.find((row) => row.id === id)!).filter(Boolean)])),
    );

    const matchedRowsForVectors = sampleRows
      .map(({ qdrantPoint, match }) => ({
        qdrantPoint,
        postgresRow: match.postgresRows[0] ?? null,
      }))
      .filter((item): item is { qdrantPoint: QdrantPoint; postgresRow: PostgresIdentityRow } => item.postgresRow != null)
      .slice(0, options.vectorSampleSize);

    if (matchedRowsForVectors.length > 0) {
      const postgresEmbeddingRows = await loadPostgresEmbeddings(
        pool,
        columnNames,
        matchedRowsForVectors.map((item) => item.postgresRow.id),
      );
      const postgresEmbeddingById = new Map(postgresEmbeddingRows.map((row) => [row.id, row]));
      const retrieved = await retrieveQdrantPoints(
        options.qdrantUrl,
        options.qdrantCollection,
        matchedRowsForVectors.map((item) => item.qdrantPoint.id),
      );
      const retrievedById = new Map(retrieved.map((point) => [pointIdAsString(point.id), point]));

      let maxDiff = 0;
      let totalDiff = 0;
      let compared = 0;
      let failures = 0;
      let maxNorm = 0;
      let minNorm = Number.POSITIVE_INFINITY;

      for (const item of matchedRowsForVectors) {
        const qdrantPoint = retrievedById.get(pointIdAsString(item.qdrantPoint.id));
        const postgresRow = postgresEmbeddingById.get(item.postgresRow.id);
        if (!qdrantPoint || !postgresRow) {
          failures += 1;
          continue;
        }
        const qdrantVector = extractVector(qdrantPoint);
        const postgresVector = parseHalfvecText(postgresRow.embeddingText, 768);
        if (!qdrantVector || qdrantVector.length !== 768 || postgresVector.length !== 768) {
          failures += 1;
          continue;
        }
        if (qdrantVector.some((value) => !Number.isFinite(value))) {
          failures += 1;
          continue;
        }
        const diff = maxAbsoluteDifference(qdrantVector, postgresVector);
        const meanDiff = meanAbsoluteDifference(qdrantVector, postgresVector);
        const qNorm = vectorNorm(qdrantVector);
        const pNorm = vectorNorm(postgresVector);
        maxDiff = Math.max(maxDiff, diff);
        totalDiff += meanDiff;
        maxNorm = Math.max(maxNorm, qNorm);
        minNorm = Math.min(minNorm, qNorm);
        compared += 1;
        report.vectorParity.samples.push({
          qdrantId: pointIdAsString(item.qdrantPoint.id),
          postgresId: item.postgresRow.id,
          maxAbsDifference: diff,
          meanAbsDifference: meanDiff,
          qdrantNorm: qNorm,
          postgresNorm: pNorm,
        });
      }

      report.vectorParity.sampled = matchedRowsForVectors.length;
      report.vectorParity.compared = compared;
      report.vectorParity.failures = failures;
      report.vectorParity.maxAbsoluteDifference = compared > 0 ? maxDiff : null;
      report.vectorParity.meanAbsoluteDifference = compared > 0 ? totalDiff / compared : null;
      report.vectorParity.maxObservedQdrantNorm = compared > 0 ? maxNorm : null;
      report.vectorParity.minObservedQdrantNorm = compared > 0 ? minNorm : null;

      const sampleRow = postgresEmbeddingRows[0];
      if (sampleRow) {
        const searchVector = parseHalfvecText(sampleRow.embeddingText, 768);
        const searchResults = await searchQdrant(
          options.qdrantUrl,
          options.qdrantCollection,
          searchVector,
          report.liveCollection?.vectorTarget ?? null,
        );
        report.vectorParity.searchProbe.executed = true;
        report.vectorParity.searchProbe.vectorName = report.liveCollection?.vectorTarget?.vectorName ?? (report.liveCollection?.vectorTarget?.mode === 'unnamed' ? 'content' : null);
        report.vectorParity.searchProbe.topId = searchResults[0] ? pointIdAsString(searchResults[0].id) : null;
        report.vectorParity.searchProbe.topScore = typeof (searchResults[0] as JsonRecord | undefined)?.score === 'number'
          ? Number((searchResults[0] as JsonRecord).score)
          : null;
        const sourceRowRank = searchResults.findIndex((point) => {
          const payload = (point.payload ?? {}) as JsonRecord;
          if (toStringOrNull(payload.postgres_id) === sampleRow.id) return true;
          if (toStringOrNull(payload.qdrant_id) === sampleRow.id) return true;
          const resolved = resolvePointIdentity(
            point,
            lookupMaps.byPostgresId,
            lookupMaps.byChunkId,
            lookupMaps.byPathHash,
            lookupMaps.byPathHashChunk,
            lookupMaps.byQdrantId,
          );
          return resolved.postgresRows.some((row) => row.id === sampleRow.id);
        });
        report.vectorParity.searchProbe.sourceRowRank = sourceRowRank >= 0 ? sourceRowRank + 1 : null;
        report.vectorParity.searchProbe.sourceRowInTop10 = sourceRowRank >= 0 && sourceRowRank < 10;
      }
    }

    const duplicatePostgresRows = [...postgresMatchCounts.entries()].filter(([, count]) => count > 1).length;
    const duplicateChunkRows = [...chunkMatchCounts.entries()].filter(([, count]) => count > 1).length;
    const duplicateQdrantRows = [...qdrantIdMatchCounts.entries()].filter(([, count]) => count > 1).length;
    report.qdrant.duplicatePostgresMappings = duplicatePostgresRows;
    report.qdrant.duplicateChunkMappings = duplicateChunkRows;
    report.qdrant.duplicateQdrantIdMappings = duplicateQdrantRows;

    const blockers: string[] = [];
    if ((report.qdrant.ambiguousPoints ?? 0) > 0) blockers.push('AMBIGUOUS_QDRANT_POINTS_PRESENT');
    if ((report.qdrant.unmatchedPoints ?? 0) > 0) blockers.push('UNMATCHED_QDRANT_POINTS_PRESENT');
    if ((report.qdrant.duplicatePostgresMappings ?? 0) > 0) blockers.push('POSTGRES_ROWS_WITH_MULTIPLE_QDRANT_POINTS');
    if ((report.vectorParity.failures ?? 0) > 0) blockers.push('VECTOR_SAMPLE_READBACK_FAILED');
    if (!report.vectorParity.searchProbe.executed) blockers.push('SEARCH_PROBE_NOT_EXECUTED');
    if (report.vectorParity.searchProbe.sourceRowRank == null) blockers.push('SOURCE_ROW_NOT_RECOVERED_IN_SEARCH_TOP10');
    if ((report.vectorParity.maxAbsoluteDifference ?? Number.POSITIVE_INFINITY) > 0.001) blockers.push('VECTOR_PARITY_MAX_ABS_DIFF_EXCEEDS_THRESHOLD');

    report.recommendation.blockers = blockers;
    if (blockers.length === 0) {
      report.recommendation.safeForRetrieval = true;
      report.recommendation.strategy = 'REPAIR_IN_PLACE';
      report.recommendation.reason = 'all points reconcile to Postgres and sampled vectors read back within threshold';
    } else if (report.qdrant.ambiguousPoints > 0 || report.qdrant.unmatchedPoints > 0 || report.qdrant.duplicatePostgresMappings > 0) {
      report.recommendation.safeForRetrieval = false;
      report.recommendation.strategy = 'REBUILD_NEW_COLLECTION';
      report.recommendation.reason = 'identity ambiguity or duplicate mapping requires a clean collection before retrieval can resume';
    } else {
      report.recommendation.safeForRetrieval = false;
      report.recommendation.strategy = 'RECONCILIATION_REQUIRED';
      report.recommendation.reason = 'identity or vector parity evidence is incomplete';
    }

    report.completedAt = new Date().toISOString();
    await writeReports(report);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (options.verbose) {
      console.log(formatReport(report));
    } else {
      console.log(
        `[phase109-audit] points=${report.qdrant.pointsCount} matched=${report.qdrant.matchedExact + report.qdrant.matchedChunk + report.qdrant.matchedPathHash + report.qdrant.matchedQdrantId} unmatched=${report.qdrant.unmatchedPoints} ambiguous=${report.qdrant.ambiguousPoints} safe=${report.recommendation.safeForRetrieval}`,
      );
    }

    process.exitCode = report.recommendation.safeForRetrieval ? 0 : 2;
  } catch (error) {
    report.completedAt = new Date().toISOString();
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.recommendation.blockers.push('RUNTIME_FAILURE');
    report.recommendation.safeForRetrieval = false;
    report.recommendation.strategy = 'RECONCILIATION_REQUIRED';
    report.recommendation.reason = 'runtime failure before reconciliation completed';
    await writeReports(report);
    process.exitCode = 7;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const executedDirectly = (() => {
  const currentFile = path.resolve(fileURLToPath(import.meta.url));
  return process.argv.some((arg) => path.resolve(arg) === currentFile);
})();

if (executedDirectly) {
  main().catch((error) => {
    console.error('[phase109-audit] fatal:', error instanceof Error ? error.message : String(error));
    process.exitCode = 7;
  });
}

export {
  buildEmbeddingQuery,
  buildIdentityQuery,
  determinePointGeneration,
  extractVector,
  formatReport,
  identityBlockersFromColumns,
  loadPostgresEmbeddings,
  loadPostgresIdentities,
  maxAbsoluteDifference,
  meanAbsoluteDifference,
  resolvePointIdentity,
  scrollAllPoints,
  searchQdrant,
};

export { main };
