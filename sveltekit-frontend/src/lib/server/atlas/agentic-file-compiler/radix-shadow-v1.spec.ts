import { describe, expect, it } from 'vitest';
import { runAfcRadixShadowV1 } from './radix-shadow-v1.js';
import { buildKeywordVocabularyV1 } from './vocabulary-v1.js';

const vocabulary = buildKeywordVocabularyV1({
	revision: 'radix-shadow-fixture-v1',
	entries: [
		{ term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['semantic-768', 'postgres-fts'] },
	],
	prefixRules: [{ prefix: 'qdr', allowedExpansions: ['qdrant'] }],
});

const input = {
	schema: 'atlas.afc-radix-shadow-input.v1' as const,
	taskId: 'AFC-RADIX-PROOF-01',
	runId: 'fixture-run-1',
	contractRevision: 'radix-shadow-contract-v1',
	cases: [{
		caseId: 'qdrant-prefix',
		query: 'inspect qdr in retrieval',
		prefixes: ['qdr'],
		baselineCandidates: [],
		baselineHelperRefs: ['rg-exact'],
		workspaceRevision: 'workspace-fixture-v1',
		taxonomyRevision: 'taxonomy-fixture-v1',
		ontologyRevision: 'ontology-fixture-v1',
	}],
};

describe('AFC radix shadow harness', () => {
	it('compares frozen baseline and radix proposals without promotion', () => {
		const receipt = runAfcRadixShadowV1(input, vocabulary, 'source-fixture-v1');
		expect(receipt.status).toBe('BLOCKED_VOCABULARY_NOT_OWNER_REVIEWED');
		expect(receipt.cases[0]?.tokensExtracted).toContain('qdr');
		expect(receipt.cases[0]?.matchedPrefixes).toEqual(['qdr']);
		expect(receipt.cases[0]?.triggeredHelpers).toEqual(['postgres-fts', 'semantic-768']);
		expect(receipt.cases[0]?.termDiff).toEqual({ added: ['qdrant'], removed: [] });
		expect(receipt.cases[0]?.helperDiff).toEqual({ added: ['postgres-fts', 'semantic-768'], removed: [], radixProposed: ['postgres-fts', 'semantic-768'] });
		expect(receipt.productionInputsChanged).toBe(false);
		expect(receipt.writesToDatastores).toBe(0);
		expect(receipt.promotionAuthorized).toBe(false);
	});

	it('is deterministic for identical frozen coordinates', () => {
		const first = runAfcRadixShadowV1(input, vocabulary, 'source-fixture-v1');
		const replay = runAfcRadixShadowV1(input, vocabulary, 'source-fixture-v1');
		expect(replay.checksum).toBe(first.checksum);
	});

	it('blocks malformed or duplicate frozen cases', () => {
		expect(() => runAfcRadixShadowV1({ ...input, schema: 'wrong' }, vocabulary, 'source-fixture-v1'))
			.toThrow('AFC_RADIX_SHADOW_INPUT_SCHEMA_MISMATCH');
		expect(() => runAfcRadixShadowV1({ ...input, cases: [input.cases[0], input.cases[0]] }, vocabulary, 'source-fixture-v1'))
			.toThrow('AFC_RADIX_SHADOW_DUPLICATE_CASE_ID');
	});
});
