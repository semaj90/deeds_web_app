import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import {
  materializeCandidateFeatureSnapshotFromQasRowsV1,
  materializeCandidateFeatureSnapshotFromRetrievalRowsV1,
} from './retrieval-router-to-candidate-feature-snapshot-v1.js';
import { produceAceFeatureSnapshotV1 } from '../context/ace-feature-snapshot-producer-v1.js';

const bits = Array.from({ length: 32 }, () => 0 as const);

const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision: 'snapshot:r1',
  workspaceRevision: '1',
  producerRevision: 'ordinal-producer:r1',
  candidates: [{
    canonicalId: 'canonical:1',
    packetKey: 'packet:1',
    sourceRef: 'src/file.ts',
    treeNodeId: 'tree:1',
    symbolVersionId: 'symbol:1',
    workspaceRevision: '1',
    sourceRevision: 'source:r1',
    graphRevision: 'graph:r1',
    semanticRevision: 'semantic:r1',
    degradedIdentity: false,
    evidenceRefs: ['evidence:1'],
    representationBindings: [],
  }],
});

const routerRow = {
  schema: 'atlas.retrieval-router-feature-row.v1' as const,
  candidateOrdinal: 0,
  canonicalId: 'canonical:1',
  packetKey: 'packet:1',
  sourceRef: 'src/file.ts',
  treeNodeId: 'tree:1',
  sourceVersionReceiptId: null,
  reconciliationReceiptId: null,
  workspaceRevision: 1,
  featureRevision: 'feature:r1',
  graphRevision: 'graph:r1',
  semantic: { representationId: 'semantic_768' as const, representationRevision: 'semantic:r1', dimension: 768 as const, cosine: 0.9 },
  latent: null,
  structure: { hasFunction: true, hasCall: false, hasDatabaseAccess: false, hasNetworkCall: false, hasTest: false, hasErrorHandler: false, astPatternMask: bits },
  ontology: { mask: bits, classes: [] },
  lexical: { nounDensity: null, verbDensity: null, identifierOverlap: null, bm25Score: 0.4, bm42ChallengerScore: null },
  graph: { pageRank: 0.2, personalizedPageRank: null, degree: 1, communityId: null, hopDistance: null },
  cluster: { kmeansClusterId: null, kmeansProbability: null, somRow: null, somCol: null, somDistance: null },
  temporal: { recency: null, changeFrequency: null, mutationStatus: 'FRESH' as const },
  evidence: { groundingExact: true, validatorPassed: true, authorityWeight: 0.8, evidenceRefs: ['evidence:1'] },
  flattenedTags: [],
  rowDigest: 'a'.repeat(64),
};

describe('retrieval-router to candidate feature snapshot adapter', () => {
  it('preserves ordinal-map identity and explicit revisions', () => {
    const snapshot = materializeCandidateFeatureSnapshotFromRetrievalRowsV1({
      ordinalMap,
      rows: [routerRow],
      laneMaskByOrdinal: { '0': ['semantic', 'lexical', 'graph'] },
      producerRevision: 'snapshot-producer:r1',
    });

    expect(snapshot.rows[0]).toMatchObject({
      candidateOrdinal: 0,
      canonicalId: 'canonical:1',
      sourceRevision: 'source:r1',
      workspaceRevision: '1',
      featureRevision: 'feature:r1',
    });
    expect(snapshot.identityAuthority).toBe(false);
  });

  it('rejects nullable workspace lineage instead of coercing it', () => {
    expect(() => materializeCandidateFeatureSnapshotFromRetrievalRowsV1({
      ordinalMap,
      rows: [{ ...routerRow, workspaceRevision: null }],
      laneMaskByOrdinal: { '0': ['semantic'] },
      producerRevision: 'snapshot-producer:r1',
    })).toThrow('ACE_FEATURE_ROW_WORKSPACE_REVISION_MISMATCH:0');
  });

  it('builds a deterministic snapshot from revision-qualified QAS rows', () => {
    const snapshot = materializeCandidateFeatureSnapshotFromQasRowsV1({
      candidateSnapshotRevision: 'snapshot:qas:r1',
      producerRevision: 'qas-snapshot-producer:r1',
      laneMaskByCanonicalId: { 'symbol:qas:1': ['semantic', 'lexical', 'graph'] },
      rows: [{
        schema: 'atlas.qas.candidate-feature.v1',
        requestId: 'request:qas:1',
        canonicalId: 'symbol:qas:1',
        packetKey: 'packet:qas:1',
        symbolVersionId: 'symbol:qas:1',
        sourceRef: 'src/qas.ts',
        workspaceRevision: 'workspace:qas:r1',
        sourceRevision: 'source:qas:r1',
        graphRevision: 'graph:qas:r1',
        featureRevision: 'feature:qas:r1',
        representationRevision: 'semantic:qas:r1',
        policyRevision: 'policy:qas:r1',
        taskKind: 'retrieval',
        domainClass: null,
        somRevision: null,
        features: {
          semanticAffinity: 0.9,
          lexicalAffinity: 0.5,
          graphAuthority: 0.2,
          astAffinity: 0.1,
          processAffinity: 0.2,
          domainAffinity: 0.3,
          priorExecutionSuccess: 0.4,
          reuseProbability: 0.5,
          recency: 0.6,
        },
        logicalLanes: ['semantic'],
        fusedRank: 1,
        rerankScore: 0.9,
        evidenceRefs: ['evidence:qas:1'],
      }],
    });

    expect(snapshot.rows[0]).toMatchObject({
      canonicalId: 'symbol:qas:1',
      sourceRevision: 'source:qas:r1',
      workspaceRevision: 'workspace:qas:r1',
      semanticRelevance: 0.9,
    });
  });

  it('composes the server-owned snapshot into ACE admission without writes', () => {
    const result = produceAceFeatureSnapshotV1({
      ordinalMap,
      rows: [routerRow],
      laneMaskByOrdinal: { '0': ['semantic', 'lexical', 'graph'] },
      producerRevision: 'snapshot-producer:r1',
      requestId: 'request:ace:1',
      tokenBudget: 1024,
      retrievalPolicyRevision: 'retrieval-policy:r1',
      acePlaybookRevision: 'ace-playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });

    expect(result.snapshot.ordinalMapChecksum).toBe(ordinalMap.ordinalMapChecksum);
    expect(result.admission.manifest.v1.snapshotId).toBe('snapshot:r1');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });
});
