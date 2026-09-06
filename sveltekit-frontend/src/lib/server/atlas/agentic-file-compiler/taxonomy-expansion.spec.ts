import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';
import { buildQueryExpansionBundleV1, type QueryExpansionTermV1 } from './query-expansion-v1.js';
import { compileTaxonomyScopeV1 } from './taxonomy-scope-v1.js';

describe('taxonomy-scoped query expansion', () => {
  it('preserves literal terms and deterministically derives known taxonomy terms', () => {
    const classification = classifyAtlasQuery({ requestId: 'tax-1', query: 'TurboVec double vote semantic retrieval' });
    const scope = compileTaxonomyScopeV1({
      classification,
      workspaceRevision: 'workspace:r1',
      taxonomyRevision: 'taxonomy:r1',
      ontologyRevision: 'ontology:r1',
      knownFeatures: [{ id: 'retrieval.semantic', aliases: ['semantic'] }],
    });
    const candidates: QueryExpansionTermV1[] = [{ term: 'retrieval.semantic', normalized: '', source: 'FEATURE_ALIAS', confidence: 0.98, evidenceRef: 'feature:retrieval.semantic', sourceRevision: 'feature:r1' }];
    const bundle = buildQueryExpansionBundleV1({ scope, literalTerms: ['TurboVec', 'double', 'vote', 'semantic', 'retrieval'], candidates });
    expect(bundle.literalTerms).toEqual(['double', 'retrieval', 'semantic', 'TurboVec', 'vote']);
    expect(bundle.literalTerms).toContain('TurboVec');
    expect(bundle.expansions.some((term) => term.term === 'retrieval.semantic')).toBe(true);
    expect(bundle.checksum).toHaveLength(64);
  });

  it('changes scope and expansion checksums when taxonomy revisions change', () => {
    const classification = classifyAtlasQuery({ requestId: 'tax-2', query: 'semantic search' });
    const a = compileTaxonomyScopeV1({ classification, workspaceRevision: 'workspace:r1', taxonomyRevision: 'taxonomy:r1', ontologyRevision: 'ontology:r1' });
    const b = compileTaxonomyScopeV1({ classification, workspaceRevision: 'workspace:r1', taxonomyRevision: 'taxonomy:r2', ontologyRevision: 'ontology:r1' });
    expect(a.checksum).not.toBe(b.checksum);
    const bundleA = buildQueryExpansionBundleV1({ scope: a, literalTerms: ['semantic', 'search'], candidates: [] });
    const bundleB = buildQueryExpansionBundleV1({ scope: b, literalTerms: ['semantic', 'search'], candidates: [] });
    expect(bundleA.checksum).not.toBe(bundleB.checksum);
  });
});
