import { describe, it, expect, vi } from 'vitest';
import {
	bitnetPolynomialSurrogate,
	bitnetPolynomialDerivative,
	quantizeBitnetUnipolar,
	renderGlyphTokensToPixelBuffer,
	buildGlyphTokenCacheKeyV1,
	cacheGlyphTokenEnvelopeV1,
	readCachedGlyphTokenEnvelopeV1,
	deriveLoDTierFromHeadroom,
	computeHeadroomCoupledLuminance,
	type GlyphTokenEnvelopeV1,
} from './nes-glyph-canvas-renderer-v1.js';
import { encodeSparseRoutingByte } from '../tensors/sparse-routing-bit-packer-v1.js';
import type { RedisLike } from '../cache/lod-ladder-cache-adapter-v1.js';

describe('NES Glyph Canvas Renderer & BitNet Polynomial V1', () => {
	const sampleChecksum = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

	describe('1. BitNet {0, 1} Polynomial Surrogate & Derivative', () => {
		it('evaluates cubic Hermite surrogate P(x) = 3x^2 - 2x^3 accurately', () => {
			expect(bitnetPolynomialSurrogate(0)).toBe(0);
			expect(bitnetPolynomialSurrogate(1)).toBe(1);
			expect(bitnetPolynomialSurrogate(0.5)).toBe(0.5);

			// Test monotonicity and boundary clamping
			expect(bitnetPolynomialSurrogate(-0.5)).toBe(0);
			expect(bitnetPolynomialSurrogate(1.5)).toBe(1);
			expect(bitnetPolynomialSurrogate(0.8)).toBeCloseTo(0.896, 3);
		});

		it('evaluates surrogate derivative dP/dx = 6x(1-x) for gradient flow', () => {
			expect(bitnetPolynomialDerivative(0)).toBe(0);
			expect(bitnetPolynomialDerivative(1)).toBe(0);
			expect(bitnetPolynomialDerivative(0.5)).toBe(1.5);
			expect(bitnetPolynomialDerivative(0.2)).toBeCloseTo(0.96, 2);
		});

		it('quantizes unipolar weight using BitNet surrogate', () => {
			const active = quantizeBitnetUnipolar(0.8, 1.0);
			expect(active.gate).toBe(1);
			expect(active.smoothSurrogate).toBeGreaterThan(0.5);
			expect(active.quantizedWeight).toBe(1.0);

			const pruned = quantizeBitnetUnipolar(0.2, 1.0);
			expect(pruned.gate).toBe(0);
			expect(pruned.smoothSurrogate).toBeLessThan(0.5);
			expect(pruned.quantizedWeight).toBe(0.0);
		});
	});

	describe('2. NES Sprite Pixel Buffer Synthesis for HTML5 Canvas', () => {
		it('renders active and pruned tokens with correct alpha and palette luminance', () => {
			const width = 2;
			const height = 1;
			// Token 0: Active with shifter 100 (high luminance)
			// Token 1: Pruned with shifter 10 (low luminance)
			const byte0 = encodeSparseRoutingByte(true, 100);
			const byte1 = encodeSparseRoutingByte(false, 10);
			const packedBytes = new Uint8Array([byte0, byte1]);

			const buffer = renderGlyphTokensToPixelBuffer(packedBytes, width, height);
			expect(buffer.width).toBe(2);
			expect(buffer.height).toBe(1);
			expect(buffer.data.length).toBe(2 * 1 * 4); // 8 bytes RGBA

			// Pixel 0 (Active)
			expect(buffer.data[0]).toBe(computeHeadroomCoupledLuminance(100, 5, 1.0)); // R (luminance coupled to LoD 5)
			expect(buffer.data[1]).toBe(220); // G (YoRHa HUD Green)
			expect(buffer.data[3]).toBe(255); // Alpha = 255 (Active)

			// Pixel 1 (Pruned)
			expect(buffer.data[4]).toBe(30);  // Dark muted R
			expect(buffer.data[5]).toBe(30);  // Dark muted G
			expect(buffer.data[6]).toBe(30);  // Dark muted B
			expect(buffer.data[7]).toBe(40);  // Alpha = 40 (Semi-transparent ghost)
		});
	});

	describe('3. Redis-Valkey Transport & Session Caching', () => {
		it('generates canonical cache key with LoD tier and hex64 checksum', () => {
			const key = buildGlyphTokenCacheKeyV1(3, sampleChecksum);
			expect(key).toBe(`ace:glyph:token:3:${sampleChecksum}`);
		});

		it('writes and reads envelope with simulated Redis client', async () => {
			const mockStorage = new Map<string, string>();
			const mockRedis: RedisLike = {
				get: vi.fn(async (key: string) => mockStorage.get(key) ?? null),
				set: vi.fn(async (key: string, val: string) => {
					mockStorage.set(key, val);
					return 'OK';
				}),
				del: vi.fn(async () => 1),
			};

			const envelope: GlyphTokenEnvelopeV1 = {
				schema: 'atlas.nes-glyph-renderer.v1',
				lodTier: 5,
				tokenCount: 64,
				canvasWidth: 8,
				canvasHeight: 8,
				hex64Checksum: sampleChecksum,
				encodedBase64Payload: Buffer.from([1, 2, 3, 4]).toString('base64'),
				cacheKey: buildGlyphTokenCacheKeyV1(5, sampleChecksum),
				canonicalAuthority: false,
				writesPerformed: false,
			};

			const cached = await cacheGlyphTokenEnvelopeV1(envelope, mockRedis, 300);
			expect(cached.success).toBe(true);

			const retrieved = await readCachedGlyphTokenEnvelopeV1(envelope.cacheKey, mockRedis);
			expect(retrieved).not.toBeNull();
			expect(retrieved?.lodTier).toBe(5);
			expect(retrieved?.canvasWidth).toBe(8);
			expect(retrieved?.canonicalAuthority).toBe(false);
		});
	});

	describe('4. Netflix-Style Headroom Proxy & Datastore LoD Coupling', () => {
		it('derives constrained LoD Tier 1..5 when GPU/RAM headroom is low or latency is high', () => {
			const lowVramTier = deriveLoDTierFromHeadroom({
				gpuFreeBytes: 1024 * 1024 * 1024, // 1 GB free of 8 GB (12.5%)
				gpuTotalBytes: 8192 * 1024 * 1024,
				valkeyUsedBytes: 256 * 1024 * 1024,
				ramFreeBytes: 2 * 1024 * 1024 * 1024,
			});
			expect(lowVramTier).toBeGreaterThanOrEqual(1);
			expect(lowVramTier).toBeLessThanOrEqual(5);

			const highLatencyTier = deriveLoDTierFromHeadroom({
				gpuFreeBytes: 4096 * 1024 * 1024, // 50% free
				gpuTotalBytes: 8192 * 1024 * 1024,
				valkeyUsedBytes: 100 * 1024 * 1024,
				ramFreeBytes: 4 * 1024 * 1024 * 1024,
				p99LatencyMs: 350, // High latency penalty
			});
			expect(highLatencyTier).toBeLessThanOrEqual(5);
		});

		it('derives balanced LoD Tier 6..14 (Redis ACE) under moderate headroom', () => {
			const moderateTier = deriveLoDTierFromHeadroom({
				gpuFreeBytes: 4096 * 1024 * 1024, // 50% free
				gpuTotalBytes: 8192 * 1024 * 1024,
				valkeyUsedBytes: 200 * 1024 * 1024,
				ramFreeBytes: 8 * 1024 * 1024 * 1024,
				p99LatencyMs: 45, // Healthy p99
			});
			expect(moderateTier).toBeGreaterThanOrEqual(6);
			expect(moderateTier).toBeLessThanOrEqual(14);
		});

		it('derives high LoD Tier 15..20 (PostgreSQL 18 deep readback) under abundant headroom', () => {
			const abundantTier = deriveLoDTierFromHeadroom({
				gpuFreeBytes: 7000 * 1024 * 1024, // >85% free
				gpuTotalBytes: 8192 * 1024 * 1024,
				valkeyUsedBytes: 50 * 1024 * 1024,
				ramFreeBytes: 16 * 1024 * 1024 * 1024,
				p99LatencyMs: 20,
			});
			expect(abundantTier).toBeGreaterThanOrEqual(15);
			expect(abundantTier).toBeLessThanOrEqual(20);
		});

		it('scales NES luminance dynamically according to headroom ratio and LoD tier', () => {
			const shifter = 100;
			// Constrained headroom (0.3) dims canvas luminance
			const dimLuminance = computeHeadroomCoupledLuminance(shifter, 3, 0.3);
			// Abundant headroom (1.0) with high LoD tier 18 brightens canvas luminance
			const brightLuminance = computeHeadroomCoupledLuminance(shifter, 18, 1.0);

			expect(dimLuminance).toBeLessThan(brightLuminance);
			expect(brightLuminance).toBeGreaterThan(150);
		});
	});
});
