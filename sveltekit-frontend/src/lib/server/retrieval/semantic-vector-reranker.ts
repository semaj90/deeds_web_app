/**
 * semantic-vector-reranker.ts — Multi-vector composite ranking for retrieval
 *
 * Pipeline: top-K from Qdrant (768-dim dense) + Postgres metadata → composite score
 * → ranked candidates for ACE context packing
 *
 * Scoring lanes (all 0-1 normalized):
 * 1. Vector similarity (from Qdrant ANN distance)
 * 2. SOM cluster authority (7.17% coverage today, graceful fallback to 0.5)
 * 3. Domain class match (100% coverage, boolean)
 * 4. Feature label recency (proxy for code age, optional)
 * 5. Tree depth (structural authority, 100% coverage)
 *
 * Blend: 0.40·vector + 0.25·som_authority + 0.20·domain_match + 0.10·recency + 0.05·tree_depth
 *
 * Output: ranked candidates with confidence scores, diagnostics for tracing
 */

import { db } from '$lib/server/db/client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { codebaseChunkIndex, atlasPackets } from '$lib/server/db/schema-postgres.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { getRedisClient } from '$lib/server/cache.js';

interface QdrantSearchResult {
	id: string;
	score: number;
	payload?: Record<string, unknown>;
}

interface RerankerCandidate {
	packetKey: string;
	chunkId?: string;
	sourceRef: string;
	title?: string;
	vectorScore: number;
	somScore: number;
	domainScore: number;
	recencyScore: number;
	depthScore: number;
	compositeScore: number;
	diagnostics: {
		somCluster?: number;
		domainClass?: string;
		treeNodeId?: string;
		hasEmbedding: boolean;
		hasSomCluster: boolean;
	};
}

interface RerankerOptions {
	topK?: number; // how many to rerank (default: top-50 from Qdrant)
	blendWeights?: Record<string, number>;
	somCoverageThreshold?: number; // if SOM coverage < this, set som_score to 0.5 (neutral)
	verbose?: boolean;
}

const DEFAULT_BLEND = {
	vector: 0.40,
	som_authority: 0.25,
	domain_match: 0.20,
	recency: 0.10,
	tree_depth: 0.05,
};

/**
 * Normalize vector distance (cosine typically 0-2) to 0-1 similarity
 * Cosine distance 0 = identical (similarity 1), distance 2 = opposite (similarity 0)
 */
function normalizeVectorScore(qdrantDistance: number): number {
	// Qdrant cosine distance is in range [0, 2]
	// Convert to similarity: 1 - distance/2
	const similarity = Math.max(0, 1 - qdrantDistance / 2);
	return Math.min(1, Math.max(0, similarity));
}

/**
 * SOM authority: if cluster is known, fetch from Redis cache
 * If cache miss or SOM not computed, return neutral 0.5
 */
async function getSomScore(
	packetKey: string,
	somCluster?: number
): Promise<{ score: number; cluster?: number }> {
	if (!somCluster) {
		return { score: 0.5 }; // Neutral: no cluster info
	}

	try {
		const redis = await getRedisClient();
		const clusterScoreKey = `som:cluster:authority:${somCluster}`;
		const cachedScore = await redis.get(clusterScoreKey);

		if (cachedScore) {
			const score = parseFloat(cachedScore);
			return { score: Math.min(1, Math.max(0, score)), cluster: somCluster };
		}
	} catch {
		// Redis miss or error, fall through
	}

	// No cache, return neutral
	return { score: 0.5, cluster: somCluster };
}

/**
 * Domain class match: binary score based on alignment with query domain
 * For now, always 1.0 (no query domain filtering implemented yet)
 */
function getDomainScore(domainClass?: string): number {
	// TODO: wire query domain from context
	// For now, any domain is acceptable (1.0)
	return domainClass ? 1.0 : 0.8;
}

/**
 * Recency score: based on packet update time
 * Newer packets score higher (assumption: recently updated code is more relevant)
 * Decay by days since update: score = 1 / (1 + days_old)
 */
function getRecencyScore(updatedAt?: Date): number {
	if (!updatedAt) return 0.5; // Unknown age = neutral

	const now = Date.now();
	const ageMs = now - updatedAt.getTime();
	const ageDays = ageMs / (1000 * 60 * 60 * 24);

	// Decay function: newer is better, but diminishes over time
	const score = 1 / (1 + ageDays);
	return Math.min(1, Math.max(0, score));
}

/**
 * Tree depth score: files at greater depth in the tree are more specialized (higher authority)
 * Score = min(1, depth / max_depth_in_corpus)
 */
function getDepthScore(treeNodeId?: string, maxDepth: number = 8): number {
	if (!treeNodeId) return 0.5; // Unknown depth = neutral

	// tree_node_id format: "1.2.3.4" (dot-separated depth indicators)
	const depth = treeNodeId.split('.').length;
	return Math.min(1, Math.max(0, depth / maxDepth));
}

/**
 * Main reranker: take Qdrant results + Postgres metadata, compute composite score
 */
export async function rerank(
	qdrantResults: QdrantSearchResult[],
	options: RerankerOptions = {}
): Promise<RerankerCandidate[]> {
	const { topK = 50, blendWeights = DEFAULT_BLEND, verbose = false } = options;

	const candidates = qdrantResults.slice(0, topK);

	if (verbose) {
		console.log(`[Reranker] Input: ${candidates.length} Qdrant results`);
	}

	// Extract packet_key from Qdrant payload
	const packetKeys = candidates
		.map((c) => c.payload?.packet_key as string)
		.filter(Boolean);

	if (packetKeys.length === 0) {
		console.warn('[Reranker] No packet_keys found in Qdrant payloads');
		return [];
	}

	// Fetch metadata from Postgres
	const packets = await db
		.select({
			packetKey: atlasPackets.packetKey,
			sourceRef: atlasPackets.sourceRef,
			title: atlasPackets.title,
			domainClass: atlasPackets.domainClass,
			treeNodeId: atlasPackets.treeNodeId,
			updatedAt: atlasPackets.updatedAt,
			somCluster: atlasPackets.somCluster,
		})
		.from(atlasPackets)
		.where(inArray(atlasPackets.packetKey, packetKeys));

	const packetMap = new Map(packets.map((p) => [p.packetKey, p]));

	// Compute composite scores
	const scored: RerankerCandidate[] = [];

	for (const qResult of candidates) {
		const packetKey = qResult.payload?.packet_key as string;
		const packet = packetMap.get(packetKey);

		if (!packet) {
			console.warn(`[Reranker] Packet ${packetKey} not found in Postgres`);
			continue;
		}

		// Normalize individual scores
		const vectorScore = normalizeVectorScore(qResult.score);
		const { score: somScore } = await getSomScore(packetKey, packet.somCluster);
		const domainScore = getDomainScore(packet.domainClass);
		const recencyScore = getRecencyScore(packet.updatedAt);
		const depthScore = getDepthScore(packet.treeNodeId);

		// Composite blend
		const compositeScore =
			blendWeights.vector * vectorScore +
			blendWeights.som_authority * somScore +
			blendWeights.domain_match * domainScore +
			blendWeights.recency * recencyScore +
			blendWeights.tree_depth * depthScore;

		scored.push({
			packetKey,
			sourceRef: packet.sourceRef,
			title: packet.title,
			vectorScore,
			somScore,
			domainScore,
			recencyScore,
			depthScore,
			compositeScore: Math.min(1, Math.max(0, compositeScore)),
			diagnostics: {
				somCluster: packet.somCluster,
				domainClass: packet.domainClass,
				treeNodeId: packet.treeNodeId,
				hasEmbedding: true, // Qdrant returned it, so it has an embedding
				hasSomCluster: !!packet.somCluster,
			},
		});
	}

	// Sort by composite score descending
	scored.sort((a, b) => b.compositeScore - a.compositeScore);

	if (verbose) {
		console.log(`[Reranker] Output: ${scored.length} candidates ranked`);
		if (scored.length > 0) {
			const top = scored[0];
			console.log(`  Top: ${top.packetKey} (score=${top.compositeScore.toFixed(3)})`);
		}
	}

	return scored;
}

/**
 * Health check: verify all scoring components are operational
 */
export async function healthCheckReranker(): Promise<{
	operational: boolean;
	components: Record<string, boolean>;
	diagnostics: string[];
}> {
	const diagnostics: string[] = [];
	const components: Record<string, boolean> = {
		postgres: false,
		redis: false,
		qdrant: false,
	};

	try {
		// Postgres: sample packet read
		const sample = await db
			.select({ packetKey: atlasPackets.packetKey })
			.from(atlasPackets)
			.limit(1);
		components.postgres = sample.length > 0;
		if (!components.postgres) {
			diagnostics.push('Postgres: no packets found');
		}
	} catch (e) {
		diagnostics.push(`Postgres error: ${e instanceof Error ? e.message : String(e)}`);
	}

	try {
		// Redis: check som:cluster:authority keys
		const redis = await getRedisClient();
		const keys = await redis.keys('som:cluster:authority:*');
		components.redis = keys.length > 0;
		if (!components.redis) {
			diagnostics.push('Redis: no SOM cluster authority cache found (expected 7.17% coverage)');
		}
	} catch (e) {
		diagnostics.push(`Redis error: ${e instanceof Error ? e.message : String(e)}`);
	}

	try {
		// Qdrant: collection exists
		const collections = await qdrant.listCollections();
		components.qdrant = collections.some((c) => c.name === 'codebase_chunks_768');
		if (!components.qdrant) {
			diagnostics.push('Qdrant: codebase_chunks_768 collection not found');
		}
	} catch (e) {
		diagnostics.push(`Qdrant error: ${e instanceof Error ? e.message : String(e)}`);
	}

	const operational = Object.values(components).every((v) => v);

	return { operational, components, diagnostics };
}
