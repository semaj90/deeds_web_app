import { z } from 'zod';
import { canonicalPacketHash, sortedUnique } from './canonical-packet-hash.js';
import { RevisionFenceSchema, type ArtifactRefV1, buildArtifactRef } from './smart-packet-fabric.js';

export const ATLAS_SEMANTIC_SNAPSHOT_REF_SCHEMA = 'atlas.semantic-snapshot-ref.v1' as const;
export const ATLAS_HYPERGRAPH_SNAPSHOT_SCHEMA = 'atlas.hypergraph-snapshot.v1' as const;
export const ATLAS_GPU_MATERIALIZATION_RECEIPT_SCHEMA = 'atlas.gpu-materialization-receipt.v1' as const;

/**
 * Reference-only semantic snapshot contract. It deliberately does not choose
 * the repository's persistent semantic authority; it records the representation
 * identity/revision supplied by the existing snapshot owner.
 */
export const SemanticSnapshotRefSchema = z.object({
	schema: z.literal(ATLAS_SEMANTIC_SNAPSHOT_REF_SCHEMA),
	snapshotId: z.string().min(1),
	representationId: z.string().min(1),
	dimension: z.number().int().positive(),
	dtype: z.enum(['float16', 'bfloat16', 'float32']),
	vectorCount: z.number().int().nonnegative(),
	ordinalMapRevision: z.string().min(1),
	revisions: RevisionFenceSchema,
	artifactPath: z.string().min(1),
	artifactFormat: z.enum(['arrow-ipc', 'mmap']),
	identityDigest: z.string().min(1),
	vectorDigest: z.string().min(1),
	producerRevision: z.string().min(1),
	checksum: z.string().min(1),
}).strict();
export type SemanticSnapshotRefV1 = z.infer<typeof SemanticSnapshotRefSchema>;

export const HypergraphSnapshotSchema = z.object({
	schema: z.literal(ATLAS_HYPERGRAPH_SNAPSHOT_SCHEMA),
	snapshotId: z.string().min(1),
	revisions: RevisionFenceSchema,
	ordinalMapRevision: z.string().min(1),
	nodeCount: z.number().int().nonnegative(),
	hyperedgeCount: z.number().int().nonnegative(),
	membershipCount: z.number().int().nonnegative(),
	storage: z.object({
		format: z.literal('csr-nary-v1'),
		nodeOrdinals: z.string().min(1),
		hyperedgeOffsets: z.string().min(1),
		hyperedgeMembers: z.string().min(1),
		relationTypes: z.string().min(1),
		directions: z.string().min(1),
		weights: z.string().min(1),
	}).strict(),
	artifactRefs: z.array(z.string().min(1)).default([]),
	producerRevision: z.string().min(1),
	checksum: z.string().min(1),
}).strict();
export type HypergraphSnapshotV1 = z.infer<typeof HypergraphSnapshotSchema>;

export const GpuMaterializationReceiptSchema = z.object({
	schema: z.literal(ATLAS_GPU_MATERIALIZATION_RECEIPT_SCHEMA),
	materializationId: z.string().min(1),
	sourceArtifactId: z.string().min(1),
	sourceChecksum: z.string().min(1),
	revisions: RevisionFenceSchema,
	tileId: z.string().min(1),
	dtype: z.enum(['fp16', 'bf16', 'fp32', 'int8', 'uint8', 'int32', 'uint32']),
	shape: z.array(z.number().int().nonnegative()).min(1),
	byteLength: z.number().int().nonnegative(),
	residency: z.enum(['pinned-host', 'cuda']),
	cudaIpcLeaseRef: z.string().min(1).optional(),
	deviceId: z.string().min(1).optional(),
	producerRevision: z.string().min(1),
	checksum: z.string().min(1),
}).strict().superRefine((value, ctx) => {
	if (value.cudaIpcLeaseRef && value.residency !== 'cuda') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CUDA IPC lease requires cuda residency' });
});
export type GpuMaterializationReceiptV1 = z.infer<typeof GpuMaterializationReceiptSchema>;

export function buildSemanticSnapshotRef(input: Omit<SemanticSnapshotRefV1, 'schema' | 'checksum'>): SemanticSnapshotRefV1 {
	const value = { schema: ATLAS_SEMANTIC_SNAPSHOT_REF_SCHEMA, ...input };
	return SemanticSnapshotRefSchema.parse({ ...value, checksum: canonicalPacketHash(value) });
}

export function buildHypergraphSnapshot(input: Omit<HypergraphSnapshotV1, 'schema' | 'checksum'>): HypergraphSnapshotV1 {
	const value = { schema: ATLAS_HYPERGRAPH_SNAPSHOT_SCHEMA, ...input, artifactRefs: sortedUnique(input.artifactRefs) };
	return HypergraphSnapshotSchema.parse({ ...value, checksum: canonicalPacketHash(value) });
}

export function buildGpuMaterializationReceipt(input: Omit<GpuMaterializationReceiptV1, 'schema' | 'checksum'>): GpuMaterializationReceiptV1 {
	const value = { schema: ATLAS_GPU_MATERIALIZATION_RECEIPT_SCHEMA, ...input };
	return GpuMaterializationReceiptSchema.parse({ ...value, checksum: canonicalPacketHash(value) });
}

export function gpuReceiptToArtifactRef(receiptInput: GpuMaterializationReceiptV1, canonicalId?: string): ArtifactRefV1 {
	const receipt = GpuMaterializationReceiptSchema.parse(receiptInput);
	return buildArtifactRef({
		artifactId: receipt.tileId,
		canonicalId,
		kind: 'tensor-tile',
		revisions: receipt.revisions,
		checksum: receipt.checksum,
		location: { type: 'cuda', tileId: receipt.tileId },
	});
}
