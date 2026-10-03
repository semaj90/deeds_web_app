import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';
import { buildQueryExpansionBundleV1 } from './query-expansion-v1.js';
import { compileTaxonomyScopeV1 } from './taxonomy-scope-v1.js';
import { buildKeywordVocabularyV1 } from './vocabulary-v1.js';
import { compileKeywordRadixIndexV1, keywordRadixLookupToExpansionTermsV1, lookupControlledPrefixV1 } from './radix-index-v1.js';

const vocabularyInput = {
	revision: 'query-radix-fixture-v1',
	entries: [
		{ term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['semantic-768', 'postgres-fts'] },
		{ term: 'cagra', domainRefs: ['retrieval', 'ml'], helperRefs: ['semantic-768', 'docs-corpus-search'] },
		{ term: 'postgres', domainRefs: ['database'], helperRefs: ['postgres-fts', 'postgres-trigram'] },
		{ term: 'hnsw', domainRefs: ['retrieval', 'database'], helperRefs: ['postgres-fts', 'docs-corpus-search'] },
		{ term: 'Cafe\u0301', domainRefs: ['documentation'], helperRefs: ['docs-corpus-search'] },
	],
	prefixRules: [
		{ prefix: 'qdr', allowedExpansions: ['qdrant'] },
		{ prefix: 'cagr', allowedExpansions: ['cagra'] },
		{ prefix: 'postgr', allowedExpansions: ['postgres'] },
		{ prefix: 'hns', allowedExpansions: ['hnsw'] },
		{ prefix: 'cafe\u0301', allowedExpansions: ['Cafe\u0301'] },
	],
};

function built() {
	const vocabulary = buildKeywordVocabularyV1(vocabularyInput);
	return { vocabulary, index: compileKeywordRadixIndexV1(vocabulary) };
}

describe('controlled query radix index', () => {
	it('compiles a deterministic compressed prefix index and resolves only approved expansions', () => {
		const a = built();
		const b = built();
		expect(a.index.checksum).toBe(b.index.checksum);
		expect(a.index.nodes.some((node) => node.edge.length > 1)).toBe(true);
		const hit = lookupControlledPrefixV1(a.index, a.vocabulary, 'QDR');
		expect(hit.status).toBe('MATCH');
		expect(hit.expansions).toEqual([{ term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['postgres-fts', 'semantic-768'] }]);
		expect(hit.canonicalAuthority).toBe(false);
		expect(hit.writesPerformed).toBe(false);
	});

	it('does not invent prefix expansions or search descendants implicitly', () => {
		const { vocabulary, index } = built();
		expect(lookupControlledPrefixV1(index, vocabulary, 'q').status).toBe('TOO_SHORT');
		expect(lookupControlledPrefixV1(index, vocabulary, 'qdrx').status).toBe('MISS');
		expect(lookupControlledPrefixV1(index, vocabulary, 'qdrant').status).toBe('MISS');
	});

	it('normalizes Unicode to NFC and case-folds only under the recorded revision', () => {
		const { vocabulary, index } = built();
		const hit = lookupControlledPrefixV1(index, vocabulary, 'CAFE\u0301');
		expect(hit.status).toBe('MATCH');
		expect(hit.normalizedPrefix).toBe('café');
		expect(hit.expansions[0]?.term).toBe('café');
		expect(vocabulary.normalizationRevision).toBe('exact-token:nfc-lowercase-v1');
	});

	it('feeds a checksum-bound KEYWORD_RADIX term into the existing expansion bundle when explicitly allowed', () => {
		const { vocabulary, index } = built();
		const lookup = lookupControlledPrefixV1(index, vocabulary, 'qdr');
		const classification = classifyAtlasQuery({ requestId: 'radix-expansion-fixture', query: 'qdr', producerRevision: 'classifier-fixture-v1' });
		const scope = compileTaxonomyScopeV1({
			classification,
			workspaceRevision: 'workspace-fixture-v1',
			taxonomyRevision: 'taxonomy-fixture-v1',
			ontologyRevision: 'ontology-fixture-v1',
			allowedSources: ['KEYWORD_RADIX'],
		});
		const bundle = buildQueryExpansionBundleV1({
			scope,
			literalTerms: ['qdr'],
			candidates: keywordRadixLookupToExpansionTermsV1(lookup),
		});
		expect(bundle.expansions).toHaveLength(1);
		expect(bundle.expansions[0]).toMatchObject({ term: 'qdrant', source: 'KEYWORD_RADIX', sourceRevision: vocabulary.revision });
		expect(bundle.expansions[0]?.evidenceRef).toBe(`keyword-radix-lookup:${lookup.checksum}`);
	});

	it('is order-independent and binds the vocabulary revision/checksum', () => {
		const first = built();
		const shuffled = buildKeywordVocabularyV1({
			...vocabularyInput,
			entries: [...vocabularyInput.entries].reverse(),
			prefixRules: [...vocabularyInput.prefixRules].reverse(),
		});
		expect(compileKeywordRadixIndexV1(shuffled).checksum).toBe(first.index.checksum);
		const changed = buildKeywordVocabularyV1({
			...vocabularyInput,
			revision: 'query-radix-fixture-v2',
		});
		expect(() => lookupControlledPrefixV1(first.index, changed, 'qdr')).toThrow('KEYWORD_RADIX_VOCABULARY_MISMATCH');
	});

	it('rejects unregistered, unrelated, duplicate, or unbounded expansions', () => {
		expect(() => buildKeywordVocabularyV1({ ...vocabularyInput, prefixRules: [{ prefix: 'qdr', allowedExpansions: ['cagra'] }] })).toThrow('PREFIX_EXPANSION_MISMATCH');
		expect(() => buildKeywordVocabularyV1({ ...vocabularyInput, prefixRules: [{ prefix: 'qdr', allowedExpansions: ['missing'] }] })).toThrow('UNKNOWN_PREFIX_EXPANSION');
		expect(() => buildKeywordVocabularyV1({ ...vocabularyInput, prefixRules: [{ prefix: 'qdr', allowedExpansions: Array(9).fill('qdrant') }] })).toThrow();
		expect(() => buildKeywordVocabularyV1({ ...vocabularyInput, prefixRules: [...vocabularyInput.prefixRules, { prefix: 'qdr', allowedExpansions: ['qdrant'] }] })).toThrow('DUPLICATE_PREFIX_RULE');
	});

	it('fails closed when the compiled index checksum is altered', () => {
		const { vocabulary, index } = built();
		expect(() => lookupControlledPrefixV1({ ...index, vocabularyRevision: 'forged' }, vocabulary, 'qdr')).toThrow('KEYWORD_RADIX_INDEX_CHECKSUM_MISMATCH');
	});
});
