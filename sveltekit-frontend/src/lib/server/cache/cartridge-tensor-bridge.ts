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
import { NESMemoryArchitecture, type MemoryStats } from '$lib/gpu/nes-memory-architecture.js';
import pLimit from 'p-limit';

// ── NES Memory Singleton ─────────────────────────────────────────────────
const nesMemory = new NESMemoryArchitecture();

// ── Config ───────────────────────────────────────────────────────────────

const REDIS_CARTRIDGE_PREFIX = 'chr97:';
const CARTRIDGE_BUILD_GATE = pLimit(2); // Max 2 concurrent cartridge builds

/** NES 8-bit priority → Redis TTL mapping (seconds) */
const PRIORITY_TTL: Record<string, number> = {
  critical: 24 * 3600, // 24h — active case evidence
  high: 12 * 3600, // 12h — recent case data
  medium: 6 * 3600, //  6h — general documents
  low: 1 * 3600, //  1h — background/stale
  background: 30 * 60, // 30min — ephemeral
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
      sources: [...new Set(runes.map((r) => r.sourceName).filter(Boolean))] as string[],
    };

    return buildCartridge(runes, metadata);
  });

  const buildTimeMs = Math.round(performance.now() - buildStart);

  // 3. Cache with adaptive TTL
  const priority = scorePriority(opts);
  await cacheCartridge(caseId, cartridgeBuffer, priority);

  // 3b. Allocate in NES memory banks for in-process lookups
  nesMemory
    .allocateDocument(
      {
        id: caseId,
        type: 'evidence',
        size: cartridgeBuffer.length,
        priority: priority === 'critical' ? 1 : priority === 'high' ? 2 : 3,
        confidenceLevel: priority === 'critical' ? 1.0 : priority === 'high' ? 0.8 : 0.6,
        riskLevel: priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'medium',
        compressed: true,
        metadata: { caseId },
      },
      cartridgeBuffer.buffer.slice(
        cartridgeBuffer.byteOffset,
        cartridgeBuffer.byteOffset + cartridgeBuffer.byteLength
      ) as ArrayBuffer
    )
    .catch(() => {}); // Non-fatal

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
	nesMemory: MemoryStats;
}> {
	const nesStats = nesMemory.getMemoryStats();
	const redis = getRedis();
	if (!redis) return { cachedCases: 0, totalSizeBytes: 0, redisConnected: false, nesMemory: nesStats };

	try {
		const keys = await redis.keys(`${REDIS_CARTRIDGE_PREFIX}*`);
		let totalSize = 0;
		for (const key of keys) {
			const len = await redis.strlen(key);
			totalSize += len;
		}
		return { cachedCases: keys.length, totalSizeBytes: totalSize, redisConnected: true, nesMemory: nesStats };
	} catch {
		return { cachedCases: 0, totalSizeBytes: 0, redisConnected: false, nesMemory: nesStats };
	}
}

/**
 * Invalidate cached cartridge (e.g., after new evidence upload).
 */
export async function invalidateCartridge(caseId: string): Promise<boolean> {
	// Evict from NES memory banks
	nesMemory.removeDocument(caseId);

	const redis = getRedis();
	if (!redis) return false;

	try {
		const deleted = await redis.del(`${REDIS_CARTRIDGE_PREFIX}${caseId}`);
		return deleted > 0;
	} catch {
		return false;
	}
}

/** Get the NES memory singleton for external access (e.g., stats endpoints). */
export function getNESMemory(): NESMemoryArchitecture {
	return nesMemory;
}

// ── GPU Analysis Result Cache ────────────────────────────────────────────
// Caches GPU computation results (clusters, case embedding) so that
// subsequent uploads or dashboard queries reuse GPU results without
// re-running graphSimilarity/clusterEmbeddings/computeCaseEmbedding.

const GPU_RESULT_PREFIX = 'chr97:gpu:';

export interface CachedGpuAnalysis {
	clusterAssignments: number[];
	centroids: number[][];
	clusterK: number;
	caseEmbedding: number[];
	pointIds: string[];
	source: 'gpu' | 'cpu';
	cachedAt: string;
	embeddingCount: number;
}

/**
 * Retrieve cached GPU analysis results for a case.
 * Returns null on miss or Redis unavailable.
 */
export async function getCachedGpuAnalysis(caseId: string): Promise<CachedGpuAnalysis | null> {
	const redis = getRedis();
	if (!redis) return null;

	try {
		const data = await redis.get(`${GPU_RESULT_PREFIX}${caseId}`);
		if (!data) return null;
		return JSON.parse(data);
	} catch {
		return null;
	}
}

/**
 * Cache GPU analysis results with priority-based TTL.
 * Called after batch GPU analysis completes.
 */
export async function cacheGpuAnalysis(
	caseId: string,
	analysis: CachedGpuAnalysis,
	priority: PriorityLevel = 'medium'
): Promise<void> {
	const redis = getRedis();
	if (!redis) return;

	try {
		const ttl = getTTL(priority);
		await redis.setex(`${GPU_RESULT_PREFIX}${caseId}`, ttl, JSON.stringify(analysis));
	} catch {}
}

/**
 * Invalidate cached GPU analysis (e.g., after new evidence upload changes the set).
 */
export async function invalidateGpuAnalysis(caseId: string): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	try {
		await redis.del(`${GPU_RESULT_PREFIX}${caseId}`);
	} catch {}
}

// ── Staged 3-Pass Tensor Search ──────────────────────────────────────────────
//
// Operates on a ParsedCartridge (Redis-cached or freshly built).
// Complements GlyphBridge.searchCartridge (which operates on raw GlyphRecord[]).
//
// Stage 1 — 4d manifold L2 prefilter     (CPU, ~4 ops/rune, eliminates 75%)
// Stage 2 — attentionScoreGPU softmax    (GPU/CPU, cluster-local candidate set)
// Stage 3 — rewardScoreGPU cosine rerank (GPU/CPU, GRPO-compatible final scores)

export interface StagedSearchResult extends TensorSearchResult {
  attnWeight: number;    // Stage 2 softmax attention weight
  rewardScore: number;   // Stage 3 cosine reward score (final rank key)
  stage1Rank: number;    // Original 4d-distance rank (for diagnostics)
}

/**
 * 3-stage staged tensor search on a parsed CHR97 cartridge.
 *
 * @param queryVec   - 768-dim pre-embedded query (Float32Array)
 * @param cartridge  - ParsedCartridge from getCachedCartridge / parseCartridge
 * @param topK       - final result count (default 10)
 * @param minReward  - minimum rewardScoreGPU threshold (default 0.25)
 */
export async function searchCartridgeStaged(
  queryVec: Float32Array,
  cartridge: { runes: Array<{ id: number; clusterId: number; manifold: [number,number,number,number] }>; tensors: Float32Array[] },
  topK = 10,
  minReward = 0.25
): Promise<StagedSearchResult[]> {
  const { runes, tensors } = cartridge;
  if (tensors.length === 0 || runes.length !== tensors.length) return [];

  const dim = queryVec.length;

  // ── Stage 1: 4d manifold L2 prefilter ────────────────────────────────────
  // Derive query topo from first 4 dims (matches chr97-builder manifold convention)
  const q0 = queryVec[0], q1 = queryVec[1], q2 = queryVec[2], q3 = queryVec[3];
  const preK = Math.min(runes.length, topK * 4);

  const distanced = runes.map((rune, i) => {
    const m = rune.manifold;
    const d = (m[0]-q0)**2 + (m[1]-q1)**2 + (m[2]-q2)**2 + (m[3]-q3)**2;
    return { idx: i, rune, tensor: tensors[i], dist4d: d };
  });
  distanced.sort((a, b) => a.dist4d - b.dist4d);
  const stage1 = distanced.slice(0, preK);

  // ── Stage 2: attentionScoreGPU on cluster-local tensors ──────────────────
  const { attentionScoreGPU } = await import('$lib/server/gpu/pytorch-graph.js');
  const keyMatrix = new Float32Array(stage1.length * dim);
  for (let i = 0; i < stage1.length; i++) {
    const t = stage1[i].tensor;
    for (let d = 0; d < dim; d++) keyMatrix[i * dim + d] = t[d];
  }

  const { weights: attnWeights } = attentionScoreGPU(queryVec, dim, keyMatrix, stage1.length);

  // Re-rank by attention weight → top 2×topK for final pass
  const attended = stage1
    .map((item, i) => ({ ...item, attnWeight: attnWeights[i] }))
    .sort((a, b) => b.attnWeight - a.attnWeight)
    .slice(0, topK * 2);

  // ── Stage 3: rewardScoreGPU cosine final rerank ───────────────────────────
  const { rewardScoreGPU } = await import('$lib/server/gpu/pytorch-graph.js');
  const n = attended.length;

  const genVecs = new Float32Array(n * dim); // candidate tensors
  const refVecs = new Float32Array(n * dim); // query repeated n times
  for (let i = 0; i < n; i++) {
    const t = attended[i].tensor;
    for (let d = 0; d < dim; d++) {
      genVecs[i * dim + d] = t[d];
      refVecs[i * dim + d] = queryVec[d];
    }
  }

  const { scores: rewardScores } = rewardScoreGPU(genVecs, refVecs, n, dim);

  return attended
    .map((item, i) => ({
      runeId: item.rune.id,
      clusterId: item.rune.clusterId,
      manifold: item.rune.manifold,
      score: rewardScores[i],       // primary sort key
      attnWeight: item.attnWeight,
      rewardScore: rewardScores[i],
      stage1Rank: stage1.indexOf(item),
    }))
    .filter(r => r.rewardScore >= minReward)
    .sort((a, b) => b.rewardScore - a.rewardScore)
    .slice(0, topK);
}
