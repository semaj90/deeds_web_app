import { z } from 'zod';

export const PacketRegistryRpcReceiptV1Schema = z.object({
	schema: z.string(),
	toolCallId: z.string(),
	toolName: z.string(),
	runId: z.string(),
	workspaceId: z.string(),
	workspaceRevision: z.string(),
	packetKey: z.string(),
	packetRevision: z.string(),
	succeeded: z.boolean(),
	evidenceCount: z.number().int().nonnegative(),
	validationStatus: z.string(),
	errorCode: z.string().nullable(),
	canonicalAuthority: z.boolean(),
	writesPerformed: z.boolean(),
	receiptId: z.string(),
	receiptChecksum: z.string(),
});

export const PacketRegistryRpcLaneV1Schema = z.object({
	laneId: z.string(),
	kind: z.string(),
	owner: z.string(),
	status: z.string(),
	representationId: z.string(),
	representationRevision: z.string(),
	modelRevision: z.string(),
	collection: z.string(),
	vectorName: z.string(),
	tags: z.array(z.string()),
	indexAlgorithm: z.string(),
	indexRevision: z.string(),
	projectionChecksum: z.string(),
	writePolicy: z.string(),
});

export const PacketRegistryRpcEntryV1Schema = z.object({
	schema: z.string(),
	workspaceId: z.string(),
	workspaceRevision: z.string(),
	packetKey: z.string(),
	packetRevision: z.string(),
	sourceRef: z.string(),
	sourceRevision: z.string(),
	contentHash: z.string(),
	lanes: z.array(PacketRegistryRpcLaneV1Schema),
	registryRevision: z.string(),
});

export const PacketRegistryRpcResultV1Schema = z.object({
	schema: z.literal('atlas.rpc-packet-registry.v1'),
	status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'INVALID']),
	degraded: z.boolean(),
	entries: z.array(PacketRegistryRpcEntryV1Schema),
	receipt: PacketRegistryRpcReceiptV1Schema,
});

export type PacketRegistryRpcResultV1 = z.infer<typeof PacketRegistryRpcResultV1Schema>;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
	return value !== null && typeof value === 'object' ? value as UnknownRecord : {};
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function bool(value: unknown): boolean {
	return value === true;
}

function int(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function unavailableReceipt(errorCode: string): z.infer<typeof PacketRegistryRpcReceiptV1Schema> {
	return {
		schema: 'atlas.tool-receipt.v2',
		toolCallId: '',
		toolName: 'atlas.packet-registry',
		runId: '',
		workspaceId: '',
		workspaceRevision: '',
		packetKey: '',
		packetRevision: '',
		succeeded: false,
		evidenceCount: 0,
		validationStatus: 'UNAVAILABLE',
		errorCode,
		canonicalAuthority: false,
		writesPerformed: false,
		receiptId: '',
		receiptChecksum: '',
	};
}

function mapReceipt(value: unknown) {
	const source = record(value);
	return PacketRegistryRpcReceiptV1Schema.parse({
		schema: text(source.schema),
		toolCallId: text(source.toolCallId),
		toolName: text(source.toolName),
		runId: text(source.runId),
		workspaceId: text(source.workspaceId),
		workspaceRevision: text(source.workspaceRevision),
		packetKey: text(source.packetKey),
		packetRevision: text(source.packetRevision),
		succeeded: bool(source.succeeded),
		evidenceCount: int(source.evidenceCount),
		validationStatus: text(source.validationStatus),
		errorCode: source.errorCode == null ? null : text(source.errorCode),
		canonicalAuthority: bool(source.canonicalAuthority),
		writesPerformed: bool(source.writesPerformed),
		receiptId: text(source.receiptId),
		receiptChecksum: text(source.receiptChecksum),
	});
}

function mapLane(value: unknown) {
	const source = record(value);
	return {
		laneId: text(source.laneId),
		kind: text(source.kind),
		owner: text(source.owner),
		status: text(source.status),
		representationId: text(source.representationId),
		representationRevision: text(source.representationRevision),
		modelRevision: text(source.modelRevision),
		collection: text(source.collection),
		vectorName: text(source.vectorName),
		tags: Array.isArray(source.tags) ? source.tags.map(text) : [],
		indexAlgorithm: text(source.indexAlgorithm),
		indexRevision: text(source.indexRevision),
		projectionChecksum: text(source.projectionChecksum),
		writePolicy: text(source.writePolicy),
	};
}

function mapEntry(value: unknown) {
	const source = record(value);
	return PacketRegistryRpcEntryV1Schema.parse({
		schema: text(source.schema),
		workspaceId: text(source.workspaceId),
		workspaceRevision: text(source.workspaceRevision),
		packetKey: text(source.packetKey),
		packetRevision: text(source.packetRevision),
		sourceRef: text(source.sourceRef),
		sourceRevision: text(source.sourceRevision),
		contentHash: text(source.contentHash),
		lanes: Array.isArray(source.lanes) ? source.lanes.map(mapLane) : [],
		registryRevision: text(source.registryRevision),
	});
}

/** Maps protobufjs output into one stable tRPC/SvelteKit-safe response shape. */
export function mapPacketRegistryResponseV1(value: unknown): PacketRegistryRpcResultV1 {
	const source = record(value);
	const receipt = source.receipt ? mapReceipt(source.receipt) : unavailableReceipt('ATLAS_RPC_RESPONSE_RECEIPT_MISSING');
	const entries = Array.isArray(source.entries) ? source.entries.map(mapEntry) : [];
	const status = receipt.succeeded ? 'AVAILABLE' : 'UNAVAILABLE';
	return PacketRegistryRpcResultV1Schema.parse({
		schema: 'atlas.rpc-packet-registry.v1',
		status,
		degraded: status !== 'AVAILABLE',
		entries,
		receipt,
	});
}

export function unavailablePacketRegistryResultV1(errorCode = 'ATLAS_PACKET_REGISTRY_UNAVAILABLE'): PacketRegistryRpcResultV1 {
	return PacketRegistryRpcResultV1Schema.parse({
		schema: 'atlas.rpc-packet-registry.v1',
		status: 'UNAVAILABLE',
		degraded: true,
		entries: [],
		receipt: unavailableReceipt(errorCode),
	});
}

