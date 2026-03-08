/**
 * Citation Network Graph — Iterative PageRank for Legal Documents
 *
 * Builds a citation graph from document content and computes iterative
 * PageRank authority scores. Categorizes documents by network position:
 *   - CORE: High PageRank, many inbound links (authoritative precedent)
 *   - BRIDGE: Moderate PageRank, connects multiple clusters
 *   - PERIPHERAL: Low PageRank, few connections
 *
 * Usage:
 *   const graph = new CitationGraph();
 *   graph.buildFromItems(searchResults);
 *   graph.runPageRank();
 *   const score = graph.getAuthorityScore(docId);
 */

import type { RankableItem } from './legal-pagerank.js';
import { getRedis } from '$lib/server/redis.js';

interface GraphNode {
	rank: number;
	inLinks: Set<string>;
	outLinks: Set<string>;
}

interface SerializedNode {
	rank: number;
	inLinks: string[];
	outLinks: string[];
}

export type NetworkPosition = 'CORE' | 'BRIDGE' | 'PERIPHERAL';

// Citation detection patterns (reused from legal-pagerank countInlineCitations)
const CITATION_PATTERNS = [
	/§\s*\d+/g,                                                             // Section references
	/\d+\s+U\.?S\.?C\.?\s*§?\s*\d+/gi,                                     // USC references
	/\b(\w+)\s+v\.?\s+(\w+)/g,                                             // Case citations
	/\d+\s+(?:F\.\d+d|S\.Ct\.|L\.Ed|U\.S\.|A\.\d+d|N\.(?:E|W|Y|J)\.?\d*d?)\s+\d+/g  // Reporter citations
];

/**
 * Extract citation identifiers from document content
 * Returns normalized citation strings for graph edge construction
 */
function extractCitations(content: string): string[] {
	const citations: string[] = [];
	for (const pattern of CITATION_PATTERNS) {
		const matches = content.match(new RegExp(pattern.source, pattern.flags));
		if (matches) {
			for (const m of matches) {
				citations.push(m.trim().toLowerCase());
			}
		}
	}
	return citations;
}

export class CitationGraph {
	private nodes = new Map<string, GraphNode>();
	private citationToDocId = new Map<string, string>();

	/**
	 * Build citation graph from search result items
	 * Creates nodes for each document and edges based on citation references
	 */
	buildFromItems(items: RankableItem[]): void {
		this.nodes.clear();
		this.citationToDocId.clear();

		// Phase 1: Create nodes and index citations
		for (const item of items) {
			this.nodes.set(item.id, {
				rank: 1.0 / items.length, // Initial uniform rank
				inLinks: new Set(),
				outLinks: new Set()
			});

			// Index this document's own citations for cross-referencing
			const metaCitations = (item.metadata?.citations as string[]) ?? [];
			for (const c of metaCitations) {
				this.citationToDocId.set(c.toLowerCase(), item.id);
			}

			// Also index by title for case name matching
			const title = String(item.metadata?.title ?? '').toLowerCase();
			if (title.length > 3) {
				this.citationToDocId.set(title, item.id);
			}
		}

		// Phase 2: Build edges by matching citations across documents
		for (const item of items) {
			const citations = extractCitations(item.content);
			const metaCitations = (item.metadata?.citations as string[]) ?? [];
			const allCitations = [...citations, ...metaCitations.map(c => c.toLowerCase())];

			for (const citation of allCitations) {
				const targetId = this.citationToDocId.get(citation);
				if (targetId && targetId !== item.id) {
					// item cites targetId → outLink from item, inLink to target
					const sourceNode = this.nodes.get(item.id);
					const targetNode = this.nodes.get(targetId);
					if (sourceNode && targetNode) {
						sourceNode.outLinks.add(targetId);
						targetNode.inLinks.add(item.id);
					}
				}
			}
		}
	}

	/**
	 * Run iterative PageRank algorithm
	 * @param damping - Damping factor (0.85 standard)
	 * @param maxIter - Maximum iterations
	 * @param tolerance - Convergence threshold
	 * @returns Number of iterations until convergence
	 */
	runPageRank(damping = 0.85, maxIter = 50, tolerance = 1e-4): number {
		const n = this.nodes.size;
		if (n === 0) return 0;

		const baseProbability = (1 - damping) / n;
		let iterations = 0;

		for (let iter = 0; iter < maxIter; iter++) {
			let maxDelta = 0;
			iterations = iter + 1;

			// Compute new ranks
			const newRanks = new Map<string, number>();

			for (const [nodeId, node] of this.nodes) {
				let inboundSum = 0;
				for (const sourceId of node.inLinks) {
					const sourceNode = this.nodes.get(sourceId);
					if (sourceNode && sourceNode.outLinks.size > 0) {
						inboundSum += sourceNode.rank / sourceNode.outLinks.size;
					}
				}

				const newRank = baseProbability + damping * inboundSum;
				newRanks.set(nodeId, newRank);

				const delta = Math.abs(newRank - node.rank);
				if (delta > maxDelta) maxDelta = delta;
			}

			// Update ranks
			for (const [nodeId, newRank] of newRanks) {
				this.nodes.get(nodeId)!.rank = newRank;
			}

			// Check convergence
			if (maxDelta < tolerance) break;
		}

		return iterations;
	}

	/**
	 * Get normalized authority score for a document [0, 1]
	 */
	getAuthorityScore(id: string): number {
		const node = this.nodes.get(id);
		if (!node) return 0;

		// Normalize across all ranks
		let maxRank = 0;
		for (const n of this.nodes.values()) {
			if (n.rank > maxRank) maxRank = n.rank;
		}

		return maxRank > 0 ? node.rank / maxRank : 0;
	}

	/**
	 * Classify document's position in the citation network
	 */
	getNetworkPosition(id: string): NetworkPosition {
		const node = this.nodes.get(id);
		if (!node) return 'PERIPHERAL';

		const authority = this.getAuthorityScore(id);
		const connectionCount = node.inLinks.size + node.outLinks.size;

		// CORE: High authority AND many connections
		if (authority > 0.6 && connectionCount >= 3) return 'CORE';

		// BRIDGE: Moderate authority with both in and out connections
		if (authority > 0.3 && node.inLinks.size > 0 && node.outLinks.size > 0) return 'BRIDGE';

		return 'PERIPHERAL';
	}

	/** Get total number of nodes */
	get size(): number {
		return this.nodes.size;
	}

	/** Get total number of edges */
	get edgeCount(): number {
		let count = 0;
		for (const node of this.nodes.values()) {
			count += node.outLinks.size;
		}
		return count;
	}

	// -------------------------------------------------------------------
	// Redis Persistence
	// -------------------------------------------------------------------

	/**
	 * Save graph to Redis for reuse between requests
	 * @param cacheKey - Unique key (e.g. citation-graph:{caseId}:{queryHash})
	 * @param ttlSeconds - Time to live (default 1 hour)
	 */
	async saveToRedis(cacheKey: string, ttlSeconds = 3600): Promise<void> {
		try {
			const redis = getRedis();
			const serialized: Record<string, SerializedNode> = {};
			for (const [id, node] of this.nodes) {
				serialized[id] = {
					rank: node.rank,
					inLinks: [...node.inLinks],
					outLinks: [...node.outLinks]
				};
			}
			const data = {
				nodes: serialized,
				citationIndex: Object.fromEntries(this.citationToDocId)
			};
			await redis.set(cacheKey, JSON.stringify(data), 'EX', ttlSeconds);
		} catch {
			// Cache save failure is non-fatal
		}
	}

	/**
	 * Load graph from Redis cache
	 * @returns true if loaded successfully, false if cache miss or error
	 */
	static async loadFromRedis(cacheKey: string): Promise<CitationGraph | null> {
		try {
			const redis = getRedis();
			const raw = await redis.get(cacheKey);
			if (!raw) return null;

			const data = JSON.parse(raw) as {
				nodes: Record<string, SerializedNode>;
				citationIndex: Record<string, string>;
			};

			const graph = new CitationGraph();
			for (const [id, sn] of Object.entries(data.nodes)) {
				graph.nodes.set(id, {
					rank: sn.rank,
					inLinks: new Set(sn.inLinks),
					outLinks: new Set(sn.outLinks)
				});
			}
			for (const [citation, docId] of Object.entries(data.citationIndex)) {
				graph.citationToDocId.set(citation, docId);
			}
			return graph;
		} catch {
			return null;
		}
	}

	// -------------------------------------------------------------------
	// Incremental Updates
	// -------------------------------------------------------------------

	/**
	 * Add a single item to the graph without full rebuild.
	 * Re-runs PageRank after adding (convergence is fast for small deltas).
	 */
	addItem(item: RankableItem): void {
		if (this.nodes.has(item.id)) return;

		this.nodes.set(item.id, {
			rank: 1.0 / (this.nodes.size + 1),
			inLinks: new Set(),
			outLinks: new Set()
		});

		// Index citations
		const metaCitations = (item.metadata?.citations as string[]) ?? [];
		for (const c of metaCitations) {
			this.citationToDocId.set(c.toLowerCase(), item.id);
		}
		const title = String(item.metadata?.title ?? '').toLowerCase();
		if (title.length > 3) {
			this.citationToDocId.set(title, item.id);
		}

		// Build edges for new item
		const citations = extractCitations(item.content);
		const allCitations = [...citations, ...metaCitations.map((c) => c.toLowerCase())];
		for (const citation of allCitations) {
			const targetId = this.citationToDocId.get(citation);
			if (targetId && targetId !== item.id) {
				const sourceNode = this.nodes.get(item.id);
				const targetNode = this.nodes.get(targetId);
				if (sourceNode && targetNode) {
					sourceNode.outLinks.add(targetId);
					targetNode.inLinks.add(item.id);
				}
			}
		}

		// Check if any existing documents cite this new one
		for (const [otherId, otherNode] of this.nodes) {
			if (otherId === item.id) continue;
			for (const outId of otherNode.outLinks) {
				if (this.citationToDocId.get(outId) === item.id) {
					otherNode.outLinks.add(item.id);
					this.nodes.get(item.id)!.inLinks.add(otherId);
				}
			}
		}
	}

	/**
	 * Remove a node and its edges from the graph
	 */
	removeItem(id: string): void {
		const node = this.nodes.get(id);
		if (!node) return;

		// Remove inbound references from sources
		for (const sourceId of node.inLinks) {
			const sourceNode = this.nodes.get(sourceId);
			if (sourceNode) sourceNode.outLinks.delete(id);
		}

		// Remove outbound references from targets
		for (const targetId of node.outLinks) {
			const targetNode = this.nodes.get(targetId);
			if (targetNode) targetNode.inLinks.delete(id);
		}

		this.nodes.delete(id);

		// Clean up citation index
		for (const [citation, docId] of this.citationToDocId) {
			if (docId === id) this.citationToDocId.delete(citation);
		}
	}

	// -------------------------------------------------------------------
	// Statistics
	// -------------------------------------------------------------------

	/**
	 * Get graph statistics for search response metadata
	 */
	getStats(): {
		nodeCount: number;
		edgeCount: number;
		avgDegree: number;
		density: number;
		coreNodes: number;
		bridgeNodes: number;
		peripheralNodes: number;
	} {
		const nodeCount = this.nodes.size;
		const edges = this.edgeCount;
		const avgDegree = nodeCount > 0 ? (edges * 2) / nodeCount : 0;
		const maxEdges = nodeCount * (nodeCount - 1);
		const density = maxEdges > 0 ? edges / maxEdges : 0;

		let coreNodes = 0;
		let bridgeNodes = 0;
		let peripheralNodes = 0;
		for (const id of this.nodes.keys()) {
			const pos = this.getNetworkPosition(id);
			if (pos === 'CORE') coreNodes++;
			else if (pos === 'BRIDGE') bridgeNodes++;
			else peripheralNodes++;
		}

		return { nodeCount, edgeCount: edges, avgDegree, density, coreNodes, bridgeNodes, peripheralNodes };
	}
}
