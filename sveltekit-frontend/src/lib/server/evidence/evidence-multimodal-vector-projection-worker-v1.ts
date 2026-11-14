import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1,
  EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1,
  type EvidenceMultimodalExecuteV1,
} from './evidence-multimodal-vector-persistence-v1.js';

export interface EvidenceMultimodalProjectionDatabaseV1 extends EvidenceMultimodalExecuteV1 {
  transaction<T>(operation: (transaction: EvidenceMultimodalExecuteV1) => Promise<T>): Promise<T>;
}

export interface EvidenceMultimodalProjectionQdrantV1 {
  upsert(alias: string, input: { wait: true; points: Array<{ id: string; vector: { content: number[] }; payload: Record<string, unknown> }> }): Promise<unknown>;
  retrieve(alias: string, ids: string[], options: { with_payload: true; with_vector: true }): Promise<Array<{
    id: string | number;
    vector?: number[] | Record<string, number[]>;
    payload?: Record<string, unknown> | null;
  }>>;
}

interface MultimodalProjectionJob {
  id: string;
  vector_id: string;
  qdrant_point_id: string;
  projection_lane: string;
  projection_contract_revision: string;
  source_revision: string;
  analysis_revision: string;
  modality: string;
  locator_sha256: string;
  model_artifact_sha256: string;
  preprocessing_revision: string;
  input_sha256: string;
  output_sha256: string;
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
}

interface CanonicalVector {
  id: string;
  evidence_id: string;
  case_id: string;
  evidence_hash: string;
  deleted_at: string | null;
  source_revision: string;
  analysis_revision: string;
  modality: string;
  source_locator: Record<string, unknown>;
  source_locator_sha256: string;
  embedding_float4: unknown;
  dimension: number;
  embedding_type: string;
  model: string;
  model_artifact_sha256: string;
  preprocessing_revision: string;
  input_sha256: string;
  output_sha256: string;
};

export interface EvidenceMultimodalProjectionOptionsV1 {
  limit?: number;
  leaseSeconds?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  resolveCollectionAlias(lane: string): Promise<string>;
}

export interface EvidenceMultimodalProjectionResultV1 {
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
    return body.length ? body.split(',').map(Number) : [];
  }
  throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_VECTOR_INVALID');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('EVIDENCE_MULTIMODAL_SOURCE_LOCATOR_INVALID');
  return serialized;
}

async function claimBatch(db: EvidenceMultimodalProjectionDatabaseV1, limit: number, leaseSeconds: number): Promise<MultimodalProjectionJob[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE evidence_multimodal_vector_projection_outbox
      SET status='DEAD_LETTER', lease_token=NULL, lease_expires_at=NULL,
        last_error=COALESCE(last_error, 'lease expired after maximum attempts'), updated_at=clock_timestamp()
      WHERE attempt_count >= max_attempts
        AND ((status IN ('PENDING','RETRY') AND available_at <= clock_timestamp())
          OR (status='PROCESSING' AND lease_expires_at <= clock_timestamp()))
    `);
    const result = await tx.execute(sql`
      WITH candidates AS (
        SELECT id FROM evidence_multimodal_vector_projection_outbox
        WHERE attempt_count < max_attempts
          AND ((status IN ('PENDING','RETRY') AND available_at <= clock_timestamp())
            OR (status='PROCESSING' AND lease_expires_at <= clock_timestamp()))
        ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE evidence_multimodal_vector_projection_outbox AS job
      SET status='PROCESSING', attempt_count=job.attempt_count+1, lease_token=gen_random_uuid(),
        lease_expires_at=clock_timestamp()+(${leaseSeconds} * interval '1 second'), updated_at=clock_timestamp()
      FROM candidates WHERE job.id=candidates.id
      RETURNING job.id::text AS id, job.evidence_multimodal_vector_id::text AS vector_id,
        job.qdrant_point_id::text AS qdrant_point_id, job.source_revision, job.analysis_revision,
        job.modality, job.source_locator_sha256 AS locator_sha256, job.model_artifact_sha256,
        job.preprocessing_revision, job.input_sha256, job.output_sha256,
        job.attempt_count, job.max_attempts, job.lease_token::text AS lease_token
    `);
    return result.rows as unknown as MultimodalProjectionJob[];
  });
}

async function loadCanonical(db: EvidenceMultimodalProjectionDatabaseV1, job: MultimodalProjectionJob): Promise<{ vector: number[]; payload: Record<string, unknown> }> {
  const result = await db.execute(sql`
    SELECT mv.id::text AS id, mv.evidence_id::text AS evidence_id, e.case_id::text AS case_id,
      e.hash AS evidence_hash, e.deleted_at, mv.source_revision, mv.analysis_revision, mv.modality,
      mv.source_locator, mv.source_locator_sha256, vector_dims(mv.embedding) AS dimension,
      vector_to_float4(mv.embedding, 768, false) AS embedding_float4, mv.embedding_type, mv.model,
      mv.model_artifact_sha256, mv.preprocessing_revision, mv.input_sha256, mv.output_sha256
    FROM evidence_multimodal_vectors mv JOIN evidence e ON e.id=mv.evidence_id
    WHERE mv.id=${job.vector_id}::uuid LIMIT 2
  `);
  if (result.rows.length !== 1) throw new Error(`EVIDENCE_MULTIMODAL_CANONICAL_ROW_NOT_UNIQUE:${result.rows.length}`);
  const row = result.rows[0] as unknown as CanonicalVector;
  const hash = String(row.evidence_hash ?? '').replace(/^sha256:/, '').toLowerCase();
  const locatorDigest = createHash('sha256').update(stableJson(row.source_locator), 'utf8').digest('hex');
  if (
    row.id !== job.vector_id || row.deleted_at != null || hash !== job.source_revision.slice(7)
    || row.source_revision !== job.source_revision || row.analysis_revision !== job.analysis_revision
    || row.modality !== job.modality || row.source_locator_sha256 !== job.locator_sha256
    || locatorDigest !== job.locator_sha256
    || row.embedding_type !== 'evidence_multimodal_semantic_768' || Number(row.dimension) !== 768
    || row.model_artifact_sha256 !== job.model_artifact_sha256 || row.preprocessing_revision !== job.preprocessing_revision
    || row.input_sha256 !== job.input_sha256 || row.output_sha256 !== job.output_sha256
  ) throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_CANONICAL_IDENTITY_MISMATCH');
  const vector = validateSemantic768OutputV1(readFloat4Array(row.embedding_float4));
  if (digestSemantic768OutputV1(vector) !== job.output_sha256) throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_VECTOR_CHECKSUM_MISMATCH');
  return {
    vector: Array.from(vector),
    payload: {
      evidence_id: row.evidence_id,
      case_id: row.case_id,
      source_revision: row.source_revision,
      analysis_revision: row.analysis_revision,
      modality: row.modality,
      source_locator: row.source_locator,
      source_locator_sha256: row.source_locator_sha256,
      embedding_type: row.embedding_type,
      model: row.model,
      model_artifact_sha256: row.model_artifact_sha256,
      preprocessing_revision: row.preprocessing_revision,
      input_sha256: row.input_sha256,
      output_sha256: row.output_sha256,
    },
  };
}

function verifyPayload(actual: Record<string, unknown> | null | undefined, expected: Record<string, unknown>): void {
  if (!actual) throw new Error('EVIDENCE_MULTIMODAL_QDRANT_PAYLOAD_MISSING');
  for (const key of Object.keys(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) throw new Error(`EVIDENCE_MULTIMODAL_QDRANT_PAYLOAD_MISMATCH:${key}`);
  }
}

async function finish(db: EvidenceMultimodalProjectionDatabaseV1, job: MultimodalProjectionJob, collectionAlias: string, payload: Record<string, unknown>): Promise<void> {
  const receipt = {
    schema: 'evidence-multimodal-qdrant-projection-receipt-v1',
    projectionLane: EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1,
    projectionContractRevision: EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1,
    collectionAlias,
    qdrantPointId: job.qdrant_point_id,
    vectorDimension: 768,
    sourceRevision: job.source_revision,
    analysisRevision: job.analysis_revision,
    outputSha256: job.output_sha256,
    payloadIdentityVerified: true,
    verifiedAt: new Date().toISOString(),
  };
  await db.transaction(async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE evidence_multimodal_vector_projection_outbox
      SET status='COMPLETED', lease_token=NULL, lease_expires_at=NULL,
        verification_receipt=${JSON.stringify(receipt)}::jsonb, completed_at=clock_timestamp(),
        updated_at=clock_timestamp(), last_error=NULL
      WHERE id=${job.id}::uuid AND status='PROCESSING' AND lease_token=${job.lease_token}::uuid
      RETURNING id
    `);
    if (updated.rows.length !== 1) throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_LEASE_LOST');
    const persisted = await tx.execute(sql`
      SELECT status, verification_receipt FROM evidence_multimodal_vector_projection_outbox
      WHERE id=${job.id}::uuid AND qdrant_point_id=${job.qdrant_point_id}::uuid LIMIT 2
    `);
    if (persisted.rows.length !== 1 || persisted.rows[0].status !== 'COMPLETED') throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_RECEIPT_READBACK_FAILED');
    const savedReceipt = persisted.rows[0].verification_receipt as Record<string, unknown> | null;
    if (!savedReceipt || savedReceipt.outputSha256 !== job.output_sha256 || savedReceipt.payloadIdentityVerified !== true
      || savedReceipt.sourceRevision !== job.source_revision || savedReceipt.analysisRevision !== job.analysis_revision
      || savedReceipt.collectionAlias !== collectionAlias || payload.output_sha256 !== job.output_sha256) {
      throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_RECEIPT_IDENTITY_MISMATCH');
    }
  });
}

async function fail(db: EvidenceMultimodalProjectionDatabaseV1, job: MultimodalProjectionJob, error: unknown, baseMs: number, maxMs: number): Promise<'retried' | 'deadLettered' | 'leaseLost'> {
  const dead = job.attempt_count >= job.max_attempts;
  const delay = Math.min(baseMs * 2 ** Math.max(0, job.attempt_count - 1), maxMs);
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/(amqps?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/((?:password|token|secret|api[_-]?key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 2000);
  const result = await db.execute(sql`
    UPDATE evidence_multimodal_vector_projection_outbox
    SET status=${dead ? 'DEAD_LETTER' : 'RETRY'}, lease_token=NULL, lease_expires_at=NULL,
      available_at=CASE WHEN ${dead} THEN available_at ELSE clock_timestamp()+(${delay} * interval '1 millisecond') END,
      last_error=${message}, updated_at=clock_timestamp()
    WHERE id=${job.id}::uuid AND status='PROCESSING' AND lease_token=${job.lease_token}::uuid RETURNING id
  `);
  if (result.rows.length !== 1) return 'leaseLost';
  return dead ? 'deadLettered' : 'retried';
}

/** Project only rows already committed in PostgreSQL; Qdrant is never the source of vector bytes. */
export async function projectEvidenceMultimodalVectorOutboxBatchV1(
  db: EvidenceMultimodalProjectionDatabaseV1,
  qdrant: EvidenceMultimodalProjectionQdrantV1,
  options: EvidenceMultimodalProjectionOptionsV1,
): Promise<EvidenceMultimodalProjectionResultV1> {
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 16)));
  const leaseSeconds = Math.max(10, Math.min(600, Math.trunc(options.leaseSeconds ?? 120)));
  const baseMs = Math.max(100, Math.trunc(options.retryBaseMs ?? 1000));
  const maxMs = Math.max(baseMs, Math.trunc(options.retryMaxMs ?? 900_000));
  const jobs = await claimBatch(db, limit, leaseSeconds);
  const result: EvidenceMultimodalProjectionResultV1 = { claimed: jobs.length, completed: 0, retried: 0, deadLettered: 0, leaseLost: 0 };
  for (const job of jobs) {
    try {
      if (job.projection_lane !== EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1 || job.projection_contract_revision !== EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1) {
        throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_UNSUPPORTED');
      }
      const canonical = await loadCanonical(db, job);
      const alias = await options.resolveCollectionAlias(job.projection_lane);
      if (!alias || alias.trim() !== alias) throw new Error('EVIDENCE_MULTIMODAL_PROJECTION_ALIAS_UNRESOLVED');
      await qdrant.upsert(alias, { wait: true, points: [{ id: job.qdrant_point_id, vector: { content: canonical.vector }, payload: canonical.payload }] });
      const points = await qdrant.retrieve(alias, [job.qdrant_point_id], { with_payload: true, with_vector: true });
      if (points.length !== 1 || String(points[0].id) !== job.qdrant_point_id) throw new Error('EVIDENCE_MULTIMODAL_QDRANT_READBACK_NOT_UNIQUE');
      const actualVector = points[0].vector;
      const vectorValues = Array.isArray(actualVector) ? actualVector : actualVector?.content;
      if (!Array.isArray(vectorValues) || digestSemantic768OutputV1(validateSemantic768OutputV1(vectorValues)) !== job.output_sha256) {
        throw new Error('EVIDENCE_MULTIMODAL_QDRANT_VECTOR_CHECKSUM_MISMATCH');
      }
      verifyPayload(points[0].payload, canonical.payload);
      await finish(db, job, alias, canonical.payload);
      result.completed += 1;
    } catch (error) {
      const outcome = await fail(db, job, error, baseMs, maxMs);
      if (outcome === 'retried') result.retried += 1;
      else if (outcome === 'deadLettered') result.deadLettered += 1;
      else result.leaseLost += 1;
    }
  }
  return result;
}
