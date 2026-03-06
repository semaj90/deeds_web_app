/**
 * Graph Centrality Calculator
 *
 * Computes real graph centrality metrics from Neo4j for the recommendation engine.
 * Replaces the hardcoded centrality: 0.8 in fetchGraphCandidates().
 *
 * Metrics:
 *   - Degree centrality: # of relationships / max possible
 *   - Connection strength: shared entities between case pairs
 *   - Combined score: normalized [0, 1] for multi-modal ranker signal #4
 *
 * Graceful degradation: Returns empty results when Neo4j is unavailable.
 */

import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

export interface GraphDocument {
	id: string;
	title: string;
	nodeLabel: string; // 'Evidence' | 'Case' | 'Person' | 'Statute'
	centrality: number; // [0, 1] normalized degree centrality
	connectionStrength: number; // # of shared entities with source case
	relationships: string[]; // relationship types traversed
	caseIds: string[];
}

export interface GraphCentralityResult {
	documents: GraphDocument[];
	totalNodes: number;
	totalRelationships: number;
	maxDegree: number;
	durationMs: number;
}

/**
 * Fetch graph-connected documents for a case with real centrality scores.
 *
 * Cypher strategy:
 *   1. Start from Case node
 *   2. Walk 1-2 hops to find Evidence, Person, Statute nodes
 *   3. Compute degree centrality (total relationships per node)
 *   4. Normalize centrality to [0, 1] using max-degree in result set
 *   5. Return as DocumentCandidate-compatible shape
 */
export async function fetchGraphDocuments(
	caseId: string,
	limit: number = 20
): Promise<GraphCentralityResult> {
	const start = Date.now();
	const empty: GraphCentralityResult = {
		documents: [],
		totalNodes: 0,
		totalRelationships: 0,
		maxDegree: 0,
		durationMs: 0
	};

	try {
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			// Step 1: Find all nodes connected to this case within 2 hops
			// and compute their degree centrality (total relationship count)
			const result = await session.run(
				`MATCH (source:Case {id: $caseId})-[r1]-(neighbor)
				 WHERE neighbor.id IS NOT NULL
				 // Count total relationships for each neighbor (degree centrality)
				 OPTIONAL MATCH (neighbor)-[allRels]-()
				 WITH neighbor,
					  labels(neighbor)[0] AS nodeLabel,
					  type(r1) AS relType,
					  count(DISTINCT allRels) AS degree
				 // Also find 2nd-hop connections through this case
				 OPTIONAL MATCH (neighbor)-[r2]-(hop2)
				 WHERE hop2.id IS NOT NULL AND hop2.id <> $caseId
				 WITH neighbor, nodeLabel, relType, degree,
					  collect(DISTINCT type(r2)) AS hop2Rels,
					  count(DISTINCT hop2) AS connectionStrength
				 RETURN DISTINCT
					 neighbor.id AS nodeId,
					 coalesce(neighbor.title, neighbor.name, neighbor.code, '') AS title,
					 nodeLabel,
					 relType,
					 degree,
					 connectionStrength,
					 hop2Rels
				 ORDER BY degree DESC, connectionStrength DESC
				 LIMIT $limit`,
				{ caseId, limit: Number(limit) }
			);

			if (result.records.length === 0) {
				empty.durationMs = Date.now() - start;
				return empty;
			}

			// Step 2: Extract raw results
			const rawNodes: Array<{
				id: string;
				title: string;
				nodeLabel: string;
				relType: string;
				degree: number;
				connectionStrength: number;
				hop2Rels: string[];
			}> = [];

			for (const rec of result.records) {
				rawNodes.push({
					id: rec.get('nodeId'),
					title: rec.get('title') || 'Untitled',
					nodeLabel: rec.get('nodeLabel') || 'Unknown',
					relType: rec.get('relType') || '',
					degree: toNumber(rec.get('degree')),
					connectionStrength: toNumber(rec.get('connectionStrength')),
					hop2Rels: (rec.get('hop2Rels') as string[]) || []
				});
			}

			// Step 3: Compute normalized centrality
			const maxDegree = Math.max(1, ...rawNodes.map((n) => n.degree));
			let totalRels = 0;

			// Deduplicate nodes (same node may appear via different relationship types)
			const nodeMap = new Map<string, GraphDocument>();
			for (const node of rawNodes) {
				totalRels += node.degree;
				const existing = nodeMap.get(node.id);
				if (existing) {
					// Merge: keep highest centrality, accumulate relationships
					existing.centrality = Math.max(existing.centrality, node.degree / maxDegree);
					existing.connectionStrength = Math.max(
						existing.connectionStrength,
						node.connectionStrength
					);
					if (!existing.relationships.includes(node.relType)) {
						existing.relationships.push(node.relType);
					}
				} else {
					nodeMap.set(node.id, {
						id: node.id,
						title: node.title,
						nodeLabel: node.nodeLabel,
						centrality: node.degree / maxDegree,
						connectionStrength: node.connectionStrength,
						relationships: [node.relType],
						caseIds: [caseId]
					});
				}
			}

			const documents = Array.from(nodeMap.values())
				.sort((a, b) => b.centrality - a.centrality)
				.slice(0, limit);

			return {
				documents,
				totalNodes: nodeMap.size,
				totalRelationships: totalRels,
				maxDegree,
				durationMs: Date.now() - start
			};
		} finally {
			await session.close();
		}
	} catch (err) {
		console.warn('[graph-centrality] Neo4j unavailable, returning empty results:', err);
		empty.durationMs = Date.now() - start;
		return empty;
	}
}

/**
 * Compute degree centrality for specific node IDs.
 * Used to enrich existing candidates with graph centrality scores.
 *
 * Returns Map<nodeId, centralityScore [0, 1]>
 */
export async function computeCentralityForNodes(
	nodeIds: string[]
): Promise<Map<string, number>> {
	const centralities = new Map<string, number>();
	if (nodeIds.length === 0) return centralities;

	try {
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			const result = await session.run(
				`UNWIND $nodeIds AS nid
				 MATCH (n {id: nid})
				 OPTIONAL MATCH (n)-[r]-()
				 WITH n.id AS nodeId, count(r) AS degree
				 RETURN nodeId, degree
				 ORDER BY degree DESC`,
				{ nodeIds }
			);

			if (result.records.length === 0) return centralities;

			// Normalize by max degree in the batch
			const degrees: Array<{ id: string; degree: number }> = result.records.map((rec) => ({
				id: rec.get('nodeId'),
				degree: toNumber(rec.get('degree'))
			}));

			const maxDegree = Math.max(1, ...degrees.map((d) => d.degree));
			for (const d of degrees) {
				centralities.set(d.id, d.degree / maxDegree);
			}
		} finally {
			await session.close();
		}
	} catch (err) {
		console.warn('[graph-centrality] Centrality computation failed:', err);
	}

	return centralities;
}

/**
 * Find cases connected to a source case via shared entities (2-hop graph walk).
 * Returns cases with connection strength (# of shared entities).
 */
export async function findConnectedCases(
	caseId: string,
	limit: number = 10
): Promise<Array<{ caseId: string; title: string; strength: number; sharedTypes: string[] }>> {
	try {
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			const result = await session.run(
				`MATCH (c1:Case {id: $caseId})-[r1]-(shared)-[r2]-(c2:Case)
				 WHERE c1 <> c2
				 WITH c2,
					  count(DISTINCT shared) AS strength,
					  collect(DISTINCT labels(shared)[0]) AS sharedTypes
				 RETURN c2.id AS caseId, c2.title AS title, strength, sharedTypes
				 ORDER BY strength DESC
				 LIMIT $limit`,
				{ caseId, limit: Number(limit) }
			);

			return result.records.map((rec) => ({
				caseId: rec.get('caseId'),
				title: rec.get('title') || '',
				strength: toNumber(rec.get('strength')),
				sharedTypes: (rec.get('sharedTypes') as string[]) || []
			}));
		} finally {
			await session.close();
		}
	} catch (err) {
		console.warn('[graph-centrality] Connected cases query failed:', err);
		return [];
	}
}

/**
 * Convert Neo4j integer (which may be a neo4j.Integer object) to JS number.
 */
function toNumber(val: unknown): number {
	if (val === null || val === undefined) return 0;
	if (typeof val === 'number') return val;
	if (typeof val === 'object' && val !== null && 'toNumber' in val) {
		return (val as { toNumber: () => number }).toNumber();
	}
	return Number(val) || 0;
}
