import { z } from 'zod';
import { sha256Stable } from './contracts.js';
import { assertHelperRegistryV1, HELPER_REGISTRY_V1, type HelperRegistryV1 } from './helper-registry-v1.js';
import { assertHelperCapabilitySnapshotV1, type HelperCapabilitySnapshotV1 } from './helper-capability-snapshot-v1.js';
import { assertKeywordRecognitionV1, type KeywordRecognitionV1 } from './keyword-recognition-v1.js';

export const HELPER_ELIGIBILITY_SCHEMA_V1 = 'atlas.helper-eligibility.v1' as const;
export const HelperEligibilityDecisionSchema = z.object({
	helperId: z.string().min(1),
	status: z.enum(['ELIGIBLE', 'INELIGIBLE', 'BLOCKED']),
	positiveReasons: z.array(z.string()),
	blockingReasons: z.array(z.string()),
	matchedEvidenceRefs: z.array(z.string()),
	estimatedCostClass: z.enum(['LOW', 'MEDIUM', 'HIGH']),
}).strict();

export const HelperEligibilityV1Schema = z.object({
	schema: z.literal(HELPER_ELIGIBILITY_SCHEMA_V1),
	keywordRecognitionChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	helperRegistryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	capabilitySnapshotChecksums: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
	retrievalPolicyRevision: z.string().min(1),
	decisions: z.array(HelperEligibilityDecisionSchema),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
	executionAuthorized: z.literal(false),
	executionPerformed: z.literal(false),
	writesPerformed: z.literal(false),
	canonicalAuthority: z.literal(false),
}).strict();
export type HelperEligibilityV1 = z.infer<typeof HelperEligibilityV1Schema>;

export function buildHelperEligibilityV1(input: {
	keywordRecognition: KeywordRecognitionV1;
	capabilitySnapshots: HelperCapabilitySnapshotV1[];
	retrievalPolicyRevision: string;
	registry?: HelperRegistryV1;
}): HelperEligibilityV1 {
	const registry = input.registry ?? HELPER_REGISTRY_V1;
	assertHelperRegistryV1(registry);
	const recognition = assertKeywordRecognitionV1(input.keywordRecognition);
	if (recognition.helperRegistryChecksum !== registry.checksum) throw new Error('HELPER_REGISTRY_CHECKSUM_MISMATCH');
	const snapshots = input.capabilitySnapshots.map(assertHelperCapabilitySnapshotV1).sort((a, b) => a.helperId.localeCompare(b.helperId));
	if (new Set(snapshots.map((snapshot) => snapshot.helperId)).size !== snapshots.length) throw new Error('DUPLICATE_CAPABILITY_SNAPSHOT');
	for (const snapshot of snapshots) {
		const helper = registry.entries.find((entry) => entry.helperId === snapshot.helperId);
		if (!helper) throw new Error(`UNKNOWN_CAPABILITY_HELPER:${snapshot.helperId}`);
		if (snapshot.registryChecksum !== registry.checksum || snapshot.helperRevision !== helper.helperRevision) throw new Error(`CAPABILITY_REVISION_MISMATCH:${snapshot.helperId}`);
	}
	const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.helperId, snapshot]));
	const matchedHelpers = new Set(recognition.helperRefs);
	const decisions = registry.entries.map((helper) => {
		const snapshot = snapshotsById.get(helper.helperId);
		if (!matchedHelpers.has(helper.helperId)) return {
			helperId: helper.helperId, status: 'INELIGIBLE' as const,
			positiveReasons: [], blockingReasons: ['NO_EXACT_KEYWORD_EVIDENCE'], matchedEvidenceRefs: [], estimatedCostClass: helper.costClass,
		};
		if (!snapshot) return {
			helperId: helper.helperId, status: 'BLOCKED' as const,
			positiveReasons: ['EXACT_KEYWORD_EVIDENCE'], blockingReasons: ['CAPABILITY_SNAPSHOT_MISSING'], matchedEvidenceRefs: [`keyword-recognition:${recognition.checksum}`], estimatedCostClass: helper.costClass,
		};
		if (!snapshot.available) return {
			helperId: helper.helperId, status: 'BLOCKED' as const,
			positiveReasons: ['EXACT_KEYWORD_EVIDENCE'], blockingReasons: ['CAPABILITY_UNAVAILABLE'],
			matchedEvidenceRefs: [`keyword-recognition:${recognition.checksum}`, ...snapshot.evidenceRefs].sort(), estimatedCostClass: helper.costClass,
		};
		return {
			helperId: helper.helperId, status: 'ELIGIBLE' as const,
			positiveReasons: ['EXACT_KEYWORD_EVIDENCE', 'CAPABILITY_AVAILABLE'], blockingReasons: [],
			matchedEvidenceRefs: [`keyword-recognition:${recognition.checksum}`, ...snapshot.evidenceRefs].sort(), estimatedCostClass: helper.costClass,
		};
	});
	const body = {
		schema: HELPER_ELIGIBILITY_SCHEMA_V1,
		keywordRecognitionChecksum: recognition.checksum,
		helperRegistryChecksum: registry.checksum,
		capabilitySnapshotChecksums: snapshots.map((snapshot) => snapshot.checksum),
		retrievalPolicyRevision: input.retrievalPolicyRevision,
		decisions,
		executionAuthorized: false as const,
		executionPerformed: false as const,
		writesPerformed: false as const,
		canonicalAuthority: false as const,
	};
	return HelperEligibilityV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}
