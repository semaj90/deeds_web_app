import crypto from 'node:crypto';
import { buildQueryExpansionBundleV1 } from './query-expansion-v1.js';
import { compileTaxonomyScopeV1 } from './taxonomy-scope-v1.js';
import { classifyAtlasQuery } from './query-classifier.js';
import { assertKeywordVocabularyV1, KeywordVocabularyV1Schema } from './vocabulary-v1.js';
import type { TaxonomySourceV1 } from './taxonomy-scope-v1.js';
import {
	assertKeywordRadixIndexV1,
	compileKeywordRadixIndexV1,
	keywordRadixLookupToExpansionTermsV1,
	lookupControlledPrefixV1,
} from './radix-index-v1.js';

export const AFC_RADIX_SHADOW_INPUT_SCHEMA = 'atlas.afc-radix-shadow-input.v1';
export const AFC_RADIX_SHADOW_RECEIPT_SCHEMA = 'atlas.afc-radix-shadow-receipt.v1';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
};

function requireString(value: unknown, code: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) throw new Error(code);
	return value;
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function setDifference(left: readonly string[], right: readonly string[]): string[] {
	const rightSet = new Set(right);
	return left.filter((value) => !rightSet.has(value));
}

export interface AfcRadixShadowInputV1 {
	schema: typeof AFC_RADIX_SHADOW_INPUT_SCHEMA;
	taskId: string;
	runId: string;
	contractRevision: string;
	cases: Array<{
		caseId: string;
		query: string;
		prefixes: string[];
		baselineCandidates: Parameters<typeof buildQueryExpansionBundleV1>[0]['candidates'];
		baselineHelperRefs: string[];
		workspaceRevision: string;
		taxonomyRevision: string;
		ontologyRevision: string;
	}>;
}

export function runAfcRadixShadowV1(input: AfcRadixShadowInputV1, vocabularyValue: unknown, sourceRevision: string) {
	if (!input || input.schema !== AFC_RADIX_SHADOW_INPUT_SCHEMA) throw new Error('AFC_RADIX_SHADOW_INPUT_SCHEMA_MISMATCH');
	const taskId = requireString(input.taskId, 'AFC_RADIX_SHADOW_TASK_ID_REQUIRED');
	const runId = requireString(input.runId, 'AFC_RADIX_SHADOW_RUN_ID_REQUIRED');
	const contractRevision = requireString(input.contractRevision, 'AFC_RADIX_SHADOW_CONTRACT_REVISION_REQUIRED');
	if (!Array.isArray(input.cases) || input.cases.length === 0) throw new Error('AFC_RADIX_SHADOW_CASES_REQUIRED');

	const vocabulary = assertKeywordVocabularyV1(KeywordVocabularyV1Schema.parse(vocabularyValue));
	const index = assertKeywordRadixIndexV1(compileKeywordRadixIndexV1(vocabulary));
	const caseIds = new Set<string>();
	const cases = input.cases.map((testCase) => {
		const caseId = requireString(testCase.caseId, 'AFC_RADIX_SHADOW_CASE_ID_REQUIRED');
		if (caseIds.has(caseId)) throw new Error('AFC_RADIX_SHADOW_DUPLICATE_CASE_ID');
		caseIds.add(caseId);
		if (!Array.isArray(testCase.prefixes) || !Array.isArray(testCase.baselineCandidates) || !Array.isArray(testCase.baselineHelperRefs)) {
			throw new Error('AFC_RADIX_SHADOW_CASE_FIELDS_REQUIRED');
		}

		const classification = classifyAtlasQuery({ requestId: `${runId}:${caseId}`, query: requireString(testCase.query, 'AFC_RADIX_SHADOW_QUERY_REQUIRED'), producerRevision: contractRevision });
		const scope = compileTaxonomyScopeV1({
			classification,
			workspaceRevision: requireString(testCase.workspaceRevision, 'AFC_RADIX_SHADOW_WORKSPACE_REVISION_REQUIRED'),
			taxonomyRevision: requireString(testCase.taxonomyRevision, 'AFC_RADIX_SHADOW_TAXONOMY_REVISION_REQUIRED'),
			ontologyRevision: requireString(testCase.ontologyRevision, 'AFC_RADIX_SHADOW_ONTOLOGY_REVISION_REQUIRED'),
			allowedSources: sortedUnique<TaxonomySourceV1>([
				...testCase.baselineCandidates.map((candidate) => candidate.source),
				'KEYWORD_RADIX',
			]),
		});
		const literalTerms = classification.exactTerms;
		const baseline = buildQueryExpansionBundleV1({ scope, literalTerms, candidates: testCase.baselineCandidates });
		const lookups = testCase.prefixes.map((prefix) => lookupControlledPrefixV1(index, vocabulary, prefix));
		const radixCandidates = lookups.flatMap(keywordRadixLookupToExpansionTermsV1);
		const shadow = buildQueryExpansionBundleV1({ scope, literalTerms, candidates: [...testCase.baselineCandidates, ...radixCandidates] });
		const baselineTerms = sortedUnique(baseline.expansions.map((entry) => entry.normalized));
		const shadowTerms = sortedUnique(shadow.expansions.map((entry) => entry.normalized));
		const baselineHelpers = sortedUnique(testCase.baselineHelperRefs);
		const radixHelpers = sortedUnique(lookups.flatMap((lookup) => lookup.expansions.flatMap((entry) => entry.helperRefs)));
		const shadowHelpers = sortedUnique([...baselineHelpers, ...radixHelpers]);

		return {
			caseId,
			tokensExtracted: classification.exactTerms,
			inputChecksum: sha256(stable({
				query: testCase.query,
				prefixes: testCase.prefixes,
				baselineCandidates: testCase.baselineCandidates,
				baselineHelperRefs: baselineHelpers,
				workspaceRevision: scope.workspaceRevision,
				taxonomyRevision: scope.taxonomyRevision,
				ontologyRevision: scope.ontologyRevision,
			})),
			baselineExpansionChecksum: baseline.checksum,
			shadowExpansionChecksum: shadow.checksum,
			radixLookupChecksums: lookups.map((lookup) => lookup.checksum),
			prefixStatuses: lookups.map(({ normalizedPrefix, status }) => ({ normalizedPrefix, status })),
			matchedPrefixes: lookups.filter((lookup) => lookup.status === 'MATCH').map((lookup) => lookup.normalizedPrefix),
			triggeredHelpers: radixHelpers,
			termDiff: { added: setDifference(shadowTerms, baselineTerms), removed: setDifference(baselineTerms, shadowTerms) },
			helperDiff: {
				added: setDifference(shadowHelpers, baselineHelpers),
				removed: setDifference(baselineHelpers, shadowHelpers),
				radixProposed: radixHelpers,
			},
		};
	});

	const body = {
		schema: AFC_RADIX_SHADOW_RECEIPT_SCHEMA,
		status: 'BLOCKED_VOCABULARY_NOT_OWNER_REVIEWED',
		taskId,
		runId,
		sourceRevision: requireString(sourceRevision, 'AFC_RADIX_SHADOW_SOURCE_REVISION_REQUIRED'),
		contractRevision,
		vocabulary: {
			revision: vocabulary.revision,
			checksum: vocabulary.checksum,
			reviewStatus: 'DRAFT_UNREVIEWED_FIXTURE_DERIVED',
			entryCount: vocabulary.entries.length,
			prefixRuleCount: vocabulary.prefixRules.length,
		},
		indexChecksum: index.checksum,
		caseCount: cases.length,
		cases,
		writesToDatastores: 0,
		productionInputsChanged: false,
		promotionAuthorized: false,
	};
	return { ...body, checksum: sha256(stable(body)) };
}
