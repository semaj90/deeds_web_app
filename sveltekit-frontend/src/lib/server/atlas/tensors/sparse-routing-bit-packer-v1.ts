import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ALIGNMENT_BYTES } from './aligned-bitset-blob-v1.js';

export const SPARSE_ROUTING_BYTE_MASK = 0x80; // Bit 7: 1 = sparse active, 0 = pruned
export const SHIFTER_7BIT_MASK = 0x7f;        // Bits 0..6: 7-bit AVX2 tensor shifter (0..127)

export const SparseRoutingEntrySchema = z.object({
	candidateId: z.string().min(1),
	sparseActive: z.boolean(),
	shifter7: z.number().int().min(0).max(127),
});

export type SparseRoutingEntry = z.infer<typeof SparseRoutingEntrySchema>;

export const PackedSparseRoutingEnvelopeV1Schema = z.object({
	schema: z.literal('atlas.packed-sparse-routing.v1'),
	candidateCount: z.number().int().nonnegative(),
	sparseActiveCount: z.number().int().nonnegative(),
	byteLength: z.number().int().nonnegative(),
	base64Payload: z.string(),
	hex64Checksum: z.string().length(64),
	domainClass: z.string().min(1),
	nesLutClusterId: z.number().int().nonnegative(),
	canonicalAuthority: z.literal(false),
}).strict();

export type PackedSparseRoutingEnvelopeV1 = z.infer<typeof PackedSparseRoutingEnvelopeV1Schema>;

/**
 * Encodes a single candidate's sparse routing state and 7-bit AVX2 shifter into 1 byte.
 * Bit 7: Sparse routing gate (1 = active candidate, 0 = pruned).
 * Bits 0..6: AVX2 tensor packing shifter / quantization level (0..127).
 */
export function encodeSparseRoutingByte(sparseActive: boolean, shifter7: number): number {
	if (shifter7 < 0 || shifter7 > 127 || !Number.isInteger(shifter7)) {
		throw new Error(`SPARSE_ROUTING_INVALID_SHIFTER: expected integer in [0, 127], got ${shifter7}`);
	}
	return (sparseActive ? SPARSE_ROUTING_BYTE_MASK : 0) | (shifter7 & SHIFTER_7BIT_MASK);
}

/**
 * Decodes a 1-byte packed routing token into its sparse flag and 7-bit shifter.
 */
export function decodeSparseRoutingByte(byte: number): { sparseActive: boolean; shifter7: number } {
	return {
		sparseActive: (byte & SPARSE_ROUTING_BYTE_MASK) !== 0,
		shifter7: byte & SHIFTER_7BIT_MASK,
	};
}

/**
 * Packs an array of candidate routing entries into a 64-byte-aligned byte buffer
 * suitable for PostgreSQL bytea, gRPC binary payload, or ACE JSON streaming.
 */
export function packSparseRoutingBuffer(entries: readonly SparseRoutingEntry[]): {
	buffer: Uint8Array;
	sparseActiveCount: number;
	hex64Checksum: string;
} {
	const count = entries.length;
	// Align to 64-byte boundary for AVX-512 / AVX2 DMA alignment
	const alignedLength = Math.max(ALIGNMENT_BYTES, Math.ceil(count / ALIGNMENT_BYTES) * ALIGNMENT_BYTES);
	const buffer = new Uint8Array(alignedLength);

	let activeCount = 0;
	for (let i = 0; i < count; i++) {
		const entry = entries[i];
		if (entry.sparseActive) activeCount++;
		buffer[i] = encodeSparseRoutingByte(entry.sparseActive, entry.shifter7);
	}

	const hex64Checksum = createHash('sha256').update(buffer.subarray(0, count)).digest('hex');

	return {
		buffer,
		sparseActiveCount: activeCount,
		hex64Checksum,
	};
}

/**
 * Unpacks raw binary bytes (e.g. from gRPC protobuf bytes or PostgreSQL bytea)
 * into candidate routing entries without requiring intermediate Base64 conversion.
 */
export function unpackSparseRoutingBuffer(
	buffer: Uint8Array,
	count: number,
	candidateIds?: readonly string[],
): SparseRoutingEntry[] {
	if (buffer.length < count) {
		throw new Error(
			`SPARSE_ROUTING_BUFFER_UNDERFLOW: expected at least ${count} bytes, got ${buffer.length}`,
		);
	}

	const entries: SparseRoutingEntry[] = new Array(count);
	for (let i = 0; i < count; i++) {
		const decoded = decodeSparseRoutingByte(buffer[i]);
		entries[i] = {
			candidateId: candidateIds ? candidateIds[i] ?? `cand-${i}` : `cand-${i}`,
			sparseActive: decoded.sparseActive,
			shifter7: decoded.shifter7,
		};
	}
	return entries;
}

/**
 * Synthesizes an ACE JSON-compatible routing envelope from candidate entries and NES LUT lookup.
 * Directly portable across gRPC streams, Redis cache, and prompt context injectors.
 */
export function synthesizeAceSparseRoutingEnvelopeV1(input: {
	entries: readonly SparseRoutingEntry[];
	domainClass: string;
	nesLutClusterId: number;
}): PackedSparseRoutingEnvelopeV1 {
	const { buffer, sparseActiveCount, hex64Checksum } = packSparseRoutingBuffer(input.entries);
	const base64Payload = Buffer.from(buffer.subarray(0, input.entries.length)).toString('base64');

	return PackedSparseRoutingEnvelopeV1Schema.parse({
		schema: 'atlas.packed-sparse-routing.v1',
		candidateCount: input.entries.length,
		sparseActiveCount,
		byteLength: input.entries.length,
		base64Payload,
		hex64Checksum,
		domainClass: input.domainClass,
		nesLutClusterId: input.nesLutClusterId,
		canonicalAuthority: false,
	});
}

/**
 * Applies the 1-bit sparse routing mask and 7-bit scale shift to an FP32 feature tensor.
 * Emulates the AVX2 SIMD kernel behavior:
 * - If bit 7 is 0, the row is zeroed out (pruned).
 * - If bit 7 is 1, the row is scaled by 2^((shifter7 - 64) / 16) for tensor core alignment.
 */
export function applyAvx2SparseRoutingToFloatTensor(
	tensor: Float32Array,
	cols: number,
	packedBytes: Uint8Array,
): Float32Array {
	const rows = Math.floor(tensor.length / cols);
	const out = new Float32Array(tensor.length);

	for (let r = 0; r < rows; r++) {
		const byte = packedBytes[r] ?? 0;
		const { sparseActive, shifter7 } = decodeSparseRoutingByte(byte);

		if (!sparseActive) {
			// Zero out row
			continue;
		}

		// Power-of-two scale multiplier centered at shifter=64
		const scaleMultiplier = Math.pow(2, (shifter7 - 64) / 16);
		const rowOffset = r * cols;

		for (let c = 0; c < cols; c++) {
			out[rowOffset + c] = tensor[rowOffset + c] * scaleMultiplier;
		}
	}

	return out;
}

/**
 * Fail-closed 1-Bit / 7-Bit BitNet Polynomial Encoder with Lineage Gate.
 * Enforces fail-closed protection over PostgreSQL atlas_feature_map and UNRESOLVED ontology tuples:
 * 1. If AIO bitmap failed or canonical lineage is required but unverified -> outputs 0x00 (Pruned).
 * 2. Maps cosine similarity [-1, 1] -> [0, 1] and applies Smoothstep cubic polynomial: P(u) = 3u^2 - 2u^3.
 * 3. Modulates 7-bit shifter by polynomial confidence; caps at s_i <= 48 (gamma(s_i) <= 0.5x) if lineage is unverified.
 * 4. Packs Bit 7 (0x80) + 7-bit shifter (0x7F).
 */
export function encodeBitNetPolynomialRoutingByte(params: {
	passedAioBitmap: boolean;
	isCanonicalLineageVerified: boolean;
	requireCanonicalLineage: boolean;
	dotProductNormalized: number; // in [-1.0, 1.0]
	baseShifter7: number;         // in [0, 127], centered at 64
}): number {
	// 1. Fail-closed gate: prune if AIO bitmap failed or canonical lineage is required but missing
	const activeGate =
		params.passedAioBitmap &&
		(!params.requireCanonicalLineage || params.isCanonicalLineageVerified);

	if (!activeGate) {
		return 0x00; // Bit 7 = 0 (Pruned), Bits 6..0 = 0
	}

	// 2. Map cosine similarity [-1, 1] -> [0, 1] and apply Smoothstep cubic polynomial 3u^2 - 2u^3
	const u = Math.max(0.0, Math.min(1.0, 0.5 * (1.0 + params.dotProductNormalized)));
	const poly01 = u * u * (3.0 - 2.0 * u); // strictly in [0.0, 1.0]

	// 3. Modulate 7-bit shifter by polynomial confidence; cap if lineage is unverified
	const rawShifter = Math.round(params.baseShifter7 * poly01);
	const maxAllowedShifter = params.isCanonicalLineageVerified ? 127 : 48; // 48 => 2^(-1) = 0.5x cap
	const clampedShifter = Math.max(0, Math.min(maxAllowedShifter, rawShifter)) & 0x7f;

	// 4. Pack MSB (0x80) + 7-bit shifter (0x7F)
	return 0x80 | clampedShifter;
}
