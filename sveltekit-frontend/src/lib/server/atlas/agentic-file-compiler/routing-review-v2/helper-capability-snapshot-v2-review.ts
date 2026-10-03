import { z } from 'zod';
import { sha256Stable } from '../contracts.js';
import { assertHelperRegistryReviewV2, type HelperRegistryReviewV2 } from './helper-registry-v2-review.js';

/** Observation-only input. This module deliberately contains no network probe or default availability. */
export const HELPER_CAPABILITY_SNAPSHOT_REVIEW_SCHEMA = 'atlas.helper-capability-snapshot.review.v2' as const;
export const HelperCapabilityObservationReviewV2Schema = z.object({
	helperId: z.string().min(1),
	helperRevision: z.string().regex(/^[a-f0-9]{64}$/),
	available: z.boolean(),
	executorRevision: z.string().min(1).nullable(),
	serviceRevision: z.string().min(1).nullable(),
	observedAt: z.string().datetime({ offset: true }),
	evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type HelperCapabilityObservationReviewV2 = z.infer<typeof HelperCapabilityObservationReviewV2Schema>;

export const HelperCapabilitySnapshotReviewV2Schema = z.object({
	schema: z.literal(HELPER_CAPABILITY_SNAPSHOT_REVIEW_SCHEMA),
	capabilitySnapshotRevision: z.string().min(1),
	helperRegistryRevision: z.string().min(1),
	helperRegistryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	observations: z.array(HelperCapabilityObservationReviewV2Schema),
	writesPerformed: z.literal(false),
	canonicalAuthority: z.literal(false),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((snapshot, ctx) => {
	const ids = new Set<string>();
	snapshot.observations.forEach((observation, index) => {
		if (ids.has(observation.helperId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['observations', index, 'helperId'], message: `DUPLICATE_CAPABILITY_OBSERVATION:${observation.helperId}` });
		ids.add(observation.helperId);
	});
});
export type HelperCapabilitySnapshotReviewV2 = z.infer<typeof HelperCapabilitySnapshotReviewV2Schema>;

export function buildHelperCapabilitySnapshotReviewV2(input: {
	capabilitySnapshotRevision: string;
	registry: HelperRegistryReviewV2;
	observations: readonly HelperCapabilityObservationReviewV2[];
}): HelperCapabilitySnapshotReviewV2 {
	const registry = assertHelperRegistryReviewV2(input.registry);
	const byId = new Map(registry.entries.map((entry) => [entry.helperId, entry]));
	const observations = input.observations.map((value) => {
		const observation = HelperCapabilityObservationReviewV2Schema.parse(value);
		const entry = byId.get(observation.helperId);
		if (!entry) throw new Error(`UNKNOWN_CAPABILITY_HELPER:${observation.helperId}`);
		if (entry.helperRevision !== observation.helperRevision) throw new Error(`CAPABILITY_HELPER_REVISION_MISMATCH:${observation.helperId}`);
		return { ...observation, evidenceRefs: [...new Set(observation.evidenceRefs)].sort() };
	}).sort((a, b) => a.helperId < b.helperId ? -1 : a.helperId > b.helperId ? 1 : 0);
	const body = {
		schema: HELPER_CAPABILITY_SNAPSHOT_REVIEW_SCHEMA,
		capabilitySnapshotRevision: input.capabilitySnapshotRevision,
		helperRegistryRevision: registry.helperRegistryRevision,
		helperRegistryChecksum: registry.checksum,
		observations,
		writesPerformed: false as const,
		canonicalAuthority: false as const,
	};
	return HelperCapabilitySnapshotReviewV2Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertHelperCapabilitySnapshotReviewV2(value: HelperCapabilitySnapshotReviewV2): HelperCapabilitySnapshotReviewV2 {
	const snapshot = HelperCapabilitySnapshotReviewV2Schema.parse(value);
	const { checksum, ...body } = snapshot;
	if (sha256Stable(body) !== checksum) throw new Error('HELPER_CAPABILITY_REVIEW_CHECKSUM_MISMATCH');
	return snapshot;
}

