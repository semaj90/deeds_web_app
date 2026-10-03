import { z } from 'zod';
import { sha256Stable } from './contracts.js';
import { assertHelperRegistryV1, HELPER_REGISTRY_V1, type HelperRegistryV1 } from './helper-registry-v1.js';
import {
	KEYWORD_NORMALIZATION_REVISION_V1,
	KeywordVocabularyEntryV1Schema,
	normalizeKeywordTermV1,
	type KeywordVocabularyEntryV1,
} from './keyword-recognition-v1.js';

export const KEYWORD_VOCABULARY_V1_SCHEMA = 'atlas.keyword-vocabulary.v1' as const;
export const KEYWORD_PREFIX_POLICY_V1 = 'CONTROLLED' as const;
const MAX_ALLOWED_PREFIX_EXPANSIONS = 8;

export const KeywordPrefixRuleV1Schema = z.object({
	prefix: z.string().min(2),
	allowedExpansions: z.array(z.string().min(1)).min(1).max(MAX_ALLOWED_PREFIX_EXPANSIONS),
}).strict();
export type KeywordPrefixRuleV1 = z.infer<typeof KeywordPrefixRuleV1Schema>;

export const KeywordVocabularyV1Schema = z.object({
	schema: z.literal(KEYWORD_VOCABULARY_V1_SCHEMA),
	revision: z.string().min(1),
	normalizationRevision: z.literal(KEYWORD_NORMALIZATION_REVISION_V1),
	prefixPolicy: z.literal(KEYWORD_PREFIX_POLICY_V1),
	entries: z.array(KeywordVocabularyEntryV1Schema).min(1),
	prefixRules: z.array(KeywordPrefixRuleV1Schema),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type KeywordVocabularySourceV1 = z.infer<typeof KeywordVocabularyV1Schema>;

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function sorted(values: readonly string[]): string[] { return [...new Set(values)].sort(compare); }
function isSingleToken(value: string): boolean { return /^[\p{L}\p{N}_]+$/u.test(value); }

export function buildKeywordVocabularyV1(input: {
	revision: string;
	entries: readonly KeywordVocabularyEntryV1[];
	prefixRules: readonly KeywordPrefixRuleV1[];
	registry?: HelperRegistryV1;
}): KeywordVocabularySourceV1 {
	const registry = input.registry ?? HELPER_REGISTRY_V1;
	assertHelperRegistryV1(registry);
	const helperIds = new Set(registry.entries.map((entry) => entry.helperId));
	const entries = input.entries.map((raw) => {
		const entry = KeywordVocabularyEntryV1Schema.parse(raw);
		const normalized = normalizeKeywordTermV1(entry.term);
		if (!isSingleToken(normalized)) throw new Error(`VOCABULARY_TERM_NOT_SINGLE_TOKEN:${entry.term}`);
		for (const helperId of entry.helperRefs) {
			if (!helperIds.has(helperId)) throw new Error(`UNKNOWN_VOCABULARY_HELPER:${helperId}`);
		}
		return { term: normalized, domainRefs: sorted(entry.domainRefs), helperRefs: sorted(entry.helperRefs) };
	}).sort((a, b) => compare(a.term, b.term));
	if (new Set(entries.map((entry) => entry.term)).size !== entries.length) throw new Error('DUPLICATE_VOCABULARY_TERM');
	const terms = new Set(entries.map((entry) => entry.term));
	const prefixRules = input.prefixRules.map((raw) => {
		const rule = KeywordPrefixRuleV1Schema.parse(raw);
		const prefix = normalizeKeywordTermV1(rule.prefix);
		if (!isSingleToken(prefix) || [...prefix].length < 2) throw new Error(`INVALID_PREFIX:${rule.prefix}`);
		const allowedExpansions = sorted(rule.allowedExpansions.map(normalizeKeywordTermV1));
		if (allowedExpansions.length !== rule.allowedExpansions.length) throw new Error(`DUPLICATE_PREFIX_EXPANSION:${prefix}`);
		for (const term of allowedExpansions) {
			if (!terms.has(term)) throw new Error(`UNKNOWN_PREFIX_EXPANSION:${prefix}:${term}`);
			if (!term.startsWith(prefix)) throw new Error(`PREFIX_EXPANSION_MISMATCH:${prefix}:${term}`);
		}
		return { prefix, allowedExpansions };
	}).sort((a, b) => compare(a.prefix, b.prefix));
	if (new Set(prefixRules.map((rule) => rule.prefix)).size !== prefixRules.length) throw new Error('DUPLICATE_PREFIX_RULE');
	const body = {
		schema: KEYWORD_VOCABULARY_V1_SCHEMA,
		revision: input.revision,
		normalizationRevision: KEYWORD_NORMALIZATION_REVISION_V1,
		prefixPolicy: KEYWORD_PREFIX_POLICY_V1,
		entries,
		prefixRules,
	};
	return KeywordVocabularyV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertKeywordVocabularyV1(value: KeywordVocabularySourceV1): KeywordVocabularySourceV1 {
	const vocabulary = KeywordVocabularyV1Schema.parse(value);
	const { checksum, ...body } = vocabulary;
	if (sha256Stable(body) !== checksum) throw new Error('KEYWORD_VOCABULARY_CHECKSUM_MISMATCH');
	return vocabulary;
}
