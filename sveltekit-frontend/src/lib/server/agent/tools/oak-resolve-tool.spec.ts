import { describe, it, expect, vi } from 'vitest';
import { createOakResolveTool } from './oak-resolve.js';

vi.mock('$lib/server/atlas/agentic/oak-resolution-evidence-client.js', () => ({
  resolveOakEvidenceV1: vi.fn(async (term: string) => {
    if (term === 'bankruptcy') {
      return {
        schema: 'atlas.oak-resolution-evidence.v1',
        requestId: 'test-req-1',
        rawLabel: 'bankruptcy',
        normalizedLabel: 'bankruptcy',
        resolvedCurie: 'LEGAL:0001234',
        preferredLabel: 'Bankruptcy Proceeding',
        synonyms: ['insolvency', 'chapter 11'],
        ancestors: ['LEGAL:0000001'],
        ontologyRevision: 'atlas.domain-taxonomy.v1',
        resolverRevision: 'oak-resolution-evidence-client:v1',
        state: 'RESOLVED_EXACT',
        evidenceRefs: ['oak:fixture:bankruptcy'],
        canonicalAuthority: false,
      };
    }
    return {
      schema: 'atlas.oak-resolution-evidence.v1',
      requestId: 'test-req-2',
      rawLabel: term,
      normalizedLabel: term.toLowerCase(),
      resolvedCurie: null,
      preferredLabel: null,
      synonyms: [],
      ancestors: [],
      ontologyRevision: null,
      resolverRevision: 'oak-resolution-evidence-client:v1',
      state: 'RESOLUTION_UNAVAILABLE',
      evidenceRefs: [],
      canonicalAuthority: false,
    };
  }),
}));

describe('OAKLIB LangChain Tool Integration', () => {
  it('creates an oak_resolve_concept tool with correct name and schema', () => {
    const tool = createOakResolveTool();
    expect(tool.name).toBe('oak_resolve_concept');
    expect(tool.description).toContain('OAK ontology kernel');
  });

  it('resolves known concept to canonical CURIE and synonyms', async () => {
    const tool = createOakResolveTool();
    const result = await tool.invoke({ term: 'bankruptcy' });
    const parsed = JSON.parse(result);

    expect(parsed.term).toBe('bankruptcy');
    expect(parsed.state).toBe('RESOLVED_EXACT');
    expect(parsed.curie).toBe('LEGAL:0001234');
    expect(parsed.preferredLabel).toBe('Bankruptcy Proceeding');
    expect(parsed.synonyms).toContain('insolvency');
    expect(parsed.canonicalAuthority).toBe(false);
  });

  it('fails closed when concept is unknown without hallucinating CURIE', async () => {
    const tool = createOakResolveTool();
    const result = await tool.invoke({ term: 'fictional_term_xyz' });
    const parsed = JSON.parse(result);

    expect(parsed.term).toBe('fictional_term_xyz');
    expect(parsed.state).toBe('RESOLUTION_UNAVAILABLE');
    expect(parsed.curie).toBeNull();
    expect(parsed.canonicalAuthority).toBe(false);
  });
});
