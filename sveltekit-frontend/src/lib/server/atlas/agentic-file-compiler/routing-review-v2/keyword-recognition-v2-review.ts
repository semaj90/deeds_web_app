import { z } from 'zod';
import { CANONICAL_DOMAINS, DOMAIN_TAXONOMY_VERSION, type CanonicalDomain, type DomainClassification } from '../../domain-taxonomy.js';
import { sha256Stable } from '../contracts.js';
import type { QueryClassificationV1 } from '../query-classifier.js';
import { assertHelperRegistryReviewV2, type HelperRegistryReviewV2 } from './helper-registry-v2-review.js';

/** Exact-token review candidate; vocabulary and all revision domains are caller-owned inputs. */
export const KEYWORD_RECOGNITION_REVIEW_SCHEMA = 'atlas.keyword-recognition.review.v2' as const;
export const KEYWORD_NORMALIZATION_REVIEW_REVISION = 'nfc-lowercase-unicode-token-v2-review' as const;
const CanonicalDomainSchema = z.enum(CANONICAL_DOMAINS);

export const KeywordVocabularyEntryReviewV2Schema = z.object({
	term: z.string().min(1),
	domainRefs: z.array(CanonicalDomainSchema),
	helperRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type KeywordVocabularyEntryReviewV2 = z.infer<typeof KeywordVocabularyEntryReviewV2Schema>;

export const KeywordRecognitionReviewV2Schema = z.object({
	schema: z.literal(KEYWORD_RECOGNITION_REVIEW_SCHEMA),
	queryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	classificationChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	classifierRevision: z.string().min(1),
	domainTaxonomyRevision: z.string().min(1),
	classificationDomainRefs: z.array(CanonicalDomainSchema),
	vocabularyRevision: z.string().min(1),
	vocabularyChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	normalizationRevision: z.literal(KEYWORD_NORMALIZATION_REVIEW_REVISION),
	helperRegistryRevision: z.string().min(1),
	helperRegistryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	matches: z.array(z.object({
		term: z.string().min(1),
		matchedText: z.string().min(1),
		startIndex: z.number().int().nonnegative(),
		endIndex: z.number().int().positive(),
		domainHints: z.array(CanonicalDomainSchema),
		helperRefs: z.array(z.string().min(1)),
	}).strict()),
	unmatchedTokens: z.array(z.string().min(1)),
	writesPerformed: z.literal(false),
	canonicalAuthority: z.literal(false),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type KeywordRecognitionReviewV2 = z.infer<typeof KeywordRecognitionReviewV2Schema>;

export function normalizeKeywordTokenReviewV2(value: string): string {
	return value.normalize('NFC').trim().toLowerCase();
}

function tokenizeQuery(value: string): Array<{ text: string; startIndex: number; endIndex: number }> {
	const normalized = value.normalize('NFC');
	return [...normalized.matchAll(/[\p{L}\p{N}_]+/gu)].map((match) => {
		const startIndex = match.index ?? 0;
		return { text: match[0], startIndex, endIndex: startIndex + match[0].length };
	});
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

export function buildKeywordRecognitionReviewV2(input: {
	query: string;
	classification: QueryClassificationV1;
	domainClassification: DomainClassification;
	vocabularyRevision: string;
	vocabulary: readonly KeywordVocabularyEntryReviewV2[];
	registry: HelperRegistryReviewV2;
}): KeywordRecognitionReviewV2 {
	const registry = assertHelperRegistryReviewV2(input.registry);
	const { checksum: classificationChecksum, ...classificationBody } = input.classification;
	if (sha256Stable(classificationBody) !== classificationChecksum) throw new Error('QUERY_CLASSIFICATION_REVIEW_CHECKSUM_MISMATCH');
	if (input.classification.rawQuery !== input.query) throw new Error('QUERY_CLASSIFICATION_TEXT_MISMATCH');
	if (input.domainClassification.classifier_version !== DOMAIN_TAXONOMY_VERSION) throw new Error('DOMAIN_TAXONOMY_REVISION_MISMATCH');

	const validDomains = new Set<string>(CANONICAL_DOMAINS);
	const rawClassificationDomainRefs = [
		...(input.domainClassification.primary_domain ? [input.domainClassification.primary_domain] : []),
		...input.domainClassification.secondary_domains,
		...input.domainClassification.labels.map((label) => label.label),
	];
	for (const domain of rawClassificationDomainRefs) {
		if (!validDomains.has(domain)) throw new Error(`DOMAIN_TAXONOMY_EMITTED_NONCANONICAL_DOMAIN:${domain}`);
	}
	const classificationDomainRefs = sortedUnique(rawClassificationDomainRefs as CanonicalDomain[]);
	const validHelpers = new Set(registry.entries.map((entry) => entry.helperId));
	const vocabulary = input.vocabulary.map((entry) => {
		const parsed = KeywordVocabularyEntryReviewV2Schema.parse(entry);
		const term = normalizeKeywordTokenReviewV2(parsed.term);
		if (!term || /\s/u.test(term)) throw new Error(`KEYWORD_TERM_NOT_SINGLE_TOKEN:${parsed.term}`);
		for (const helperId of parsed.helperRefs) if (!validHelpers.has(helperId)) throw new Error(`UNKNOWN_KEYWORD_HELPER:${helperId}`);
		return { term, domainRefs: sortedUnique(parsed.domainRefs), helperRefs: sortedUnique(parsed.helperRefs) };
	}).sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
	if (new Set(vocabulary.map((entry) => entry.term)).size !== vocabulary.length) throw new Error('DUPLICATE_NORMALIZED_KEYWORD_TERM');
	const vocabularyBody = { vocabularyRevision: input.vocabularyRevision, normalizationRevision: KEYWORD_NORMALIZATION_REVIEW_REVISION, entries: vocabulary };
	const vocabularyChecksum = sha256Stable(vocabularyBody);
	const byTerm = new Map(vocabulary.map((entry) => [entry.term, entry]));
	const tokens = tokenizeQuery(input.query);
	const matches: KeywordRecognitionReviewV2['matches'] = [];
	const unmatchedTokens: string[] = [];
	for (const token of tokens) {
		const term = normalizeKeywordTokenReviewV2(token.text);
		const entry = byTerm.get(term);
		if (!entry) { unmatchedTokens.push(token.text); continue; }
		matches.push({ term, matchedText: token.text, startIndex: token.startIndex, endIndex: token.endIndex, domainHints: entry.domainRefs, helperRefs: entry.helperRefs });
	}
	const body = {
		schema: KEYWORD_RECOGNITION_REVIEW_SCHEMA,
		queryChecksum: sha256Stable({ query: input.query }),
		classificationChecksum: input.classification.checksum,
		classifierRevision: input.classification.producerRevision,
		domainTaxonomyRevision: input.domainClassification.classifier_version,
		classificationDomainRefs,
		vocabularyRevision: input.vocabularyRevision,
		vocabularyChecksum,
		normalizationRevision: KEYWORD_NORMALIZATION_REVIEW_REVISION,
		helperRegistryRevision: registry.helperRegistryRevision,
		helperRegistryChecksum: registry.checksum,
		matches,
		unmatchedTokens,
		writesPerformed: false as const,
		canonicalAuthority: false as const,
	};
	return KeywordRecognitionReviewV2Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertKeywordRecognitionReviewV2(value: KeywordRecognitionReviewV2): KeywordRecognitionReviewV2 {
	const recognition = KeywordRecognitionReviewV2Schema.parse(value);
	const { checksum, ...body } = recognition;
	if (sha256Stable(body) !== checksum) throw new Error('KEYWORD_RECOGNITION_REVIEW_CHECKSUM_MISMATCH');
	return recognition;
}
