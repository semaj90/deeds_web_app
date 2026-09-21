import { describe, expect, it } from 'vitest';

import { createChunkRetrievalProfileV2 } from './chunk-retrieval-profile-v2.js';
import {
  compileSearchRuntimeLiveFeatureJoinV1,
  type SearchRuntimeLiveFeatureSupplementV1,
} from './search-runtime-live-feature-join-v1.js';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;

function profile() {
  return createChunkRetrievalProfileV2({
    schemaVersion: 'atlas.chunk-retrieval-profile.v2',
    canonicalChunkId: 'chunk:canonical:one',
    chunkRowId: '11111111-1111-4111-8111-111111111111',
    packetKey: 'packet:one',
    repositoryId: 'repo:root',
    repositoryRelativePath: 'src/one.ts',
    sourceIdentityKey: 'repo:root:src/one.ts',
    sourceRef: 'src/one.ts',
    workspaceRevision: SHA_A,
    sourceRevision: SHA_B,
    lexicalStructural: {
      language: 'typescript',
      symbolKind: 'function',
      symbolName: 'one',
      astNodeType: 'function_declaration',
      astPath: ['program', 'function_declaration'],
    },
    semantic: {
      embeddingRepresentation: 'semantic_768',
      representationRevision: 'semantic_768:r1',
      modelRevision: 'embeddinggemma:r1',
    },
    domainTopic: {
      primaryDomain: 'retrieval',
      domainConfidence: 0.9,
    },
    topology: {
      pageRank: 0.6,
    },
    revisions: {
      featureRevision: 'features:r1',
      graphRevision: 'graph:r1',
      topologyRevision: 'topology:r1',
    },
    evidenceRefs: ['postgres:atlas_packet_chunk_lineage:packet:one'],
  });
}

function packet(overrides: Record<string, unknown> = {}) {
  return {
    chunk_id: '11111111-1111-4111-8111-111111111111',
    packet_key: 'packet:one',
    symbol_version_id: 'symbol-version:one',
    source_ref: 'src/one.ts',
    workspace_revision: SHA_A,
    source_revision: SHA_B,
    domain_class: 'retrieval',
    dense: { name: 'dense', score: 0.9, qdrant_point_id: 'q1', metric: 'cosine', confidence: 1 },
    lexical: { name: 'lexical', score: 0.8, matched_terms: ['one'], query_coverage: 1, confidence: 1 },
    ast: { name: 'ast', score: 0.7, confidence: 1 },
    authority: { name: 'authority', score: 0.6, confidence: 1 },
    metadata: { name: 'metadata', score: 0.5, matched_tags: [], domain: 'retrieval', confidence: 1 },
    recency: { name: 'recency', score: 0.4, confidence: 1 },
    retrieval_score: 0.9,
    fusion_score: 0.88,
    fusion_rank: 1,
    ...overrides,
  } as any;
}

const supplement: SearchRuntimeLiveFeatureSupplementV1 = {
  packetKey: 'packet:one',
  retrievalFrequency: 0.3,
  executionUtility: 0.2,
  processFit: 0.1,
  featureRevision: 'features:r1',
  producerRevisions: {
    retrievalFrequency: 'hotness:r1',
    executionUtility: 'execution-utility:r1',
    processFit: 'process-fit:r1',
  },
  evidenceRefs: ['postgres:atlas_execution_utility:packet:one'],
};

function baseInput() {
  return {
    requestId: 'request:one',
    policyRevision: 'policy:r1',
    workspaceRevision: SHA_A,
    representationRevision: 'semantic_768:r1',
    candidateSnapshotRevision: 'snapshot:r1',
    producerRevision: 'live-feature-join:r1',
    taskKind: 'DEBUG',
    response: {
      packets: [packet()],
      provenance: { readOnly: true },
    },
    profiles: [profile()],
    supplements: [supplement],
  } as const;
}

describe('SearchRuntime live feature join v1', () => {
  it('materializes the existing candidate snapshot and columnar matrix only from revision-qualified owners', () => {
    const result = compileSearchRuntimeLiveFeatureJoinV1(baseInput());

    expect(result.status).toBe('ADMITTED');
    expect(result.rejections).toEqual([]);
    expect(result.acceptedCount).toBe(1);
    expect(result.snapshot?.rowCount).toBe(1);
    expect(result.snapshot?.rows[0]).toMatchObject({
      canonicalId: 'symbol-version:one',
      packetKey: 'packet:one',
      workspaceRevision: SHA_A,
      sourceRevision: SHA_B,
      graphRevision: 'graph:r1',
      semanticRevision: 'semantic_768:r1',
      featureRevision: 'features:r1',
      semanticRelevance: 0.9,
      lexicalRelevance: 0.8,
      astAffinity: 0.7,
      graphAuthority: 0.6,
      domainAffinity: 0.5,
      executionUtility: 0.2,
      memoryUtility: 0.3,
    });
    expect(result.columnar?.rowCount).toBe(1);
    expect(result.columnar?.featureCount).toBe(12);
    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.rankingPromotion).toBe(false);
  });

  it('fails closed when a required supplemental producer is absent', () => {
    const input = baseInput();
    const result = compileSearchRuntimeLiveFeatureJoinV1({
      ...input,
      supplements: [],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.snapshot).toBeNull();
    expect(result.columnar).toBeNull();
    expect(result.rejections).toEqual([
      expect.objectContaining({
        packetKey: 'packet:one',
        code: 'SUPPLEMENT_MISSING',
      }),
    ]);
  });

  it('fails closed when SearchRuntime did not prove read-only execution', () => {
    const input = baseInput();
    const result = compileSearchRuntimeLiveFeatureJoinV1({
      ...input,
      response: {
        ...input.response,
        provenance: { readOnly: false },
      } as any,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.rejections[0]?.code).toBe('SEARCH_RUNTIME_NOT_READ_ONLY');
    expect(result.snapshot).toBeNull();
  });

  it('does not zero-fill missing query-time feature evidence', () => {
    const input = baseInput();
    const result = compileSearchRuntimeLiveFeatureJoinV1({
      ...input,
      response: {
        ...input.response,
        packets: [packet({ ast: undefined })],
      },
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.rejections[0]).toMatchObject({
      packetKey: 'packet:one',
      code: 'INCOMPLETE_QUERY_FEATURES',
      missingFeatures: ['ast_signal'],
    });
    expect(result.snapshot).toBeNull();
  });
});
