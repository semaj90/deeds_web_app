import { z } from 'zod';
import { canonicalPacketHash } from './canonical-packet-hash.js';
import {
	RevisionFenceSchema,
	SmartRpcPacketSchema,
	buildSmartRpcPacket,
	type RevisionFenceV1,
	type SmartRpcPacketV1,
} from './smart-packet-fabric.js';

export const ATLAS_ORDINAL_REGISTRY_SCHEMA = 'atlas.ordinal-registry.v1' as const;

export const OrdinalBindingSchema = z.object({
	canonicalId: z.string().min(1),
	packetKey: z.string().min(1).optional(),
	symbolVersionId: z.string().min(1).optional(),
	treeNodeId: z.string().min(1).optional(),
	sourceRef: z.string().min(1).optional(),
	semanticOrdinal: z.number().int().nonnegative().optional(),
	graphOrdinal: z.number().int().nonnegative().optional(),
	featureOrdinal: z.number().int().nonnegative().optional(),
	tensorRowOrdinal: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, ctx) => {
	if (
		value.semanticOrdinal === undefined
		&& value.graphOrdinal === undefined
		&& value.featureOrdinal === undefined
		&& value.tensorRowOrdinal === undefined
	) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ordinal binding requires at least one ordinal' });
});
export type OrdinalBindingV1 = z.infer<typeof OrdinalBindingSchema>;

export const OrdinalRegistrySchema = z.object({
	schema: z.literal(ATLAS_ORDINAL_REGISTRY_SCHEMA),
	registryId: z.string().min(1),
	revisions: RevisionFenceSchema,
	semanticSnapshotId: z.string().min(1).optional(),
	graphSnapshotId: z.string().min(1).optional(),
	featureSnapshotId: z.string().min(1).optional(),
	bindings: z.array(OrdinalBindingSchema),
	producerRevision: z.string().min(1),
	checksum: z.string().min(1),
}).strict();
export type OrdinalRegistryV1 = z.infer<typeof OrdinalRegistrySchema>;

const ORDINAL_FIELDS = ['semanticOrdinal', 'graphOrdinal', 'featureOrdinal', 'tensorRowOrdinal'] as const;

function assertUniqueBindings(bindings: readonly OrdinalBindingV1[]): void {
	const canonicalIds = new Set<string>();
	for (const binding of bindings) {
		if (canonicalIds.has(binding.canonicalId)) throw new Error(`duplicate canonicalId in ordinal registry: ${binding.canonicalId}`);
		canonicalIds.add(binding.canonicalId);
	}
	for (const field of ORDINAL_FIELDS) {
		const seen = new Map<number, string>();
		for (const binding of bindings) {
			const value = binding[field];
			if (typeof value !== 'number') continue;
			const owner = seen.get(value);
			if (owner) throw new Error(`duplicate ${field} ${value}: ${owner} and ${binding.canonicalId}`);
			seen.set(value, binding.canonicalId);
		}
	}
}

function revisionMismatch(packet: RevisionFenceV1, registry: RevisionFenceV1): string | null {
	for (const field of ['workspaceRevision', 'sourceRevision', 'graphRevision', 'representationRevision', 'featureRevision'] as const) {
		const a = packet[field];
		const b = registry[field];
		if (a !== undefined && b !== undefined && a !== b) return field;
	}
	return null;
}

export function buildOrdinalRegistry(input: Omit<OrdinalRegistryV1, 'schema' | 'checksum'>): OrdinalRegistryV1 {
	const bindings = input.bindings.map((binding) => OrdinalBindingSchema.parse(binding)).sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
	assertUniqueBindings(bindings);
	const value = { schema: ATLAS_ORDINAL_REGISTRY_SCHEMA, ...input, bindings };
	return OrdinalRegistrySchema.parse({ ...value, checksum: canonicalPacketHash(value) });
}

export function resolveOrdinalBinding(registry: OrdinalRegistryV1, canonicalId: string): OrdinalBindingV1 | null {
	const parsed = OrdinalRegistrySchema.parse(registry);
	return parsed.bindings.find((binding) => binding.canonicalId === canonicalId) ?? null;
}

export function joinSmartPacketOrdinals(packetInput: SmartRpcPacketV1, registryInput: OrdinalRegistryV1): SmartRpcPacketV1 {
	const packet = SmartRpcPacketSchema.parse(packetInput);
	const registry = OrdinalRegistrySchema.parse(registryInput);
	const mismatch = revisionMismatch(packet.revisions, registry.revisions);
	if (mismatch) throw new Error(`ordinal registry revision mismatch: ${mismatch}`);
	const binding = resolveOrdinalBinding(registry, packet.canonicalId);
	if (!binding) throw new Error(`canonicalId absent from ordinal registry: ${packet.canonicalId}`);
	if (binding.packetKey && binding.packetKey !== packet.packetKey) throw new Error(`packetKey mismatch for ${packet.canonicalId}`);

	const resolved = {
		semanticOrdinal: binding.semanticOrdinal ?? packet.ordinals.semanticOrdinal,
		graphOrdinal: binding.graphOrdinal ?? packet.ordinals.graphOrdinal,
		featureOrdinal: binding.featureOrdinal ?? packet.ordinals.featureOrdinal,
		tensorRowOrdinal: binding.tensorRowOrdinal ?? packet.ordinals.tensorRowOrdinal,
	};
	for (const field of ORDINAL_FIELDS) {
		const before = packet.ordinals[field];
		const after = resolved[field];
		if (before !== undefined && after !== undefined && before !== after) throw new Error(`packet ${field} conflicts with ordinal registry`);
	}
	const { schema: _schema, contentChecksum: _checksum, ...rest } = packet;
	return buildSmartRpcPacket({ ...rest, ordinals: resolved });
}
