import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	assertCandidateOrdinalMapIntegrityV1,
	candidateOrdinalMapV1Schema,
	type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
	FEATURE_ROW_V1_NUMERIC_FIELDS,
	featureRowV1ToFloat32,
	type FeatureRowV1,
} from '../ranking/feature-row-v1.js';
import {
	encodeMessagePackPayload,
	decodeMessagePackPayload,
	type MessagePackEnvelope,
} from './messagepack-transport-v1.js';

export const FEATURE_ROW_RPC_PACKET_SCHEMA_V1 = 'atlas.feature-row-rpc-packet.v1' as const;
export const FEATURE_ROW_NUMERIC_COLS = FEATURE_ROW_V1_NUMERIC_FIELDS.length; // 10 columns
const NULLABLE_FEATURE_FIELDS = new Set(['pprAffinity', 'crossEncoder']);

export const FeatureRowRpcPacketV1Schema = z
	.object({
		schema: z.literal(FEATURE_ROW_RPC_PACKET_SCHEMA_V1),
		rows: z.number().int().positive(),
		cols: z.literal(FEATURE_ROW_NUMERIC_COLS),
		candidatePacketKeys: z.array(z.string().min(1)).min(1),
		canonicalIds: z.array(z.string().min(1)).min(1),
		sourceRefs: z.array(z.string().min(1)).min(1),
		sourceRevisions: z.array(z.string().min(1)).min(1),
		evidenceRefs: z.array(z.array(z.string().min(1)).min(1)).min(1),
		workspaceRevision: z.string().min(1),
		featureRevision: z.string().min(1),
		graphRevision: z.string().min(1),
		semanticRevision: z.string().min(1),
		numericEncoding: z.literal('float32-le'),
		numericBufferBytes: z.instanceof(Uint8Array),
		presenceMaskBitOrder: z.literal('lsb0'),
		presenceMaskBytes: z.instanceof(Uint8Array),
		messagePackEnvelope: z.object({
			schema: z.literal('atlas.messagepack-transport.v1'),
			canonicalJsonChecksum: z.string().min(1),
			payloadBytes: z.instanceof(Uint8Array),
			byteLength: z.number().int().min(0),
			canonicalAuthority: z.literal(false),
		}),
		checksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
	})
	.strict()
	.superRefine((packet, context) => {
		for (const field of ['candidatePacketKeys', 'canonicalIds', 'sourceRefs', 'sourceRevisions', 'evidenceRefs'] as const) {
			if (packet[field].length !== packet.rows) {
				context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'ROW_LINEAGE_COUNT_MISMATCH' });
			}
		}
		if (packet.numericBufferBytes.byteLength !== packet.rows * packet.cols * Float32Array.BYTES_PER_ELEMENT) {
			context.addIssue({ code: z.ZodIssueCode.custom, path: ['numericBufferBytes'], message: 'NUMERIC_BUFFER_LENGTH_MISMATCH' });
		}
		if (packet.presenceMaskBytes.byteLength !== Math.ceil(packet.rows * packet.cols / 8)) {
			context.addIssue({ code: z.ZodIssueCode.custom, path: ['presenceMaskBytes'], message: 'PRESENCE_MASK_LENGTH_MISMATCH' });
		}
	});

export type FeatureRowRpcPacketV1 = z.infer<typeof FeatureRowRpcPacketV1Schema>;

export const FeatureRowRpcOrdinalBindingV1Schema = z.object({
	schema: z.literal('atlas.feature-row-rpc-ordinal-binding.v1'),
	packetChecksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	workspaceRevision: z.string().min(1),
	candidateSnapshotRevision: z.string().min(1),
	ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	candidateOrdinals: z.array(z.number().int().nonnegative()).min(1),
	checksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict();

export type FeatureRowRpcOrdinalBindingV1 = z.infer<typeof FeatureRowRpcOrdinalBindingV1Schema>;

function ordinalBindingChecksum(payload: Omit<FeatureRowRpcOrdinalBindingV1, 'checksumSha256'>): string {
	return sha256(JSON.stringify(payload));
}

export function bindFeatureRowRpcPacketToOrdinalMapV1(
	packet: FeatureRowRpcPacketV1,
	ordinalMapInput: CandidateOrdinalMapV1,
): FeatureRowRpcOrdinalBindingV1 {
	FeatureRowRpcPacketV1Schema.parse(packet);
	const ordinalMap = candidateOrdinalMapV1Schema.parse(ordinalMapInput);
	assertCandidateOrdinalMapIntegrityV1(ordinalMap);
	if (packet.workspaceRevision !== ordinalMap.workspaceRevision) {
		throw new Error('FEATURE_ROW_RPC_ORDINAL_MAP_WORKSPACE_MISMATCH');
	}

	const byCanonicalId = new Map(ordinalMap.candidates.map((candidate) => [candidate.canonicalId, candidate]));
	const candidateOrdinals = packet.canonicalIds.map((canonicalId, index) => {
		const candidate = byCanonicalId.get(canonicalId);
		if (!candidate
			|| candidate.packetKey !== packet.candidatePacketKeys[index]
			|| candidate.sourceRef !== packet.sourceRefs[index]
			|| candidate.sourceRevision !== packet.sourceRevisions[index]
			|| candidate.workspaceRevision !== packet.workspaceRevision
			|| candidate.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision) {
			throw new Error('FEATURE_ROW_RPC_CANDIDATE_NOT_BOUND_TO_ORDINAL_MAP');
		}
		return candidate.candidateOrdinal;
	});

	const payload = {
		schema: 'atlas.feature-row-rpc-ordinal-binding.v1' as const,
		packetChecksumSha256: packet.checksumSha256,
		workspaceRevision: ordinalMap.workspaceRevision,
		candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
		ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
		candidateOrdinals,
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};
	return FeatureRowRpcOrdinalBindingV1Schema.parse({
		...payload,
		checksumSha256: ordinalBindingChecksum(payload),
	});
}

export function decodeOrdinalBoundFeatureRowRpcPacketV1(input: {
	packet: FeatureRowRpcPacketV1;
	binding: FeatureRowRpcOrdinalBindingV1;
	ordinalMap: CandidateOrdinalMapV1;
}): ReturnType<typeof decodeFeatureRowRpcPacketV1> & { candidateOrdinals: number[] } {
	const packet = FeatureRowRpcPacketV1Schema.parse(input.packet);
	const binding = FeatureRowRpcOrdinalBindingV1Schema.parse(input.binding);
	const expected = bindFeatureRowRpcPacketToOrdinalMapV1(packet, input.ordinalMap);
	if (JSON.stringify(binding) !== JSON.stringify(expected)) {
		throw new Error('FEATURE_ROW_RPC_ORDINAL_BINDING_MISMATCH');
	}
	return {
		...decodeFeatureRowRpcPacketV1(packet),
		candidateOrdinals: [...binding.candidateOrdinals],
	};
}

function sha256(value: string): string {
	return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function sha256Bytes(value: Uint8Array): string {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function metadataFor(packet: Pick<FeatureRowRpcPacketV1,
	| 'rows' | 'cols' | 'candidatePacketKeys' | 'canonicalIds' | 'sourceRefs' | 'sourceRevisions'
	| 'evidenceRefs' | 'workspaceRevision' | 'featureRevision' | 'graphRevision' | 'semanticRevision'
	| 'numericEncoding' | 'numericBufferBytes' | 'presenceMaskBitOrder' | 'presenceMaskBytes'>) {
	return {
		schema: FEATURE_ROW_RPC_PACKET_SCHEMA_V1,
		rows: packet.rows,
		cols: packet.cols,
		candidatePacketKeys: packet.candidatePacketKeys,
		canonicalIds: packet.canonicalIds,
		sourceRefs: packet.sourceRefs,
		sourceRevisions: packet.sourceRevisions,
		evidenceRefs: packet.evidenceRefs,
		workspaceRevision: packet.workspaceRevision,
		featureRevision: packet.featureRevision,
		graphRevision: packet.graphRevision,
		semanticRevision: packet.semanticRevision,
		numericEncoding: packet.numericEncoding,
		byteLength: packet.numericBufferBytes.byteLength,
		presenceMaskBitOrder: packet.presenceMaskBitOrder,
		presenceMaskBytes: Buffer.from(packet.presenceMaskBytes).toString('base64'),
		presenceMaskChecksum: sha256Bytes(packet.presenceMaskBytes),
	};
}

function packetChecksum(metadata: ReturnType<typeof metadataFor>, numericBufferBytes: Uint8Array): string {
	return sha256(JSON.stringify({ metadata, tensorDigest: sha256Bytes(numericBufferBytes) }));
}

export function buildFeatureRowRpcPacketV1(
	rows: readonly FeatureRowV1[],
): FeatureRowRpcPacketV1 {
	if (!rows || rows.length === 0) {
		throw new Error('FEATURE_ROW_RPC_PACKET_EMPTY_ROWS');
	}

	const n = rows.length;
	const first = rows[0];
	const workspaceRevision = first.workspaceRevision;
	const featureRevision = first.featureRevision;
	const graphRevision = first.graphRevision;
	const semanticRevision = first.semanticRevision;

	const candidatePacketKeys: string[] = [];
	const canonicalIds: string[] = [];
	const sourceRefs: string[] = [];
	const sourceRevisions: string[] = [];
	const evidenceRefs: string[][] = [];

	const numericBufferBytes = new Uint8Array(n * FEATURE_ROW_NUMERIC_COLS * Float32Array.BYTES_PER_ELEMENT);
	const dataView = new DataView(numericBufferBytes.buffer);
	const presenceMaskBytes = new Uint8Array(Math.ceil(n * FEATURE_ROW_NUMERIC_COLS / 8));

	for (let i = 0; i < n; i++) {
		const row = rows[i];
		// Reject revision mixing within one ranking tensor
		if (row.workspaceRevision !== workspaceRevision) {
			throw new Error('FEATURE_ROW_RPC_PACKET_MIXED_WORKSPACE_REVISION');
		}
		if (row.featureRevision !== featureRevision) {
			throw new Error('FEATURE_ROW_RPC_PACKET_MIXED_FEATURE_REVISION');
		}
		if (row.graphRevision !== graphRevision) {
			throw new Error('FEATURE_ROW_RPC_PACKET_MIXED_GRAPH_REVISION');
		}
		if (row.semanticRevision !== semanticRevision) {
			throw new Error('FEATURE_ROW_RPC_PACKET_MIXED_SEMANTIC_REVISION');
		}

		candidatePacketKeys.push(row.packetKey);
		canonicalIds.push(row.canonicalId);
		sourceRefs.push(row.sourceRef);
		sourceRevisions.push(row.sourceRevision);
		evidenceRefs.push([...row.evidenceRefs]);

		const rowFloats = featureRowV1ToFloat32(row);
		for (let column = 0; column < FEATURE_ROW_NUMERIC_COLS; column++) {
			const bitIndex = i * FEATURE_ROW_NUMERIC_COLS + column;
			const field = FEATURE_ROW_V1_NUMERIC_FIELDS[column];
			const isPresent = !NULLABLE_FEATURE_FIELDS.has(field) || row[field] !== null;
			if (isPresent) presenceMaskBytes[bitIndex >> 3] |= 1 << (bitIndex & 7);
			dataView.setFloat32(bitIndex * Float32Array.BYTES_PER_ELEMENT, rowFloats[column], true);
		}
	}
	if (new Set(candidatePacketKeys).size !== n || new Set(canonicalIds).size !== n) {
		throw new Error('FEATURE_ROW_RPC_PACKET_DUPLICATE_CANDIDATE_IDENTITY');
	}

	const packetBase = {
		rows: n,
		cols: FEATURE_ROW_NUMERIC_COLS,
		candidatePacketKeys,
		canonicalIds,
		sourceRefs,
		sourceRevisions,
		evidenceRefs,
		workspaceRevision,
		featureRevision,
		graphRevision,
		semanticRevision,
		numericEncoding: 'float32-le' as const,
		numericBufferBytes,
		presenceMaskBitOrder: 'lsb0' as const,
		presenceMaskBytes,
	};
	const metadataForTransport = metadataFor(packetBase);
	const messagePackEnvelope = encodeMessagePackPayload(metadataForTransport);
	const checksumSha256 = packetChecksum(metadataForTransport, numericBufferBytes);

	return FeatureRowRpcPacketV1Schema.parse({
		schema: FEATURE_ROW_RPC_PACKET_SCHEMA_V1,
		rows: n,
		cols: FEATURE_ROW_NUMERIC_COLS,
		candidatePacketKeys,
		canonicalIds,
		sourceRefs,
		sourceRevisions,
		evidenceRefs,
		workspaceRevision,
		featureRevision,
		graphRevision,
		semanticRevision,
		numericEncoding: 'float32-le',
		numericBufferBytes,
		presenceMaskBitOrder: 'lsb0',
		presenceMaskBytes,
		messagePackEnvelope,
		checksumSha256,
		canonicalAuthority: false,
		writesPerformed: false,
	});
}

export function decodeFeatureRowRpcPacketV1(packet: FeatureRowRpcPacketV1): {
	tensor: Float32Array;
	shape: [number, number];
	candidatePacketKeys: string[];
	canonicalIds: string[];
	sourceRefs: string[];
	sourceRevisions: string[];
	evidenceRefs: string[][];
	presenceMaskBytes: Uint8Array;
	verified: true;
} {
	FeatureRowRpcPacketV1Schema.parse(packet);
	const expectedMetadata = metadataFor(packet);
	const decodedMetadata = decodeMessagePackPayload<Record<string, unknown>>(packet.messagePackEnvelope);
	if (
		!decodedMetadata.verified ||
		packet.messagePackEnvelope.byteLength !== packet.messagePackEnvelope.payloadBytes.byteLength ||
		JSON.stringify(decodedMetadata.data) !== JSON.stringify(expectedMetadata)
	) throw new Error('FEATURE_ROW_RPC_PACKET_METADATA_MISMATCH');
	if (packetChecksum(expectedMetadata, packet.numericBufferBytes) !== packet.checksumSha256) {
		throw new Error('FEATURE_ROW_RPC_PACKET_CHECKSUM_MISMATCH');
	}
	const tensor = new Float32Array(packet.rows * packet.cols);
	const view = new DataView(packet.numericBufferBytes.buffer, packet.numericBufferBytes.byteOffset, packet.numericBufferBytes.byteLength);
	for (let index = 0; index < tensor.length; index++) {
		tensor[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
	}
	for (let bitIndex = 0; bitIndex < packet.rows * packet.cols; bitIndex++) {
		const isPresent = (packet.presenceMaskBytes[bitIndex >> 3] & (1 << (bitIndex & 7))) !== 0;
		const column = bitIndex % FEATURE_ROW_NUMERIC_COLS;
		const field = FEATURE_ROW_V1_NUMERIC_FIELDS[column];
		if (!NULLABLE_FEATURE_FIELDS.has(field) && !isPresent) throw new Error('FEATURE_ROW_RPC_PACKET_REQUIRED_FEATURE_ABSENT');
	}

	return {
		tensor,
		shape: [packet.rows, packet.cols],
		candidatePacketKeys: packet.candidatePacketKeys,
		canonicalIds: packet.canonicalIds,
		sourceRefs: packet.sourceRefs,
		sourceRevisions: packet.sourceRevisions,
		evidenceRefs: packet.evidenceRefs,
		presenceMaskBytes: packet.presenceMaskBytes,
		verified: true,
	};
}

/**
 * Quantizes an FP32 continuous tensor buffer to IEEE 754 half-precision (FP16) bytes.
 * Reduces bandwidth from 40 bytes/row to 20 bytes/row for Ampere Tensor Core execution.
 */
export function float32ToFloat16Bytes(tensor: Float32Array): Uint8Array {
	const out = new Uint8Array(tensor.length * 2);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
	for (let i = 0; i < tensor.length; i++) {
		const f32 = tensor[i];
		const f32View = new DataView(new ArrayBuffer(4));
		f32View.setFloat32(0, f32, true);
		const u32 = f32View.getUint32(0, true);
		const sign = (u32 >> 31) & 0x1;
		let exp = (u32 >> 23) & 0xff;
		const mant = u32 & 0x7fffff;
		let h: number;
		if (exp === 0xff) {
			h = (sign << 15) | 0x7c00 | (mant !== 0 ? 0x200 : 0);
		} else if (exp === 0) {
			h = sign << 15;
		} else {
			exp = exp - 127 + 15;
			if (exp >= 31) {
				h = (sign << 15) | 0x7c00;
			} else if (exp <= 0) {
				h = sign << 15;
			} else {
				h = (sign << 15) | (exp << 10) | (mant >> 13);
			}
		}
		view.setUint16(i * 2, h, true);
	}
	return out;
}

/**
 * Quantizes an FP32 continuous tensor buffer to INT8 with scale and zero-point.
 * Suitable for Ampere RTX DP4A / INT8 Tensor Core acceleration.
 */
export function quantizeFloat32ToInt8(tensor: Float32Array): {
	data: Int8Array;
	scale: number;
	zeroPoint: number;
} {
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < tensor.length; i++) {
		const v = tensor[i];
		if (v < min) min = v;
		if (v > max) max = v;
	}
	if (min === max || !isFinite(min) || !isFinite(max)) {
		return { data: new Int8Array(tensor.length), scale: 1.0, zeroPoint: 0 };
	}
	const scale = (max - min) / 255.0;
	const zeroPoint = Math.round(-min / scale) - 128;
	const data = new Int8Array(tensor.length);
	for (let i = 0; i < tensor.length; i++) {
		const q = Math.round(tensor[i] / scale) + zeroPoint;
		data[i] = Math.max(-128, Math.min(127, q));
	}
	return { data, scale, zeroPoint };
}

export interface GroundedTopkRecommendationV1 {
	rank: number;
	canonicalId: string;
	packetKey: string;
	sourceRef: string;
	sourceRevision: string;
	evidenceRefs: string[];
	denseRelevance: number;
	sparseRelevance: number;
	rrfScore: number;
	crossEncoderScore: number;
	compositeScore: number;
}

/**
 * Extracts paginated Top-K grounded recommendations from an ingested and decoded RPC packet.
 * Prevents generative LLM drift by mapping token contexts back to exact symbols, refs, and evidence.
 */
export function paginateTopkRecommendationsFromPacketV1(
	decoded: ReturnType<typeof decodeFeatureRowRpcPacketV1>,
	options: { page?: number; pageSize?: number } = {},
): {
	page: number;
	pageSize: number;
	totalCandidates: number;
	totalPages: number;
	items: GroundedTopkRecommendationV1[];
} {
	const page = Math.max(1, options.page ?? 1);
	const pageSize = Math.max(1, options.pageSize ?? 10);
	const totalCandidates = decoded.shape[0];
	const cols = decoded.shape[1];

	const candidates: GroundedTopkRecommendationV1[] = [];
	for (let row = 0; row < totalCandidates; row++) {
		const offset = row * cols;
		const dense = decoded.tensor[offset + 0] ?? 0;
		const sparse = decoded.tensor[offset + 1] ?? 0;
		const rrf = decoded.tensor[offset + 2] ?? 0;
		const crossEncoder = decoded.tensor[offset + 8] ?? 0;
		const compositeScore = rrf;

		candidates.push({
			rank: 0,
			canonicalId: decoded.canonicalIds[row],
			packetKey: decoded.candidatePacketKeys[row],
			sourceRef: decoded.sourceRefs[row],
			sourceRevision: decoded.sourceRevisions[row],
			evidenceRefs: decoded.evidenceRefs[row],
			denseRelevance: dense,
			sparseRelevance: sparse,
			rrfScore: rrf,
			crossEncoderScore: crossEncoder,
			compositeScore,
		});
	}

	candidates.sort((a, b) => b.compositeScore - a.compositeScore);
	candidates.forEach((c, i) => {
		c.rank = i + 1;
	});

	const totalPages = Math.max(1, Math.ceil(totalCandidates / pageSize));
	const startIndex = (page - 1) * pageSize;
	const items = candidates.slice(startIndex, startIndex + pageSize);

	return {
		page,
		pageSize,
		totalCandidates,
		totalPages,
		items,
	};
}

export const FEATURE_ROW_RPC_RESULT_ENVELOPE_SCHEMA_V1 = 'atlas.feature-row-rpc-result-envelope.v1' as const;

export const FeatureRowRpcResultEnvelopeV1Schema = z
	.object({
		schema: z.literal(FEATURE_ROW_RPC_RESULT_ENVELOPE_SCHEMA_V1),
		inputPacketChecksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		ordinalBindingChecksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable().optional(),
		workspaceRevision: z.string().min(1),
		modelRevision: z.string().min(1),
		rankingAlgorithm: z.string().min(1),
		selectedOrdinals: z.array(z.number().int().nonnegative()),
		selectedCanonicalIds: z.array(z.string().min(1)),
		scores: z.array(z.number()),
		executionReceiptSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		artifactRef: z.string().nullable().optional(),
		checksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
	})
	.strict()
	.superRefine((env, ctx) => {
		if (env.selectedOrdinals.length !== env.selectedCanonicalIds.length) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SELECTED_ORDINALS_CANONICAL_IDS_LENGTH_MISMATCH' });
		}
		if (env.selectedOrdinals.length !== env.scores.length) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SELECTED_ORDINALS_SCORES_LENGTH_MISMATCH' });
		}
	});

export type FeatureRowRpcResultEnvelopeV1 = z.infer<typeof FeatureRowRpcResultEnvelopeV1Schema>;

export function createFeatureRowRpcResultEnvelopeV1(input: {
	inputPacket: FeatureRowRpcPacketV1;
	ordinalBinding?: FeatureRowRpcOrdinalBindingV1 | null;
	modelRevision: string;
	rankingAlgorithm: string;
	selectedOrdinals: number[];
	selectedCanonicalIds: string[];
	scores: number[];
	executionReceiptSha256: string;
	artifactRef?: string | null;
}): FeatureRowRpcResultEnvelopeV1 {
	FeatureRowRpcPacketV1Schema.parse(input.inputPacket);
	if (input.ordinalBinding) {
		FeatureRowRpcOrdinalBindingV1Schema.parse(input.ordinalBinding);
		if (input.ordinalBinding.packetChecksumSha256 !== input.inputPacket.checksumSha256) {
			throw new Error('FEATURE_ROW_RPC_RESULT_ORDINAL_BINDING_MISMATCH');
		}
	}
	if (
		input.selectedOrdinals.length !== input.selectedCanonicalIds.length ||
		input.selectedOrdinals.length !== input.scores.length
	) {
		throw new Error('FEATURE_ROW_RPC_RESULT_LENGTH_MISMATCH');
	}

	const base = {
		schema: FEATURE_ROW_RPC_RESULT_ENVELOPE_SCHEMA_V1,
		inputPacketChecksumSha256: input.inputPacket.checksumSha256,
		ordinalBindingChecksumSha256: input.ordinalBinding?.checksumSha256 ?? null,
		workspaceRevision: input.inputPacket.workspaceRevision,
		modelRevision: input.modelRevision,
		rankingAlgorithm: input.rankingAlgorithm,
		selectedOrdinals: [...input.selectedOrdinals],
		selectedCanonicalIds: [...input.selectedCanonicalIds],
		scores: [...input.scores],
		executionReceiptSha256: input.executionReceiptSha256,
		artifactRef: input.artifactRef ?? null,
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};
	const checksumSha256 = sha256(JSON.stringify(base));
	return FeatureRowRpcResultEnvelopeV1Schema.parse({
		...base,
		checksumSha256,
	});
}

export function verifyFeatureRowRpcResultEnvelopeV1(
	envelope: FeatureRowRpcResultEnvelopeV1,
	expectedInputPacket: FeatureRowRpcPacketV1,
): boolean {
	const parsedEnv = FeatureRowRpcResultEnvelopeV1Schema.parse(envelope);
	const parsedPacket = FeatureRowRpcPacketV1Schema.parse(expectedInputPacket);

	if (parsedEnv.inputPacketChecksumSha256 !== parsedPacket.checksumSha256) {
		return false;
	}
	if (parsedEnv.workspaceRevision !== parsedPacket.workspaceRevision) {
		return false;
	}
	const { checksumSha256, ...base } = parsedEnv;
	return checksumSha256 === sha256(JSON.stringify(base));
}

// ============================================================================
// Phase 17: Low-Rank Keyframe Chunk (v2, 64-Byte) & TurboVec 24B SIMT Mappings
// ============================================================================

export const LOWRANK_KEYFRAME_CHUNK_SIZE_V2 = 64 as const;
export const TURBOVEC_FEATURE_ROW_SIZE_24B = 24 as const;

export interface LowRankKeyframeChunk64BV2 {
	morton: number;
	ordinal: number;
	cluster: number;
	reserved: number;
	pos: [number, number, number];
	finalScore: number;
	feature: [number, number, number, number, number, number, number, number];
}

export interface TurboVecFeatureRow24B {
	lexical: number;
	dense: number;
	sparse: number;
	pagerank: number;
	clusterId: number;
	flags: number;
	ordinal: number;
}

/**
 * Decodes contiguous 64-byte keyframe chunks (v2 layout):
 * u32 morton | u32 ordinal | u16 cluster | u16 reserved (0) |
 * f32 pos[3] | f64 finalScore | f32 feature[8]
 */
export function decodeLowRankKeyframeChunks64BV2(
	bytes: Uint8Array | ArrayBuffer,
	expectedCount?: number,
): LowRankKeyframeChunk64BV2[] {
	const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	if (buf.byteLength % LOWRANK_KEYFRAME_CHUNK_SIZE_V2 !== 0) {
		throw new Error(
			`CHUNK_BUFFER_MISALIGNED: byteLength ${buf.byteLength} is not a multiple of ${LOWRANK_KEYFRAME_CHUNK_SIZE_V2}`,
		);
	}
	const count = buf.byteLength / LOWRANK_KEYFRAME_CHUNK_SIZE_V2;
	if (expectedCount !== undefined && count !== expectedCount) {
		throw new Error(`CHUNK_COUNT_MISMATCH: expected ${expectedCount}, got ${count}`);
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const records: LowRankKeyframeChunk64BV2[] = new Array(count);

	for (let i = 0; i < count; i++) {
		const offset = i * LOWRANK_KEYFRAME_CHUNK_SIZE_V2;
		const ordinal = view.getUint32(offset + 4, true);
		const reserved = view.getUint16(offset + 10, true);
		if (reserved !== 0) {
			throw new Error(`RESERVED_NONZERO_AT_INDEX_${i}: got ${reserved}`);
		}
		records[i] = {
			morton: view.getUint32(offset, true),
			ordinal,
			cluster: view.getUint16(offset + 8, true),
			reserved,
			pos: [
				view.getFloat32(offset + 12, true),
				view.getFloat32(offset + 16, true),
				view.getFloat32(offset + 20, true),
			],
			finalScore: view.getFloat64(offset + 24, true),
			feature: [
				view.getFloat32(offset + 32, true),
				view.getFloat32(offset + 36, true),
				view.getFloat32(offset + 40, true),
				view.getFloat32(offset + 44, true),
				view.getFloat32(offset + 48, true),
				view.getFloat32(offset + 52, true),
				view.getFloat32(offset + 56, true),
				view.getFloat32(offset + 60, true),
			],
		};
	}
	return records;
}

/**
 * Encodes keyframe chunks into contiguous 64-byte little-endian records.
 */
export function encodeLowRankKeyframeChunks64BV2(chunks: LowRankKeyframeChunk64BV2[]): Uint8Array {
	const out = new Uint8Array(chunks.length * LOWRANK_KEYFRAME_CHUNK_SIZE_V2);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

	for (let i = 0; i < chunks.length; i++) {
		const offset = i * LOWRANK_KEYFRAME_CHUNK_SIZE_V2;
		const c = chunks[i];
		view.setUint32(offset, c.morton, true);
		view.setUint32(offset + 4, c.ordinal, true);
		view.setUint16(offset + 8, c.cluster, true);
		view.setUint16(offset + 10, 0, true);
		view.setFloat32(offset + 12, c.pos[0], true);
		view.setFloat32(offset + 16, c.pos[1], true);
		view.setFloat32(offset + 20, c.pos[2], true);
		view.setFloat64(offset + 24, c.finalScore, true);
		for (let k = 0; k < 8; k++) {
			view.setFloat32(offset + 32 + 4 * k, c.feature[k] ?? 0, true);
		}
	}
	return out;
}

/**
 * Decodes contiguous 24-byte TurboVec feature rows:
 * f32 lexical | f32 dense | f32 sparse | f32 pagerank | u16 clusterId | u16 flags | u32 ordinal
 */
export function decodeTurboVecFeatureRows24B(
	bytes: Uint8Array | ArrayBuffer,
	expectedCount?: number,
): TurboVecFeatureRow24B[] {
	const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	if (buf.byteLength % TURBOVEC_FEATURE_ROW_SIZE_24B !== 0) {
		throw new Error(
			`TURBOVEC_BUFFER_MISALIGNED: byteLength ${buf.byteLength} is not a multiple of ${TURBOVEC_FEATURE_ROW_SIZE_24B}`,
		);
	}
	const count = buf.byteLength / TURBOVEC_FEATURE_ROW_SIZE_24B;
	if (expectedCount !== undefined && count !== expectedCount) {
		throw new Error(`TURBOVEC_ROW_COUNT_MISMATCH: expected ${expectedCount}, got ${count}`);
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const rows: TurboVecFeatureRow24B[] = new Array(count);

	for (let i = 0; i < count; i++) {
		const offset = i * TURBOVEC_FEATURE_ROW_SIZE_24B;
		rows[i] = {
			lexical: view.getFloat32(offset, true),
			dense: view.getFloat32(offset + 4, true),
			sparse: view.getFloat32(offset + 8, true),
			pagerank: view.getFloat32(offset + 12, true),
			clusterId: view.getUint16(offset + 16, true),
			flags: view.getUint16(offset + 18, true),
			ordinal: view.getUint32(offset + 20, true),
		};
	}
	return rows;
}

/**
 * Encodes 24-byte TurboVec feature rows into a contiguous Uint8Array.
 */
export function encodeTurboVecFeatureRows24B(rows: TurboVecFeatureRow24B[]): Uint8Array {
	const out = new Uint8Array(rows.length * TURBOVEC_FEATURE_ROW_SIZE_24B);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

	for (let i = 0; i < rows.length; i++) {
		const offset = i * TURBOVEC_FEATURE_ROW_SIZE_24B;
		const r = rows[i];
		view.setFloat32(offset, r.lexical, true);
		view.setFloat32(offset + 4, r.dense, true);
		view.setFloat32(offset + 8, r.sparse, true);
		view.setFloat32(offset + 12, r.pagerank, true);
		view.setUint16(offset + 16, r.clusterId, true);
		view.setUint16(offset + 18, r.flags, true);
		view.setUint32(offset + 20, r.ordinal, true);
	}
	return out;
}

