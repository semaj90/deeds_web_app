import { describe, expect, it } from 'vitest';
import * as afc from './index.js';

/**
 * AFC-ROUTING-PROMOTE-01 (option A): the owner-verified v1 helper-routing contracts are part of the stable
 * AFC index. The isolated routing-review-v2 candidate must NOT leak into it.
 */
describe('agentic-file-compiler index: promoted helper-routing contracts', () => {
	it('exports the verified v1 registry, snapshot, keyword and eligibility contracts', () => {
		for (const name of [
			'HELPER_REGISTRY_V1', 'assertHelperRegistryV1', 'HelperRegistryV1Schema',
			'buildHelperCapabilitySnapshotV1', 'assertHelperCapabilitySnapshotV1',
			'buildKeywordRecognitionV1', 'assertKeywordRecognitionV1', 'normalizeKeywordTermV1',
			'buildHelperEligibilityV1', 'HelperEligibilityV1Schema',
		] as const) {
			expect(afc[name], name).toBeDefined();
		}
	});

	it('keeps the promoted contracts working end to end through the index', () => {
		const classification = afc.classifyAtlasQuery({ requestId: 'index-fixture', query: 'cache', producerRevision: 'index-fixture-v1' });
		const recognition = afc.buildKeywordRecognitionV1({
			classification, taxonomyRevision: 'taxonomy-fixture-v1',
			vocabulary: { revision: 'index-vocab-v1', entries: [{ term: 'cache', domainRefs: ['cache'], helperRefs: ['rg-exact'] }] },
		});
		const snapshots = afc.HELPER_REGISTRY_V1.entries.map((h) => afc.buildHelperCapabilitySnapshotV1({
			helperId: h.helperId, available: true, observedAt: '2026-11-02T18:00:00.000Z', evidenceRefs: [`fixture:${h.helperId}`],
		}));
		const e = afc.buildHelperEligibilityV1({ keywordRecognition: recognition, capabilitySnapshots: snapshots, expansionPolicyRevision: 'e1', retrievalPolicyRevision: 'r1' });
		expect(e.decisions.find((d) => d.helperId === 'rg-exact')?.status).toBe('ELIGIBLE');
		expect(e.canonicalAuthority).toBe(false);
	});

	it('does not export the review-v2 candidate or the v2 comparison copies', () => {
		const keys = Object.keys(afc);
		expect(keys.filter((k) => /Review|V2$|_V2$/.test(k) && /Helper|Keyword|REGISTRY|ELIGIBILITY/i.test(k))).toEqual([]);
	});
});
