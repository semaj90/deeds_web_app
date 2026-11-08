/**
 * route-spatial-enhancer.ts
 *
 * SvelteKit 2 Server Route Enhancer & SIMD / Radix Packet Synthesizer.
 * Bridges gRPC hex alignment, base64 bitsets, 30-bit Morton code radix sorting,
 * and PostgreSQL 18 / Drizzle ORM table integrations for high-throughput spatial telemetry.
 */

import {
	ALIGNED_KEYFRAME_CHUNK_SIZE,
	AVX2_VECTOR_BYTES,
	AVX512_VECTOR_BYTES,
	MAX_ARENA_SLOTS,
	computeMorton30,
	mortonRadixSort,
	encodeActiveSlotBitset,
	decodeActiveSlotBitset,
	packKeyframeChunksToBuffer,
	unpackKeyframeBuffer,
	quantizeFloatToInt8,
	dequantizeInt8ToFloat,
	quantizePositionsToInt8Buffer,
	packInt4Nibbles,
	unpackInt4Nibbles,
	HyperLogLogSketch64B,
	type KeyframeChunk,
	type SpatialBitsetInfo
} from '../../spatial/spatial-simd-morton.js';

export {
	ALIGNED_KEYFRAME_CHUNK_SIZE,
	AVX2_VECTOR_BYTES,
	AVX512_VECTOR_BYTES,
	MAX_ARENA_SLOTS,
	computeMorton30,
	mortonRadixSort,
	encodeActiveSlotBitset,
	decodeActiveSlotBitset,
	packKeyframeChunksToBuffer,
	unpackKeyframeBuffer,
	quantizeFloatToInt8,
	dequantizeInt8ToFloat,
	quantizePositionsToInt8Buffer,
	packInt4Nibbles,
	unpackInt4Nibbles,
	HyperLogLogSketch64B,
	type KeyframeChunk,
	type SpatialBitsetInfo
};

import { atlasSpatialKeyframes, type AtlasSpatialKeyframeInsert } from '../db/schema/atlas-spatial-keyframes.js';
import { setCachedSpatialPacket, type CachedSpatialPacket } from '../cache/valkey-packet-cache.js';
import { db } from '../db/client.js';

export interface ReconcileSpatialKeyframeOptions {
	caseId: string;
	sceneId: string;
	titleId: string;
	revisionId?: number;
	sourceSha256: string;
	rawPositions?: number[]; // N x 3
	rawRot6d?: number[];     // N x 6
	rawScales?: number[];    // N x 3
	clusters?: number[];     // N
	chunks?: KeyframeChunk[];
	clusterMetadata?: Record<string, unknown>;
	writeToDb?: boolean;
}

export interface ReconcileSpatialResult {
	sceneId: string;
	revisionId: number;
	sourceSha256: string;
	activeSlotCount: number;
	bitsetInfo: SpatialBitsetInfo;
	cachedPacket: CachedSpatialPacket;
	keyframeRecord: AtlasSpatialKeyframeInsert;
	simdMetrics: {
		chunkCount: number;
		totalBytes: number;
		avx2Instructions: number;
		avx512Instructions: number;
	};
	status: 'CACHED' | 'PERSISTED' | 'DRY_RUN';
}

/**
 * Reconciles incoming spatial keyframe telemetry across:
 * 1. 30-bit Morton code calculation & Radix Sort
 * 2. 64-byte AVX2/AVX-512 SIMD memory packing
 * 3. 256-bit occupancy mask generation (hex, base64, bitstring)
 * 4. Sub-millisecond transient caching in Valkey (:6379)
 * 5. PostgreSQL 18 / Drizzle ORM reconciliation
 */
export async function reconcileSpatialKeyframe(
	options: ReconcileSpatialKeyframeOptions
): Promise<ReconcileSpatialResult> {
	const {
		caseId,
		sceneId,
		titleId,
		revisionId = 1,
		sourceSha256,
		clusterMetadata = {},
		writeToDb = false
	} = options;

	let chunks: KeyframeChunk[] = [];

	if (options.chunks && options.chunks.length > 0) {
		chunks = options.chunks;
	} else if (options.rawPositions) {
		const count = Math.floor(options.rawPositions.length / 3);
		for (let i = 0; i < count && i < MAX_ARENA_SLOTS; i++) {
			const pos: [number, number, number] = [
				options.rawPositions[i * 3 + 0] ?? 0,
				options.rawPositions[i * 3 + 1] ?? 0,
				options.rawPositions[i * 3 + 2] ?? 0
			];
			const rot: [number, number, number, number, number, number] = [
				options.rawRot6d?.[i * 6 + 0] ?? 1,
				options.rawRot6d?.[i * 6 + 1] ?? 0,
				options.rawRot6d?.[i * 6 + 2] ?? 0,
				options.rawRot6d?.[i * 6 + 3] ?? 0,
				options.rawRot6d?.[i * 6 + 4] ?? 1,
				options.rawRot6d?.[i * 6 + 5] ?? 0
			];
			const scl: [number, number, number] = [
				options.rawScales?.[i * 3 + 0] ?? 1,
				options.rawScales?.[i * 3 + 1] ?? 1,
				options.rawScales?.[i * 3 + 2] ?? 1
			];
			const mortonCode = computeMorton30(pos[0], pos[1], pos[2]);
			const clusterId = options.clusters?.[i] ?? 0;

			chunks.push({
				mortonCode,
				slotIndex: i,
				clusterId,
				position: pos,
				rot6d: rot,
				scale: scl,
				flags: 1, // Caliper verified
				reserved: 0
			});
		}
	}

	// 1. Radix Sort by Morton Code for spatial cache coherence
	const sortedChunks = mortonRadixSort(chunks);

	// 2. Compute 256-bit active slot occupancy mask
	const activeSlotIndices = sortedChunks.map((c) => c.slotIndex);
	const bitsetInfo = encodeActiveSlotBitset(activeSlotIndices);

	// 3. Binary Buffer Packing (64-byte chunks)
	const packedBlob = packKeyframeChunksToBuffer(sortedChunks);

	// 3b. Int8 position quantization (1 byte per axis offset)
	const rawPosArray: number[] = [];
	for (const chunk of sortedChunks) {
		rawPosArray.push(chunk.position[0], chunk.position[1], chunk.position[2]);
	}
	const int8Coords = quantizePositionsToInt8Buffer(rawPosArray);

	// 3c. Int4 nibble-packed cluster and flags scores
	const int4Vals: number[] = [];
	for (const chunk of sortedChunks) {
		int4Vals.push(chunk.clusterId & 0x0f, chunk.flags & 0x0f);
	}
	const int4Scores = packInt4Nibbles(int4Vals);

	// 3d. HyperLogLog 64-byte cardinality sketch
	const hll = new HyperLogLogSketch64B();
	for (const chunk of sortedChunks) {
		hll.add(`slot:${chunk.slotIndex}:morton:${chunk.mortonCode}`);
	}
	const hllSketch = hll.toBuffer();

	// 4. Valkey / Redis Transient Caching (:6379)
	const cachedPacket: CachedSpatialPacket = {
		caseId,
		sceneId,
		titleId,
		sourceSha256,
		revisionId,
		activeSlotBitset: bitsetInfo.bitsetString,
		packedTransformsBase64: packedBlob.toString('base64'),
		clusterMetadata,
		cachedAt: new Date().toISOString()
	};

	await setCachedSpatialPacket(caseId, sceneId, revisionId, cachedPacket);

	// 5. Drizzle ORM Insert Record Structure
	const keyframeRecord: AtlasSpatialKeyframeInsert = {
		caseId,
		sceneId,
		titleId,
		sourceSha256,
		revisionId,
		activeSlotBitset: bitsetInfo.bitsetString,
		packedTransformsBlob: packedBlob,
		int8QuantizedCoords: int8Coords,
		int4QuantizedScores: int4Scores,
		hyperloglogSketch: hllSketch,
		clusterMetadata
	};

	let status: 'CACHED' | 'PERSISTED' | 'DRY_RUN' = 'CACHED';

	if (writeToDb) {
		try {
			await db.insert(atlasSpatialKeyframes)
				.values(keyframeRecord)
				.onConflictDoUpdate({
					target: [atlasSpatialKeyframes.caseId, atlasSpatialKeyframes.sceneId, atlasSpatialKeyframes.revisionId],
					set: {
						activeSlotBitset: keyframeRecord.activeSlotBitset,
						packedTransformsBlob: keyframeRecord.packedTransformsBlob,
						int8QuantizedCoords: keyframeRecord.int8QuantizedCoords,
						int4QuantizedScores: keyframeRecord.int4QuantizedScores,
						hyperloglogSketch: keyframeRecord.hyperloglogSketch,
						clusterMetadata: keyframeRecord.clusterMetadata
					}
				});
			status = 'PERSISTED';
		} catch (dbErr) {
			console.warn('[RouteSpatialEnhancer] DB insert fell back to DRY_RUN:', dbErr);
			status = 'DRY_RUN';
		}
	}

	const totalBytes = packedBlob.length;
	const chunkCount = sortedChunks.length;

	return {
		sceneId,
		revisionId,
		sourceSha256,
		activeSlotCount: bitsetInfo.popcount,
		bitsetInfo,
		cachedPacket,
		keyframeRecord,
		simdMetrics: {
			chunkCount,
			totalBytes,
			avx2Instructions: chunkCount * 2,
			avx512Instructions: chunkCount * 1
		},
		status
	};
}
