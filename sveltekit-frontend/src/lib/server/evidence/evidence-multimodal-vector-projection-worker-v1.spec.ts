import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { digestSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1,
  EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1,
} from './evidence-multimodal-vector-persistence-v1.js';
import {
  projectEvidenceMultimodalVectorOutboxBatchV1,
  type EvidenceMultimodalProjectionDatabaseV1,
} from './evidence-multimodal-vector-projection-worker-v1.js';

const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));
const outputSha256 = digestSemantic768OutputV1(Float32Array.from(vector));
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const locator = { frame: 13, timestampTicks: '1100000000', sourceWidth: 1920, sourceHeight: 1080 };
const locatorJson = JSON.stringify(Object.fromEntries(Object.entries(locator).sort(([a], [b]) => a.localeCompare(b))));
const locatorSha256 = createHash('sha256').update(locatorJson).digest('hex');

function setup(sourceHash = sourceRevision) {
  const evidenceVectorId = '11111111-1111-4111-8111-111111111111';
  const jobId = '22222222-2222-4222-8222-222222222222';
  const qdrantPointId = '33333333-3333-4333-8333-333333333333';
  const leaseToken = '44444444-4444-4444-8444-444444444444';
  let call = 0;
  let pointPayload: Record<string, unknown> | undefined;
  let pointVector: number[] | undefined;
  const execute = vi.fn(async () => {
    const n = call++;
    if (n === 1) return { rows: [{
      id: jobId, vector_id: evidenceVectorId, qdrant_point_id: qdrantPointId,
      projection_lane: EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1,
      projection_contract_revision: EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1,
      source_revision: sourceRevision, analysis_revision: 'analysis:v1', modality: 'video_frame',
      locator_sha256: locatorSha256, model_artifact_sha256: `sha256:${'b'.repeat(64)}`,
      preprocessing_revision: 'frames:v1', input_sha256: `sha256:${'c'.repeat(64)}`,
      output_sha256: outputSha256, attempt_count: 1, max_attempts: 5, lease_token: leaseToken,
    }] };
    if (n === 2) return { rows: [{
      id: evidenceVectorId, evidence_id: '55555555-5555-4555-8555-555555555555',
      case_id: '66666666-6666-4666-8666-666666666666', evidence_hash: sourceHash, deleted_at: null,
      source_revision: sourceRevision, analysis_revision: 'analysis:v1', modality: 'video_frame',
      source_locator: locator, source_locator_sha256: locatorSha256, dimension: 768,
      embedding_float4: vector, embedding_type: 'evidence_multimodal_semantic_768',
      model: 'fixture-model', model_artifact_sha256: `sha256:${'b'.repeat(64)}`,
      preprocessing_revision: 'frames:v1', input_sha256: `sha256:${'c'.repeat(64)}`, output_sha256: outputSha256,
    }] };
    if (n === 4) return { rows: [{ status: 'COMPLETED', verification_receipt: {
      outputSha256, payloadIdentityVerified: true, sourceRevision, analysisRevision: 'analysis:v1', collectionAlias: 'evidence-multimodal-test',
    } }] };
    if (n === 3) return { rows: [{ id: jobId }] };
    return { rows: [{ id: jobId }] };
  });
  const database: EvidenceMultimodalProjectionDatabaseV1 = {
    execute,
    transaction: async (operation) => operation({ execute }),
  };
  const qdrant = {
    upsert: vi.fn(async (_alias: string, input: { points: Array<{ vector: { content: number[] }; payload: Record<string, unknown> }> }) => {
      pointPayload = input.points[0].payload;
      pointVector = input.points[0].vector.content;
    }),
    retrieve: vi.fn(async () => [{ id: qdrantPointId, vector: pointVector, payload: pointPayload }]),
  };
  return { database, execute, qdrant, jobId };
}

describe('multimodal vector outbox projector', () => {
  it('publishes only a verified PostgreSQL vector and records a completion receipt', async () => {
    const test = setup();
    await expect(projectEvidenceMultimodalVectorOutboxBatchV1(test.database, test.qdrant, {
      resolveCollectionAlias: async () => 'evidence-multimodal-test',
    })).resolves.toEqual({ claimed: 1, completed: 1, retried: 0, deadLettered: 0, leaseLost: 0 });
    expect(test.qdrant.upsert).toHaveBeenCalledTimes(1);
    expect(test.qdrant.retrieve).toHaveBeenCalledTimes(1);
    expect(test.execute).toHaveBeenCalledTimes(5);
  });

  it('does not publish a vector when the canonical source revision has changed', async () => {
    const test = setup(`sha256:${'d'.repeat(64)}`);
    await expect(projectEvidenceMultimodalVectorOutboxBatchV1(test.database, test.qdrant, {
      retryBaseMs: 100,
      resolveCollectionAlias: async () => 'evidence-multimodal-test',
    })).resolves.toEqual({ claimed: 1, completed: 0, retried: 1, deadLettered: 0, leaseLost: 0 });
    expect(test.qdrant.upsert).not.toHaveBeenCalled();
    expect(test.qdrant.retrieve).not.toHaveBeenCalled();
  });
});
