import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getValkeyClient } from '../../cache/valkey-client.js';
import {
	float32ToFloat16Bytes,
	quantizeFloat32ToInt8,
	FEATURE_ROW_NUMERIC_COLS,
} from '../transport/feature-row-rpc-packet-v1.js';
import {
	encodeSparseRoutingByte,
	decodeSparseRoutingByte,
	packSparseRoutingBuffer,
	type SparseRoutingEntry,
} from '../tensors/sparse-routing-bit-packer-v1.js';

export const LOD_CACHE_ENTRY_SCHEMA_V1 = 'atlas.lod-cache-entry.v1' as const;

export type LoDTierGroup = 'LOD_1_5' | 'LOD_6_14' | 'LOD_15_20';
export type LoDQuantizationDepth = 'INT8_1BIT_7BIT' | 'FP16_HALF' | 'FP32_FULL';
export type LoDStorageTarget = 'HOT_VALKEY' | 'ACE_REDIS' | 'POSTGRES_READBACK';

export interface LoDCharacteristics {
	tier: number;
	tierGroup: LoDTierGroup;
	quantizationDepth: LoDQuantizationDepth;
	bytesPerRow: number;
	storageTarget: LoDStorageTarget;
	keyPrefix: string;
	ttlSeconds: number;
	maxCandidates: number;
	strategy: string;
	costEstimateUsd: number;
}

/**
 * Returns structural compute and cache invariants for a given LoD compute budget tier ($1..$20).
 * Defined in alignment with ast_chunk_routing_helpers_v2.py.
 */
export function getLoDCharacteristics(tier: number): LoDCharacteristics {
	const clampedTier = Math.min(20, Math.max(1, Math.floor(tier)));

	if (clampedTier <= 5) {
		return {
			tier: clampedTier,
			tierGroup: 'LOD_1_5',
			quantizationDepth: 'INT8_1BIT_7BIT',
			bytesPerRow: 10,
			storageTarget: 'HOT_VALKEY',
			keyPrefix: 'valkey:lod:hot:',
			ttlSeconds: 300, // 5 minutes
			maxCandidates: 10,
			strategy: 'Top-10 pruned candidate beam, NES LUT pre-filter only',
			costEstimateUsd: clampedTier * 1.0,
		};
	} else if (clampedTier <= 14) {
		return {
			tier: clampedTier,
			tierGroup: 'LOD_6_14',
			quantizationDepth: 'FP16_HALF',
			bytesPerRow: 20,
			storageTarget: 'ACE_REDIS',
			keyPrefix: 'redis:lod:ace:',
			ttlSeconds: 3600, // 1 hour
			maxCandidates: 50,
			strategy: 'Top-50 candidates, PageRank authority + AST affinity',
			costEstimateUsd: clampedTier * 1.0,
		};
	} else {
		return {
			tier: clampedTier,
			tierGroup: 'LOD_15_20',
			quantizationDepth: 'FP32_FULL',
			bytesPerRow: 40,
			storageTarget: 'POSTGRES_READBACK',
			keyPrefix: 'pg:lod:full:',
			ttlSeconds: 86400, // 24 hours
			maxCandidates: 200,
			strategy: 'Full corpus deep graph traversal + Cross-Encoder reranking',
			costEstimateUsd: clampedTier * 1.0,
		};
	}
}

export const LoDCacheEntryV1Schema = z
	.object({
		schema: z.literal(LOD_CACHE_ENTRY_SCHEMA_V1),
		cacheKey: z.string().min(1),
		lodTier: z.number().int().min(1).max(20),
		tierGroup: z.enum(['LOD_1_5', 'LOD_6_14', 'LOD_15_20']),
		quantizationDepth: z.enum(['INT8_1BIT_7BIT', 'FP16_HALF', 'FP32_FULL']),
		storageTarget: z.enum(['HOT_VALKEY', 'ACE_REDIS', 'POSTGRES_READBACK']),
		queryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
		candidateRevision: z.string().min(1),
		candidateIds: z.array(z.string().min(1)),
		rowCount: z.number().int().nonnegative(),
		bytesPerRow: z.number().int().positive(),
		totalByteLength: z.number().int().nonnegative(),
		encodedBase64Payload: z.string(),
		payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
		titansMirasMetadata: z
			.object({
				surpriseGradNorm: z.number().finite().optional(),
				retentionGateAlpha: z.number().finite().optional(),
				kvBlockId: z.number().int().optional(),
			})
			.optional(),
		scale: z.number().finite().optional(),
		zeroPoint: z.number().finite().optional(),
		ttlSeconds: z.number().int().positive(),
		createdAt: z.string().datetime(),
		expiresAt: z.string().datetime(),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
		canonicalAdmission: z.literal('NOT_ADMITTED'),
	})
	.strict();

export type LoDCacheEntryV1 = z.infer<typeof LoDCacheEntryV1Schema>;

export interface RedisLike {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, mode?: string, duration?: number): Promise<unknown>;
	del(key: string | string[]): Promise<number>;
	ping?(): Promise<string>;
}

export function buildLoDCacheKeyV1(input: {
	tier: number;
	queryChecksum: string;
	candidateRevision: string;
}): string {
	const chars = getLoDCharacteristics(input.tier);
	const qShort = input.queryChecksum.slice(0, 16);
	const cShort = input.candidateRevision.slice(0, 16);
	return `${chars.keyPrefix}${chars.tier}:${qShort}:${cShort}`;
}

/**
 * Converts IEEE 754 half-precision (FP16) 16-bit float buffer back to Float32Array.
 */
export function float16BytesToFloat32(bytes: Uint8Array): Float32Array {
	const count = Math.floor(bytes.byteLength / 2);
	const out = new Float32Array(count);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	for (let i = 0; i < count; i++) {
		const h = view.getUint16(i * 2, true);
		const sign = (h & 0x8000) >> 15;
		const exp = (h & 0x7c00) >> 10;
		const mant = h & 0x03ff;

		if (exp === 0) {
			if (mant === 0) {
				out[i] = sign ? -0.0 : 0.0;
			} else {
				// Subnormal
				out[i] = (sign ? -1 : 1) * Math.pow(2, -14) * (mant / 1024);
			}
		} else if (exp === 31) {
			out[i] = mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
		} else {
			// Normalized
			out[i] = (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + mant / 1024);
		}
	}
	return out;
}

/**
 * Packs continuous Float32 tensor rows according to LoD budget quantization depth:
 * - LoD 1-5: INT8 quantization (10 B/row) with 1-bit sparse gate & 7-bit AVX2 shifter
 * - LoD 6-14: FP16 half-precision (20 B/row)
 * - LoD 15-20: Full FP32 continuous buffer (40 B/row for 10 active fields)
 */
export function packLoDTensorPayloadV1(
	tier: number,
	tensor: Float32Array,
	rowCount: number,
	sparseGates?: boolean[],
): {
	payload: Uint8Array;
	bytesPerRow: number;
	scale?: number;
	zeroPoint?: number;
} {
	const chars = getLoDCharacteristics(tier);

	if (chars.quantizationDepth === 'INT8_1BIT_7BIT') {
		const q = quantizeFloat32ToInt8(tensor);
		const bytesPerRow = 10;
		const totalBytes = rowCount * bytesPerRow;
		const out = new Uint8Array(totalBytes);

		for (let r = 0; r < rowCount; r++) {
			const rowGate = sparseGates ? (sparseGates[r] ?? true) : true;
			const rowOffset = r * bytesPerRow;
			for (let c = 0; c < 10; c++) {
				const val = q.data[r * 10 + c] ?? 0;
				// Map -128..127 into unsigned 7-bit range 0..127 for shifter
				const shifter7 = Math.max(0, Math.min(127, val + 128 >> 1));
				const encoded = encodeSparseRoutingByte(rowGate, shifter7);
				out[rowOffset + c] = encoded;
			}
		}
		return { payload: out, bytesPerRow, scale: q.scale, zeroPoint: q.zeroPoint };
	}

	if (chars.quantizationDepth === 'FP16_HALF') {
		const fp16 = float32ToFloat16Bytes(tensor);
		return { payload: fp16, bytesPerRow: 20 };
	}

	// FP32_FULL (LoD 15-20)
	const byteLen = tensor.byteLength;
	const out = new Uint8Array(byteLen);
	out.set(new Uint8Array(tensor.buffer, tensor.byteOffset, byteLen));
	return { payload: out, bytesPerRow: 40 };
}

/**
 * Unpacks an LoD cached payload back into a continuous Float32Array.
 */
export function unpackLoDTensorPayloadV1(
	entry: LoDCacheEntryV1,
): Float32Array {
	const rawBytes = Buffer.from(entry.encodedBase64Payload, 'base64');

	if (entry.quantizationDepth === 'INT8_1BIT_7BIT') {
		const totalElements = entry.rowCount * 10;
		const out = new Float32Array(totalElements);
		const scale = entry.scale ?? 1.0;
		const zeroPoint = entry.zeroPoint ?? 0;

		for (let i = 0; i < totalElements; i++) {
			const byte = rawBytes[i] ?? 0;
			const decoded = decodeSparseRoutingByte(byte);
			// Reconstruct signed int8 value from 7-bit shifter
			const reconstructedInt8 = (decoded.shifter7 << 1) - 128;
			out[i] = (reconstructedInt8 - zeroPoint) * scale;
		}
		return out;
	}

	if (entry.quantizationDepth === 'FP16_HALF') {
		return float16BytesToFloat32(new Uint8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength));
	}

	// FP32_FULL
	const totalFloats = entry.rowCount * 10;
	const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
	const out = new Float32Array(totalFloats);
	for (let i = 0; i < totalFloats; i++) {
		out[i] = view.getFloat32(i * 4, true);
	}
	return out;
}

/**
 * Builds an immutable, validated LoDCacheEntryV1 record.
 */
export function buildLoDCacheEntryV1(input: {
	tier: number;
	queryChecksum: string;
	candidateRevision: string;
	candidateIds: string[];
	tensor: Float32Array;
	sparseGates?: boolean[];
	titansMirasMetadata?: {
		surpriseGradNorm?: number;
		retentionGateAlpha?: number;
		kvBlockId?: number;
	};
	now?: Date;
}): LoDCacheEntryV1 {
	const chars = getLoDCharacteristics(input.tier);
	const now = input.now ?? new Date();
	const expiresAt = new Date(now.getTime() + chars.ttlSeconds * 1000).toISOString();
	const cacheKey = buildLoDCacheKeyV1({
		tier: chars.tier,
		queryChecksum: input.queryChecksum,
		candidateRevision: input.candidateRevision,
	});

	const rowCount = input.candidateIds.length;
	const { payload, bytesPerRow, scale, zeroPoint } = packLoDTensorPayloadV1(
		chars.tier,
		input.tensor,
		rowCount,
		input.sparseGates,
	);

	const payloadSha256 = createHash('sha256').update(payload).digest('hex');
	const encodedBase64Payload = Buffer.from(payload).toString('base64');

	return LoDCacheEntryV1Schema.parse({
		schema: LOD_CACHE_ENTRY_SCHEMA_V1,
		cacheKey,
		lodTier: chars.tier,
		tierGroup: chars.tierGroup,
		quantizationDepth: chars.quantizationDepth,
		storageTarget: chars.storageTarget,
		queryChecksum: input.queryChecksum,
		candidateRevision: input.candidateRevision,
		candidateIds: [...input.candidateIds],
		rowCount,
		bytesPerRow,
		totalByteLength: payload.byteLength,
		encodedBase64Payload,
		payloadSha256,
		titansMirasMetadata: input.titansMirasMetadata,
		scale,
		zeroPoint,
		ttlSeconds: chars.ttlSeconds,
		createdAt: now.toISOString(),
		expiresAt,
		canonicalAuthority: false,
		writesPerformed: false,
		canonicalAdmission: 'NOT_ADMITTED',
	});
}

export interface LoDCacheWriteReceiptV1 {
	cacheKey: string;
	lodTier: number;
	storageTarget: LoDStorageTarget;
	bytesWritten: number;
	ttlSeconds: number;
	success: boolean;
	writesPerformed: false;
}

/**
 * Writes an LoDCacheEntryV1 record to Valkey/Redis (:6379) with bounded TTL.
 */
export async function writeLoDCacheEntryV1(
	entry: LoDCacheEntryV1,
	redisClient?: RedisLike,
): Promise<LoDCacheWriteReceiptV1> {
	const client = redisClient ?? (getValkeyClient() as unknown as RedisLike);
	const serialized = JSON.stringify(entry);

	await client.set(entry.cacheKey, serialized, 'EX', entry.ttlSeconds);

	return {
		cacheKey: entry.cacheKey,
		lodTier: entry.lodTier,
		storageTarget: entry.storageTarget,
		bytesWritten: entry.totalByteLength,
		ttlSeconds: entry.ttlSeconds,
		success: true,
		writesPerformed: false,
	};
}

/**
 * Reads and validates an LoDCacheEntryV1 record from Valkey/Redis (:6379).
 * Returns null if missing, expired, or invalid.
 */
export async function readLoDCacheEntryV1(
	cacheKey: string,
	redisClient?: RedisLike,
	now: Date = new Date(),
): Promise<LoDCacheEntryV1 | null> {
	const client = redisClient ?? (getValkeyClient() as unknown as RedisLike);
	const raw = await client.get(cacheKey);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw);
		const entry = LoDCacheEntryV1Schema.parse(parsed);

		const expiry = new Date(entry.expiresAt).getTime();
		if (expiry <= now.getTime()) {
			return null;
		}

		// Verify payload SHA-256 integrity
		const payloadBytes = Buffer.from(entry.encodedBase64Payload, 'base64');
		const calculatedHash = createHash('sha256').update(payloadBytes).digest('hex');
		if (calculatedHash !== entry.payloadSha256) {
			return null;
		}

		return entry;
	} catch {
		return null;
	}
}
