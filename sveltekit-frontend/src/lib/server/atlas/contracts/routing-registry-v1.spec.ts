// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ROUTING_REGISTRY_V1, registryCodeOfV1, registryNameOfV1, registryVocabularyV1, validateRoutingRegistryV1,
  type RoutingRegistryV1,
} from './routing-registry-v1.js';
import { SearchLaneSchema } from '../../retrieval/search-contract.js';
import { retrievalLaneSchema, routerIntentSchema } from '../../retrieval/cognitive-router.js';
import { CANONICAL_DOMAINS, DOMAIN_TAXONOMY_VERSION } from '../domain-taxonomy.js';

/** The real source enums. A registry that disagrees with them must fail, in both directions. */
const SOURCES: Record<string, readonly string[]> = {
  'search_contract.lane': SearchLaneSchema.options,
  'cognitive_router.lane': retrievalLaneSchema.options,
  'cognitive_router.intent': routerIntentSchema.options,
  canonical_domains: CANONICAL_DOMAINS,
};

describe('routing registry v1: drift guard against the real source vocabularies', () => {
  for (const [vocabularyId, sourceNames] of Object.entries(SOURCES)) {
    it(`${vocabularyId}: every live source member has a code (a new member must be appended, never silently unrouted)`, () => {
      const v = registryVocabularyV1(vocabularyId)!;
      expect(v).not.toBeNull();
      const live = new Set(v.entries.filter((e) => !e.deprecated).map((e) => e.name));
      expect([...sourceNames].filter((n) => !live.has(n))).toEqual([]);
    });

    it(`${vocabularyId}: no live registry entry points at a name the source no longer has (rename = deprecate + append)`, () => {
      const v = registryVocabularyV1(vocabularyId)!;
      const src = new Set(sourceNames);
      expect(v.entries.filter((e) => !e.deprecated && !src.has(e.name)).map((e) => e.name)).toEqual([]);
    });
  }

  it('records the taxonomy revision for the domain vocabulary and covers every registered vocabulary in this spec', () => {
    expect(registryVocabularyV1('canonical_domains')!.sourceRevision).toBe(DOMAIN_TAXONOMY_VERSION);
    expect(ROUTING_REGISTRY_V1.vocabularies.map((v) => v.vocabularyId).sort()).toEqual(Object.keys(SOURCES).sort());
  });
});

describe('routing registry v1: structure and lookups', () => {
  it('the shipped registry is structurally valid', () => {
    expect(validateRoutingRegistryV1(ROUTING_REGISTRY_V1)).toEqual([]);
  });

  it('codes are scoped per vocabulary: the same number means different things in different vocabularies', () => {
    expect(registryNameOfV1('search_contract.lane', 2)).toBe('dense');
    expect(registryNameOfV1('cognitive_router.lane', 2)).toBe('ann');
    expect(registryCodeOfV1('cognitive_router.intent', 'graph')).toBe(3);
    expect(registryCodeOfV1('canonical_domains', 'graph')).toBe(8);
  });

  it('code 0 and unknown names are never routable', () => {
    expect(registryNameOfV1('cognitive_router.lane', 0)).toBeNull();
    expect(registryCodeOfV1('cognitive_router.lane', 'nope')).toBeNull();
    expect(registryCodeOfV1('no_such_vocabulary', 'graph')).toBeNull();
  });

  it('flags duplicate codes, duplicate names, out-of-range codes, empty and duplicate vocabularies', () => {
    const bad: RoutingRegistryV1 = {
      ...ROUTING_REGISTRY_V1,
      vocabularies: [
        { vocabularyId: 'x', axis: 'LANE', source: 's', sourceRevision: null, entries: [{ code: 1, name: 'a' }, { code: 1, name: 'b' }, { code: 2, name: 'a' }, { code: 0, name: 'z' }, { code: 256, name: 'y' }] },
        { vocabularyId: 'x', axis: 'LANE', source: 's', sourceRevision: null, entries: [] },
      ],
    };
    const kinds = validateRoutingRegistryV1(bad).map((v) => v.violation).sort();
    expect(kinds).toEqual(['CODE_OUT_OF_RANGE', 'CODE_OUT_OF_RANGE', 'DUPLICATE_CODE', 'DUPLICATE_NAME', 'DUPLICATE_VOCABULARY_ID', 'EMPTY_VOCABULARY']);
  });

  it('append-only: a deprecated entry keeps its code and is excluded from the live source check', () => {
    const v = registryVocabularyV1('cognitive_router.lane')!;
    const withDeprecated: RoutingRegistryV1 = {
      ...ROUTING_REGISTRY_V1,
      vocabularies: [{ ...v, entries: [...v.entries, { code: 7, name: 'retired_lane', deprecated: true }] }],
    };
    expect(validateRoutingRegistryV1(withDeprecated)).toEqual([]);
    expect(registryNameOfV1('cognitive_router.lane', 7, withDeprecated)).toBe('retired_lane');
  });
});
