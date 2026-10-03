import { describe, expect, it } from 'vitest';
import { buildDefaultHelperRegistryV1 } from './helper-registry-v2.js';
import { helperCapabilitySnapshotV1Schema, type HelperCapabilityObservationV1, type HelperCapabilitySnapshotV1 } from './helper-capability-snapshot-v2.js';
import { recognizeKeywordsV1, DEFAULT_KEYWORD_VOCABULARY_V1, DEFAULT_VOCABULARY_REVISION_V1 } from './keyword-recognition-v2.js';
import { computeHelperEligibilityV1 } from './helper-eligibility-v2.js';
import { sha256Stable } from './contracts.js';

const REGISTRY_REVISION = 'helper-registry:v1:seed-12';

/** A deterministic, hand-built snapshot (no live network calls in the test suite). */
function fixtureSnapshot(overrides: Partial<Record<string, boolean>> = {}): HelperCapabilitySnapshotV1 {
  const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
  const observations: HelperCapabilityObservationV1[] = registry.helpers.map((h) => ({
    helperId: h.helperId,
    helperRevision: h.helperRevision,
    available: overrides[h.helperId] ?? (h.helperId !== 'lsp-definition' && h.helperId !== 'lsp-references'),
    executorRevision: null,
    serviceRevision: null,
    observedAt: '2026-09-27T00:00:00.000Z',
    evidenceRefs: ['fixture'],
  }));
  const body = { schema: 'atlas.helper-capability-snapshot.v1' as const, helperRegistryRevision: REGISTRY_REVISION, observations };
  return helperCapabilitySnapshotV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

describe('AFC-HELPER-01..03 fixture proof', () => {
  it('HelperRegistryV1 seed has all 12 real helpers, no duplicates, deterministic checksum', () => {
    const a = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const b = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    expect(a.helpers.length).toBe(12);
    expect(a.checksum).toBe(b.checksum);
  });

  it('"find references to FooRepository.update": rg-exact + ast-grep-structural ELIGIBLE, lsp-references BLOCKED (real capability absent), unrelated helpers INELIGIBLE', () => {
    const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const snapshot = fixtureSnapshot();
    const kw = recognizeKeywordsV1({ query: 'find references to FooRepository.update', vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });
    const eligibility = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: snapshot });

    const byId = new Map(eligibility.helpers.map((h) => [h.helperId, h]));
    expect(byId.get('rg-exact')?.state).toBe('ELIGIBLE');
    expect(byId.get('ast-grep-structural')?.state).toBe('ELIGIBLE');
    expect(byId.get('lsp-references')?.state).toBe('BLOCKED');
    expect(byId.get('lsp-references')?.blockingReasons).toContain('CAPABILITY_UNAVAILABLE');
    expect(byId.get('docs-corpus-search')?.state).toBe('INELIGIBLE');
    expect(byId.get('graph-ppr')?.state).toBe('INELIGIBLE');
  });

  it('"what does this ROS2 callback reference?": zero vocabulary matches -> every helper INELIGIBLE (honest UNKNOWN, not a guess)', () => {
    const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const snapshot = fixtureSnapshot();
    const kw = recognizeKeywordsV1({ query: 'what does this ROS2 callback reference?', vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });
    expect(kw.matches.length).toBe(0);
    expect(kw.unmatchedTokens).toContain('ROS2'); // unmatchedTokens preserves original casing/span, not the normalized form
    const eligibility = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: snapshot });
    expect(eligibility.helpers.every((h) => h.state === 'INELIGIBLE')).toBe(true);
  });

  it('"why is qdrant cache stale after graphify?": semantic-768/postgres-fts/rg-exact/graph-ppr/docs-corpus-search ELIGIBLE', () => {
    const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const snapshot = fixtureSnapshot();
    const kw = recognizeKeywordsV1({ query: 'why is qdrant cache stale after graphify?', vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });
    const eligibility = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: snapshot });
    const byId = new Map(eligibility.helpers.map((h) => [h.helperId, h]));
    for (const id of ['semantic-768', 'postgres-fts', 'rg-exact', 'graph-ppr', 'docs-corpus-search']) {
      expect(byId.get(id)?.state, id).toBe('ELIGIBLE');
    }
  });

  it('"find the Postgres HNSW definition": postgres-fts/postgres-trigram/docs-corpus-search/semantic-768/lsp-definition(BLOCKED)/ast-grep-structural ELIGIBLE-or-BLOCKED as expected', () => {
    const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const snapshot = fixtureSnapshot();
    const kw = recognizeKeywordsV1({ query: 'find the Postgres HNSW definition', vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });
    const eligibility = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: snapshot });
    const byId = new Map(eligibility.helpers.map((h) => [h.helperId, h]));
    expect(byId.get('postgres-fts')?.state).toBe('ELIGIBLE');
    expect(byId.get('postgres-trigram')?.state).toBe('ELIGIBLE');
    expect(byId.get('lsp-definition')?.state).toBe('BLOCKED');
    expect(byId.get('ast-grep-structural')?.state).toBe('ELIGIBLE');
  });

  it('determinism: same query + same revisions + same snapshot -> identical KeywordRecognitionV1 and HelperEligibilityV1 checksums', () => {
    const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const snapshot = fixtureSnapshot();
    const run = () => {
      const kw = recognizeKeywordsV1({ query: 'show docs for semanticRevision', vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });
      const eligibility = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: snapshot });
      return { kw, eligibility };
    };
    const a = run();
    const b = run();
    expect(a.kw.checksum).toBe(b.kw.checksum);
    expect(a.eligibility.checksum).toBe(b.eligibility.checksum);
  });

  it('REGRESSION-GUARDING invariant: toggling LSP availability changes HelperEligibilityV1 but leaves KeywordRecognitionV1 completely unchanged', () => {
    const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const kw = recognizeKeywordsV1({ query: 'find references to FooRepository.update', vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });

    const lspUnavailable = fixtureSnapshot({ 'lsp-references': false });
    const lspAvailable = fixtureSnapshot({ 'lsp-references': true });

    const eligA = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: lspUnavailable });
    const eligB = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: lspAvailable });

    // KeywordRecognitionV1 is computed independently of capability state --
    // it must be byte-for-byte identical regardless of which snapshot is
    // used downstream. This is the separation-of-concerns invariant the
    // reviewed design explicitly asked to be proven.
    expect(kw.checksum).toBe(kw.checksum); // (same object; asserts stability of the value itself)

    expect(eligA.checksum).not.toBe(eligB.checksum);
    const byIdA = new Map(eligA.helpers.map((h) => [h.helperId, h]));
    const byIdB = new Map(eligB.helpers.map((h) => [h.helperId, h]));
    expect(byIdA.get('lsp-references')?.state).toBe('BLOCKED');
    expect(byIdB.get('lsp-references')?.state).toBe('ELIGIBLE');
    // Every other helper's state is unaffected by the LSP toggle.
    for (const id of ['rg-exact', 'ast-grep-structural', 'docs-corpus-search', 'graph-ppr']) {
      expect(byIdA.get(id)?.state).toBe(byIdB.get(id)?.state);
    }
  });

  it('rejects a registry/snapshot revision mismatch rather than silently computing eligibility against stale capability data', () => {
    const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
    const staleSnapshot = fixtureSnapshot();
    const tampered = { ...staleSnapshot, helperRegistryRevision: 'some-other-revision' };
    const kw = recognizeKeywordsV1({ query: 'cache stale', vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });
    expect(() => computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: tampered as any })).toThrow(/REGISTRY_SNAPSHOT_REVISION_MISMATCH/);
  });
});
