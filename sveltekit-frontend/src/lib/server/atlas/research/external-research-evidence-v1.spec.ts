import { describe, expect, it } from 'vitest';
import { AtlasExternalResearchEvidenceV1Schema, buildAtlasExternalResearchEvidenceV1 } from './external-research-evidence-v1.js';

describe('AtlasExternalResearchEvidenceV1', () => {
  it('normalizes external evidence without local identity authority', () => {
    const evidence = buildAtlasExternalResearchEvidenceV1({
      queryId: 'query:1',
      sourceKind: 'official_docs',
      externalId: 'doc:1',
      url: 'https://example.com/docs',
      title: 'Documentation',
      text: 'A grounded external excerpt.',
      semanticScore: 0.82,
      fetchedAt: '2026-08-28T20:00:00Z',
      retrievalRevision: 'go-retrieval-research:v1',
    });

    expect(AtlasExternalResearchEvidenceV1Schema.parse(evidence)).toEqual(evidence);
    expect(evidence.canonicalAuthority).toBe(false);
    expect(evidence.localSourceAuthority).toBe(false);
    expect(evidence.mutationAuthority).toBe(false);
  });

  it('rejects local coordinates smuggled into the external envelope', () => {
    const input = {
      queryId: 'query:1',
      sourceKind: 'web_page' as const,
      externalId: 'page:1',
      text: 'External text',
      semanticScore: 0.5,
      retrievalRevision: 'go-retrieval-research:v1',
      candidateOrdinal: 1,
    };

    expect(() => buildAtlasExternalResearchEvidenceV1(input as never)).toThrow();
  });
});
