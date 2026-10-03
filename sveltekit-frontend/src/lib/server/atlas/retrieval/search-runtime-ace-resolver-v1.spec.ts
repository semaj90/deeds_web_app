import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { createSearchRuntimeAceResolverV1 } from './search-runtime-ace-resolver-v1.js';

const emptyOrdinalMap = materializeCandidateOrdinalMap({
  candidates: [],
  candidateSnapshotRevision: 'snapshot:ace:r1',
  workspaceRevision: 'workspace:r1',
  producerRevision: 'ordinal:r1',
});
const WORKSPACE_REVISION = `sha256:${'e'.repeat(64)}`;

const baseSources = {
  candidates: [],
  ordinalMap: emptyOrdinalMap,
  rows: [],
  laneMaskByOrdinal: {},
  producerRevision: 'ace-producer:r1',
  requestId: 'request:r1',
  tokenBudget: 1200,
  retrievalPolicyRevision: 'policy:r1',
  acePlaybookRevision: 'playbook:r1',
  representationRevision: 'semantic_768:r1',
  graphRevision: null,
};

describe('SearchRuntimeAceResolverV1', () => {
  it('accepts an already-admitted empty composition without writing', async () => {
    const resolver = createSearchRuntimeAceResolverV1(async () => baseSources);
    const result = await resolver.resolve({ query: 'inspect', requestId: 'request:r1', workspaceRevision: 'workspace:r1' });
    expect(result.ordinalMap.ordinalMapChecksum).toBe(emptyOrdinalMap.ordinalMapChecksum);
    expect(result.rows).toHaveLength(0);
  });

  it('rejects candidate/map population mismatch', async () => {
    const resolver = createSearchRuntimeAceResolverV1(async () => ({
      ...baseSources,
      candidates: [{
        canonicalId: 'symbol:1', packetKey: 'packet:1', sourceRef: 'src/one.ts',
        sourceRevision: 'source:r1', workspaceRevision: 'workspace:r1',
      }],
    }));
    await expect(resolver.resolve({ query: 'inspect', requestId: 'request:r1', workspaceRevision: 'workspace:r1' }))
      .rejects.toThrow('ACE_RESOLVER_CANDIDATE_ORDINAL_MAP_COUNT_MISMATCH');
  });

  it('rejects runtime candidate provenance that differs from the ordinal-map identity', async () => {
    const ordinalMap = materializeCandidateOrdinalMap({
      candidates: [{
        canonicalId: 'packet:1', packetKey: 'packet:1', sourceRef: 'src/one.ts',
        treeNodeId: null, symbolVersionId: null, graphRevision: null, semanticRevision: null,
        workspaceRevision: WORKSPACE_REVISION, sourceRevision: `sha256:${'a'.repeat(64)}`,
      }],
      candidateSnapshotRevision: 'snapshot:ace:r1',
      workspaceRevision: WORKSPACE_REVISION,
      producerRevision: 'ordinal:r1',
    });
    const resolver = createSearchRuntimeAceResolverV1(async () => ({
      ...baseSources,
      ordinalMap,
      candidates: [{
        canonicalId: 'packet:1', packetKey: 'packet:1', sourceRef: 'src/one.ts',
        workspaceRevision: WORKSPACE_REVISION, sourceRevision: `sha256:${'b'.repeat(64)}`,
      }],
      rows: [{
        schema: 'atlas.retrieval-router-feature-row.v1',
        candidateOrdinal: 0,
        canonicalId: 'packet:1',
        packetKey: 'packet:1',
        sourceRef: 'src/one.ts',
        treeNodeId: null,
        sourceVersionReceiptId: null,
        reconciliationReceiptId: null,
        workspaceRevision: WORKSPACE_REVISION,
        featureRevision: 'feature:r1',
        graphRevision: null,
        semantic: { representationId: 'semantic_768', representationRevision: 'semantic_768:r1', dimension: 768, cosine: null },
        latent: null,
        structure: { hasFunction: false, hasCall: false, hasDatabaseAccess: false, hasNetworkCall: false, hasTest: false, hasErrorHandler: false, astPatternMask: Array(32).fill(0) },
        ontology: { mask: Array(32).fill(0), classes: [] },
        lexical: { nounDensity: null, verbDensity: null, identifierOverlap: null, bm25Score: null, bm42ChallengerScore: null },
        graph: { pageRank: null, personalizedPageRank: null, degree: null, communityId: null, hopDistance: null },
        cluster: { kmeansClusterId: null, kmeansProbability: null, somRow: null, somCol: null, somDistance: null },
        temporal: { recency: null, changeFrequency: null, mutationStatus: 'UNKNOWN' },
        evidence: { groundingExact: false, validatorPassed: false, authorityWeight: null, evidenceRefs: [] },
        flattenedTags: [],
        rowDigest: 'a'.repeat(64),
      }],
    }));

    await expect(resolver.resolve({ query: 'inspect', requestId: 'request:r1', workspaceRevision: WORKSPACE_REVISION }))
      .rejects.toThrow('ACE_RESOLVER_CANDIDATE_FEATURE_MISMATCH:0');
  });

  it('rejects a synthetic workspace revision', async () => {
    const syntheticMap = materializeCandidateOrdinalMap({
      candidates: [],
      candidateSnapshotRevision: 'snapshot:ace:r1',
      workspaceRevision: new Date().toISOString(),
      producerRevision: 'ordinal:r1',
    });
    const resolver = createSearchRuntimeAceResolverV1(async () => ({ ...baseSources, ordinalMap: syntheticMap }));
    await expect(resolver.resolve({ query: 'inspect', requestId: 'request:r1', workspaceRevision: syntheticMap.workspaceRevision }))
      .rejects.toThrow('ACE_RESOLVER_SYNTHETIC_REVISION_REJECTED:workspaceRevision');
  });

  it('rejects missing feature rows', async () => {
    const resolver = createSearchRuntimeAceResolverV1(async () => ({
      ...baseSources,
      ordinalMap: {
        ...emptyOrdinalMap,
        rowCount: 1,
      },
    }));
    await expect(resolver.resolve({ query: 'inspect', requestId: 'request:r1', workspaceRevision: 'workspace:r1' }))
      .rejects.toThrow();
  });
});
