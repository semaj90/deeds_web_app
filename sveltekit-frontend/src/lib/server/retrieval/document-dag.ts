/**
 * Document DAG — Citation Dependency Ordering
 *
 * Builds a directed acyclic graph from citation references between documents,
 * then applies topological sort (Kahn's algorithm) so cited documents appear
 * before citing documents in the result set.
 *
 * Handles cycles gracefully by breaking the lowest-scored edge.
 *
 * Usage:
 *   const ordered = orderByDependency(rankedDocs);
 */

export interface DAGDocument {
	id: string;
	title: string;
	score: number;
	citations: string[]; // IDs or titles of documents this one cites
	content?: string;
}

export interface DAGEdge {
	from: string; // citing document
	to: string; // cited document
	score: number; // score of the citing document (for cycle breaking)
}

export interface DAGResult {
	ordered: DAGDocument[];
	cycles: string[][]; // detected cycles (each is a path of IDs)
	edgesDropped: number; // edges removed to break cycles
}

/**
 * Build adjacency list from documents and their citation references.
 * Edges point from citing doc → cited doc.
 */
export function buildCitationDAG(
	documents: DAGDocument[]
): { adjacency: Map<string, string[]>; inDegree: Map<string, number> } {
	const docIds = new Set(documents.map((d) => d.id));
	const adjacency = new Map<string, string[]>();
	const inDegree = new Map<string, number>();

	// Initialize all nodes
	for (const doc of documents) {
		adjacency.set(doc.id, []);
		inDegree.set(doc.id, 0);
	}

	// Build edges: if doc A cites doc B (and B is in our set), add edge A → B
	for (const doc of documents) {
		for (const citedId of doc.citations) {
			if (docIds.has(citedId) && citedId !== doc.id) {
				adjacency.get(doc.id)!.push(citedId);
				inDegree.set(citedId, (inDegree.get(citedId) ?? 0) + 1);
			}
		}
	}

	return { adjacency, inDegree };
}

/**
 * Topological sort using Kahn's algorithm (BFS-based).
 * Returns sorted node IDs where cited docs appear before citing docs.
 *
 * If cycles exist, breaks them by removing the edge from the lowest-scored node.
 */
export function topologicalSort(
	documents: DAGDocument[],
	adjacency: Map<string, string[]>,
	inDegree: Map<string, number>
): { sorted: string[]; cycles: string[][]; edgesDropped: number } {
	const docMap = new Map(documents.map((d) => [d.id, d]));
	const degree = new Map(inDegree); // clone
	const adj = new Map<string, string[]>();
	for (const [k, v] of adjacency) {
		adj.set(k, [...v]);
	}

	const sorted: string[] = [];
	const cycles: string[][] = [];
	let edgesDropped = 0;
	const maxIterations = documents.length + 10; // safety limit
	let iteration = 0;

	while (sorted.length < documents.length && iteration < maxIterations) {
		iteration++;

		// Find all nodes with in-degree 0
		const queue: string[] = [];
		for (const [id, deg] of degree) {
			if (deg === 0 && !sorted.includes(id)) {
				queue.push(id);
			}
		}

		if (queue.length > 0) {
			// Sort queue by score descending (higher-scored cited docs first)
			queue.sort((a, b) => (docMap.get(b)?.score ?? 0) - (docMap.get(a)?.score ?? 0));

			for (const nodeId of queue) {
				sorted.push(nodeId);
				degree.set(nodeId, -1); // mark as processed

				// Reduce in-degree of neighbors
				for (const neighbor of adj.get(nodeId) ?? []) {
					const current = degree.get(neighbor) ?? 0;
					if (current > 0) {
						degree.set(neighbor, current - 1);
					}
				}
			}
		} else {
			// Cycle detected — break it by removing edge from lowest-scored remaining node
			const remaining = documents.filter(
				(d) => !sorted.includes(d.id) && (degree.get(d.id) ?? -1) >= 0
			);

			if (remaining.length === 0) break;

			// Find the lowest-scored node in the cycle
			remaining.sort((a, b) => a.score - b.score);
			const weakest = remaining[0];

			// Record cycle path
			const cyclePath = remaining.map((d) => d.id);
			cycles.push(cyclePath);

			// Drop all incoming edges to the weakest node
			for (const [, neighbors] of adj) {
				const idx = neighbors.indexOf(weakest.id);
				if (idx !== -1) {
					neighbors.splice(idx, 1);
					edgesDropped++;
				}
			}
			degree.set(weakest.id, 0);

			if (cycles.length > 5) {
				console.warn('[DAG] Too many cycles, forcing remaining order by score');
				const rest = remaining.map((d) => d.id);
				sorted.push(...rest);
				break;
			}
		}
	}

	return { sorted, cycles, edgesDropped };
}

/**
 * Reorder ranked documents so cited documents appear before citing documents.
 * Preserves score-based ordering within each dependency level.
 *
 * @param documents - Ranked documents with citation references
 * @returns Ordered documents + cycle info
 */
export function orderByDependency(documents: DAGDocument[]): DAGResult {
	if (documents.length <= 1) {
		return { ordered: documents, cycles: [], edgesDropped: 0 };
	}

	const { adjacency, inDegree } = buildCitationDAG(documents);
	const { sorted, cycles, edgesDropped } = topologicalSort(
		documents,
		adjacency,
		inDegree
	);

	if (cycles.length > 0) {
		console.warn(
			`[DAG] Broke ${cycles.length} cycle(s), dropped ${edgesDropped} edge(s)`
		);
	}

	// Map sorted IDs back to documents
	const docMap = new Map(documents.map((d) => [d.id, d]));
	const ordered = sorted
		.map((id) => docMap.get(id))
		.filter((d): d is DAGDocument => d !== undefined);

	// Append any documents that weren't in the sort (safety net)
	for (const doc of documents) {
		if (!sorted.includes(doc.id)) {
			ordered.push(doc);
		}
	}

	return { ordered, cycles, edgesDropped };
}

/**
 * Extract citation IDs from document text content.
 * Looks for patterns like document IDs, case citations, and statute references.
 */
export function extractCitationRefs(
	text: string,
	knownIds: Set<string>
): string[] {
	const refs: string[] = [];

	// Match UUIDs that exist in our document set
	const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
	const uuids = text.match(uuidPattern) ?? [];
	for (const uuid of uuids) {
		if (knownIds.has(uuid) && !refs.includes(uuid)) {
			refs.push(uuid);
		}
	}

	return refs;
}
