import { z } from 'zod';
import { sha256Stable } from '../contracts.js';
import { assertHelperRegistryReviewV2, ReviewCostClassSchema, ReviewLogicalLaneSchema, type HelperRegistryReviewV2 } from './helper-registry-v2-review.js';
import { assertHelperCapabilitySnapshotReviewV2, type HelperCapabilitySnapshotReviewV2 } from './helper-capability-snapshot-v2-review.js';
import { assertKeywordRecognitionReviewV2, type KeywordRecognitionReviewV2 } from './keyword-recognition-v2-review.js';

export const HELPER_ELIGIBILITY_REVIEW_SCHEMA = 'atlas.helper-eligibility.review.v2' as const;
export const HelperEligibilityStateReviewV2Schema = z.enum(['ELIGIBLE', 'INELIGIBLE', 'BLOCKED']);
export const HelperEligibilityReasonReviewV2Schema = z.enum([
	'EXACT_KEYWORD_MATCH', 'NO_EXACT_KEYWORD_MATCH', 'CAPABILITY_AVAILABLE',
	'CAPABILITY_UNAVAILABLE', 'CAPABILITY_SNAPSHOT_MISSING',
]);

export const HelperEligibilityEntryReviewV2Schema = z.object({
	helperId: z.string().min(1),
	logicalLane: ReviewLogicalLaneSchema,
	state: HelperEligibilityStateReviewV2Schema,
	positiveReasons: z.array(HelperEligibilityReasonReviewV2Schema),
	blockingReasons: z.array(HelperEligibilityReasonReviewV2Schema),
	matchedEvidenceRefs: z.array(z.string().min(1)),
	costClass: ReviewCostClassSchema,
}).strict();
export type HelperEligibilityEntryReviewV2 = z.infer<typeof HelperEligibilityEntryReviewV2Schema>;

export const HelperEligibilityReviewV2Schema = z.object({
	schema: z.literal(HELPER_ELIGIBILITY_REVIEW_SCHEMA),
	queryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	classifierRevision: z.string().min(1),
	domainTaxonomyRevision: z.string().min(1),
	vocabularyRevision: z.string().min(1),
	normalizationRevision: z.string().min(1),
	helperRegistryRevision: z.string().min(1),
	helperRegistryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	capabilitySnapshotRevision: z.string().min(1),
	capabilitySnapshotChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	keywordRecognitionChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	retrievalPolicyRevision: z.string().min(1),
	entries: z.array(HelperEligibilityEntryReviewV2Schema),
	executionAuthorized: z.literal(false),
	executionPerformed: z.literal(false),
	writesPerformed: z.literal(false),
	canonicalAuthority: z.literal(false),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type HelperEligibilityReviewV2 = z.infer<typeof HelperEligibilityReviewV2Schema>;

export function buildHelperEligibilityReviewV2(input: {
	registry: HelperRegistryReviewV2;
	capabilitySnapshot: HelperCapabilitySnapshotReviewV2;
	keywordRecognition: KeywordRecognitionReviewV2;
	retrievalPolicyRevision: string;
}): HelperEligibilityReviewV2 {
	const registry = assertHelperRegistryReviewV2(input.registry);
	const snapshot = assertHelperCapabilitySnapshotReviewV2(input.capabilitySnapshot);
	const recognition = assertKeywordRecognitionReviewV2(input.keywordRecognition);
	if (snapshot.helperRegistryRevision !== registry.helperRegistryRevision || snapshot.helperRegistryChecksum !== registry.checksum) throw new Error('CAPABILITY_REGISTRY_IDENTITY_MISMATCH');
	if (recognition.helperRegistryRevision !== registry.helperRegistryRevision || recognition.helperRegistryChecksum !== registry.checksum) throw new Error('KEYWORD_REGISTRY_IDENTITY_MISMATCH');
	const observations = new Map(snapshot.observations.map((observation) => [observation.helperId, observation]));
	const matchedHelpers = new Set(recognition.matches.flatMap((match) => match.helperRefs));
	const entries = registry.entries.map((helper) => {
		const observation = observations.get(helper.helperId);
		const matchedEvidenceRefs = recognition.matches
			.filter((match) => match.helperRefs.includes(helper.helperId))
			.map((match) => `keyword:${recognition.checksum}:${match.term}`)
			.sort();
		if (!matchedHelpers.has(helper.helperId)) return {
			helperId: helper.helperId, logicalLane: helper.logicalLane, state: 'INELIGIBLE' as const,
			positiveReasons: [], blockingReasons: ['NO_EXACT_KEYWORD_MATCH'] as const,
			matchedEvidenceRefs: [], costClass: helper.costClass,
		};
		if (!observation) return {
			helperId: helper.helperId, logicalLane: helper.logicalLane, state: 'BLOCKED' as const,
			positiveReasons: ['EXACT_KEYWORD_MATCH'] as const, blockingReasons: ['CAPABILITY_SNAPSHOT_MISSING'] as const,
			matchedEvidenceRefs, costClass: helper.costClass,
		};
		if (!observation.available) return {
			helperId: helper.helperId, logicalLane: helper.logicalLane, state: 'BLOCKED' as const,
			positiveReasons: ['EXACT_KEYWORD_MATCH'] as const, blockingReasons: ['CAPABILITY_UNAVAILABLE'] as const,
			matchedEvidenceRefs: [...matchedEvidenceRefs, ...observation.evidenceRefs].sort(), costClass: helper.costClass,
		};
		return {
			helperId: helper.helperId, logicalLane: helper.logicalLane, state: 'ELIGIBLE' as const,
			positiveReasons: ['EXACT_KEYWORD_MATCH', 'CAPABILITY_AVAILABLE'] as const, blockingReasons: [],
			matchedEvidenceRefs: [...matchedEvidenceRefs, ...observation.evidenceRefs].sort(), costClass: helper.costClass,
		};
	}).sort((a, b) => a.helperId < b.helperId ? -1 : a.helperId > b.helperId ? 1 : 0);
	const body = {
		schema: HELPER_ELIGIBILITY_REVIEW_SCHEMA,
		queryChecksum: recognition.queryChecksum,
		classifierRevision: recognition.classifierRevision,
		domainTaxonomyRevision: recognition.domainTaxonomyRevision,
		vocabularyRevision: recognition.vocabularyRevision,
		normalizationRevision: recognition.normalizationRevision,
		helperRegistryRevision: registry.helperRegistryRevision,
		helperRegistryChecksum: registry.checksum,
		capabilitySnapshotRevision: snapshot.capabilitySnapshotRevision,
		capabilitySnapshotChecksum: snapshot.checksum,
		keywordRecognitionChecksum: recognition.checksum,
		retrievalPolicyRevision: input.retrievalPolicyRevision,
		entries,
		executionAuthorized: false as const,
		executionPerformed: false as const,
		writesPerformed: false as const,
		canonicalAuthority: false as const,
	};
	return HelperEligibilityReviewV2Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertHelperEligibilityReviewV2(value: HelperEligibilityReviewV2): HelperEligibilityReviewV2 {
	const eligibility = HelperEligibilityReviewV2Schema.parse(value);
	const { checksum, ...body } = eligibility;
	if (sha256Stable(body) !== checksum) throw new Error('HELPER_ELIGIBILITY_REVIEW_CHECKSUM_MISMATCH');
	return eligibility;
}
