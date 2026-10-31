import { sql, type SQL } from 'drizzle-orm';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  EVIDENCE_EMBEDDING_TYPE,
  EVIDENCE_SEMANTIC_DIMENSION,
  EVIDENCE_SOURCE_FIELD,
  type EvidenceEmbeddingProvenance,
} from './evidence-embedding-contract.js';
import {
  EVIDENCE_VECTOR_PROJECTION_CONTRACT_V1,
  EVIDENCE_VECTOR_PROJECTION_LANE_V1,
  type EvidenceVectorExecuteV1,
} from './evidence-vector-persistence-v1.js';

export interface EvidenceProjectionDatabaseV1 extends EvidenceVectorExecuteV1 {
  transaction<T>(operation: (transaction: EvidenceVectorExecuteV1) => Promise<T>): Promise<T>;
}

export interface EvidenceProjectionQdrantV1 {
  upsert(
    collectionAlias: string,
    input: { wait: true; points: Array<{ id: string; vector: { content: number[] }; payload: Record<string, unknown> }> },
  ): Promise<unknown>;
  retrieve(
    collectionAlias: string,
    ids: string[],
    options: { with_payload: true; with_vector: true },
  ): Promise<Array<{ id: string | number; vector?: number[] | Record<string, number[]>; payload?: Record<string, unknown> | null }>>;
}

export interface EvidenceProjectionJobV1 {
  id: string;
  evidence_vector_id: string;
  qdrant_point_id: string;
  projection_lane: string;
  projection_contract_revision: string;
  source_revision: string;
  chunk_index: number;
  output_sha256: string;
  model_artifact_sha256: string;
  input_recipe_revision: string;
  input_sha256: string;
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
}

interface CanonicalEvidenceVectorV1 {
  id: string;
  evidence_id: string;
  chunk_index: number;
  content: string;
  embedding_float4: unknown;
  dimension: number;
  embedding_type: string;
  source_field: string;
  source_revision: string;
  model: string;
  metadata: Record<string, unknown>;
}

export interface EvidenceProjectionWorkerOptionsV1 {
  limit?: number;
  leaseSeconds?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  resolveCollectionAlias(lane: string): Promise<string>;
}

export interface EvidenceProjectionWorkerResultV1 {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
}

function readFloat4Array(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const body = value.slice(1, -1);
    return body.length === 0 ? [] : body.split(',').map(Number);
  }
  throw new Error('EVIDENCE_VECTOR_PROJECTION_READBACK_INVALID_FLOAT4_ARRAY');
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function projectionPayload(row: CanonicalEvidenceVectorV1, provenance: EvidenceEmbeddingProvenance): Record<string, unknown> {
  const metadata = row.metadata;
  return {
    evidence_id: row.evidence_id,
    case_id: boundedText(metadata.case_id, 128),
    source_revision: row.source_revision,
    embedding_input_recipe_revision: provenance.inputRecipeRevision,
    embedding_input_sha256: provenance.inputSha256,
    model_artifact_sha256: provenance.modelArtifactSha256,
    embedding_output_sha256: metadata.embedding_output_sha256,
    embedding_type: row.embedding_type,
    source_field: row.source_field,
    embedding_provenance: provenance,
    chunk_index: row.chunk_index,
    file_name: boundedText(metadata.fileName, 512),
    content_preview: row.content.slice(0, 500),
    extraction_method: boundedText(metadata.extractionMethod, 128),
    section_path: Array.isArray(metadata.sectionPath) ? metadata.sectionPath : [],
    heading: boundedText(metadata.heading, 500),
    citations: Array.isArray(metadata.citations) ? metadata.citations : [],
    token_count: Number(metadata.tokenCount ?? 0),
    section_type: boundedText(metadata.sectionType, 128),
  };
}

function verifyPayload(actual: Record<string, unknown> | null | undefined, expected: Record<string, unknown>): void {
  if (!actual) throw new Error('EVIDENCE_VECTOR_QDRANT_PAYLOAD_READBACK_MISSING');
  for (const key of [
    'evidence_id',
    'case_id',
    'source_revision',
    'embedding_input_recipe_revision',
    'embedding_input_sha256',
    'model_artifact_sha256',
    'embedding_output_sha256',
    'embedding_type',
    'source_field',
    'chunk_index',
  ]) {
    if (actual[key] !== expected[key]) throw new Error(`EVIDENCE_VECTOR_QDRANT_PAYLOAD_MISMATCH:${key}`);
  }
}

function readVector(point: { vector?: number[] | Record<string, number[]> }): number[] {
  const value = point.vector;
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.content)) return value.content;
  throw new Error('EVIDENCE_VECTOR_QDRANT_VECTOR_READBACK_MISSING');
}

async function claimBatch(database: EvidenceProjectionDatabaseV1, limit: number, leaseSeconds: number): Promise<EvidenceProjectionJobV1[]> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`
      UPDATE evidence_vector_projection_outbox
      SET status = 'DEAD_LETTER', lease_token = NULL, lease_expires_at = NULL,
          last_error = COALESCE(last_error, 'lease expired after maximum attempts'), updated_at = clock_timestamp()
      WHERE attempt_count >= max_attempts
        AND ((status IN ('PENDING', 'RETRY') AND available_at <= clock_timestamp())
          OR (status = 'PROCESSING' AND lease_expires_at <= clock_timestamp()))
    `);
    const result = await transaction.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM evidence_vector_projection_outbox
        WHERE attempt_count < max_attempts
          AND ((status IN ('PENDING', 'RETRY') AND available_at <= clock_timestamp())
            OR (status = 'PROCESSING' AND lease_expires_at <= clock_timestamp()))
        ORDER BY available_at, created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE evidence_vector_projection_outbox AS job
      SET status = 'PROCESSING', attempt_count = job.attempt_count + 1,
          lease_token = gen_random_uuid(),
          lease_expires_at = clock_timestamp() + (${leaseSeconds} * interval '1 second'),
          updated_at = clock_timestamp()
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.id::text AS id, job.evidence_vector_id::text AS evidence_vector_id,
        job.qdrant_point_id::text AS qdrant_point_id, job.projection_lane,
        job.projection_contract_revision, job.source_revision, job.chunk_index,
        job.output_sha256, job.model_artifact_sha256, job.input_recipe_revision,
        job.input_sha256, job.attempt_count, job.max_attempts, job.lease_token::text AS lease_token
    `);
    return result.rows as unknown as EvidenceProjectionJobV1[];
  });
}

async function loadCanonicalVector(database: EvidenceProjectionDatabaseV1, job: EvidenceProjectionJobV1): Promise<{
  vector: number[];
  payload: Record<string, unknown>;
  outputChecksum: string;
}> {
  const result = await database.execute(sql`
    SELECT id::text AS id, evidence_id::text AS evidence_id, chunk_index, content,
      vector_dims(embedding) AS dimension,
      vector_to_float4(embedding, ${EVIDENCE_SEMANTIC_DIMENSION}, false) AS embedding_float4,
      embedding_type, source_field, source_revision, model, metadata
    FROM evidence_vectors
    WHERE id = ${job.evidence_vector_id}::uuid
    LIMIT 2
  `);
  if (result.rows.length !== 1) throw new Error(`EVIDENCE_VECTOR_CANONICAL_ROW_NOT_UNIQUE:${result.rows.length}`);
  const row = result.rows[0] as unknown as CanonicalEvidenceVectorV1;
  const metadata = row.metadata;
  const provenance = metadata.embedding_provenance as EvidenceEmbeddingProvenance | undefined;
  const outputChecksum = boundedText(metadata.embedding_output_sha256, 71);
  if (
    row.id !== job.evidence_vector_id
    || row.source_revision !== job.source_revision
    || Number(row.chunk_index) !== job.chunk_index
    || row.embedding_type !== EVIDENCE_EMBEDDING_TYPE
    || row.source_field !== EVIDENCE_SOURCE_FIELD
    || Number(row.dimension) !== EVIDENCE_SEMANTIC_DIMENSION
    || outputChecksum !== job.output_sha256
    || !provenance
    || provenance.modelArtifactSha256 !== job.model_artifact_sha256
    || provenance.inputRecipeRevision !== job.input_recipe_revision
    || provenance.inputSha256 !== job.input_sha256
  ) {
    throw new Error('EVIDENCE_VECTOR_PROJECTION_CANONICAL_IDENTITY_MISMATCH');
  }
  const vector = validateSemantic768OutputV1(readFloat4Array(row.embedding_float4));
  if (digestSemantic768OutputV1(vector) !== job.output_sha256) {
    throw new Error('EVIDENCE_VECTOR_PROJECTION_CANONICAL_CHECKSUM_MISMATCH');
  }
  return { vector: Array.from(vector), payload: projectionPayload(row, provenance), outputChecksum };
}

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/(amqps?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/((?:password|token|secret|api[_-]?key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 2000);
}

async function markCompleted(database: EvidenceProjectionDatabaseV1, job: EvidenceProjectionJobV1, receipt: Record<string, unknown>): Promise<void> {
  const result = await database.execute(sql`
    UPDATE evidence_vector_projection_outbox
    SET status = 'COMPLETED', lease_token = NULL, lease_expires_at = NULL,
        verification_receipt = ${JSON.stringify(receipt)}::jsonb,
        completed_at = clock_timestamp(), updated_at = clock_timestamp(), last_error = NULL
    WHERE id = ${job.id}::uuid AND status = 'PROCESSING' AND lease_token = ${job.lease_token}::uuid
    RETURNING id
  `);
  if (result.rows.length !== 1) throw new Error('EVIDENCE_VECTOR_PROJECTION_LEASE_LOST');
}

async function markFailure(
  database: EvidenceProjectionDatabaseV1,
  job: EvidenceProjectionJobV1,
  error: unknown,
  retryBaseMs: number,
  retryMaxMs: number,
): Promise<'retried' | 'deadLettered' | 'leaseLost'> {
  const dead = job.attempt_count >= job.max_attempts;
  const delayMs = Math.min(retryBaseMs * 2 ** Math.max(0, job.attempt_count - 1), retryMaxMs);
  const result = await database.execute(sql`
    UPDATE evidence_vector_projection_outbox
    SET status = ${dead ? 'DEAD_LETTER' : 'RETRY'},
        lease_token = NULL, lease_expires_at = NULL,
        available_at = CASE WHEN ${dead} THEN available_at ELSE clock_timestamp() + (${delayMs} * interval '1 millisecond') END,
        last_error = ${errorText(error)}, updated_at = clock_timestamp()
    WHERE id = ${job.id}::uuid AND status = 'PROCESSING' AND lease_token = ${job.lease_token}::uuid
    RETURNING id
  `);
  if (result.rows.length !== 1) return 'leaseLost';
  return dead ? 'deadLettered' : 'retried';
}

export async function projectEvidenceVectorOutboxBatchV1(
  database: EvidenceProjectionDatabaseV1,
  qdrant: EvidenceProjectionQdrantV1,
  options: EvidenceProjectionWorkerOptionsV1,
): Promise<EvidenceProjectionWorkerResultV1> {
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 16)));
  const leaseSeconds = Math.max(10, Math.min(600, Math.trunc(options.leaseSeconds ?? 120)));
  const retryBaseMs = Math.max(100, Math.trunc(options.retryBaseMs ?? 1000));
  const retryMaxMs = Math.max(retryBaseMs, Math.trunc(options.retryMaxMs ?? 900_000));
  const jobs = await claimBatch(database, limit, leaseSeconds);
  const result: EvidenceProjectionWorkerResultV1 = {
    claimed: jobs.length,
    completed: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
  };

  for (const job of jobs) {
    try {
      if (
        job.projection_lane !== EVIDENCE_VECTOR_PROJECTION_LANE_V1
        || job.projection_contract_revision !== EVIDENCE_VECTOR_PROJECTION_CONTRACT_V1
      ) throw new Error('EVIDENCE_VECTOR_PROJECTION_CONTRACT_UNSUPPORTED');
      const canonical = await loadCanonicalVector(database, job);
      const collectionAlias = await options.resolveCollectionAlias(job.projection_lane);
      if (!collectionAlias || collectionAlias.trim() !== collectionAlias) {
        throw new Error('EVIDENCE_VECTOR_PROJECTION_ALIAS_UNRESOLVED');
      }
      await qdrant.upsert(collectionAlias, {
        wait: true,
        points: [{ id: job.qdrant_point_id, vector: { content: Array.from(canonical.vector) }, payload: canonical.payload }],
      });
      const points = await qdrant.retrieve(collectionAlias, [job.qdrant_point_id], {
        with_payload: true,
        with_vector: true,
      });
      if (points.length !== 1 || String(points[0].id) !== job.qdrant_point_id) {
        throw new Error(`EVIDENCE_VECTOR_QDRANT_POINT_READBACK_NOT_UNIQUE:${points.length}`);
      }
      const vector = validateSemantic768OutputV1(readVector(points[0]));
      if (digestSemantic768OutputV1(vector) !== canonical.outputChecksum) {
        throw new Error('EVIDENCE_VECTOR_QDRANT_VECTOR_CHECKSUM_MISMATCH');
      }
      verifyPayload(points[0].payload, canonical.payload);
      await markCompleted(database, job, {
        schema: 'evidence-vector-qdrant-projection-receipt-v1',
        projectionLane: job.projection_lane,
        projectionContractRevision: job.projection_contract_revision,
        collectionAlias,
        qdrantPointId: job.qdrant_point_id,
        vectorDimension: EVIDENCE_SEMANTIC_DIMENSION,
        outputSha256: canonical.outputChecksum,
        payloadIdentityVerified: true,
        verifiedAt: new Date().toISOString(),
      });
      result.completed++;
    } catch (error) {
      const outcome = await markFailure(database, job, error, retryBaseMs, retryMaxMs);
      if (outcome === 'retried') result.retried++;
      else if (outcome === 'deadLettered') result.deadLettered++;
      else result.leaseLost++;
    }
  }
  return result;
}
