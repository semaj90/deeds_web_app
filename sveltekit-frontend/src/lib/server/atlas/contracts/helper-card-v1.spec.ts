// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  HelperCardV1Schema,
  HelperRoutingCandidateV1Schema,
  canDispatchDirectly,
} from './helper-card-v1.js';

describe('HelperCardV1', () => {
  const validCard = {
    helperId: 'ast-grep-owner-finder',
    capabilities: 'Finds the structural owner of a symbol via ast-grep pattern match.',
    supportedTaskFamilies: ['code_retrieval', 'ownership_lookup'],
    invocationCostClass: 'CHEAP' as const,
    evidenceRequirements: ['source_ref', 'symbol_version_id'],
    semantic768Ref: 'semantic768:helper:ast-grep-owner-finder:r1',
    revision: 'r1',
  };

  it('accepts a valid helper card', () => {
    const parsed = HelperCardV1Schema.parse(validCard);
    expect(parsed.helperId).toBe('ast-grep-owner-finder');
    expect(parsed.schema).toBe('atlas.helper-card.v1');
  });

  it('rejects a card with an inline semantic768 vector instead of a ref', () => {
    const invalid = { ...validCard, semantic768: new Array(768).fill(0.1) };
    // @ts-expect-error -- deliberately malformed for the test
    delete invalid.semantic768Ref;
    expect(() => HelperCardV1Schema.parse(invalid)).toThrow();
  });

  it('rejects unknown fields (strict schema)', () => {
    expect(() => HelperCardV1Schema.parse({ ...validCard, somethingElse: 'nope' })).toThrow();
  });

  it('rejects an invocationCostClass outside the enum', () => {
    expect(() =>
      HelperCardV1Schema.parse({ ...validCard, invocationCostClass: 'FREE' })
    ).toThrow();
  });
});

describe('HelperRoutingCandidateV1 / canDispatchDirectly', () => {
  it('allows direct dispatch for a high-confidence top-ranked candidate', () => {
    const candidate = HelperRoutingCandidateV1Schema.parse({
      helperId: 'qdrant-semantic-search',
      similarity: 0.9,
      rank: 0,
    });
    expect(canDispatchDirectly(candidate)).toBe(true);
  });

  it('denies direct dispatch below the confidence threshold', () => {
    const candidate = HelperRoutingCandidateV1Schema.parse({
      helperId: 'qdrant-semantic-search',
      similarity: 0.5,
      rank: 0,
    });
    expect(canDispatchDirectly(candidate)).toBe(false);
  });

  it('denies direct dispatch for a non-top-ranked candidate even at high similarity', () => {
    const candidate = HelperRoutingCandidateV1Schema.parse({
      helperId: 'qdrant-semantic-search',
      similarity: 0.95,
      rank: 1,
    });
    expect(canDispatchDirectly(candidate)).toBe(false);
  });
});
