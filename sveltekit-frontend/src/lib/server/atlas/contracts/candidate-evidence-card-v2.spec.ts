// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { CandidateEvidenceCardV2Schema, readIfPresent } from './candidate-evidence-card-v2.js';

const baseCard = {
  identity: {
    canonicalId: 'cand:1',
    candidateOrdinal: 0,
    sourceRevision: 'src-r1',
    featureRevision: 'feat-r1',
  },
  structural: { symbols: ['mergeDuplicateIdentityScores'], apis: [], calls: [], imports: [], tests: [] },
  semanticGrounding: { constraints: [], invariants: [], requirements: [], failureModes: [], ownershipClaims: [] },
  graph: {},
  ontology: { relationTypes: [], conceptIds: [], supportCount: 0 },
  rank: { rrf: 0.82 },
  presenceMask: { structural: true, semanticGrounding: false, graph: false, ontology: false },
  evidenceRefs: [],
};

describe('CandidateEvidenceCardV2', () => {
  it('accepts a valid card', () => {
    const parsed = CandidateEvidenceCardV2Schema.parse(baseCard);
    expect(parsed.identity.canonicalId).toBe('cand:1');
    expect(parsed.schema).toBe('atlas.candidate-evidence-card.v2');
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(() => CandidateEvidenceCardV2Schema.parse({ ...baseCard, extra: true })).toThrow();
  });

  it('rejects a negative candidateOrdinal', () => {
    expect(() =>
      CandidateEvidenceCardV2Schema.parse({ ...baseCard, identity: { ...baseCard.identity, candidateOrdinal: -1 } })
    ).toThrow();
  });

  it('rejects mxbaiNormalized outside [0, 1]', () => {
    expect(() =>
      CandidateEvidenceCardV2Schema.parse({ ...baseCard, rank: { mxbaiNormalized: 1.5 } })
    ).toThrow();
  });

  it('is additive relative to V1 — importing V2 has no dependency on candidate-evidence-card-v1.ts', async () => {
    const mod = await import('./candidate-evidence-card-v2.js');
    expect(Object.keys(mod)).not.toContain('CandidateEvidenceCardV1Schema');
  });
});

describe('presenceMask — distinguishes "not extracted" from "extracted empty"', () => {
  it('readIfPresent returns the section content when presenceMask is true', () => {
    const parsed = CandidateEvidenceCardV2Schema.parse(baseCard);
    const structural = readIfPresent(parsed, 'structural');
    expect(structural).not.toBeNull();
    expect(structural?.symbols).toEqual(['mergeDuplicateIdentityScores']);
  });

  it('readIfPresent returns null when presenceMask is false, even if the section array is empty', () => {
    const parsed = CandidateEvidenceCardV2Schema.parse(baseCard);
    // semanticGrounding is empty AND presenceMask.semanticGrounding is false (extraction never ran) —
    // this is exactly the EVIDENCE-CARD-01 scenario: a legal-domain-only extractor produced zero
    // entities on a code candidate, which must be visible as "not attempted", not "empty result".
    expect(readIfPresent(parsed, 'semanticGrounding')).toBeNull();
  });

  it('an extraction that genuinely ran and found nothing is distinguishable from not-attempted', () => {
    const ranButEmpty = {
      ...baseCard,
      presenceMask: { ...baseCard.presenceMask, semanticGrounding: true },
    };
    const parsed = CandidateEvidenceCardV2Schema.parse(ranButEmpty);
    const result = readIfPresent(parsed, 'semanticGrounding');
    expect(result).not.toBeNull();
    expect(result?.constraints).toEqual([]);
  });
});
