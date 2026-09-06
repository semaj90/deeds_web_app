import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';
import { buildQueryExpansionBundleV1 } from './query-expansion-v1.js';
import { buildQueryFingerprintV1 } from './query-fingerprint-v1.js';
import { buildRetrievalPlan } from './retrieval-plan.js';
import { compileTaxonomyScopeV1 } from './taxonomy-scope-v1.js';

describe('buildRetrievalPlan', () => {
  it('contains one semantic lane and no executor names', () => {
    const classification = classifyAtlasQuery({ requestId: 'r1', query: 'implement cache adapter using CAGRA evidence' });
    const plan = buildRetrievalPlan({ classification, workspaceRevision: 'w1' });
    expect(plan.lanes.filter((lane) => lane === 'semantic')).toHaveLength(1);
    expect(JSON.stringify(plan.lanes)).not.toMatch(/CAGRA|QDRANT|DISKANN|CUVS/);
  });

  it('carries taxonomy and expansion references without changing the semantic lane', () => {
    const classification = classifyAtlasQuery({ requestId: 'plan-1', query: 'semantic retrieval' });
    const scope = compileTaxonomyScopeV1({ classification, workspaceRevision: 'workspace:r1', taxonomyRevision: 'taxonomy:r1', ontologyRevision: 'ontology:r1' });
    const expansion = buildQueryExpansionBundleV1({ scope, literalTerms: classification.rawQuery.split(/\s+/), candidates: [] });
    const fingerprint = buildQueryFingerprintV1({ requestId: classification.requestId, query: classification.rawQuery, normalizerRevision: 'normalizer:v1', corpusRevision: 'corpus:r1', observedAt: '2026-09-06T00:00:00.000Z' });
    const plan = buildRetrievalPlan({ classification, workspaceRevision: 'workspace:r1', taxonomyScope: scope, queryExpansion: expansion, queryFingerprint: fingerprint, tokenBudget: 2048 });
    expect(plan.semanticRepresentation).toBe('semantic_768');
    expect(plan.taxonomyScopeChecksum).toBe(scope.checksum);
    expect(plan.queryExpansionChecksum).toBe(expansion.checksum);
    expect(plan.queryFingerprintRef).toBe(`query-fingerprint:${fingerprint.checksum}`);
    expect(plan.queryFingerprintChecksum).toBe(fingerprint.checksum);
    expect(plan.tokenBudget).toBe(2048);
  });
});
