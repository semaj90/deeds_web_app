import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { digestSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import { deriveUUID } from '$lib/utils/uuid.js';
import {
  EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1,
  EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1,
  persistEvidenceMultimodalVectorV1,
  type EvidenceMultimodalDatabaseV1,
  type EvidenceMultimodalVectorInputV1,
} from './evidence-multimodal-vector-persistence-v1.js';

const revision = `sha256:${'a'.repeat(64)}`;
const modelRevision = `sha256:${'b'.repeat(64)}`;
const inputRevision = `sha256:${'c'.repeat(64)}`;
const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));
const outputSha256 = digestSemantic768OutputV1(Float32Array.from(vector));

function makeInput(overrides: Partial<EvidenceMultimodalVectorInputV1> = {}): EvidenceMultimodalVectorInputV1 {
  return {
    evidenceId: '11111111-1111-4111-8111-111111111111',
    caseId: '22222222-2222-4222-8222-222222222222',
    sourceRevision: revision,
    analysisRevision: 'detector+embedding:v1',
    modality: 'video_frame',
    sourceLocator: { frame: 7, timestampTicks: '254016000000', sourceWidth: 1920, sourceHeight: 1080 },
    embedding: vector,
    model: 'embeddinggemma-vision:v1',
    modelArtifactSha256: modelRevision,
    preprocessingRevision: 'video-frame-sampling:v1',
    inputSha256: inputRevision,
    outputSha256,
    metadata: { proposal: true },
    ...overrides,
  };
}

function mockDatabase(input: EvidenceMultimodalVectorInputV1, sourceHash = revision) {
  const locatorJson = JSON.stringify(Object.fromEntries(Object.entries(input.sourceLocator).sort(([a], [b]) => a.localeCompare(b))));
  const locatorSha256 = createHash('sha256').update(locatorJson).digest('hex');
  const calls: unknown[] = [];
  let qdrantPointId = '';
  const execute = vi.fn(async () => {
    const index = calls.length;
    calls.push(index);
    if (index === 0) return { rows: [{ evidence_id: input.evidenceId, case_id: input.caseId, hash: sourceHash, deleted_at: null }] };
    if (index === 2) return { rows: [{
      id: '33333333-3333-4333-8333-333333333333', evidence_id: input.evidenceId, case_id: input.caseId,
      source_revision: input.sourceRevision, analysis_revision: input.analysisRevision, modality: input.modality,
      source_locator_sha256: locatorSha256, dimension: 768, embedding_float4: vector,
      model: input.model, model_artifact_sha256: input.modelArtifactSha256,
      preprocessing_revision: input.preprocessingRevision, input_sha256: input.inputSha256, output_sha256: outputSha256,
    }] };
    if (index === 4) return { rows: [{
      qdrant_point_id: qdrantPointId, source_revision: input.sourceRevision,
      analysis_revision: input.analysisRevision, modality: input.modality,
      source_locator_sha256: locatorSha256, model_artifact_sha256: input.modelArtifactSha256,
      preprocessing_revision: input.preprocessingRevision, input_sha256: input.inputSha256, output_sha256: outputSha256,
    }] };
    return { rows: [] };
  });
  const database: EvidenceMultimodalDatabaseV1 = {
    execute,
    transaction: async (operation) => {
      const wrapped = { execute };
      return operation(wrapped);
    },
  };
  return { database, calls, execute, locatorSha256, setPointId: (value: string) => { qdrantPointId = value; } };
}

describe('canonical multimodal vector persistence', () => {
  it('rejects stale source revisions before inserting canonical or projection rows', async () => {
    const input = makeInput();
    const mock = mockDatabase(input, `sha256:${'d'.repeat(64)}`);
    await expect(persistEvidenceMultimodalVectorV1(mock.database, input))
      .rejects.toThrow('EVIDENCE_MULTIMODAL_SOURCE_REVISION_OR_CASE_MISMATCH');
    expect(mock.execute).toHaveBeenCalledTimes(1);
  });

  it('requires a real normalized 768-dimensional vector and matching output digest', async () => {
    const input = makeInput({ embedding: [0, 0, 0] });
    const mock = mockDatabase(input);
    await expect(persistEvidenceMultimodalVectorV1(mock.database, input)).rejects.toThrow();
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it('commits PostgreSQL vector and Qdrant outbox intent only after source and vector readback', async () => {
    const input = makeInput();
    const mock = mockDatabase(input);
    const locatorSha256 = mock.locatorSha256;
    const qdrantPointId = await deriveUUID('atlas.evidence-multimodal-vector.qdrant-point.v1', {
      evidenceId: input.evidenceId,
      sourceRevision: input.sourceRevision,
      analysisRevision: input.analysisRevision,
      modality: input.modality,
      sourceLocatorSha256: locatorSha256,
      modelArtifactSha256: input.modelArtifactSha256,
      preprocessingRevision: input.preprocessingRevision,
    });
    mock.setPointId(qdrantPointId);
    const result = await persistEvidenceMultimodalVectorV1(mock.database, input);
    expect(result).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      qdrantPointId,
      outputSha256,
      sourceLocatorSha256: locatorSha256,
    });
    expect(mock.calls).toHaveLength(5);
    expect(EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1).toBe('evidence_multimodal_semantic_768');
    expect(EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1).toBe('evidence-multimodal-qdrant-projection-v1');
  });
});
