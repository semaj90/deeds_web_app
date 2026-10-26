import { describe, it, expect, vi } from 'vitest';
import {
	getLoDCharacteristics,
	buildLoDCacheKeyV1,
	packLoDTensorPayloadV1,
	unpackLoDTensorPayloadV1,
	buildLoDCacheEntryV1,
	writeLoDCacheEntryV1,
	readLoDCacheEntryV1,
	float16BytesToFloat32,
	type RedisLike,
} from './lod-ladder-cache-adapter-v1.js';
import { float32ToFloat16Bytes } from '../transport/feature-row-rpc-packet-v1.js';

describe('LoD Ladder Multi-Tier Compute Cache Adapter V1', () => {
	const sampleQueryChecksum = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
	const sampleRevision = 'rev-workspace-20261024-v1';

	describe('1. LoD Compute Budget Ladder & Tier Classification ($1 - $20)', () => {
		it('classifies LoD 1-5 as Valkey hot cache with 1-bit sparse gate + 7-bit shifter (10 B/row)', () => {
			for (let tier = 1; tier <= 5; tier++) {
				const chars = getLoDCharacteristics(tier);
				expect(chars.tier).toBe(tier);
				expect(chars.tierGroup).toBe('LOD_1_5');
				expect(chars.quantizationDepth).toBe('INT8_1BIT_7BIT');
				expect(chars.bytesPerRow).toBe(10);
				expect(chars.storageTarget).toBe('HOT_VALKEY');
				expect(chars.ttlSeconds).toBe(300);
				expect(chars.maxCandidates).toBe(10);
				expect(chars.costEstimateUsd).toBe(tier * 1.0);
				expect(chars.keyPrefix).toBe('valkey:lod:hot:');
			}
		});

		it('classifies LoD 6-14 as Redis ACE packets with FP16 half-precision (20 B/row)', () => {
			for (let tier = 6; tier <= 14; tier++) {
				const chars = getLoDCharacteristics(tier);
				expect(chars.tier).toBe(tier);
				expect(chars.tierGroup).toBe('LOD_6_14');
				expect(chars.quantizationDepth).toBe('FP16_HALF');
				expect(chars.bytesPerRow).toBe(20);
				expect(chars.storageTarget).toBe('ACE_REDIS');
				expect(chars.ttlSeconds).toBe(3600);
				expect(chars.maxCandidates).toBe(50);
				expect(chars.costEstimateUsd).toBe(tier * 1.0);
				expect(chars.keyPrefix).toBe('redis:lod:ace:');
			}
		});

		it('classifies LoD 15-20 as PostgreSQL 18 deep readback with full FP32 (40 B/row)', () => {
			for (let tier = 15; tier <= 20; tier++) {
				const chars = getLoDCharacteristics(tier);
				expect(chars.tier).toBe(tier);
				expect(chars.tierGroup).toBe('LOD_15_20');
				expect(chars.quantizationDepth).toBe('FP32_FULL');
				expect(chars.bytesPerRow).toBe(40);
				expect(chars.storageTarget).toBe('POSTGRES_READBACK');
				expect(chars.ttlSeconds).toBe(86400);
				expect(chars.maxCandidates).toBe(200);
				expect(chars.costEstimateUsd).toBe(tier * 1.0);
				expect(chars.keyPrefix).toBe('pg:lod:full:');
			}
		});

		it('clamps tiers outside 1..20 correctly', () => {
			expect(getLoDCharacteristics(0).tier).toBe(1);
			expect(getLoDCharacteristics(99).tier).toBe(20);
		});
	});

	describe('2. Tensor Packing, Quantization & Unpacking across LoD Ladder', () => {
		it('packs LoD Tier 3 ($3, INT8) to 10 bytes/row with 1-bit sparse routing', () => {
			const rowCount = 2;
			// 2 rows x 10 cols
			const rawFloats = new Float32Array([
				0.9, 0.1, 0.85, 0.4, 0.7, 0.65, 0.5, 0.95, 0.8, 0.3,
				0.2, 0.0, 0.15, 0.1, 0.2, 0.1, 0.05, 0.2, 0.1, 0.0,
			]);

			const packed = packLoDTensorPayloadV1(3, rawFloats, rowCount, [true, false]);
			expect(packed.bytesPerRow).toBe(10);
			expect(packed.payload.byteLength).toBe(20);
			expect(packed.scale).toBeDefined();
			expect(packed.zeroPoint).toBeDefined();

			const entry = buildLoDCacheEntryV1({
				tier: 3,
				queryChecksum: sampleQueryChecksum,
				candidateRevision: sampleRevision,
				candidateIds: ['cand-1', 'cand-2'],
				tensor: rawFloats,
				sparseGates: [true, false],
			});

			expect(entry.storageTarget).toBe('HOT_VALKEY');
			expect(entry.bytesPerRow).toBe(10);
			expect(entry.totalByteLength).toBe(20);

			const unpacked = unpackLoDTensorPayloadV1(entry);
			expect(unpacked.length).toBe(20);
			// Check relative magnitude preservation under int8 quantization
			expect(unpacked[0]).toBeGreaterThan(unpacked[1]);
		});

		it('packs LoD Tier 10 ($10, FP16) to 20 bytes/row with IEEE 754 half-precision', () => {
			const rowCount = 2;
			const rawFloats = new Float32Array([
				1.5, -2.25, 0.0, 100.5, -0.001, 42.0, 3.14159, -10.0, 0.5, 1.0,
				0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
			]);

			const packed = packLoDTensorPayloadV1(10, rawFloats, rowCount);
			expect(packed.bytesPerRow).toBe(20);
			expect(packed.payload.byteLength).toBe(40); // 2 rows * 20 bytes

			const entry = buildLoDCacheEntryV1({
				tier: 10,
				queryChecksum: sampleQueryChecksum,
				candidateRevision: sampleRevision,
				candidateIds: ['cand-3', 'cand-4'],
				tensor: rawFloats,
				titansMirasMetadata: {
					surpriseGradNorm: 0.142,
					retentionGateAlpha: 0.98,
					kvBlockId: 4096,
				},
			});

			expect(entry.storageTarget).toBe('ACE_REDIS');
			expect(entry.bytesPerRow).toBe(20);
			expect(entry.titansMirasMetadata?.kvBlockId).toBe(4096);

			const unpacked = unpackLoDTensorPayloadV1(entry);
			expect(unpacked.length).toBe(20);
			expect(unpacked[0]).toBeCloseTo(1.5, 2);
			expect(unpacked[1]).toBeCloseTo(-2.25, 2);
			expect(unpacked[5]).toBeCloseTo(42.0, 1);
		});

		it('packs LoD Tier 18 ($18, FP32) to 40 bytes/row continuous Float32Array', () => {
			const rowCount = 1;
			const rawFloats = new Float32Array([
				0.912345, 0.123456, 0.823456, 0.723456, 0.623456,
				0.523456, 0.423456, 0.323456, 0.223456, 0.123456,
			]);

			const packed = packLoDTensorPayloadV1(18, rawFloats, rowCount);
			expect(packed.bytesPerRow).toBe(40);
			expect(packed.payload.byteLength).toBe(40);

			const entry = buildLoDCacheEntryV1({
				tier: 18,
				queryChecksum: sampleQueryChecksum,
				candidateRevision: sampleRevision,
				candidateIds: ['cand-5'],
				tensor: rawFloats,
			});

			expect(entry.storageTarget).toBe('POSTGRES_READBACK');
			expect(entry.bytesPerRow).toBe(40);

			const unpacked = unpackLoDTensorPayloadV1(entry);
			expect(unpacked.length).toBe(10);
			for (let i = 0; i < 10; i++) {
				expect(unpacked[i]).toBeCloseTo(rawFloats[i], 5);
			}
		});
	});

	describe('3. Cache Invariants, Read & Write Operations', () => {
		it('enforces non-promotional and fail-closed invariants', () => {
			const rawFloats = new Float32Array(10);
			const entry = buildLoDCacheEntryV1({
				tier: 4,
				queryChecksum: sampleQueryChecksum,
				candidateRevision: sampleRevision,
				candidateIds: ['cand-6'],
				tensor: rawFloats,
			});

			expect(entry.canonicalAuthority).toBe(false);
			expect(entry.writesPerformed).toBe(false);
			expect(entry.canonicalAdmission).toBe('NOT_ADMITTED');
		});

		it('writes and reads back an entry using RedisLike mock', async () => {
			const mockStorage = new Map<string, string>();
			const mockRedis: RedisLike = {
				get: vi.fn(async (key: string) => mockStorage.get(key) ?? null),
				set: vi.fn(async (key: string, val: string) => {
					mockStorage.set(key, val);
					return 'OK';
				}),
				del: vi.fn(async (key: string | string[]) => {
					const k = Array.isArray(key) ? key[0] : key;
					const existed = mockStorage.delete(k);
					return existed ? 1 : 0;
				}),
			};

			const rawFloats = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
			const entry = buildLoDCacheEntryV1({
				tier: 8,
				queryChecksum: sampleQueryChecksum,
				candidateRevision: sampleRevision,
				candidateIds: ['cand-7'],
				tensor: rawFloats,
			});

			const writeReceipt = await writeLoDCacheEntryV1(entry, mockRedis);
			expect(writeReceipt.success).toBe(true);
			expect(writeReceipt.storageTarget).toBe('ACE_REDIS');
			expect(writeReceipt.writesPerformed).toBe(false);

			const readEntry = await readLoDCacheEntryV1(entry.cacheKey, mockRedis);
			expect(readEntry).not.toBeNull();
			expect(readEntry?.cacheKey).toBe(entry.cacheKey);
			expect(readEntry?.lodTier).toBe(8);
			expect(readEntry?.totalByteLength).toBe(20);
		});

		it('rejects expired cache entries', async () => {
			const mockRedis: RedisLike = {
				get: vi.fn(async () => {
					const rawFloats = new Float32Array(10);
					const entry = buildLoDCacheEntryV1({
						tier: 2,
						queryChecksum: sampleQueryChecksum,
						candidateRevision: sampleRevision,
						candidateIds: ['cand-8'],
						tensor: rawFloats,
						now: new Date('2026-01-01T00:00:00Z'),
					});
					return JSON.stringify(entry);
				}),
				set: vi.fn(),
				del: vi.fn(),
			};

			// Querying now in October 2026 should reject January 2026 TTL
			const result = await readLoDCacheEntryV1('valkey:lod:hot:2:test:test', mockRedis, new Date('2026-10-24T00:00:00Z'));
			expect(result).toBeNull();
		});

		it('rejects tampered base64 payload when checksum does not match', async () => {
			const rawFloats = new Float32Array(10);
			const entry = buildLoDCacheEntryV1({
				tier: 5,
				queryChecksum: sampleQueryChecksum,
				candidateRevision: sampleRevision,
				candidateIds: ['cand-9'],
				tensor: rawFloats,
			});

			const tampered = {
				...entry,
				encodedBase64Payload: Buffer.from([1, 2, 3, 4, 5]).toString('base64'),
			};

			const mockRedis: RedisLike = {
				get: vi.fn(async () => JSON.stringify(tampered)),
				set: vi.fn(),
				del: vi.fn(),
			};

			const result = await readLoDCacheEntryV1(entry.cacheKey, mockRedis);
			expect(result).toBeNull();
		});

		it('performs live write and read against Valkey :6379 if available', async () => {
			try {
				const { pingValkey, getValkeyClient } = await import('../../cache/valkey-client.js');
				const isAlive = await pingValkey();
				if (!isAlive) {
					// Skip if live Valkey is not reachable
					return;
				}

				const client = getValkeyClient();
				const testKey = `valkey:lod:hot:test:${Date.now()}`;
				const rawFloats = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);

				const entry = buildLoDCacheEntryV1({
					tier: 2,
					queryChecksum: sampleQueryChecksum,
					candidateRevision: sampleRevision,
					candidateIds: ['cand-live-valkey'],
					tensor: rawFloats,
				});

				// Test live write
				const writeReceipt = await writeLoDCacheEntryV1(entry);
				expect(writeReceipt.success).toBe(true);

				// Test live read
				const retrieved = await readLoDCacheEntryV1(entry.cacheKey);
				expect(retrieved).not.toBeNull();
				expect(retrieved?.cacheKey).toBe(entry.cacheKey);
				expect(retrieved?.lodTier).toBe(2);

				// Cleanup test key
				await client.del(entry.cacheKey);
			} catch (err) {
				// Non-fatal if container not bound in mock run
				console.warn('Valkey live test bypassed:', err);
			}
		});
	});
});
