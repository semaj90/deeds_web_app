import { createHash } from 'node:crypto';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import {
	GraphFanoutPlanV1Schema,
	GraphFanoutReceiptV1Schema,
	type GraphFanoutPlanV1,
	type GraphFanoutReceiptV1,
	type GraphTraversalDirection,
} from './graph-fanout-contract.js';

const SAFE_RELATIONSHIP_TYPE = /^[A-Z][A-Z0-9_]*$/;

export interface GraphFanoutCandidateV1 {
	canonicalId: string;
	stableKey: string;
	labels: string[];
	hop: number;
	parentCanonicalId: string;
	relationshipType: string;
	direction: GraphTraversalDirection;
}

export interface GraphFanoutExecutionV1 {
	candidates: GraphFanoutCandidateV1[];
	receipt: GraphFanoutReceiptV1;
}

/** Explicit canonical/packet/source identity only; stableKey/id are metadata, never canonical fallback. */
function nodeIdentityExpression(variable: string): string {
	return `coalesce(${variable}.canonicalId, ${variable}.canonical_id, ${variable}.packetKey, ${variable}.packet_key, ${variable}.sourceRef, ${variable}.source_ref)`;
}

function relationshipPattern(type: string, direction: GraphTraversalDirection): string {
	if (!SAFE_RELATIONSHIP_TYPE.test(type)) {
		throw new Error(`unsafe relationship type '${type}'`);
	}
	if (direction === 'OUT') return `-[r:${type}]->`;
	if (direction === 'IN') return `<-[r:${type}]-`;
	return `-[r:${type}]-`;
}

export async function executeGraphFanoutPlanNeo4j(input: unknown): Promise<GraphFanoutExecutionV1> {
	const plan = GraphFanoutPlanV1Schema.parse(input);
	return executeValidatedGraphFanoutPlanNeo4j(plan);
}

async function executeValidatedGraphFanoutPlanNeo4j(plan: GraphFanoutPlanV1): Promise<GraphFanoutExecutionV1> {
	const driver = getNeo4jDriver();
	const session = driver.session();
	const startedAt = Date.now();
	const deadline = startedAt + plan.budget.timeBudgetMs;
	const visited = new Set<string>(plan.seedCanonicalIds);
	let frontier = [...plan.seedCanonicalIds].sort();
	const candidates: GraphFanoutCandidateV1[] = [];
	let visitedEdgeCount = 0;
	let maxObservedHop = 0;
	let budgetExhausted = false;

	try {
		for (let hop = 1; hop <= plan.budget.maxHops && frontier.length > 0; hop += 1) {
			const nextFrontier = new Set<string>();
			for (const parentCanonicalId of frontier) {
				if (Date.now() >= deadline) {
					budgetExhausted = true;
					break;
				}
				let nodeRemaining = plan.budget.maxNeighborsPerNode;
				for (const relation of plan.relationships) {
					if (nodeRemaining <= 0) break;
					if (visitedEdgeCount >= plan.budget.maxEdges) {
						budgetExhausted = true;
						break;
					}
					if (visited.size >= plan.budget.maxNodes || candidates.length >= plan.budget.candidateBudget) {
						budgetExhausted = true;
						break;
					}
					const remainingEdges = plan.budget.maxEdges - visitedEdgeCount;
					const remainingNodes = plan.budget.maxNodes - visited.size;
					const remainingCandidates = plan.budget.candidateBudget - candidates.length;
					const relationLimit = Math.max(0, Math.min(
						relation.maxNeighbors,
						nodeRemaining,
						remainingEdges,
						remainingNodes,
						remainingCandidates,
					));
					if (relationLimit === 0) {
						budgetExhausted = true;
						break;
					}
					const pattern = relationshipPattern(relation.relationshipType, relation.direction);
					const query = `
						MATCH (start)
						WITH start, ${nodeIdentityExpression('start')} AS startCanonicalId
						WHERE startCanonicalId = $parentCanonicalId
						MATCH (start)${pattern}(neighbor)
						WITH neighbor, type(r) AS relationshipType
						WITH neighbor, relationshipType, ${nodeIdentityExpression('neighbor')} AS canonicalId
						WHERE canonicalId IS NOT NULL
						RETURN canonicalId,
						       coalesce(neighbor.stableKey, neighbor.sourceRef, neighbor.source_ref, canonicalId) AS stableKey,
						       labels(neighbor) AS labels,
						       relationshipType
						ORDER BY canonicalId ASC
						LIMIT toInteger($limit)
					`;
					const result = await session.run(query, { parentCanonicalId, limit: relationLimit });
					visitedEdgeCount += result.records.length;
					nodeRemaining -= result.records.length;
					for (const record of result.records) {
						const canonicalId = String(record.get('canonicalId'));
						if (visited.has(canonicalId)) continue;
						visited.add(canonicalId);
						nextFrontier.add(canonicalId);
						maxObservedHop = Math.max(maxObservedHop, hop);
						candidates.push({
							canonicalId,
							stableKey: String(record.get('stableKey')),
							labels: (record.get('labels') ?? []) as string[],
							hop,
							parentCanonicalId,
							relationshipType: String(record.get('relationshipType')),
							direction: relation.direction,
						});
						if (visited.size >= plan.budget.maxNodes || candidates.length >= plan.budget.candidateBudget) {
							budgetExhausted = true;
							break;
						}
					}
				}
				if (budgetExhausted) break;
			}
			frontier = [...nextFrontier].sort();
			if (budgetExhausted) break;
		}
	} finally {
		await session.close();
	}

	const outputHash = createHash('sha256').update(JSON.stringify(candidates)).digest('hex');
	const receipt = GraphFanoutReceiptV1Schema.parse({
		schema: 'atlas.graph-fanout-receipt.v1',
		requestId: plan.requestId,
		graphRevision: plan.projection.graphRevision,
		projectionRevision: plan.projection.projectionRevision,
		projectionHash: plan.projection.projectionHash,
		projectionName: plan.projection.projectionName,
		executorId: 'NEO4J_CYPHER',
		seedCount: plan.seedCanonicalIds.length,
		visitedNodeCount: visited.size,
		visitedEdgeCount,
		returnedCandidateCount: candidates.length,
		maxObservedHop,
		budgetExhausted,
		elapsedMillis: Date.now() - startedAt,
		outputHash,
		producerRevision: plan.producerRevision,
		completedAt: new Date().toISOString(),
	});
	return { candidates, receipt };
}
