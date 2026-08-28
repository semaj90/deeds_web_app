import { describe, expect, it } from 'vitest';
import { AtlasExternalResearchEvidenceV1Schema, buildAtlasExternalResearchEvidenceV1 } from './external-research-evidence-v1.js';
import { externalResearchEvidenceToAceCardV1 } from './external-research-ace-adapter-v1.js';

describe('externalResearchEvidenceToAceCardV1', () => {
  it('creates an ACE card without local candidate identity', () => {
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
    const card = externalResearchEvidenceToAceCardV1(evidence, {
      workspaceRevision: 'sha256:workspace',
      candidateSnapshotRevision: 'candidate:v1',
      ordinalMapChecksum: 'sha256:ordinal',
    });

    expect(card.candidateOrdinal).toBeNull();
    expect(card.sourceRevision).toBeNull();
    expect(card.sourceRef).toBeNull();
    expect(card.canonicalAuthority).toBe(false);
    expect(card.evidenceRefs).toEqual([`external:${evidence.evidenceChecksum}`]);
  });

  it('produces a schema-valid ACE card', () => {
    const evidence = AtlasExternalResearchEvidenceV1Schema.parse({
      schema: 'atlas.external-research-evidence.v1',
      queryId: 'query:2',
      sourceKind: 'web_page',
      externalId: 'page:2',
      url: 'https://example.com/page',
      title: null,
      text: 'External evidence text.',
      semanticScore: 0.5,
      fetchedAt: null,
      retrievalRevision: 'retrieval:v1',
      evidenceChecksum: 'sha256:evidence',
      canonicalAuthority: false,
      localSourceAuthority: false,
      mutationAuthority: false,
    });
    const card = externalResearchEvidenceToAceCardV1(evidence, {
      workspaceRevision: 'sha256:workspace',
      candidateSnapshotRevision: 'candidate:v1',
      ordinalMapChecksum: 'sha256:ordinal',
    });

    expect(card.schema).toBe('atlas.ace-card.v2');
    expect(card.cardId.startsWith('ace:external:')).toBe(true);
  });
});
