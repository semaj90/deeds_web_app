import { describe, expect, it } from 'vitest';
import { adaptDomainPrediction, buildPrefillRerankFeatureRow } from '../src/lib/server/ai/prefill-rerank-features.js';

describe('prefill rerank feature row', () => {
  it('keeps uncertain domain evidence unobserved rather than zero', () => {
    const domain = adaptDomainPrediction({ packet_key: 'ace:packet:x', predicted_domain: 'retrieval', top_score: .4, score_margin: .01, status: 'UNCERTAIN' }, 'prediction:1');
    expect(domain.domainScore).toBeNull();

    const row = buildPrefillRerankFeatureRow({
      requestId: 'r', candidateOrdinal: 0, canonicalId: 'c', packetKey: 'ace:packet:x', sourceRef: 'src/x.ts',
      semanticScore: .8, semanticExecutor: 'qdrant', pagerankScore: null, graphAuthorityReceiptRef: null,
      hypergraphScore: null, hyperedgeRefs: [], astScore: .9, somScore: null, hypersphereScore: null,
      ...domain, tokenCost: 100, latencyCostMs: 2, workspaceRevision: 'w', graphRevision: 'g',
      featureRevision: 'f', representationRevision: 'semantic_768:v1',
    });
    expect(row.observedSignals).toEqual(['ast', 'semantic']);
    expect(row.missingSignals).toContain('domain');
  });
});
