/**
 * Cartridge-Tensor Bridge — Redis ↔ CHR-ROM97 ↔ GPU Tensor ↔ NES Adaptive Memory
 *
 * Connects:
 *   - Redis (L2 cache for CHR-ROM97 binary cartridges, base64-encoded)
 *   - CHR-ROM97 builder/parser (FP16 tensor storage in NES cartridge format)
 *   - GPU embedding bridge (batch cosine similarity on dequantized tensors)
 *   - NES 8-bit priority scoring (adaptive TTL: critical=24h → background=1h)
 *   - p-limit concurrency gates (parallel cartridge builds + tensor searches)
 *
 * Flow:
 *   Query → Redis cartridge hit? → dequantize FP16 tensors → CPU cosine similarity
 *   Miss  → Qdrant fetch → buildCartridge() → Redis store → return ranked results
 *   Client ← JSON response with scores → IndexedDB/LokiJS/Fuse.js cache
 *
 * Server-side only (SvelteKit +server.ts routes).
 */

import { redisService } from '../redis-service.js';
import { buildCartridge, parseCartridge, type RuneData, type CartridgeMetadata, type ParsedCartridge } from '../cartridge/chr97-builder.js';
import { embedAndCompare } from '$lib/gpu/gpu-embedding-bridge.js';
import { embedGate, gated } from '../analysis/concurrency-gate.js';
import { generateEmbeddings } from '../grpc/embedding-client.js';
import pLimit from 'p-limit';

// ── Config ───────────────────────────────────────────────────────────────

const REDIS_CARTRIDGE_PREFIX = 'chr97:';
const CARTRIDGE_BUILD_GATE = pLimit(2); // Max 2 concurrent cartridge builds

/** NES 8-bit priority → Redis TTL mapping (seconds) */
const PRIORITY_TTL: Record<string, number> = {
	critical: 24 * 3600,  // 24h — active case evidence
	high:     12 * 3600,  // 12h — recent case data
	medium:    6 * 3600,  //  6h — general documents
	low:       1 * 3600,  //  1h — background/stale
	background: 30 * 60,  // 30min — ephemeral
};

// ── Types ────────────────────────────────────────────────────────────────

export interface TensorSearchResult {
	runeId: number;
	clusterId: number;
	score: number;
	manifold: [number, number, number, number];
	text?: string;
}

export interface CartridgeCacheResult {
	cartridge: ParsedCartridge;
	source: 'redis' | 'built';
	cacheKey: string;
	buildTimeMs?: number;
}

export interface TensorSearchResponse {
	results: TensorSearchResult[];
	totalRunes: number;
	searchTimeMs: number;
	cartridgeSource: 'redis' | 'built';
	caseId: string;
	embeddingModel: string;
}

// ── NES Priority Scoring (8-bit) ─────────────────────────────────────────

type PriorityLevel = 'critical' | 'high' | 'medium' | 'low' | 'background';

function scorePriority(opts: {
	hasActiveCase?: boolean;
	entityCount?: number;
	forensicFlags?: number;
	ageHours?: number;
}): PriorityLevel {
	let score = 128; // medium base

	if (opts.hasActiveCase) score += 64;
	if ((opts.entityCount ?? 0) > 10) score += 32;
	if ((opts.forensicFlags ?? 0) > 0) score += 48;
	if ((opts.ageHours ?? 0) > 48) score -= 64;
	if ((opts.ageHours ?? 0) > 168) score -= 32; // >1 week

	score = Math.max(0, Math.min(255, score));

	if (score >= 224) return 'critical';
	if (score >= 160) return 'high';
	if (score >= 96) return 'medium';
	if (score >= 48) return 'low';
	return 'background';
}

function getTTL(priority: PriorityLevel): number {
	return PRIORITY_TTL[priority] ?? PRIORITY_TTL.medium;
}

// ── Redis Cartridge Cache ────────────────────────────────────────────────

function getRedis(): any | null {
	return ((redisService as any).getClient?.() || (globalThis as any).__REDIS) ?? null;
}

/**
 * Get cached CHR-ROM97 cartridge from Redis.
 * Cartridges are stored as base64-encoded binary.
 */
export async function getCachedCartridge(caseId: string): Promise<ParsedCartridge | null> {
	const redis = getRedis();
	if (!redis) return null;

	try {
		const data = await redis.get(`${REDIS_CARTRIDGE_PREFIX}${caseId}`);
		if (!data) return null;

		const buffer = Buffer.from(data, 'base64');
		return parseCartridge(new Uint8Array(buffer));
	} catch (err) {
		console.warn('[cartridge-bridge] Redis get failed:', err);
		return null;
	}
}

/**
 * Cache a CHR-ROM97 cartridge in Redis with NES priority-based TTL.
 */
export async function cacheCartridge(
	caseId: string,
	cartridgeBuffer: Buffer,
	priority: PriorityLevel = 'medium'
): Promise<void> {
	const redis = getRedis();
	if (!redis) return;

	try {
		const ttl = getTTL(priority);
		await redis.setex(
			`${REDIS_CARTRIDGE_PREFIX}${caseId}`,
			ttl,
			cartridgeBuffer.toString('base64')
		);
	} catch (err) {
		console.warn('[cartridge-bridge] Redis cache failed:', err);
	}
}

// ── Cartridge Build + Cache Pipeline ─────────────────────────────────────

/**
 * Get or build a CHR-ROM97 cartridge for a case.
 * Redis hit → parse + return. Miss → fetch Qdrant → build → cache → return.
 */
export async function getOrBuildCartridge(
	caseId: string,
	fetchRunes: () => Promise<RuneData[]>,
	opts: {
		hasActiveCase?: boolean;
		entityCount?: number;
		forensicFlags?: number;
	} = {}
): Promise<CartridgeCacheResult> {
	const cacheKey = `${REDIS_CARTRIDGE_PREFIX}${caseId}`;

	// 1. Check Redis cache
	const cached = await getCachedCartridge(caseId);
	if (cached) {
		return { cartridge: cached, source: 'redis', cacheKey };
	}

	// 2. Build cartridge through concurrency gate (max 2 concurrent)
	const buildStart = performance.now();

	const cartridgeBuffer = await CARTRIDGE_BUILD_GATE(async () => {
		const runes = await fetchRunes();
		if (runes.length === 0) {
			throw new Error(`No runes found for case ${caseId}`);
		}

		const metadata: CartridgeMetadata = {
			caseId,
			createdAt: new Date().toISOString(),
			runeCount: runes.length,
			embeddingDim: runes[0].embedding.length,
			collections: ['evidence_items'],
			sources: [...new Set(runes.map(r => r.sourceName).filter(Boolean))] as string[],
		};

		return buildCartridge(runes, metadata);
	});

	const buildTimeMs = Math.round(performance.now() - buildStart);

	// 3. Cache with adaptive TTL
	const priority = scorePriority(opts);
	await cacheCartridge(caseId, cartridgeBuffer, priority);

	// 4. Parse for return
	const cartridge = parseCartridge(new Uint8Array(cartridgeBuffer));

	return { cartridge, source: 'built', cacheKey, buildTimeMs };
}

// ── Tensor Similarity Search ─────────────────────────────────────────────

/**
 * Search a case's cartridge tensors by cosine similarity.
 * Dequantizes FP16 → f32, runs batch cosine, returns ranked results.
 *
 * Flow:
 *   1. Get/build cartridge (Redis → build pipeline)
 *   2. Embed query via Ollama/gRPC (through embedGate)
 *   3. CPU batch cosine similarity on dequantized FP16 tensors
 *   4. Sort by score, return top_k
 */
export async function searchCartridgeTensors(
	query: string,
	caseId: string,
	fetchRunes: () => Promise<RuneData[]>,
	opts: {
		topK?: number;
		minScore?: number;
		hasActiveCase?: boolean;
		entityCount?: number;
		forensicFlags?: number;
	} = {}
): Promise<TensorSearchResponse> {
	const searchStart = performance.now();
	const topK = opts.topK ?? 10;
	const minScore = opts.minScore ?? 0.3;

	// 1. Get or build cartridge
	const { cartridge, source } = await getOrBuildCartridge(caseId, fetchRunes, opts);

	if (cartridge.tensors.length === 0) {
		return {
			results: [],
			totalRunes: 0,
			searchTimeMs: Math.round(performance.now() - searchStart),
			cartridgeSource: source,
			caseId,
			embeddingModel: 'embeddinggemma:latest',
		};
	}

	// 2. Embed query through concurrency gate
	const queryResult = await gated(embedGate, () =>
		generateEmbeddings([query])
	);
	const queryVector = queryResult.vectors[0];
	if (!queryVector || queryVector.length === 0) {
		return {
			results: [],
			totalRunes: cartridge.runes.length,
			searchTimeMs: Math.round(performance.now() - searchStart),
			cartridgeSource: source,
			caseId,
			embeddingModel: queryResult.model,
		};
	}

	// 3. Batch cosine similarity on dequantized FP16 tensors
	const dim = queryVector.length;
	const results: TensorSearchResult[] = [];

	for (let i = 0; i < cartridge.tensors.length; i++) {
		const docTensor = cartridge.tensors[i];
		if (docTensor.length !== dim) continue;

		let dot = 0, normQ = 0, normD = 0;
		for (let d = 0; d < dim; d++) {
			const q = queryVector[d];
			const v = docTensor[d];
			dot += q * v;
			normQ += q * q;
			normD += v * v;
		}
		const denom = Math.sqrt(normQ) * Math.sqrt(normD);
		const score = denom > 0 ? dot / denom : 0;

		if (score >= minScore) {
			results.push({
				runeId: cartridge.runes[i].id,
				clusterId: cartridge.runes[i].clusterId,
				score,
				manifold: cartridge.runes[i].manifold,
			});
		}
	}

	// 4. Sort descending by score, limit to topK
	results.sort((a, b) => b.score - a.score);

	return {
		results: results.slice(0, topK),
		totalRunes: cartridge.runes.length,
		searchTimeMs: Math.round(performance.now() - searchStart),
		cartridgeSource: source,
		caseId,
		embeddingModel: queryResult.model,
	};
}

// ── Cache Stats ──────────────────────────────────────────────────────────

export async function getCartridgeCacheStats(): Promise<{
	cachedCases: number;
	totalSizeBytes: number;
	redisConnected: boolean;
}> {
	const redis = getRedis();
	if (!redis) return { cachedCases: 0, totalSizeBytes: 0, redisConnected: false };

	try {
		const keys = await redis.keys(`${REDIS_CARTRIDGE_PREFIX}*`);
		let totalSize = 0;
		for (const key of keys) {
			const len = await redis.strlen(key);
			totalSize += len;
		}
		return { cachedCases: keys.length, totalSizeBytes: totalSize, redisConnected: true };
	} catch {
		return { cachedCases: 0, totalSizeBytes: 0, redisConnected: false };
	}
}

/**
 * Invalidate cached cartridge (e.g., after new evidence upload).
 */
export async function invalidateCartridge(caseId: string): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return false;

	try {
		const deleted = await redis.del(`${REDIS_CARTRIDGE_PREFIX}${caseId}`);
		return deleted > 0;
	} catch {
		return false;
	}
}
