import { describe, expect, it } from 'vitest';
import { proposeEvidenceTaxonomyV1 } from './evidence-taxonomy-proposal-v1.js';

const claimId = '22222222-2222-4222-8222-222222222222';
const ontologyRevision = `sha256:${'a'.repeat(64)}`;
const producerRevision = 'oaklib-fixture-2026-11-01';

const claims = [{
  claimId,
  sourceId: 'evidence://fixture/brief-1',
  sourceSha256: 'b'.repeat(64),
  sourceRevision: `sha256:${'b'.repeat(64)}`,
  workspaceRevision: null,
  caseId: null,
  who: 'court',
  relationPredicate: 'indexes',
  what: 'retrieval search rank candidate',
  why: 'retrieve matching evidence',
  how: 'search and rank candidate evidence',
  assertion: 'The retrieval search ranks candidate evidence.',
  domainId: null,
  taxonomyId: null,
  observedAt: null,
  validAt: null,
  extraction: {
    provider: 'fixture',
    producerRevision: 'langextract-fixture-v1',
    modelId: null,
    outputSha256: 'c'.repeat(64),
    method: 'fixture',
    confidence: 0.9,
    productVersion: 'fixture-v1',
  },
  supportingClaimIds: [],
  contradictingClaimIds: [],
  span: {
    startChar: 0,
    endChar: 10,
    startByte: 0,
    endByte: 10,
    exactText: 'pgvector',
    textSourceSha256: 'd'.repeat(64),
  },
  verificationStatus: 'SOURCE_GROUNDED',
}];

function oakResponse(overrides: Record<string, unknown> = {}) {
  const concept = {
    externalId: 'local:retrieval',
    label: 'Information retrieval',
    namespace: 'local',
    evidenceRefs: ['fixture:taxonomy-entry'],
    ontologyRevision,
    producerRevision,
    canonicalAuthority: false,
  };
  return {
    schema: 'atlas.oaklib-label-search-response.v1',
    status: 'PROPOSAL_ONLY',
    ontologyRevision,
    producerRevision,
    matches: [{ searchText: 'retrieval', externalIds: ['local:retrieval'] }],
    candidateBundle: {
      schema: 'atlas.oaklib-candidate-bundle.v1',
      sourceSelector: 'atlas-local-ontology',
      ontologyRevision,
      producerRevision,
      concepts: [concept],
      relations: [],
      canonicalAuthority: false,
    },
    canonicalAuthority: false,
    writesPerformed: false,
    ...overrides,
  };
}

describe('proposeEvidenceTaxonomyV1', () => {
  it('retains source claim support and revision-bound OAK candidates as proposals', () => {
    const result = proposeEvidenceTaxonomyV1({
      claims,
      registryStatus: 'ABSENT',
      oaklib: { status: 'RESPONSE', response: oakResponse() },
    });

    expect(result).toMatchObject({
      oaklibStatus: 'AVAILABLE',
      oaklibOntologyRevision: ontologyRevision,
      oaklibProducerRevision: producerRevision,
      canonicalAuthority: false,
      mappings: [{
        claimId,
        supportingClaimIds: [claimId],
        sourceRevision: claims[0]?.sourceRevision,
        status: 'PROPOSED',
        oakCandidates: [{ externalId: 'local:retrieval' }],
        featureIdentity: {
          state: 'UNRESOLVED',
          reason: 'REGISTRY_ABSENT',
          canonicalFeatureId: null,
          canonicalAuthority: false,
        },
      }],
    });
  });

  it('rejects revision-mismatched or unbound OAK candidates without promoting identity', () => {
    const mismatched = proposeEvidenceTaxonomyV1({
      claims,
      oaklib: { status: 'RESPONSE', response: oakResponse({
        candidateBundle: { ...oakResponse().candidateBundle, ontologyRevision: `sha256:${'e'.repeat(64)}` },
      }) },
    });
    const unbound = proposeEvidenceTaxonomyV1({
      claims,
      oaklib: { status: 'RESPONSE', response: oakResponse({
        matches: [{ searchText: 'retrieval', externalIds: ['not-in-bundle'] }],
      }) },
    });

    expect(mismatched.oaklibStatus).toBe('INVALID_RESPONSE');
    expect(unbound.oaklibStatus).toBe('INVALID_RESPONSE');
    for (const result of [mismatched, unbound]) {
      expect(result.canonicalAuthority).toBe(false);
      expect(result.mappings[0]?.oakCandidates).toEqual([]);
      expect(result.mappings[0]?.featureIdentity.canonicalFeatureId).toBeNull();
    }
  });

  it('reports unavailable OAK and unchecked registry distinctly', () => {
    const result = proposeEvidenceTaxonomyV1({
      claims,
      registryStatus: 'NOT_CHECKED',
      oaklib: { status: 'UNAVAILABLE' },
    });

    expect(result.oaklibStatus).toBe('UNAVAILABLE');
    expect(result.mappings[0]).toMatchObject({
      supportingClaimIds: [claimId],
      featureIdentity: { reason: 'REGISTRY_NOT_CHECKED', canonicalFeatureId: null },
    });
  });

  it('keeps claims without a deterministic domain classification unresolved', () => {
    const result = proposeEvidenceTaxonomyV1({
      claims: [{
        ...claims[0],
        who: '',
        relationPredicate: 'occurred',
        what: 'An event occurred.',
        why: '',
        how: '',
        assertion: 'An event occurred.',
      }],
      registryStatus: 'ABSENT',
    });

    expect(result.mappings[0]).toMatchObject({
      claimId,
      status: 'UNRESOLVED',
      candidateDomainId: null,
      candidateDomainLabel: null,
      oakCandidates: [],
      featureIdentity: { state: 'UNRESOLVED', canonicalFeatureId: null },
    });
  });
});
