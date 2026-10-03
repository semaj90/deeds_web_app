import { describe, expect, it } from 'vitest';
import { executeTraceSemanticV1, type TraceSemanticCohortRowV1 } from './trace-semantic-executor-v1.js';

const revision = `sha256:${'a'.repeat(64)}`;
const vector = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);
const cohort: TraceSemanticCohortRowV1[] = [{
  canonicalId: 'chunk:one', packetKey: 'packet:one', sourceRef: 'src/one.ts',
  workspaceRevision: revision, sourceRevision: `sha256:${'b'.repeat(64)}`, vector,
}];

describe('TRACE semantic executor', () => {
  it('keeps Qdrant as the first executor and one logical vote', async () => {
    const result = await executeTraceSemanticV1({
      admittedWorkspaceRevision: revision, queryVector: vector, topK: 1,
      semanticRepresentationRevision: 'semantic-768-test-v1',
      qdrantSearch: async () => [{ id: 'q1', score: 0.9, payload: { packet_key: 'packet:one' } }],
      loadCohort: async () => { throw new Error('must not load fallback cohort'); },
      cuvsExact: async () => { throw new Error('must not call fallback'); },
    });
    expect(result).toMatchObject({ status: 'READY', logicalLane: 'semantic', voteKey: 'semantic', voteCount: 1, executor: 'QDRANT', fallbackUsed: false, writesPerformed: false });
    expect(result.hits).toHaveLength(1);
  });

  it('uses identity-preserving cuVS only after Qdrant failure', async () => {
    const result = await executeTraceSemanticV1({
      admittedWorkspaceRevision: revision, queryVector: vector, topK: 1,
      semanticRepresentationRevision: 'semantic-768-test-v1',
      qdrantSearch: async () => { throw new Error('qdrant unavailable'); },
      loadCohort: async (requested) => requested === revision ? cohort : [],
      cuvsExact: async (input) => ({
        schema: 'atlas.semantic768-exact-knn-receipt.v1', operation: 'knn.exact', backend: 'cuvs.brute_force',
        metric: 'sqeuclidean_rank_equivalent_to_cosine_for_l2_normalized_vectors', representationId: 'semantic_768',
        representationRevision: 'semantic-768-test-v1', dimension: 768, corpusRows: input.corpus.length, topK: 1, durationMs: 1, truncated: false,
        identityManifestChecksum: 'a'.repeat(64), matrixChecksum: 'b'.repeat(64),
        gpuMemoryBeforeMb: null, gpuMemoryAfterMb: null,
        results: [{ rank: 0, packetKey: 'packet:one', sourceRevision: cohort[0].sourceRevision, symbolVersionId: null, sqeuclideanDistance: 0, cosineSimilarity: 1 }],
      }),
    });
    expect(result).toMatchObject({ status: 'READY', logicalLane: 'semantic', voteKey: 'semantic', voteCount: 1, executor: 'CUVS_EXACT', fallbackUsed: true, writesPerformed: false });
    expect(result.hits[0]).toMatchObject({ id: 'chunk:one', score: 1, payload: { source_ref: 'src/one.ts' } });
  });

  it('blocks fallback when the cohort is not admitted to the requested revision', async () => {
    const result = await executeTraceSemanticV1({
      admittedWorkspaceRevision: revision, queryVector: vector, topK: 1,
      semanticRepresentationRevision: 'semantic-768-test-v1',
      qdrantSearch: async () => { throw new Error('qdrant unavailable'); },
      loadCohort: async () => [{ ...cohort[0], workspaceRevision: 'sha256:' + 'c'.repeat(64) }],
      cuvsExact: async () => { throw new Error('must not execute'); },
    });
    expect(result).toMatchObject({ status: 'BLOCKED', executor: null, writesPerformed: false, reason: 'CUVS_FALLBACK_COHORT_WORKSPACE_REVISION_MISMATCH' });
  });

  it('blocks malformed fallback queries before loading a cohort', async () => {
    const result = await executeTraceSemanticV1({
      admittedWorkspaceRevision: revision, queryVector: [Number.NaN], topK: 1,
      semanticRepresentationRevision: 'semantic-768-test-v1',
      qdrantSearch: async () => { throw new Error('qdrant unavailable'); },
      loadCohort: async () => { throw new Error('must not load'); },
      cuvsExact: async () => { throw new Error('must not execute'); },
    });
    expect(result).toMatchObject({ status: 'BLOCKED', reason: 'CUVS_FALLBACK_QUERY_SEMANTIC_768_INVALID', writesPerformed: false });
  });
});
