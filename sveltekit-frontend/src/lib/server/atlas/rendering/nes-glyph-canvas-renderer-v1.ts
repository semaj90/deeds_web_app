import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getValkeyClient } from '../../cache/valkey-client.js';
import type { RedisLike } from '../cache/lod-ladder-cache-adapter-v1.js';
import {
	SPARSE_ROUTING_BYTE_MASK,
	SHIFTER_7BIT_MASK,
	decodeSparseRoutingByte,
} from '../tensors/sparse-routing-bit-packer-v1.js';

export const NES_GLYPH_SCHEMA_V1 = 'atlas.nes-glyph-renderer.v1' as const;

/**
 * Evaluates the smooth cubic Hermite / Chebyshev polynomial surrogate on x in [0, 1]
 * for BitNet b1.58 {0, 1} quantization:
 * P(x) = 3x^2 - 2x^3
 */
export function bitnetPolynomialSurrogate(x: number): number {
	const clamped = Math.max(0, Math.min(1, x));
	return 3 * Math.pow(clamped, 2) - 2 * Math.pow(clamped, 3);
}

/**
 * First derivative of the BitNet polynomial surrogate for gradient flow:
 * dP/dx = 6x(1 - x)
 */
export function bitnetPolynomialDerivative(x: number): number {
	const clamped = Math.max(0, Math.min(1, x));
	return 6 * clamped * (1 - clamped);
}

/**
 * Quantizes an unipolar FP32 weight/activation into BitNet {0, 1} gate using the polynomial surrogate.
 * W ≈ alpha * Quant(W)
 */
export function quantizeBitnetUnipolar(w: number, alpha: number = 1.0): {
	gate: 0 | 1;
	smoothSurrogate: number;
	quantizedWeight: number;
} {
	const normalized = alpha > 0 ? Math.max(0, Math.min(1, w / alpha)) : 0;
	const smoothSurrogate = bitnetPolynomialSurrogate(normalized);
	const gate = smoothSurrogate >= 0.5 ? 1 : 0;
	return {
		gate,
		smoothSurrogate,
		quantizedWeight: gate * alpha,
	};
}

export const GlyphTokenEnvelopeV1Schema = z
	.object({
		schema: z.literal(NES_GLYPH_SCHEMA_V1),
		lodTier: z.number().int().min(1).max(20),
		tokenCount: z.number().int().nonnegative(),
		canvasWidth: z.number().int().positive(),
		canvasHeight: z.number().int().positive(),
		hex64Checksum: z.string().regex(/^[a-f0-9]{64}$/),
		encodedBase64Payload: z.string(),
		cacheKey: z.string().min(1),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
	})
	.strict();

export type GlyphTokenEnvelopeV1 = z.infer<typeof GlyphTokenEnvelopeV1Schema>;

export function buildGlyphTokenCacheKeyV1(lodTier: number, hex64Checksum: string): string {
	const clampedTier = Math.min(20, Math.max(1, Math.floor(lodTier)));
	return `ace:glyph:token:${clampedTier}:${hex64Checksum}`;
}

export interface NesCanvasPixelBuffer {
	width: number;
	height: number;
	data: Uint8ClampedArray; // RGBA quadruplets, length = width * height * 4
}

/**
 * Renders 1-byte packed routing tokens (or 16-byte glyphs) into an RGBA pixel buffer
 * matching HTML5 Canvas ImageData specification:
 * - Pixel Alpha / Visibility: 255 if Bit 7 = 1 (Sparse Active), 40 if pruned
 * - Palette Color / Intensity: Shifter 7 mapped into 8-bit NES color luminance
 */
export interface HeadroomMetricsV1 {
	gpuFreeBytes: number;
	gpuTotalBytes: number;
	valkeyUsedBytes: number;
	valkeyMaxBytes?: number | null;
	ramFreeBytes: number;
	p99LatencyMs?: number;
}

/**
 * Dynamically maps observed Netflix-style adaptive headroom metrics into an LoD compute budget tier ($1..$20).
 * - Constrained headroom (low VRAM/RAM or high latency) -> Tier 1..5 (Valkey hot cache, INT8 10 B/row)
 * - Moderate headroom -> Tier 6..14 (Redis ACE packets, FP16 20 B/row)
 * - Abundant headroom -> Tier 15..20 (PostgreSQL 18 deep readback, FP32 40 B/row)
 */
export function deriveLoDTierFromHeadroom(headroom: HeadroomMetricsV1): number {
	const gpuRatio = headroom.gpuTotalBytes > 0 ? headroom.gpuFreeBytes / headroom.gpuTotalBytes : 0.5;
	const latencyPenalty = headroom.p99LatencyMs && headroom.p99LatencyMs > 250 ? 0.3 : 0.0;
	const effectiveHeadroom = Math.max(0, Math.min(1, gpuRatio - latencyPenalty));

	if (effectiveHeadroom < 0.35) {
		// Constrained: scale 1..5
		return Math.max(1, Math.min(5, Math.round(1 + effectiveHeadroom * 11.4)));
	} else if (effectiveHeadroom < 0.75) {
		// Moderate: scale 6..14
		const normalized = (effectiveHeadroom - 0.35) / 0.4;
		return Math.max(6, Math.min(14, Math.round(6 + normalized * 8)));
	} else {
		// Abundant: scale 15..20
		const normalized = (effectiveHeadroom - 0.75) / 0.25;
		return Math.max(15, Math.min(20, Math.round(15 + normalized * 5)));
	}
}

/**
 * Calculates NES luminance coupled to the 7-bit AVX2 shifter and the datastore LoD budget tier.
 * Higher LoD tiers and high headroom brighten canvas intensity; constrained headroom dims it.
 */
export function computeHeadroomCoupledLuminance(
	shifter7: number,
	lodTier: number,
	headroomRatio: number = 1.0,
): number {
	const clampedShifter = Math.max(0, Math.min(127, shifter7));
	const clampedTier = Math.max(1, Math.min(20, lodTier));
	const clampedHeadroom = Math.max(0.1, Math.min(1.0, headroomRatio));

	// Base luminance from 7-bit shifter (0..255)
	const rawLuminance = (clampedShifter / 127) * 255;
	// Tier modifier: tier 1 adds 0%, tier 20 adds up to +20% brightness boost
	const tierBoost = 1.0 + (clampedTier - 1) / 95;
	// Dynamic headroom scaling factor
	const scaled = rawLuminance * tierBoost * clampedHeadroom;

	return Math.max(0, Math.min(255, Math.floor(scaled)));
}

export function renderGlyphTokensToPixelBuffer(
	packedBytes: Uint8Array,
	width: number,
	height: number,
	options: {
		lodTier?: number;
		headroomRatio?: number;
	} = {},
): NesCanvasPixelBuffer {
	const pixelCount = width * height;
	const data = new Uint8ClampedArray(pixelCount * 4);
	const lodTier = options.lodTier ?? 5;
	const headroomRatio = options.headroomRatio ?? 1.0;

	for (let i = 0; i < pixelCount; i++) {
		const byte = i < packedBytes.length ? (packedBytes[i] ?? 0) : 0;
		const decoded = decodeSparseRoutingByte(byte);
		const px = i * 4;

		if (decoded.sparseActive) {
			// Sparse Active candidate with Headroom & LoD-coupled luminance
			const luminance = computeHeadroomCoupledLuminance(decoded.shifter7, lodTier, headroomRatio);
			data[px + 0] = luminance;                         // R: intensity
			data[px + 1] = 220;                               // G: YoRHa HUD Green
			data[px + 2] = Math.min(255, 180 + Math.floor(luminance * 0.29)); // B: Cyan-tinted glow
			data[px + 3] = 255;                               // Alpha: Full visibility
		} else {
			// Pruned / inactive candidate
			data[px + 0] = 30;  // Dark muted background
			data[px + 1] = 30;
			data[px + 2] = 30;
			data[px + 3] = 40;  // Semi-transparent ghost
		}
	}

	return {
		width,
		height,
		data,
	};
}

/**
 * Caches a GlyphTokenEnvelopeV1 into Redis/Valkey under ace:glyph:token:{lodTier}:{hex64Checksum}.
 */
export async function cacheGlyphTokenEnvelopeV1(
	envelope: GlyphTokenEnvelopeV1,
	redisClient?: RedisLike,
	ttlSeconds: number = 300,
): Promise<{ success: boolean; cacheKey: string }> {
	const client = redisClient ?? (getValkeyClient() as unknown as RedisLike);
	const serialized = JSON.stringify(envelope);
	await client.set(envelope.cacheKey, serialized, 'EX', ttlSeconds);
	return { success: true, cacheKey: envelope.cacheKey };
}

/**
 * Retrieves a cached GlyphTokenEnvelopeV1 from Redis/Valkey.
 */
export async function readCachedGlyphTokenEnvelopeV1(
	cacheKey: string,
	redisClient?: RedisLike,
): Promise<GlyphTokenEnvelopeV1 | null> {
	const client = redisClient ?? (getValkeyClient() as unknown as RedisLike);
	const raw = await client.get(cacheKey);
	if (!raw) return null;

	try {
		const json = JSON.parse(raw);
		return GlyphTokenEnvelopeV1Schema.parse(json);
	} catch {
		return null;
	}
}
