import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';
import { HELPER_REGISTRY_V1 } from './helper-registry-v1.js';
import {
	assertKeywordRecognitionV1,
	buildKeywordRecognitionV1,
	normalizeKeywordTermV1,
	type KeywordVocabularyV1,
} from './keyword-recognition-v1.js';

const vocabulary: KeywordVocabularyV1 = {
	revision: 'kw-fixture-vocabulary-v1',
	entries: [
		{ term: 'cache', domainRefs: ['cache'], helperRefs: ['rg-exact', 'postgres-fts'] },
		{ term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['semantic-768', 'postgres-fts'] },
		{ term: 'café', domainRefs: ['unicode'], helperRefs: ['rg-exact'] },
	],
};

const classify = (query: string) => classifyAtlasQuery({ requestId: 'kw-fixture', query, producerRevision: 'kw-fixture-v1' });
const build = (query: string, vocab: KeywordVocabularyV1 = vocabulary) =>
	buildKeywordRecognitionV1({ classification: classify(query), taxonomyRevision: 'taxonomy-fixture-v1', vocabulary: vocab });

describe('KeywordRecognitionV1 (AFC-KW-01)', () => {
	it('matches whole tokens case-insensitively with exact offsets', () => {
		const r = build('Why is the Cache stale');
		expect(r.matchedTerms).toEqual([{ term: 'cache', startIndex: 11, endIndex: 16, domainRefs: ['cache'], helperRefs: ['postgres-fts', 'rg-exact'] }]);
		expect(r.normalizedQuery).toBe('why is the cache stale');
	});

	it('does no prefix, substring or identifier-splitting expansion', () => {
		for (const q of ['caching layers', 'recache everything', 'stale_cache entries', 'cacheKey lookup']) {
			expect(build(q).matchedTerms, q).toEqual([]);
		}
	});

	it('unions and sorts helper and domain refs across matched terms', () => {
		const r = build('qdrant cache');
		expect(r.helperRefs).toEqual(['postgres-fts', 'rg-exact', 'semantic-768']);
		expect(r.domainRefs).toEqual(['cache', 'retrieval']);
	});

	it('returns a valid empty recognition when nothing matches', () => {
		const r = build('nothing relevant here');
		expect(r.matchedTerms).toEqual([]);
		expect(r.helperRefs).toEqual([]);
		expect(assertKeywordRecognitionV1(r)).toEqual(r);
	});

	it('is deterministic and independent of vocabulary entry order', () => {
		const reversed: KeywordVocabularyV1 = { revision: vocabulary.revision, entries: [...vocabulary.entries].reverse() };
		expect(build('cache').checksum).toBe(build('cache').checksum);
		expect(build('cache', reversed).checksum).toBe(build('cache').checksum);
		expect(build('cache', { ...vocabulary, revision: 'kw-fixture-vocabulary-v2' }).checksum).not.toBe(build('cache').checksum);
	});

	it('binds the registry and classification checksums and records the normalization revision', () => {
		const c = classify('cache');
		const r = buildKeywordRecognitionV1({ classification: c, taxonomyRevision: 'taxonomy-fixture-v1', vocabulary });
		expect(r.helperRegistryChecksum).toBe(HELPER_REGISTRY_V1.checksum);
		expect(r.classificationChecksum).toBe(c.checksum);
		expect(r.classifierRevision).toBe('kw-fixture-v1');
		expect(r.normalizationRevision).toBe('exact-token:nfc-lowercase-v1');
	});

	it('treats NFC and NFD spellings of the same term as equal', () => {
		const nfd = 'café';
		expect(normalizeKeywordTermV1(nfd)).toBe('café');
		expect(build(`find ${nfd} usage`).matchedTerms.map((m) => m.term)).toEqual(['café']);
	});

	it('rejects duplicate vocabulary terms after normalization', () => {
		const dup: KeywordVocabularyV1 = { revision: 'dup', entries: [
			{ term: 'Cache', domainRefs: [], helperRefs: ['rg-exact'] },
			{ term: ' cache ', domainRefs: [], helperRefs: ['rg-exact'] },
		] };
		expect(() => build('cache', dup)).toThrow('DUPLICATE_VOCABULARY_TERM');
	});

	it('rejects vocabulary helpers that are not in the registry', () => {
		const bad: KeywordVocabularyV1 = { revision: 'bad', entries: [{ term: 'cache', domainRefs: [], helperRefs: ['no-such-helper'] }] };
		expect(() => build('cache', bad)).toThrow('UNKNOWN_VOCABULARY_HELPER:no-such-helper');
	});

	it('rejects a tampered classification and a tampered recognition', () => {
		const c = classify('cache');
		expect(() => buildKeywordRecognitionV1({ classification: { ...c, rawQuery: 'cache changed' }, taxonomyRevision: 't', vocabulary })).toThrow('QUERY_CLASSIFICATION_CHECKSUM_MISMATCH');
		const r = build('cache');
		expect(() => assertKeywordRecognitionV1({ ...r, helperRefs: [] })).toThrow('KEYWORD_RECOGNITION_CHECKSUM_MISMATCH');
	});
});
