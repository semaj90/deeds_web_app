import { z } from 'zod';
import { sha256Stable } from './contracts.js';
import { assertHelperRegistryV1, HELPER_CAPABILITY_SNAPSHOT_SCHEMA_V1, HELPER_REGISTRY_V1, type HelperRegistryV1 } from './helper-registry-v1.js';

/** One immutable observation for one statically registered helper. */
export const HelperCapabilitySnapshotV1Schema = z.object({
	schema: z.literal(HELPER_CAPABILITY_SNAPSHOT_SCHEMA_V1),
	helperId: z.string().min(1),
	helperRevision: z.string().regex(/^[a-f0-9]{64}$/),
	registryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	available: z.boolean(),
	executorRevision: z.string().min(1).optional(),
	serviceRevision: z.string().min(1).optional(),
	observedAt: z.string().datetime({ offset: true }),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type HelperCapabilitySnapshotV1 = z.infer<typeof HelperCapabilitySnapshotV1Schema>;

export function assertHelperCapabilitySnapshotV1(value: HelperCapabilitySnapshotV1): HelperCapabilitySnapshotV1 {
	const snapshot = HelperCapabilitySnapshotV1Schema.parse(value);
	const { checksum, ...body } = snapshot;
	if (sha256Stable(body) !== checksum) throw new Error(`CAPABILITY_CHECKSUM_MISMATCH:${snapshot.helperId}`);
	return snapshot;
}

/**
 * Seals a caller-observed fact without probing a service or inferring runtime
 * availability from the existence of source code.
 */
export function buildHelperCapabilitySnapshotV1(
	input: Omit<HelperCapabilitySnapshotV1, 'schema' | 'checksum' | 'helperRevision' | 'registryChecksum'>,
	registry: HelperRegistryV1 = HELPER_REGISTRY_V1,
): HelperCapabilitySnapshotV1 {
	assertHelperRegistryV1(registry);
	const helper = registry.entries.find((entry) => entry.helperId === input.helperId);
	if (!helper) throw new Error(`UNKNOWN_HELPER:${input.helperId}`);
	const body = {
		schema: HELPER_CAPABILITY_SNAPSHOT_SCHEMA_V1,
		helperId: helper.helperId,
		helperRevision: helper.helperRevision,
		registryChecksum: registry.checksum,
		available: input.available,
		...(input.executorRevision ? { executorRevision: input.executorRevision } : {}),
		...(input.serviceRevision ? { serviceRevision: input.serviceRevision } : {}),
		observedAt: input.observedAt,
		evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
	};
	return HelperCapabilitySnapshotV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}
