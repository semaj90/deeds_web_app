import { describe, expect, it } from 'vitest';

import { createChunkRetrievalProfileV2 } from './chunk-retrieval-profile-v2.js';
import { runSearchRuntimeContextManifestShadowV1 } from './search-runtime-context-manifest-shadow-v1.js';
import type { SearchRuntimeLiveFeatureSupplementV1 } from './search-runtime-live-feature-join-v1.js';

const WORKSPACE = `sha256:${'a'.repeat(64)}`;
const SOURCE = `sha256:${'b'.repeat(64)}`;

function response() {
  return {
    packets: [{
      chunk_id: '11111111-1111-4111-8111-111111111111',
      packet_key: 'packet:one',
      symbol_version_id: 'symbol-version:one',
      source_ref: 'src/one.ts',
      workspace_revision: WORKSPACE,
      source_revision: SOURCE,
      domain_class: 'retrieval',
      dense: { score: 0.9 },
      lexical: { score: 0.8 },
      ast: { score: 0.7 },
      authority: { score: 0.6 },
      metadata: { score: 0.5, domain: 'retrieval' },
      recency: { score: 0.4 },
      retrieval_score: 0.9,
      fusion_score: 0.88,
      fusion_rank: 1,
    }],
    provenance: { readOnly: true },
  } as any;
}

function config() {
  return {
    requestId: 'request:one',
    policyRevision: 'policy:r1',
    workspaceRevision: WORKSPACE,
    representationRevision: 'semantic_768:r1',
    candidateSnapshotRevision: 'snapshot:r1',
    producerRevision: 'live-feature-join:r1',
    taskKind: 'DEBUG',
    retrievalPolicyRevision: 'retrieval-policy:r1',
    acePlaybookRevision: 'ace-playbook:r1',
    tokenBudget: 512,
    graphRevision: 'graph:r1',
    resolveFeatureSources: async () => ({
      profiles: [createChunkRetrievalProfileV2({
      schemaVersion: 'atlas.chunk-retrieval-profile.v2',
      canonicalChunkId: 'chunk:canonical:one',
      chunkRowId: '11111111-1111-4111-8111-111111111111',
      packetKey: 'packet:one',
      repositoryId: 'repo:root',
      repositoryRelativePath: 'src/one.ts',
      sourceIdentityKey: 'repo:root:src/one.ts',
      sourceRef: 'src/one.ts',
      workspaceRevision: WORKSPACE,
      sourceRevision: SOURCE,
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
      domainTopic: { primaryDomain: 'retrieval', domainConfidence: 0.9 },
      topology: { pageRank: 0.6 },
      revisions: {
        featureRevision: 'features:r1',
        graphRevision: 'graph:r1',
        topologyRevision: 'topology:r1',
      },
      evidenceRefs: ['postgres:atlas_packet_chunk_lineage:packet:one'],
      })],
      supplements: [{
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
      } satisfies SearchRuntimeLiveFeatureSupplementV1],
    }),
  };
}

describe('SearchRuntime ContextManifest shadow caller v1', () => {
  it('reports unavailable rather than inventing revisions or feature sources', async () => {
    const result = await runSearchRuntimeContextManifestShadowV1({ response: response() });
    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'REVISION_QUALIFIED_FEATURE_SOURCE_PROVIDER_NOT_CONFIGURED',
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    });
  });

  it('blocks the existing live join when a candidate profile is absent', async () => {
    const result = await runSearchRuntimeContextManifestShadowV1({
      response: response(),
      config: {
        ...config(),
        resolveFeatureSources: async () => ({ profiles: [], supplements: [] }),
      },
    });
    expect(result.status).toBe('BLOCKED');
    if (result.status !== 'BLOCKED') throw new Error('EXPECTED_BLOCKED');
    expect(result.join?.rejections).toEqual([
      expect.objectContaining({ packetKey: 'packet:one', code: 'PROFILE_NOT_FOUND_FOR_CHUNK' }),
    ]);
    expect(result.manifest).toBeNull();
  });

  it('keeps provider failures isolated from the search response', async () => {
    const result = await runSearchRuntimeContextManifestShadowV1({
      response: response(),
      config: { ...config(), resolveFeatureSources: async () => { throw new Error('reader unavailable'); } },
    });
    expect(result).toMatchObject({ status: 'UNAVAILABLE', reason: 'FEATURE_SOURCE_PROVIDER_FAILED', manifest: null });
  });

  it('rejects a manifest graph revision that disagrees with its profiles', async () => {
    const result = await runSearchRuntimeContextManifestShadowV1({
      response: response(),
      config: { ...config(), graphRevision: 'graph:r2' },
    });
    expect(result).toMatchObject({ status: 'BLOCKED', reason: 'MANIFEST_GRAPH_REVISION_MISMATCH', manifest: null });
  });

  it('composes a read-only ContextManifest from the existing admitted live join', async () => {
    const result = await runSearchRuntimeContextManifestShadowV1({ response: response(), config: config() });
    expect(result.status).toBe('ADMITTED');
    if (result.status !== 'ADMITTED') throw new Error('EXPECTED_ADMITTED');
    expect(result.join.acceptedCount).toBe(1);
    expect(result.manifest.manifest.v1.candidateCount).toBe(1);
    expect(result.manifest.manifest.identityInput.evidenceRevisions).toMatchObject({
      representationRevision: 'semantic_768:r1',
      featureRevision: 'features:r1',
    });
    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.rankingPromotion).toBe(false);
  });
});
