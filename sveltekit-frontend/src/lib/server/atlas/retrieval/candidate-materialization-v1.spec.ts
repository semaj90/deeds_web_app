import { describe, expect, it } from 'vitest';
import {
  RevisionQualifiedCandidateSetV1Schema,
  materializeGpuCandidateBatch,
} from './candidate-materialization-v1.js';

const representation = {
  snapshotRevision: 'workspace:W1',
  representationId: 'semantic_768' as const,
  representationRevision: 'embeddinggemma-native-768-v1',
  dimension: 768 as const,
  metric: 'cosine' as const,
  normalization: 'l2' as const,
  datasetChecksumSha256: 'a'.repeat(64),
};

describe('candidate materialization v1', () => {
  it('transfers ordinals rather than raw embeddings and pads only at tile boundaries', () => {
    const candidates = RevisionQualifiedCandidateSetV1Schema.parse({
      schema: 'atlas.revision-qualified-candidate-set.v1',
      requestId: 'req-1',
      representation,
      candidates: [
        { ordinal: 83, score: 0.99, rank: 1, executor: 'qdrant_hnsw', logicalLane: 'semantic', canonicalId: 'packet:83', evidenceRefs: ['q:1'] },
        { ordinal: 991, score: 0.98, rank: 2, executor: 'cuvs_brute_force', logicalLane: 'semantic', canonicalId: 'packet:991', evidenceRefs: ['q:2'] },
        { ordinal: 4217, score: 0.97, rank: 3, executor: 'turbovec', logicalLane: 'semantic', canonicalId: 'packet:4217', evidenceRefs: ['q:3'] },
      ],
      exactOracleCompared: true,
      canonicalDedupApplied: true,
      canonicalWrites: false,
      producerRevision: 'candidate-producer:v1',
    });
    const batch = materializeGpuCandidateBatch({
      batchRevision: 'batch:1',
      candidates,
      tileRows: 4,
      precision: 'fp16',
      heads: ['semantic', 'graph'],
      sourceArtifactRef: 'cas://semantic-snapshot/W1',
    });

    expect(batch.ordinals).toEqual([83, 991, 4217]);
    expect(batch.logicalRows).toBe(3);
    expect(batch.physicalRows).toBe(4);
    expect(batch.validMask).toEqual([1, 1, 1, 0]);
    expect(batch.canonicalWrites).toBe(false);
  });

  it('rejects duplicate ordinals because executor identities are not canonical entities', () => {
    expect(() => RevisionQualifiedCandidateSetV1Schema.parse({
      schema: 'atlas.revision-qualified-candidate-set.v1',
      requestId: 'req-2',
      representation,
      candidates: [
        { ordinal: 1, score: 0.9, rank: 1, executor: 'qdrant_hnsw', logicalLane: 'semantic', canonicalId: null, evidenceRefs: [] },
        { ordinal: 1, score: 0.8, rank: 2, executor: 'diskann', logicalLane: 'semantic', canonicalId: null, evidenceRefs: [] },
      ],
      exactOracleCompared: false,
      canonicalDedupApplied: true,
      canonicalWrites: false,
      producerRevision: 'candidate-producer:v1',
    })).toThrow('duplicate ordinal');
  });
});
