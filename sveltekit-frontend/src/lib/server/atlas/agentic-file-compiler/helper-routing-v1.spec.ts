import { describe, expect, it } from 'vitest';
import { sha256Stable } from './contracts.js';
import { classifyAtlasQuery } from './query-classifier.js';
import { HELPER_REGISTRY_V1 } from './helper-registry-v1.js';
import { buildHelperCapabilitySnapshotV1, type HelperCapabilitySnapshotV1 } from './helper-capability-snapshot-v1.js';
import { buildKeywordRecognitionV1, type KeywordVocabularyV1 } from './keyword-recognition-v1.js';
import { buildHelperEligibilityV1 } from './helper-eligibility-v1.js';

const vocabulary: KeywordVocabularyV1 = {
	revision: 'fixture-vocabulary-v1',
	entries: [
		{ term: 'called', domainRefs: ['source-code'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-references'] },
		{ term: 'references', domainRefs: ['source-code'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-references'] },
		{ term: 'update', domainRefs: ['source-code'], helperRefs: ['rg-exact', 'ast-grep-structural', 'ts-morph-symbol', 'lsp-definition'] },
		{ term: 'cagra', domainRefs: ['retrieval'], helperRefs: ['docs-corpus-search', 'postgres-fts', 'semantic-768'] },
		{ term: 'indexing', domainRefs: ['retrieval'], helperRefs: ['docs-corpus-search', 'postgres-fts', 'semantic-768'] },
		{ term: 'parameters', domainRefs: ['retrieval'], helperRefs: ['docs-corpus-search', 'postgres-fts'] },
		{ term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['postgres-fts', 'semantic-768'] },
		{ term: 'cache', domainRefs: ['cache'], helperRefs: ['rg-exact', 'postgres-fts', 'postgres-trigram'] },
		{ term: 'stale', domainRefs: ['cache'], helperRefs: ['rg-exact', 'postgres-fts', 'postgres-trigram'] },
		{ term: 'graphify', domainRefs: ['graph'], helperRefs: ['rg-exact', 'postgres-fts', 'semantic-768', 'graph-ppr'] },
		{ term: 'ros2', domainRefs: ['robotics'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-references', 'docs-corpus-search'] },
		{ term: 'callback', domainRefs: ['source-code'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-definition', 'lsp-references'] },
		{ term: 'docs', domainRefs: ['documentation'], helperRefs: ['docs-corpus-search', 'postgres-fts'] },
		{ term: 'semanticrevision', domainRefs: ['retrieval'], helperRefs: ['rg-exact', 'postgres-fts', 'semantic-768'] },
		{ term: 'postgres', domainRefs: ['database'], helperRefs: ['rg-exact', 'postgres-fts', 'postgres-trigram', 'docs-corpus-search'] },
		{ term: 'hnsw', domainRefs: ['retrieval'], helperRefs: ['postgres-fts', 'docs-corpus-search', 'semantic-768'] },
		{ term: 'definition', domainRefs: ['source-code'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-definition', 'docs-corpus-search'] },
	],
};

function snapshots(overrides: Record<string, boolean> = {}): HelperCapabilitySnapshotV1[] {
	return HELPER_REGISTRY_V1.entries.map((helper) => buildHelperCapabilitySnapshotV1({
		helperId: helper.helperId,
		available: overrides[helper.helperId] ?? !['lsp-references', 'graph-ppr'].includes(helper.helperId),
		executorRevision: `fixture:${helper.executionSurface.toLowerCase()}`,
		observedAt: '2026-09-27T12:00:00.000Z',
		evidenceRefs: [`fixture:capability:${helper.helperId}`],
	}));
}

function route(query: string, caps = snapshots()) {
	const classification = classifyAtlasQuery({ requestId: 'fixture-routing', query, producerRevision: 'query-classifier-fixture-v1' });
	const recognition = buildKeywordRecognitionV1({ classification, taxonomyRevision: 'taxonomy-fixture-v1', vocabulary });
	const eligibility = buildHelperEligibilityV1({ keywordRecognition: recognition, capabilitySnapshots: caps, retrievalPolicyRevision: 'retrieval-policy-fixture-v1' });
	return { classification, recognition, eligibility };
}

function status(result: ReturnType<typeof route>, helperId: string) {
	return result.eligibility.decisions.find((decision) => decision.helperId === helperId)?.status;
}

describe('bounded helper routing contracts', () => {
	it('registers only the twelve audited helper owners as read-only capabilities', () => {
		expect(HELPER_REGISTRY_V1.entries.map((entry) => entry.helperId)).toEqual([
			'ast-grep-structural', 'docs-corpus-search', 'graph-ppr', 'langextract-grounding', 'lsp-definition', 'lsp-references',
			'postgres-fts', 'postgres-trigram', 'rg-exact', 'semantic-768', 'tree-sitter-chunk', 'ts-morph-symbol',
		]);
		expect(HELPER_REGISTRY_V1.entries.every((entry) => entry.mutationClass === 'READ_ONLY' && entry.ownerRef.length > 0)).toBe(true);
	});

	it.each([
		['where is FooRepository.update called?', ['rg-exact', 'ast-grep-structural', 'lsp-references']],
		['explain CAGRA indexing parameters', ['docs-corpus-search', 'postgres-fts', 'semantic-768']],
		['why is qdrant cache stale after graphify?', ['postgres-fts', 'postgres-trigram', 'semantic-768', 'graph-ppr']],
		['what does this ROS2 callback reference?', ['rg-exact', 'ast-grep-structural', 'lsp-references']],
		['show docs for semanticRevision', ['docs-corpus-search', 'postgres-fts', 'semantic-768']],
		['find the Postgres HNSW definition', ['docs-corpus-search', 'postgres-fts', 'semantic-768']],
	] as const)('recognizes exact terms and returns deterministic tri-state eligibility for %s', (query, expectedHelpers) => {
		const a = route(query);
		const b = route(query);
		expect(a.recognition.checksum).toBe(b.recognition.checksum);
		expect(a.eligibility.checksum).toBe(b.eligibility.checksum);
		expect(a.recognition.helperRefs).toEqual(expect.arrayContaining(expectedHelpers));
		expect(a.eligibility.decisions.filter((entry) => entry.status === 'ELIGIBLE').map((entry) => entry.helperId)).toEqual(expect.arrayContaining(expectedHelpers.filter((id) => id !== 'lsp-references' && id !== 'graph-ppr')));
		if (query === 'explain CAGRA indexing parameters') {
			for (const id of ['lsp-references', 'ast-grep-structural', 'langextract-grounding']) {
				expect(status(a, id)).toBe('INELIGIBLE');
			}
		}
		expect(a.eligibility.executionAuthorized).toBe(false);
		expect(a.eligibility.writesPerformed).toBe(false);
	});

	it('changes eligibility, not keyword recognition, when LSP capability changes', () => {
		const available = route('where is FooRepository.update called?', snapshots({ 'lsp-references': true }));
		const unavailable = route('where is FooRepository.update called?', snapshots({ 'lsp-references': false }));
		expect(available.recognition.checksum).toBe(unavailable.recognition.checksum);
		expect(available.eligibility.checksum).not.toBe(unavailable.eligibility.checksum);
		expect(status(available, 'lsp-references')).toBe('ELIGIBLE');
		expect(unavailable.eligibility.decisions.find((entry) => entry.helperId === 'lsp-references')?.blockingReasons).toContain('CAPABILITY_UNAVAILABLE');
		expect(status(unavailable, 'ast-grep-structural')).toBe('ELIGIBLE');
	});

	it('does not perform substring, prefix, or semantic matching', () => {
		const result = route('qdrants cacheful graphifying');
		expect(result.recognition.matchedTerms).toHaveLength(0);
		expect(status(result, 'semantic-768')).toBe('INELIGIBLE');
	});

	it('fails closed on stale or duplicate capability observations', () => {
		const recognition = route('qdrant').recognition;
		const current = snapshots();
		expect(() => buildHelperEligibilityV1({ keywordRecognition: recognition, capabilitySnapshots: [current[0]!, current[0]!], retrievalPolicyRevision: 'p1' })).toThrow('DUPLICATE_CAPABILITY_SNAPSHOT');
		const semanticSnapshot = current.find((snapshot) => snapshot.helperId === 'semantic-768')!;
		const { checksum: _oldChecksum, ...semanticSnapshotBody } = semanticSnapshot;
		const staleBody = { ...semanticSnapshotBody, helperRevision: '0'.repeat(64) };
		const staleSnapshot = { ...staleBody, checksum: sha256Stable(staleBody) };
		expect(() => buildHelperEligibilityV1({ keywordRecognition: recognition, capabilitySnapshots: current.map((snapshot) => snapshot.helperId === 'semantic-768' ? staleSnapshot : snapshot), retrievalPolicyRevision: 'p1' })).toThrow('CAPABILITY_REVISION_MISMATCH:semantic-768');
		expect(() => buildHelperEligibilityV1({ keywordRecognition: recognition, capabilitySnapshots: current.map((snapshot) => snapshot.helperId === 'semantic-768' ? { ...snapshot, available: !snapshot.available } : snapshot), retrievalPolicyRevision: 'p1' })).toThrow('CAPABILITY_CHECKSUM_MISMATCH:semantic-768');
		expect(() => buildHelperEligibilityV1({ keywordRecognition: { ...recognition, helperRefs: [] }, capabilitySnapshots: current, retrievalPolicyRevision: 'p1' })).toThrow('KEYWORD_RECOGNITION_CHECKSUM_MISMATCH');
	});
});
