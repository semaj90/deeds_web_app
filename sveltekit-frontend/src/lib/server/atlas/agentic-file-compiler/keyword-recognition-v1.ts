import { z } from 'zod';
import { sha256Stable } from './contracts.js';
import { assertHelperRegistryV1, HELPER_REGISTRY_V1, type HelperRegistryV1 } from './helper-registry-v1.js';
import type { QueryClassificationV1 } from './query-classifier.js';

export const KEYWORD_RECOGNITION_SCHEMA_V1 = 'atlas.keyword-recognition.v1' as const;
export const KEYWORD_NORMALIZATION_REVISION_V1 = 'exact-token:nfc-lowercase-v1' as const;
export const KeywordVocabularyEntryV1Schema = z.object({
	term: z.string().min(1),
	domainRefs: z.array(z.string().min(1)),
	helperRefs: z.array(z.string().min(1)),
}).strict();
export type KeywordVocabularyEntryV1 = z.infer<typeof KeywordVocabularyEntryV1Schema>;

export const KeywordRecognitionV1Schema = z.object({
	schema: z.literal(KEYWORD_RECOGNITION_SCHEMA_V1),
	rawQuery: z.string().min(1),
	normalizedQuery: z.string().min(1),
	classifierRevision: z.string().min(1),
	classificationChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	taxonomyRevision: z.string().min(1),
	vocabularyRevision: z.string().min(1),
	normalizationRevision: z.literal(KEYWORD_NORMALIZATION_REVISION_V1),
	vocabularyChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	helperRegistryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	matchedTerms: z.array(z.object({
		term: z.string().min(1),
		startIndex: z.number().int().nonnegative(),
		endIndex: z.number().int().positive(),
		domainRefs: z.array(z.string()),
		helperRefs: z.array(z.string()),
	}).strict()),
	domainRefs: z.array(z.string()),
	helperRefs: z.array(z.string()),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type KeywordRecognitionV1 = z.infer<typeof KeywordRecognitionV1Schema>;

export interface KeywordVocabularyV1 {
	revision: string;
	entries: KeywordVocabularyEntryV1[];
}

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function sorted(values: readonly string[]): string[] { return [...new Set(values)].sort(compare); }
export function normalizeKeywordTermV1(value: string): string { return value.normalize('NFC').trim().toLowerCase(); }
function queryTokens(query: string): Array<{ token: string; startIndex: number; endIndex: number }> {
	const normalized = query.normalize('NFC');
	const out: Array<{ token: string; startIndex: number; endIndex: number }> = [];
	for (const match of normalized.matchAll(/[\p{L}\p{N}_]+/gu)) {
		const startIndex = match.index ?? 0;
		out.push({ token: match[0].toLowerCase(), startIndex, endIndex: startIndex + match[0].length });
	}
	return out;
}

export function buildKeywordRecognitionV1(input: {
	classification: QueryClassificationV1;
	taxonomyRevision: string;
	vocabulary: KeywordVocabularyV1;
	registry?: HelperRegistryV1;
}): KeywordRecognitionV1 {
	const registry = input.registry ?? HELPER_REGISTRY_V1;
	assertHelperRegistryV1(registry);
	const { checksum: classificationChecksum, ...classificationBody } = input.classification;
	if (sha256Stable(classificationBody) !== classificationChecksum) throw new Error('QUERY_CLASSIFICATION_CHECKSUM_MISMATCH');
	const registryIds = new Set(registry.entries.map((entry) => entry.helperId));
	const vocabulary = input.vocabulary.entries.map((entry) => KeywordVocabularyEntryV1Schema.parse(entry))
		.map((entry) => ({ term: normalizeKeywordTermV1(entry.term), domainRefs: sorted(entry.domainRefs), helperRefs: sorted(entry.helperRefs) }))
		.sort((a, b) => compare(a.term, b.term));
	if (new Set(vocabulary.map((entry) => entry.term)).size !== vocabulary.length) throw new Error('DUPLICATE_VOCABULARY_TERM');
	for (const entry of vocabulary) for (const helperRef of entry.helperRefs) if (!registryIds.has(helperRef)) throw new Error(`UNKNOWN_VOCABULARY_HELPER:${helperRef}`);

	const vocabularyBody = { revision: input.vocabulary.revision, entries: vocabulary };
	const vocabularyChecksum = sha256Stable(vocabularyBody);
	const normalizedQuery = input.classification.rawQuery.normalize('NFC').trim().toLowerCase();
	const byToken = new Map(vocabulary.map((entry) => [entry.term, entry]));
	const matchedTerms = queryTokens(input.classification.rawQuery).flatMap((token) => {
		const entry = byToken.get(token.token);
		return entry ? [{
			term: entry.term,
			startIndex: token.startIndex,
			endIndex: token.endIndex,
			domainRefs: entry.domainRefs,
			helperRefs: entry.helperRefs,
		}] : [];
	});
	const body = {
		schema: KEYWORD_RECOGNITION_SCHEMA_V1,
		rawQuery: input.classification.rawQuery,
		normalizedQuery,
		classifierRevision: input.classification.producerRevision,
		classificationChecksum: input.classification.checksum,
		taxonomyRevision: input.taxonomyRevision,
		vocabularyRevision: input.vocabulary.revision,
		normalizationRevision: KEYWORD_NORMALIZATION_REVISION_V1,
		vocabularyChecksum,
		helperRegistryChecksum: registry.checksum,
		matchedTerms,
		domainRefs: sorted(matchedTerms.flatMap((match) => match.domainRefs)),
		helperRefs: sorted(matchedTerms.flatMap((match) => match.helperRefs)),
	};
	return KeywordRecognitionV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertKeywordRecognitionV1(value: KeywordRecognitionV1): KeywordRecognitionV1 {
	const recognition = KeywordRecognitionV1Schema.parse(value);
	const { checksum, ...body } = recognition;
	if (sha256Stable(body) !== checksum) throw new Error('KEYWORD_RECOGNITION_CHECKSUM_MISMATCH');
	return recognition;
}
