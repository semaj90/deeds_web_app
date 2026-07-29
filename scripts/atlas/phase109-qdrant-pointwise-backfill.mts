#!/usr/bin/env tsx
/**
 * Phase 109 Qdrant pointwise backfill
 *
 * Canonical goal:
 * - Read from the real `codebase_chunk_index` schema
 * - Use keyset pagination on immutable UUID `id`
 * - Stop immediately on schema or SQL failure
 * - Inspect Qdrant collection shape and existing point IDs before writing
 * - Reconcile payloads by Postgres authority, never by invented source fields
 * - Persist a Postgres checkpoint so the run can resume safely
 *
 * This script is intentionally conservative. It will refuse to apply writes
 * until the live schema and collection identity contract are both proven.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pg from 'pg';

type JsonRecord = Record<string, unknown>;

type RunMode = 'DRY_RUN' | 'APPLY';

type PresenceState =
  | 'PRESENT'
  | 'ABSENT'
  | 'UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'SCHEMA_MISMATCH'
  | 'ERROR';

type ProofState =
  | 'FULLY_PROVEN'
  | 'PARTIAL_PROVEN'
  | 'NOT_PROVEN'
  | 'FAILED';

interface ColumnInfo {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
}

interface BackfillRow {
  id: string;
  qdrantId: string | null;
  relativePath: string;
  symbol: string | null;
  kind: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  domain: string | null;
  language: string | null;
  extension: string | null;
  contentHash: string | null;
  embeddingModel: string | null;
  metadata: JsonRecord;
  semanticTags: string[];
  gpuCluster: number | null;
  somCluster: number | null;
  pageRankScore: number | null;
  communityId: number | null;
  updatedAt: string | null;
  embeddingText: string;
}

interface QdrantVectorTarget {
  mode: 'named' | 'unnamed';
  vectorName?: string;
  dimension: number;
  distance: string;
}

interface QdrantCollectionInfo {
  status: string;
  pointsCount: number;
  vectorTarget: QdrantVectorTarget | null;
  rawVectors: unknown;
}

export interface PointSample {
  id: string | number;
  payload?: JsonRecord | null;
}

interface PointIdentityInspection {
  strategy: 'uuid-point-ids' | 'legacy-non-uuid';
  sampleCount: number;
  uuidPointIds: number;
  nonUuidPointIds: number;
  payloadPostgresIdMatches: number;
  payloadPostgresIdMismatches: number;
  blockers: string[];
}

interface RepairStats {
  scannedRows: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
}

interface ProjectionCheckpoint {
  projection_name: string;
  collection_name: string;
  corpus_revision: string;
  run_id: string;
  last_source_id: string;
  scanned_rows: number;
  inserted_rows: number;
  updated_rows: number;
  skipped_rows: number;
  failed_rows: number;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  error_json: JsonRecord | null;
  updated_at: string;
}

interface BackfillReport {
  schemaVersion: 'phase109-qdrant-pointwise-backfill.v1';
  runId: string;
  mode: RunMode;
  startedAt: string;
  completedAt: string | null;
  collection: string;
  corpusRevision: string;
  proofState: ProofState;
  blockers: string[];
  schemaColumns: ColumnInfo[];
  qdrantCollection: QdrantCollectionInfo | null;
  identityInspection: PointIdentityInspection | null;
  stats: RepairStats;
  samples: Array<{
    id: string;
    qdrantId: string | null;
    pointId: string;
    readBack: boolean;
    vectorDimension: number | null;
    payloadKeys: string[];
  }>;
  checkpoints: Array<{
    lastSourceId: string;
    scannedRows: number;
    insertedRows: number;
    updatedRows: number;
    skippedRows: number;
    failedRows: number;
    status: ProjectionCheckpoint['status'];
  }>;
  errors: string[];
}

interface CliOptions {
  batchSize: number;
  dryRun: boolean;
  apply: boolean;
  verbose: boolean;
  qdrantCollection: string;
  qdrantUrl: string;
  corpusRevision: string;
  sampleSize: number;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const REPORT_DIR = path.join(REPO_ROOT, 'log', 'artifacts', 'phase109');
const REPORT_JSON = path.join(REPORT_DIR, 'qdrant-pointwise-backfill-latest.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'phase109-qdrant-pointwise-backfill-latest.md');
const RECONCILIATION_REPORT_JSON = path.join(REPORT_DIR, 'qdrant-reconciliation-audit-latest.json');
const CHECKPOINT_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS atlas_projection_checkpoints (
  projection_name text NOT NULL,
  collection_name text NOT NULL,
  corpus_revision text NOT NULL,
  run_id text NOT NULL,
  last_source_id uuid NOT NULL,
  scanned_rows bigint NOT NULL DEFAULT 0,
  inserted_rows bigint NOT NULL DEFAULT 0,
  updated_rows bigint NOT NULL DEFAULT 0,
  skipped_rows bigint NOT NULL DEFAULT 0,
  failed_rows bigint NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED')),
  error_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projection_name, collection_name, corpus_revision)
);
`;

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
export const DEFAULT_COLLECTION = 'codebase_chunks_768';
const DEFAULT_BATCH_SIZE = 500;

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

export function parseHalfvecText(input: string, expectedDimension = 768): number[] {
  if (typeof input !== 'string') {
    throw new TypeError('embedding_text must be a string');
  }

  const body = input.trim();
  if (!body.startsWith('[') || !body.endsWith(']')) {
    throw new Error('invalid pgvector text representation');
  }

  const values = body
    .slice(1, -1)
    .split(',')
    .map((segment) => Number(segment.trim()));

  if (values.length !== expectedDimension) {
    throw new Error(`expected ${expectedDimension} values, got ${values.length}`);
  }

  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new Error(`non-finite vector value at index ${index}`);
    }
  }

  return values;
}

export function vectorNorm(vector: number[]): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function sanitizeMetadata(value: unknown, depth = 2): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as JsonRecord;
  const out: JsonRecord = {};
  const entries = Object.entries(input).slice(0, 32);

  for (const [key, raw] of entries) {
    out[key] = sanitizeMetadataValue(raw, depth);
  }

  return out;
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object' && Array.isArray(value)) {
    return value.slice(0, 16).map((item) => sanitizeMetadataValue(item, depth - 1));
  }
  if (typeof value === 'object') {
    if (depth <= 0) return '[truncated]';
    const out: JsonRecord = {};
    for (const [key, nested] of Object.entries(value as JsonRecord).slice(0, 16)) {
      out[key] = sanitizeMetadataValue(nested, depth - 1);
    }
    return out;
  }
  return String(value);
}

export function detectQdrantVectorTarget(vectors: unknown): QdrantVectorTarget | null {
  if (!vectors || typeof vectors !== 'object') return null;

  const direct = vectors as { size?: unknown; distance?: unknown };
  if (typeof direct.size === 'number' && Number.isFinite(direct.size)) {
    return {
      mode: 'unnamed',
      dimension: direct.size,
      distance: typeof direct.distance === 'string' ? direct.distance : 'Cosine',
    };
  }

  const named = vectors as Record<string, unknown>;
  const preferredNames = ['semantic_768', 'content', 'signature', 'error'];
  for (const name of preferredNames) {
    const candidate = named[name];
    if (candidate && typeof candidate === 'object') {
      const spec = candidate as { size?: unknown; distance?: unknown };
      if (typeof spec.size === 'number' && Number.isFinite(spec.size)) {
        return {
          mode: 'named',
          vectorName: name,
          dimension: spec.size,
          distance: typeof spec.distance === 'string' ? spec.distance : 'Cosine',
        };
      }
    }
  }

  for (const [name, candidate] of Object.entries(named)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const spec = candidate as { size?: unknown; distance?: unknown };
    if (typeof spec.size === 'number' && Number.isFinite(spec.size)) {
      return {
        mode: 'named',
        vectorName: name,
        dimension: spec.size,
        distance: typeof spec.distance === 'string' ? spec.distance : 'Cosine',
      };
    }
  }

  return null;
}

export function classifyExistingPointStrategy(samples: PointSample[]): PointIdentityInspection {
  let uuidPointIds = 0;
  let nonUuidPointIds = 0;
  let payloadPostgresIdMatches = 0;
  let payloadPostgresIdMismatches = 0;

  for (const sample of samples) {
    const pointId = String(sample.id);
    if (isUuid(pointId)) uuidPointIds += 1;
    else nonUuidPointIds += 1;

    const payloadPostgresId = typeof sample.payload?.postgres_id === 'string' ? sample.payload.postgres_id : null;
    if (payloadPostgresId) {
      if (isUuid(payloadPostgresId) && payloadPostgresId === pointId) payloadPostgresIdMatches += 1;
      else payloadPostgresIdMismatches += 1;
    }
  }

  const blockers: string[] = [];
  if (samples.length > 0 && nonUuidPointIds > 0) blockers.push('QDRANT_POINT_IDS_ARE_NOT_UUIDS');
  if (payloadPostgresIdMismatches > 0) blockers.push('QDRANT_PAYLOAD_POSTGRES_ID_MISMATCH');

  return {
    strategy: nonUuidPointIds === 0 ? 'uuid-point-ids' : 'legacy-non-uuid',
    sampleCount: samples.length,
    uuidPointIds,
    nonUuidPointIds,
    payloadPostgresIdMatches,
    payloadPostgresIdMismatches,
    blockers,
  };
}

export function buildProjectionPayload(row: BackfillRow, vector: number[]): JsonRecord {
  return {
    postgres_id: row.id,
    relative_path: row.relativePath,
    file_path: row.relativePath,
    symbol: row.symbol,
    kind: row.kind,
    line_start: row.lineStart,
    line_end: row.lineEnd,
    domain: row.domain,
    language: row.language,
    extension: row.extension,
    content_hash: row.contentHash,
    embedding_model: row.embeddingModel,
    embedding_normalized: Math.abs(vectorNorm(vector) - 1) <= 0.05,
    representation_id: 'semantic_768',
    embedding_dimension: 768,
    embedding_lane: 'dense_768',
    embedding_role: 'canonical_native_semantic',
    embedding_status: 'ACTIVE',
    gpu_cluster: row.gpuCluster,
    som_cluster: row.somCluster,
    page_rank_score: row.pageRankScore,
    community_id: row.communityId,
    tags: [],
    semantic_tags: row.semanticTags,
    metadata: sanitizeMetadata(row.metadata),
    updated_at: row.updatedAt,
  };
}

export function buildProjectionPoint(row: BackfillRow, vector: number[], vectorTarget: QdrantVectorTarget | null) {
  const payload = buildProjectionPayload(row, vector);
  const point: JsonRecord = {
    id: row.id,
    payload,
  };

  if (vectorTarget?.mode === 'named' && vectorTarget.vectorName) {
    point.vector = { [vectorTarget.vectorName]: vector };
  } else {
    point.vector = vector;
  }

  return point;
}

export function buildKeysetQuery(availableColumns: Set<string>): string {
  const selectParts = [
    'id::text AS id',
    'qdrant_id::text AS qdrant_id',
    'relative_path',
    'symbol',
    'kind',
    'line_start',
    'line_end',
    'domain',
    'language',
    'extension',
    'content_hash',
    'embedding_model',
    'metadata',
    'semantic_tags',
    'gpu_cluster',
    'som_cluster',
    'page_rank_score',
    'community_id',
    'updated_at',
    'content_embedding::text AS embedding_text',
  ];

  if (availableColumns.has('embedding_normalized')) {
    selectParts.splice(selectParts.length - 1, 0, 'embedding_normalized');
  }

  return `
    SELECT ${selectParts.join(', ')}
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
      AND id > $1::uuid
    ORDER BY id ASC
    LIMIT $2
  `;
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

async function ensureCheckpointTable(pool: pg.Pool): Promise<void> {
  await pool.query(CHECKPOINT_TABLE_DDL);
}

async function loadColumnInfo(pool: pg.Pool): Promise<ColumnInfo[]> {
  const result = await pool.query(`
    SELECT column_name, data_type, udt_name, is_nullable
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

function requireColumns(columns: ColumnInfo[]): string[] {
  const available = new Set(columns.map((column) => column.name));
  const required = [
    'id',
    'relative_path',
    'content_embedding',
    'qdrant_id',
    'embedding_model',
    'metadata',
    'semantic_tags',
    'updated_at',
    'content_hash',
    'symbol',
    'kind',
    'line_start',
    'line_end',
    'domain',
    'language',
    'extension',
    'gpu_cluster',
    'som_cluster',
    'page_rank_score',
    'community_id',
  ];

  return required.filter((name) => !available.has(name));
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
    pointsCount: Number(result.points_count ?? 0),
    vectorTarget,
    rawVectors: vectors,
  };
}

async function sampleQdrantPoints(qdrantUrl: string, collection: string, limit: number): Promise<PointSample[]> {
  const response = await fetchJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({
      limit,
      with_payload: true,
      with_vector: false,
    }),
  });

  const points = ((response as { result?: { points?: PointSample[] } })?.result?.points ?? []) as PointSample[];
  return points;
}

async function retrieveQdrantPoints(qdrantUrl: string, collection: string, ids: string[]): Promise<PointSample[]> {
  if (ids.length === 0) return [];
  const response = await fetchJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/retrieve`, {
    method: 'POST',
    body: JSON.stringify({
      ids,
      with_payload: true,
      with_vector: false,
    }),
  });
  return (((response as { result?: PointSample[] })?.result ?? []) as PointSample[]).map((point) => ({
    id: point.id,
    payload: (point.payload ?? {}) as JsonRecord,
  }));
}

async function saveCheckpoint(
  pool: pg.Pool,
  checkpoint: ProjectionCheckpoint,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO atlas_projection_checkpoints (
        projection_name,
        collection_name,
        corpus_revision,
        run_id,
        last_source_id,
        scanned_rows,
        inserted_rows,
        updated_rows,
        skipped_rows,
        failed_rows,
        status,
        error_json,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW()
      )
      ON CONFLICT (projection_name, collection_name, corpus_revision)
      DO UPDATE SET
        run_id = EXCLUDED.run_id,
        last_source_id = EXCLUDED.last_source_id,
        scanned_rows = EXCLUDED.scanned_rows,
        inserted_rows = EXCLUDED.inserted_rows,
        updated_rows = EXCLUDED.updated_rows,
        skipped_rows = EXCLUDED.skipped_rows,
        failed_rows = EXCLUDED.failed_rows,
        status = EXCLUDED.status,
        error_json = EXCLUDED.error_json,
        updated_at = NOW()
    `,
    [
      checkpoint.projection_name,
      checkpoint.collection_name,
      checkpoint.corpus_revision,
      checkpoint.run_id,
      checkpoint.last_source_id,
      checkpoint.scanned_rows,
      checkpoint.inserted_rows,
      checkpoint.updated_rows,
      checkpoint.skipped_rows,
      checkpoint.failed_rows,
      checkpoint.status,
      checkpoint.error_json ? JSON.stringify(checkpoint.error_json) : null,
    ],
  );
}

async function loadRows(pool: pg.Pool, columns: Set<string>, cursor: string, limit: number): Promise<BackfillRow[]> {
  const query = buildKeysetQuery(columns);
  const result = await pool.query(query, [cursor, limit]);

  return result.rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const semanticTags = Array.isArray(row.semantic_tags)
      ? row.semantic_tags.map((value: unknown) => String(value)).filter(Boolean)
      : [];

    return {
      id: String(row.id),
      qdrantId: row.qdrant_id == null ? null : String(row.qdrant_id),
      relativePath: String(row.relative_path ?? ''),
      symbol: row.symbol == null ? null : String(row.symbol),
      kind: row.kind == null ? null : String(row.kind),
      lineStart: row.line_start == null ? null : Number(row.line_start),
      lineEnd: row.line_end == null ? null : Number(row.line_end),
      domain: row.domain == null ? null : String(row.domain),
      language: row.language == null ? null : String(row.language),
      extension: row.extension == null ? null : String(row.extension),
      contentHash: row.content_hash == null ? null : String(row.content_hash),
      embeddingModel: row.embedding_model == null ? null : String(row.embedding_model),
      metadata: metadata as JsonRecord,
      semanticTags,
      gpuCluster: row.gpu_cluster == null ? null : Number(row.gpu_cluster),
      somCluster: row.som_cluster == null ? null : Number(row.som_cluster),
      pageRankScore: row.page_rank_score == null ? null : Number(row.page_rank_score),
      communityId: row.community_id == null ? null : Number(row.community_id),
      updatedAt: row.updated_at == null ? null : String(row.updated_at),
      embeddingText: String(row.embedding_text ?? ''),
    };
  });
}

function identityBlockersFromColumns(columns: string[]): string[] {
  const blockers: string[] = [];
  if (!columns.includes('id')) blockers.push('MISSING_ID_COLUMN');
  if (!columns.includes('content_embedding')) blockers.push('MISSING_CONTENT_EMBEDDING_COLUMN');
  if (!columns.includes('relative_path')) blockers.push('MISSING_RELATIVE_PATH_COLUMN');
  if (!columns.includes('content_hash')) blockers.push('MISSING_CONTENT_HASH_COLUMN');
  if (!columns.includes('embedding_model')) blockers.push('MISSING_EMBEDDING_MODEL_COLUMN');
  if (!columns.includes('metadata')) blockers.push('MISSING_METADATA_COLUMN');
  if (!columns.includes('semantic_tags')) blockers.push('MISSING_SEMANTIC_TAGS_COLUMN');
  return blockers;
}

async function loadLatestReconciliationDecision(): Promise<{
  safeForRetrieval: boolean;
  strategy: string | null;
  blockers: string[];
} | null> {
  try {
    const raw = await readFile(RECONCILIATION_REPORT_JSON, 'utf8');
    const parsed = JSON.parse(raw) as JsonRecord;
    const recommendation = (parsed.recommendation as JsonRecord | undefined) ?? {};
    return {
      safeForRetrieval: Boolean(recommendation.safeForRetrieval),
      strategy: typeof recommendation.strategy === 'string' ? recommendation.strategy : null,
      blockers: Array.isArray(recommendation.blockers)
        ? recommendation.blockers.map((item) => String(item))
        : [],
    };
  } catch {
    return null;
  }
}

async function writeReports(report: BackfillReport): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# Phase 109 Qdrant Pointwise Backfill',
    '',
    `- Run ID: \`${report.runId}\``,
    `- Mode: \`${report.mode}\``,
    `- Collection: \`${report.collection}\``,
    `- Corpus revision: \`${report.corpusRevision}\``,
    `- Proof state: \`${report.proofState}\``,
    '',
    '## Blockers',
    ...(report.blockers.length > 0 ? report.blockers.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Identity',
    report.identityInspection
      ? [
          `- Strategy: \`${report.identityInspection.strategy}\``,
          `- Sample count: \`${report.identityInspection.sampleCount}\``,
          `- UUID point IDs: \`${report.identityInspection.uuidPointIds}\``,
          `- Non-UUID point IDs: \`${report.identityInspection.nonUuidPointIds}\``,
          `- Payload postgres_id matches: \`${report.identityInspection.payloadPostgresIdMatches}\``,
          `- Payload postgres_id mismatches: \`${report.identityInspection.payloadPostgresIdMismatches}\``,
        ]
      : ['- not inspected'],
    '',
    '## Stats',
    `- scanned_rows: \`${report.stats.scannedRows}\``,
    `- inserted_rows: \`${report.stats.insertedRows}\``,
    `- updated_rows: \`${report.stats.updatedRows}\``,
    `- skipped_rows: \`${report.stats.skippedRows}\``,
    `- failed_rows: \`${report.stats.failedRows}\``,
    '',
    '## Samples',
    ...(report.samples.length > 0
      ? report.samples.map((sample) =>
          `- ${sample.id} | point_id=${sample.pointId} | readBack=${sample.readBack} | vector_dim=${sample.vectorDimension ?? 'n/a'}`
        )
      : ['- none']),
  ].join('\n');

  await writeFile(REPORT_MD, `${md}\n`, 'utf8');
}

function makeRunId(): string {
  return randomUUID();
}

function resolveOptions(): CliOptions {
  const argv = process.argv.slice(2);
  const apply = parseBooleanFlag(argv, '--apply');
  const dryRun = parseBooleanFlag(argv, '--dry-run') || !apply;
  const qdrantCollection = parseStringArg(argv, '--collection') ?? process.env.QDRANT_COLLECTION ?? DEFAULT_COLLECTION;
  const qdrantUrl = (parseStringArg(argv, '--qdrant-url') ?? process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
  const corpusRevision = parseStringArg(argv, '--corpus-revision') ?? process.env.CORPUS_REVISION ?? process.env.WORKSPACE_REVISION ?? 'unknown';
  const batchSize = parseNumberArg(argv, '--batch', DEFAULT_BATCH_SIZE);
  const sampleSize = parseNumberArg(argv, '--sample', 12);

  return {
    batchSize,
    dryRun,
    apply,
    verbose: parseBooleanFlag(argv, '--verbose'),
    qdrantCollection,
    qdrantUrl,
    corpusRevision,
    sampleSize,
  };
}

async function main(): Promise<void> {
  const options = resolveOptions();
  const runId = makeRunId();
  const startedAt = new Date().toISOString();
  const report: BackfillReport = {
    schemaVersion: 'phase109-qdrant-pointwise-backfill.v1',
    runId,
    mode: options.dryRun ? 'DRY_RUN' : 'APPLY',
    startedAt,
    completedAt: null,
    collection: options.qdrantCollection,
    corpusRevision: options.corpusRevision,
    proofState: 'NOT_PROVEN',
    blockers: [],
    schemaColumns: [],
    qdrantCollection: null,
    identityInspection: null,
    stats: {
      scannedRows: 0,
      insertedRows: 0,
      updatedRows: 0,
      skippedRows: 0,
      failedRows: 0,
    },
    samples: [],
    checkpoints: [],
    errors: [],
  };

  if (!process.env.DATABASE_URL?.trim()) {
    report.blockers.push('DATABASE_URL_REQUIRED');
    report.proofState = 'FAILED';
    report.completedAt = new Date().toISOString();
    await writeReports(report);
    process.exitCode = 7;
    return;
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
  });

  try {
    if (options.apply) {
      const reconciliation = await loadLatestReconciliationDecision();
      if (reconciliation && !reconciliation.safeForRetrieval) {
        report.blockers.push('RECONCILIATION_NOT_SAFE');
        report.proofState = 'FAILED';
        report.errors.push(
          `refusing to apply backfill because the latest reconciliation audit is not safe for retrieval${reconciliation.strategy ? ` (${reconciliation.strategy})` : ''}${reconciliation.blockers.length > 0 ? `: ${reconciliation.blockers.join(', ')}` : ''}`,
        );
        report.completedAt = new Date().toISOString();
        await writeReports(report);
        process.exitCode = 2;
        return;
      }
    }

    await ensureCheckpointTable(pool);

    const columns = await loadColumnInfo(pool);
    report.schemaColumns = columns;
    const available = new Set(columns.map((column) => column.name));
    report.blockers.push(...identityBlockersFromColumns([...available]));
    if (report.blockers.length > 0) {
      report.proofState = 'FAILED';
      throw new Error(`schema mismatch: ${report.blockers.join(', ')}`);
    }

    const qdrantInfo = await inspectQdrantCollection(options.qdrantUrl, options.qdrantCollection);
    report.qdrantCollection = qdrantInfo;
    if (!qdrantInfo.vectorTarget) {
      report.blockers.push('QDRANT_VECTOR_SCHEMA_UNKNOWN');
    } else if (qdrantInfo.vectorTarget.dimension !== 768) {
      report.blockers.push(`QDRANT_VECTOR_DIMENSION_${qdrantInfo.vectorTarget.dimension}_EXPECTED_768`);
    }

    const samplePoints = await sampleQdrantPoints(options.qdrantUrl, options.qdrantCollection, options.sampleSize);
    const identityInspection = classifyExistingPointStrategy(samplePoints);
    report.identityInspection = identityInspection;
    report.blockers.push(...identityInspection.blockers);

    if (report.blockers.length > 0) {
      report.proofState = options.dryRun ? 'PARTIAL_PROVEN' : 'FAILED';
      report.completedAt = new Date().toISOString();
      await writeReports(report);
      process.exitCode = 2;
      return;
    }

    const totalResult = await pool.query(`
      SELECT COUNT(*)::bigint AS total
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
    `);
    const totalRows = Number(totalResult.rows[0]?.total ?? 0);

    let cursor = ZERO_UUID;
    let batchIndex = 0;

    while (true) {
      let rows: BackfillRow[] = [];
      try {
        rows = await loadRows(pool, available, cursor, options.batchSize);
      } catch (error) {
        report.errors.push(`postgres batch query failed at cursor=${cursor}: ${(error as Error).message}`);
        report.stats.failedRows += 1;
        report.proofState = 'FAILED';
        throw error;
      }

      if (rows.length === 0) break;

      const points = rows.map((row) => {
        const vector = parseHalfvecText(row.embeddingText, 768);
        if (row.contentHash == null) {
          throw new Error(`row ${row.id} missing content_hash`);
        }
        if (row.embeddingModel == null) {
          throw new Error(`row ${row.id} missing embedding_model`);
        }
        return buildProjectionPoint(row, vector, report.qdrantCollection?.vectorTarget ?? null);
      });

      report.stats.scannedRows += rows.length;
      cursor = rows[rows.length - 1].id;

      if (options.dryRun) {
        report.stats.skippedRows += rows.length;
      } else {
        const upsertResponse = await fetchJson(
          `${options.qdrantUrl}/collections/${encodeURIComponent(options.qdrantCollection)}/points?wait=true`,
          {
            method: 'PUT',
            body: JSON.stringify({ points }),
          },
        );
        void upsertResponse;

        const readBackIds = rows.map((row) => row.id);
        const readBack = await retrieveQdrantPoints(options.qdrantUrl, options.qdrantCollection, readBackIds);
        const readBackById = new Map(readBack.map((point) => [String(point.id), point]));

        if (readBack.length !== rows.length) {
          throw new Error(
            `read-back count mismatch for batch ${batchIndex + 1}: expected ${rows.length}, got ${readBack.length}`,
          );
        }

        for (const row of rows) {
          const point = readBackById.get(row.id);
          if (!point) {
            throw new Error(`missing qdrant point after upsert: ${row.id}`);
          }

          const payload = (point.payload ?? {}) as JsonRecord;
          if (String(point.id) !== row.id) {
            throw new Error(`point id mismatch for ${row.id}: got ${String(point.id)}`);
          }
          if (String(payload.postgres_id ?? '') !== row.id) {
            throw new Error(`postgres_id mismatch for ${row.id}`);
          }
          if (String(payload.relative_path ?? '') !== row.relativePath) {
            throw new Error(`relative_path mismatch for ${row.id}`);
          }
          if (String(payload.representation_id ?? '') !== 'semantic_768') {
            throw new Error(`representation_id mismatch for ${row.id}`);
          }
          if (Number(payload.embedding_dimension ?? 0) !== 768) {
            throw new Error(`embedding_dimension mismatch for ${row.id}`);
          }
          if (row.embeddingModel && String(payload.embedding_model ?? '') !== row.embeddingModel) {
            throw new Error(`embedding_model mismatch for ${row.id}`);
          }
          if (row.contentHash && String(payload.content_hash ?? '') !== row.contentHash) {
            throw new Error(`content_hash mismatch for ${row.id}`);
          }

          if (report.samples.length < 20) {
            report.samples.push({
              id: row.id,
              qdrantId: row.qdrantId,
              pointId: String(point.id),
              readBack: true,
              vectorDimension: 768,
              payloadKeys: Object.keys(payload).sort(),
            });
          }
        }

        report.stats.insertedRows += rows.length;
      }

      await saveCheckpoint(pool, {
        projection_name: 'phase109-qdrant-pointwise-backfill',
        collection_name: options.qdrantCollection,
        corpus_revision: options.corpusRevision,
        run_id: runId,
        last_source_id: cursor,
        scanned_rows: report.stats.scannedRows,
        inserted_rows: report.stats.insertedRows,
        updated_rows: report.stats.updatedRows,
        skipped_rows: report.stats.skippedRows,
        failed_rows: report.stats.failedRows,
        status: options.dryRun ? 'PAUSED' : 'RUNNING',
        error_json: null,
        updated_at: new Date().toISOString(),
      });

      report.checkpoints.push({
        lastSourceId: cursor,
        scannedRows: report.stats.scannedRows,
        insertedRows: report.stats.insertedRows,
        updatedRows: report.stats.updatedRows,
        skippedRows: report.stats.skippedRows,
        failedRows: report.stats.failedRows,
        status: options.dryRun ? 'PAUSED' : 'RUNNING',
      });

      batchIndex += 1;
      if (options.verbose) {
        console.log(
          `[phase109] batch=${batchIndex} rows=${rows.length} scanned=${report.stats.scannedRows}/${totalRows} cursor=${cursor} dryRun=${options.dryRun}`,
        );
      }
    }

    report.proofState = options.dryRun ? 'PARTIAL_PROVEN' : 'FULLY_PROVEN';
    report.completedAt = new Date().toISOString();
    await saveCheckpoint(pool, {
      projection_name: 'phase109-qdrant-pointwise-backfill',
      collection_name: options.qdrantCollection,
      corpus_revision: options.corpusRevision,
      run_id: runId,
      last_source_id: cursor,
      scanned_rows: report.stats.scannedRows,
      inserted_rows: report.stats.insertedRows,
      updated_rows: report.stats.updatedRows,
      skipped_rows: report.stats.skippedRows,
      failed_rows: report.stats.failedRows,
      status: report.blockers.length === 0 ? 'COMPLETED' : 'PAUSED',
      error_json: report.blockers.length > 0 ? { blockers: report.blockers } : null,
      updated_at: report.completedAt,
    });
    report.checkpoints.push({
      lastSourceId: cursor,
      scannedRows: report.stats.scannedRows,
      insertedRows: report.stats.insertedRows,
      updatedRows: report.stats.updatedRows,
      skippedRows: report.stats.skippedRows,
      failedRows: report.stats.failedRows,
      status: report.blockers.length === 0 ? 'COMPLETED' : 'PAUSED',
    });

    await writeReports(report);

    if (report.blockers.length > 0) {
      process.exitCode = 2;
      return;
    }

    process.exitCode = options.dryRun ? 2 : 0;
  } catch (error) {
    report.proofState = 'FAILED';
    report.completedAt = new Date().toISOString();
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.blockers.push('RUNTIME_FAILURE');
    await writeReports(report);
    process.exitCode = 7;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const executedDirectly = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return import.meta.url === pathToFileURL(path.resolve(argv1)).href;
})();

if (executedDirectly) {
  main().catch((error) => {
    console.error('[phase109] fatal:', error instanceof Error ? error.message : String(error));
    process.exitCode = 7;
  });
}

export { main };
