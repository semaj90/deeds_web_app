import { describe, expect, it } from 'vitest';
import { mapQdrantProjectionCandidate } from './projection-candidate-v1.js';

describe('mapQdrantProjectionCandidate', () => {
  it('maps a well-formed codebase_chunks_768_v2 point into a ProjectionCandidateV1', () => {
    const candidate = mapQdrantProjectionCandidate({
      id: '0417b9e4-621b-45d5-b623-f814513440ad',
      score: 0.987,
      payload: {
        postgres_id: '0417b9e4-621b-45d5-b623-f814513440ad',
        chunk_id: 'card:src/lib/types/evidence.ts:140d1e05409c8a83',
        source_ref: 'src/lib/types/evidence.ts',
        content_hash: '140d1e05409c8a83',
        representation_name: 'semantic_768',
        projection_revision: 'v2_uuid_clean',
      },
    });

    expect(candidate).toEqual({
      physicalPointId: '0417b9e4-621b-45d5-b623-f814513440ad',
      postgresId: '0417b9e4-621b-45d5-b623-f814513440ad',
      chunkId: 'card:src/lib/types/evidence.ts:140d1e05409c8a83',
      sourceRef: 'src/lib/types/evidence.ts',
      contentHash: '140d1e05409c8a83',
      score: 0.987,
      representationName: 'semantic_768',
      projectionRevision: 'v2_uuid_clean',
      identityMissing: false,
    });
  });

  it('fails closed (identityMissing: true) when postgres_id is absent, rather than fabricating an identity', () => {
    const candidate = mapQdrantProjectionCandidate({
      id: 'card:some/legacy/path.ts:deadbeef',
      score: 0.5,
      payload: { source_ref: 'some/legacy/path.ts' },
    });

    expect(candidate.identityMissing).toBe(true);
    expect(candidate.postgresId).toBeNull();
  });

  it('fails closed when postgres_id is present but not a well-formed UUID', () => {
    const candidate = mapQdrantProjectionCandidate({
      id: 1,
      score: 0.5,
      payload: { postgres_id: 'not-a-uuid' },
    });

    expect(candidate.identityMissing).toBe(true);
    expect(candidate.postgresId).toBeNull();
  });

  it('handles a missing payload entirely without throwing', () => {
    const candidate = mapQdrantProjectionCandidate({ id: 42 });
    expect(candidate.identityMissing).toBe(true);
    expect(candidate.physicalPointId).toBe('42');
  });
});
