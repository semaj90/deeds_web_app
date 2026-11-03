import { describe, expect, it } from 'vitest';
import { sha256Stable } from './contracts.js';
import { classifyAtlasQuery } from './query-classifier.js';
import { HELPER_REGISTRY_V1, type HelperRegistryV1 } from './helper-registry-v1.js';
import { buildHelperCapabilitySnapshotV1, type HelperCapabilitySnapshotV1 } from './helper-capability-snapshot-v1.js';
import { buildKeywordRecognitionV1, type KeywordVocabularyV1 } from './keyword-recognition-v1.js';
import { buildHelperEligibilityV1, HelperEligibilityV1Schema } from './helper-eligibility-v1.js';

const vocabulary: KeywordVocabularyV1 = {
	revision: 'eligibility-fixture-vocabulary-v1',
	entries: [
		{ term: 'cache', domainRefs: ['cache'], helperRefs: ['rg-exact', 'postgres-fts'] },
		{ term: 'called', domainRefs: ['source-code'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-references'] },
	],
};

function snapshots(registry: HelperRegistryV1 = HELPER_REGISTRY_V1, overrides: Record<string, boolean> = {}): HelperCapabilitySnapshotV1[] {
	return registry.entries.map((h) => buildHelperCapabilitySnapshotV1({
		helperId: h.helperId, available: overrides[h.helperId] ?? true, observedAt: '2026-11-02T18:00:00.000Z',
		evidenceRefs: [`fixture:capability:${h.helperId}`],
	}, registry));
}

function recognition(query = 'cache') {
	const classification = classifyAtlasQuery({ requestId: 'elig-fixture', query, producerRevision: 'elig-fixture-v1' });
	return buildKeywordRecognitionV1({ classification, taxonomyRevision: 'taxonomy-fixture-v1', vocabulary });
}

const policy = { expansionPolicyRevision: 'expansion-fixture-v1', retrievalPolicyRevision: 'retrieval-fixture-v1' };
const decision = (e: ReturnType<typeof buildHelperEligibilityV1>, id: string) => e.decisions.find((d) => d.helperId === id)!;

describe('HelperEligibilityV1 (AFC-HELPER-03)', () => {
	it('is tri-state: ELIGIBLE, BLOCKED (unavailable), INELIGIBLE (no keyword evidence)', () => {
		const e = buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: snapshots(HELPER_REGISTRY_V1, { 'postgres-fts': false }), ...policy });
		expect(decision(e, 'rg-exact')).toMatchObject({ status: 'ELIGIBLE', blockingReasons: [] });
		expect(decision(e, 'postgres-fts')).toMatchObject({ status: 'BLOCKED', blockingReasons: ['CAPABILITY_UNAVAILABLE'] });
		expect(decision(e, 'semantic-768')).toMatchObject({ status: 'INELIGIBLE', blockingReasons: ['NO_EXACT_KEYWORD_EVIDENCE'] });
		expect(e.decisions).toHaveLength(HELPER_REGISTRY_V1.entries.length);
	});

	it('AFC-PROOF-01: a deliberately unavailable LSP is BLOCKED with CAPABILITY_UNAVAILABLE, never silently omitted', () => {
		const e = buildHelperEligibilityV1({ keywordRecognition: recognition('where is it called'), capabilitySnapshots: snapshots(HELPER_REGISTRY_V1, { 'lsp-references': false }), ...policy });
		expect(e.decisions.map((d) => d.helperId)).toContain('lsp-references');
		expect(decision(e, 'lsp-references')).toMatchObject({ status: 'BLOCKED', positiveReasons: ['EXACT_KEYWORD_EVIDENCE'], blockingReasons: ['CAPABILITY_UNAVAILABLE'] });
		expect(decision(e, 'ast-grep-structural').status).toBe('ELIGIBLE');
		expect(decision(e, 'langextract-grounding').status).toBe('INELIGIBLE');
	});

	it('BLOCKS a keyword-matched helper that has no capability snapshot instead of assuming it is up', () => {
		const partial = snapshots().filter((s) => s.helperId !== 'rg-exact');
		const e = buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: partial, ...policy });
		expect(decision(e, 'rg-exact')).toMatchObject({ status: 'BLOCKED', blockingReasons: ['CAPABILITY_SNAPSHOT_MISSING'] });
	});

	it('pins every revision and never authorizes execution, writes or canonical authority', () => {
		const rec = recognition();
		const e = buildHelperEligibilityV1({ keywordRecognition: rec, capabilitySnapshots: snapshots(), ...policy });
		expect(HelperEligibilityV1Schema.parse(e)).toEqual(e);
		expect(e).toMatchObject({
			keywordRecognitionChecksum: rec.checksum, helperRegistryChecksum: HELPER_REGISTRY_V1.checksum, helperRegistryRevision: HELPER_REGISTRY_V1.revision,
			classifierRevision: rec.classifierRevision, taxonomyRevision: rec.taxonomyRevision, vocabularyRevision: rec.vocabularyRevision, normalizationRevision: rec.normalizationRevision,
			expansionPolicyRevision: 'expansion-fixture-v1', retrievalPolicyRevision: 'retrieval-fixture-v1',
			executionAuthorized: false, executionPerformed: false, writesPerformed: false, canonicalAuthority: false,
		});
		const { checksum, ...body } = e;
		expect(checksum).toBe(sha256Stable(body));
	});

	it('is deterministic and the expansion policy revision changes the checksum', () => {
		const a = buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: snapshots(), ...policy });
		const b = buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: snapshots(), ...policy });
		const c = buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: snapshots(), ...policy, expansionPolicyRevision: 'expansion-fixture-v2' });
		expect(a.checksum).toBe(b.checksum);
		expect(c.checksum).not.toBe(a.checksum);
	});

	it('rejects duplicate snapshots', () => {
		const s = snapshots();
		expect(() => buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: [...s, s[0]!], ...policy })).toThrow('DUPLICATE_CAPABILITY_SNAPSHOT');
	});

	it('rejects snapshots sealed against a different registry (CAPABILITY_REVISION_MISMATCH)', () => {
		const entries = HELPER_REGISTRY_V1.entries.map((h) => (h.helperId === 'rg-exact' ? { ...h, costClass: 'HIGH' as const } : h));
		const body = { schema: HELPER_REGISTRY_V1.schema, revision: 'helper-registry:alt-fixture', entries };
		const alt: HelperRegistryV1 = { ...body, checksum: sha256Stable(body) };
		expect(() => buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: snapshots(alt), ...policy })).toThrow('CAPABILITY_REVISION_MISMATCH');
	});

	it('rejects a tampered snapshot', () => {
		const s = snapshots();
		const bad = [{ ...s[0]!, available: !s[0]!.available }, ...s.slice(1)];
		expect(() => buildHelperEligibilityV1({ keywordRecognition: recognition(), capabilitySnapshots: bad, ...policy })).toThrow('CAPABILITY_CHECKSUM_MISMATCH');
	});
});
