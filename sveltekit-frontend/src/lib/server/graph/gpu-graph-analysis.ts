/**
 * GPU-Accelerated Graph Analysis Bridge
 *
 * Combines Neo4j graph algorithms + LibTorch CUDA for deep codebase/case analysis:
 *
 *   1. Neo4j GDS algorithms: PageRank, community detection (Louvain), betweenness
 *   2. LibTorch GPU: similarity matrix (cuBLAS GEMM), K-Means clustering, batch cosine
 *   3. CouchDB: cache analysis results with 1hr TTL
 *
 * Architecture:
 *   Neo4j (graph structure) → Qdrant (embeddings) → LibTorch CUDA (matrix ops) → CouchDB (cache)
 *
 * Usage:
 *   const analysis = await analyzeGraph({ caseId, includePageRank: true, clusterCount: 5 });
 *   // Returns: { pageRank, communities, clusters, similarityMatrix, cached }
 */

import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import neo4j from 'neo4j-driver';
import {
	graphSimilarity,
	graphSimilarityHalf,
	clusterEmbeddings,
	isCudaAvailable,
	getCudaMemoryInfo,
} from '$lib/server/gpu/libtorch-bridge.js';
import {
	pageRankGPU,
	kmeansWithCentroids as kmeansGPU,
	attentionScoreGPU,
} from '$lib/server/gpu/pytorch-graph.js';
import { couchdb } from '$lib/services/couchdb-client.js';
import { createHash } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────

export interface GraphAnalysisRequest {
	caseId?: string;
	includePageRank?: boolean;
	includeCommunities?: boolean;
	includeGpuClusters?: boolean;
	includeSimilarityMatrix?: boolean;
	clusterCount?: number;
	halfPrecision?: boolean;
	maxNodes?: number;
	attentionQuery?: number[];
}

export interface PageRankResult {
	nodeId: string;
	label: string;
	title: string;
	score: number;
}

export interface CommunityResult {
	communityId: number;
	members: Array<{ nodeId: string; label: string; title: string }>;
	size: number;
}

export interface GraphAnalysisResult {
	caseId?: string;
	nodeCount: number;
	edgeCount: number;
	pageRank?: PageRankResult[];
	communities?: CommunityResult[];
	gpuClusters?: {
		k: number;
		source: 'gpu' | 'cpu';
		assignments: Array<{ nodeId: string; label: string; cluster: number }>;
		centroids?: Array<{ cluster: number; vector: number[] }>;
		attentionWeights?: number[];
	};
	similarityMatrix?: {
		source: 'gpu' | 'cpu';
		precision: 'fp32' | 'fp16';
		size: number;
		topPairs: Array<{ a: string; b: string; similarity: number }>;
	};
	gpu: {
		cuda: boolean;
		freeMB: number;
		totalMB: number;
	};
	cached: boolean;
	durationMs: number;
}

// ── Cache Layer (CouchDB) ─────────────────────────────────────────────

const CACHE_DB = 'graph_analysis_cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function buildCacheKey(req: GraphAnalysisRequest): string {
	const hash = createHash('md5')
		.update(JSON.stringify(req))
		.digest('hex');
	return `gqa-${req.caseId ?? 'global'}-${hash}`;
}

async function getCachedResult(key: string): Promise<GraphAnalysisResult | null> {
	try {
		const doc = await couchdb.get(CACHE_DB, key);
		const cachedAt = doc.cachedAt as number;
		if (cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) {
			return { ...(doc.result as GraphAnalysisResult), cached: true };
		}
	} catch {
		// Not cached or DB not available
	}
	return null;
}

async function setCachedResult(key: string, result: GraphAnalysisResult): Promise<void> {
	try {
		await couchdb.createDb(CACHE_DB).catch(() => {}); // ensure DB exists
		await couchdb.put(CACHE_DB, key, {
			result,
			cachedAt: Date.now(),
			caseId: result.caseId,
		});
	} catch {
		// Cache write failure — non-fatal
	}
}

// ── Neo4j Graph Queries ───────────────────────────────────────────────

interface GraphNode {
	nodeId: string;
	label: string;
	title: string;
}

/** Fetch graph nodes and edges from Neo4j for a case (or entire graph) */
async function fetchGraphData(
	caseId: string | undefined,
	maxNodes: number
): Promise<{ nodes: GraphNode[]; edges: Array<{ from: string; to: string; type: string }>; nodeCount: number; edgeCount: number }> {
	try {
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			const nodeQuery = caseId
				? `MATCH (c:Case {id: $caseId})-[r*1..2]-(n)
				   RETURN DISTINCT elementId(n) AS nodeId, labels(n)[0] AS label, COALESCE(n.title, n.name, n.term, n.code, '') AS title
				   LIMIT $maxNodes`
				: `MATCH (n)
				   RETURN DISTINCT elementId(n) AS nodeId, labels(n)[0] AS label, COALESCE(n.title, n.name, n.term, n.code, '') AS title
				   LIMIT $maxNodes`;

			const nodeResult = await session.run(nodeQuery, {
				caseId: caseId ?? '',
				maxNodes: neo4j.int(maxNodes),
			});

			const nodes: GraphNode[] = nodeResult.records.map((r) => ({
				nodeId: String(r.get('nodeId')),
				label: String(r.get('label') ?? 'Unknown'),
				title: String(r.get('title') ?? ''),
			}));

			const edgeQuery = caseId
				? `MATCH (a)-[r]-(b)
				   WHERE elementId(a) IN $nodeIds AND elementId(b) IN $nodeIds
				   RETURN DISTINCT elementId(a) AS fromId, elementId(b) AS toId, type(r) AS relType
				   LIMIT 5000`
				: `MATCH (a)-[r]-(b)
				   WHERE elementId(a) IN $nodeIds AND elementId(b) IN $nodeIds
				   RETURN DISTINCT elementId(a) AS fromId, elementId(b) AS toId, type(r) AS relType
				   LIMIT 5000`;

			const nodeIds = nodes.map((n) => n.nodeId);
			const edgeResult = await session.run(edgeQuery, {
				caseId: caseId ?? '',
				nodeIds,
			});

			const edges = edgeResult.records.map((r) => ({
				from: String(r.get('fromId')),
				to: String(r.get('toId')),
				type: String(r.get('relType') ?? 'RELATED'),
			}));

			return { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length };
		} finally {
			await session.close();
		}
	} catch (err) {
		console.warn('[gpu-graph-analysis] Neo4j query failed:', (err as Error)?.message);
		return { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 };
	}
}

/** Run PageRank on the Neo4j graph (in-memory TypeScript implementation) */
function computePageRank(
	nodes: GraphNode[],
	edges: Array<{ from: string; to: string }>,
	damping = 0.85,
	maxIter = 50
): PageRankResult[] {
	const n = nodes.length;
	if (n === 0) return [];

	const nodeIndex = new Map<string, number>();
	nodes.forEach((node, i) => nodeIndex.set(node.nodeId, i));

	// Build adjacency
	const outDegree = new Array(n).fill(0);
	const inLinks: number[][] = Array.from({ length: n }, () => []);

	for (const edge of edges) {
		const fromIdx = nodeIndex.get(edge.from);
		const toIdx = nodeIndex.get(edge.to);
		if (fromIdx !== undefined && toIdx !== undefined) {
			outDegree[fromIdx]++;
			inLinks[toIdx].push(fromIdx);
		}
	}

	// Iterative PageRank
	let ranks = new Array(n).fill(1 / n);
	const base = (1 - damping) / n;

	for (let iter = 0; iter < maxIter; iter++) {
		const newRanks = new Array(n).fill(base);
		for (let i = 0; i < n; i++) {
			let sum = 0;
			for (const j of inLinks[i]) {
				sum += ranks[j] / (outDegree[j] || 1);
			}
			newRanks[i] += damping * sum;
		}

		// Check convergence
		let maxDelta = 0;
		for (let i = 0; i < n; i++) {
			maxDelta = Math.max(maxDelta, Math.abs(newRanks[i] - ranks[i]));
		}
		ranks = newRanks;
		if (maxDelta < 1e-6) break;
	}

	// Normalize to [0, 1]
	const maxRank = Math.max(...ranks);
	const normalized = maxRank > 0 ? ranks.map((r) => r / maxRank) : ranks;

	return nodes
		.map((node, i) => ({
			nodeId: node.nodeId,
			label: node.label,
			title: node.title,
			score: Math.round(normalized[i] * 10000) / 10000,
		}))
		.sort((a, b) => b.score - a.score);
}

/** Community detection via label propagation (lightweight, no GDS dependency) */
function detectCommunities(
	nodes: GraphNode[],
	edges: Array<{ from: string; to: string }>
): CommunityResult[] {
	const n = nodes.length;
	if (n === 0) return [];

	const nodeIndex = new Map<string, number>();
	nodes.forEach((node, i) => nodeIndex.set(node.nodeId, i));

	// Build adjacency list
	const neighbors: number[][] = Array.from({ length: n }, () => []);
	for (const edge of edges) {
		const fromIdx = nodeIndex.get(edge.from);
		const toIdx = nodeIndex.get(edge.to);
		if (fromIdx !== undefined && toIdx !== undefined) {
			neighbors[fromIdx].push(toIdx);
			neighbors[toIdx].push(fromIdx);
		}
	}

	// Label propagation
	const labels = Array.from({ length: n }, (_, i) => i);
	const maxIter = 20;

	for (let iter = 0; iter < maxIter; iter++) {
		let changed = false;
		// Random order to avoid bias
		const order = Array.from({ length: n }, (_, i) => i);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}

		for (const i of order) {
			if (neighbors[i].length === 0) continue;

			// Find most frequent label among neighbors
			const labelCounts = new Map<number, number>();
			for (const j of neighbors[i]) {
				labelCounts.set(labels[j], (labelCounts.get(labels[j]) ?? 0) + 1);
			}

			let bestLabel = labels[i];
			let bestCount = 0;
			for (const [label, count] of labelCounts) {
				if (count > bestCount) {
					bestLabel = label;
					bestCount = count;
				}
			}

			if (bestLabel !== labels[i]) {
				labels[i] = bestLabel;
				changed = true;
			}
		}

		if (!changed) break;
	}

	// Group into communities
	const communityMap = new Map<number, CommunityResult>();
	for (let i = 0; i < n; i++) {
		const label = labels[i];
		if (!communityMap.has(label)) {
			communityMap.set(label, { communityId: label, members: [], size: 0 });
		}
		const community = communityMap.get(label)!;
		community.members.push({
			nodeId: nodes[i].nodeId,
			label: nodes[i].label,
			title: nodes[i].title,
		});
		community.size++;
	}

	return [...communityMap.values()]
		.sort((a, b) => b.size - a.size)
		.map((c, i) => ({ ...c, communityId: i }));
}

// ── Main Analysis Function ────────────────────────────────────────────

/**
 * Run comprehensive graph analysis combining Neo4j + GPU.
 *
 * Steps:
 *   1. Check CouchDB cache
 *   2. Fetch graph data from Neo4j
 *   3. Run PageRank (in-process, O(n*iter))
 *   4. Run community detection (label propagation, O(n*edges*iter))
 *   5. Optionally: fetch embeddings from Qdrant → GPU K-Means clustering
 *   6. Optionally: GPU similarity matrix (cuBLAS GEMM)
 *   7. Cache results in CouchDB (1hr TTL)
 */
export async function analyzeGraph(req: GraphAnalysisRequest): Promise<GraphAnalysisResult> {
	const start = performance.now();
	const cacheKey = buildCacheKey(req);

	// 1. Check cache
	const cached = await getCachedResult(cacheKey);
	if (cached) return cached;

	// GPU status
	const cuda = isCudaAvailable();
	const mem = getCudaMemoryInfo();

	// 2. Fetch graph data
	const { nodes, edges, nodeCount, edgeCount } = await fetchGraphData(
		req.caseId,
		req.maxNodes ?? 500
	);

	if (nodeCount === 0) {
		return {
			caseId: req.caseId,
			nodeCount: 0,
			edgeCount: 0,
			gpu: { cuda, freeMB: mem.freeMB, totalMB: mem.totalMB },
			cached: false,
			durationMs: Math.round(performance.now() - start),
		};
	}

	const result: GraphAnalysisResult = {
		caseId: req.caseId,
		nodeCount,
		edgeCount,
		gpu: { cuda, freeMB: mem.freeMB, totalMB: mem.totalMB },
		cached: false,
		durationMs: 0,
	};

	// 3. PageRank — GPU-first, CPU fallback when GPU fails or graph too large
	if (req.includePageRank !== false) {
		const n = nodes.length;
		let pageRankSource: 'gpu' | 'cpu' = 'cpu';
		let pageRankScores: number[] | null = null;

		if (n > 0 && n <= 2000) {
			try {
				// Build adjacency matrix as Float32Array (row-major, n×n)
				const nodeIndex = new Map<string, number>();
				nodes.forEach((node, i) => nodeIndex.set(node.nodeId, i));

				const adjMatrix = new Float32Array(n * n);
				for (const edge of edges) {
					const fromIdx = nodeIndex.get(edge.from);
					const toIdx = nodeIndex.get(edge.to);
					if (fromIdx !== undefined && toIdx !== undefined) {
						adjMatrix[fromIdx * n + toIdx] = 1;
					}
				}

				const gpuResult = pageRankGPU(adjMatrix, n, 0.85, 50);
				if (gpuResult.scores.length === n) {
					pageRankScores = Array.from(gpuResult.scores);
					pageRankSource = gpuResult.source;
				}
			} catch (err) {
				console.warn('[gpu-graph-analysis] GPU PageRank failed, falling back to CPU:', (err as Error)?.message);
			}
		}

		if (pageRankScores) {
			// Normalise to [0, 1] and attach source label
			const maxScore = Math.max(...pageRankScores);
			const normalised = maxScore > 0 ? pageRankScores.map((s) => s / maxScore) : pageRankScores;
			result.pageRank = nodes
				.map((node, i) => ({
					nodeId: node.nodeId,
					label: node.label,
					title: node.title,
					score: Math.round(normalised[i] * 10000) / 10000,
					source: pageRankSource,
				}))
				.sort((a, b) => b.score - a.score) as PageRankResult[];
		} else {
			// CPU fallback
			result.pageRank = computePageRank(nodes, edges);
		}
	}

	// 4. Community detection
	if (req.includeCommunities !== false) {
		result.communities = detectCommunities(nodes, edges);
	}

	// 5. GPU K-Means clustering (if embeddings available from Qdrant)
	if (req.includeGpuClusters) {
		try {
			const { ENV } = await import('$lib/server/env.server.js');
			// Fetch embeddings for evidence nodes
			const evidenceNodeIds = nodes
				.filter((n) => n.label === 'Evidence' || n.label === 'Case')
				.map((n) => n.nodeId);

			if (evidenceNodeIds.length >= 2) {
				const embeddings = await fetchNodeEmbeddings(ENV.QDRANT_URL, evidenceNodeIds);
				if (embeddings.length >= 2) {
					const n_emb = embeddings.length;
					const dim = embeddings[0].vector.length;
					const k = req.clusterCount ?? Math.min(8, Math.ceil(n_emb / 3));

					// Flatten to Float32Array (n × dim, row-major) for kmeansGPU
					const flatVectors = new Float32Array(n_emb * dim);
					for (let i = 0; i < n_emb; i++) {
						const v = embeddings[i].vector;
						for (let d = 0; d < dim; d++) flatVectors[i * dim + d] = v[d] ?? 0;
					}

					// kmeansGPU(embeddings, n, dim, k, maxIters?) → { assignments: Int32Array, centroids: Float32Array, source }
					const kmeansResult = kmeansGPU(flatVectors, n_emb, dim, k);

					// Unpack centroids: Float32Array[k×dim] → Array<{ cluster, vector }>
					const centroids: Array<{ cluster: number; vector: number[] }> = [];
					for (let ci = 0; ci < k; ci++) {
						centroids.push({
							cluster: ci,
							vector: Array.from(kmeansResult.centroids.subarray(ci * dim, (ci + 1) * dim)),
						});
					}

					result.gpuClusters = {
						k,
						source: kmeansResult.source,
						assignments: Array.from(kmeansResult.assignments).map((cluster, i) => ({
							nodeId: embeddings[i]?.nodeId ?? '',
							label: embeddings[i]?.label ?? '',
							cluster,
						})),
						centroids,
					};

					// Attention re-ranking of clusters if a query vector is provided
					if (req.attentionQuery && req.attentionQuery.length === dim && centroids.length > 0) {
						try {
							const queryVec = new Float32Array(req.attentionQuery);
							const centroidMatrix = kmeansResult.centroids; // already k×dim Float32Array
							const attnResult = attentionScoreGPU(queryVec, dim, centroidMatrix, k);
							result.gpuClusters.attentionWeights = Array.from(attnResult.weights);
						} catch (attnErr) {
							console.warn('[gpu-graph-analysis] attentionScoreGPU failed:', (attnErr as Error)?.message);
						}
					}
				}
			}
		} catch (err) {
			console.warn('[gpu-graph-analysis] GPU clustering failed:', (err as Error)?.message);
		}
	}

	// 6. GPU similarity matrix
	if (req.includeSimilarityMatrix) {
		try {
			const { ENV } = await import('$lib/server/env.server.js');
			const evidenceNodeIds = nodes
				.filter((n) => n.label === 'Evidence' || n.label === 'Case')
				.map((n) => n.nodeId);

			const embeddings = await fetchNodeEmbeddings(ENV.QDRANT_URL, evidenceNodeIds);
			if (embeddings.length >= 2) {
				const vectors = embeddings.map((e) => e.vector);
				const simResult = req.halfPrecision
					? await graphSimilarityHalf(vectors)
					: await graphSimilarity(vectors);

				// Extract top similar pairs
				const topPairs: Array<{ a: string; b: string; similarity: number }> = [];
				for (let i = 0; i < simResult.n; i++) {
					for (let j = i + 1; j < simResult.n; j++) {
						const sim = simResult.matrix[i][j];
						if (sim >= 0.8) {
							topPairs.push({
								a: embeddings[i].nodeId,
								b: embeddings[j].nodeId,
								similarity: Math.round(sim * 10000) / 10000,
							});
						}
					}
				}
				topPairs.sort((a, b) => b.similarity - a.similarity);

				result.similarityMatrix = {
					source: simResult.source,
					precision: req.halfPrecision ? 'fp16' : 'fp32',
					size: simResult.n,
					topPairs: topPairs.slice(0, 50),
				};
			}
		} catch (err) {
			console.warn('[gpu-graph-analysis] Similarity matrix failed:', (err as Error)?.message);
		}
	}

	result.durationMs = Math.round(performance.now() - start);

	// 7. Cache
	await setCachedResult(cacheKey, result);

	return result;
}

// ── Helper: Fetch embeddings from Qdrant for Neo4j node IDs ───────────

interface NodeEmbedding {
	nodeId: string;
	label: string;
	vector: number[];
}

async function fetchNodeEmbeddings(
	qdrantUrl: string,
	nodeIds: string[]
): Promise<NodeEmbedding[]> {
	const results: NodeEmbedding[] = [];

	// Search evidence_items collection for matching IDs
	try {
		const res = await fetch(`${qdrantUrl}/collections/evidence_items/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				limit: Math.min(nodeIds.length, 200),
				with_payload: true,
				with_vector: true,
				filter: {
					should: [
						{ key: 'evidence_id', match: { any: nodeIds } },
						{ key: 'document_id', match: { any: nodeIds } },
					],
				},
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (res.ok) {
			const data = await res.json();
			const points = data.result?.points ?? [];
			for (const point of points) {
				const vector = Array.isArray(point.vector)
					? point.vector
					: point.vector?.dense ?? point.vector?.content ?? null;
				if (vector && vector.length > 0) {
					results.push({
						nodeId: String(point.payload?.evidence_id ?? point.payload?.document_id ?? point.id),
						label: String(point.payload?.type ?? 'Evidence'),
						vector,
					});
				}
			}
		}
	} catch {
		// Non-fatal
	}

	return results;
}
