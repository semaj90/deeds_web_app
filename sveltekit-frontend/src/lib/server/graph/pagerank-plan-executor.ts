import { createHash } from 'node:crypto';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import {
	PageRankExecutionPlanV1Schema,
	PageRankExecutionReceiptV1Schema,
	type PageRankExecutionPlanV1,
	type PageRankExecutionReceiptV1,
} from './pagerank-execution-contract.js';
import { assertPageRankDispatchable } from './pagerank-dispatch-policy.js';

export interface RawPageRankScoreV1 {
	nodeId: number;
	canonicalId: string;
	score: number;
}

export interface PageRankPlanExecutionV1 {
	scores: RawPageRankScoreV1[];
	receipt: PageRankExecutionReceiptV1;
}

/** Explicit identity only. Never fall back to stableKey, generic id, or Neo4j internal id. */
function canonicalNodeExpression(variable: string): string {
	return `coalesce(${variable}.canonicalId, ${variable}.canonical_id, ${variable}.packetKey, ${variable}.packet_key, ${variable}.sourceRef, ${variable}.source_ref)`;
}

async function resolvePersonalizationSourceNodes(
	session: ReturnType<ReturnType<typeof getNeo4jDriver>['session']>,
	plan: PageRankExecutionPlanV1,
): Promise<Array<[number, number]>> {
	if (plan.parameters.personalization.mode !== 'PERSONALIZED') return [];
	const seeds = plan.parameters.personalization.seeds;
	const canonicalIds = seeds.map((seed) => seed.canonicalId);
	const result = await session.run(
		`MATCH (n)
		 WITH n, ${canonicalNodeExpression('n')} AS canonicalId
		 WHERE canonicalId IS NOT NULL AND canonicalId IN $canonicalIds
		 RETURN canonicalId, id(n) AS nodeId
		 ORDER BY canonicalId ASC`,
		{ canonicalIds },
	);
	const idsByCanonical = new Map<string, number[]>();
	for (const record of result.records) {
		const canonicalId = String(record.get('canonicalId'));
		const nodeId = Number(record.get('nodeId'));
		const ids = idsByCanonical.get(canonicalId) ?? [];
		ids.push(nodeId);
		idsByCanonical.set(canonicalId, ids);
	}
	for (const seed of seeds) {
		const matches = idsByCanonical.get(seed.canonicalId) ?? [];
		if (matches.length !== 1) {
			throw new Error(
				`personalized PageRank seed '${seed.canonicalId}' resolved to ${matches.length} explicit-identity Neo4j nodes; expected exactly one`,
			);
		}
	}
	return seeds.map((seed) => [idsByCanonical.get(seed.canonicalId)![0], seed.weight]);
}

export async function executeNeo4jPageRankPlan(input: unknown): Promise<PageRankPlanExecutionV1> {
	const plan = PageRankExecutionPlanV1Schema.parse(input);
	assertPageRankDispatchable(plan);
	if (plan.executor.executorId !== 'NEO4J_GDS') {
		throw new Error(`executeNeo4jPageRankPlan requires NEO4J_GDS, got ${plan.executor.executorId}`);
	}
	return executeValidatedNeo4jPageRankPlan(plan);
}

async function executeValidatedNeo4jPageRankPlan(plan: PageRankExecutionPlanV1): Promise<PageRankPlanExecutionV1> {
	const driver = getNeo4jDriver();
	const session = driver.session();
	const projectionName = plan.projection.projectionName;
	const mutateProperty = `atlas_pr_${createHash('sha256').update(plan.runId).digest('hex').slice(0, 16)}`;

	try {
		const graphResult = await session.run(
			`CALL gds.graph.list($graphName)
			 YIELD graphName, nodeCount, relationshipCount
			 RETURN graphName, nodeCount, relationshipCount`,
			{ graphName: projectionName },
		);
		if (!graphResult.records.length) throw new Error(`GDS projection '${projectionName}' does not exist`);
		const graphRecord = graphResult.records[0];
		const liveNodeCount = Number(graphRecord.get('nodeCount'));
		const liveRelationshipCount = Number(graphRecord.get('relationshipCount'));
		if (liveNodeCount !== plan.projection.nodeCount || liveRelationshipCount !== plan.projection.relationshipCount) {
			throw new Error(
				`GDS projection shape mismatch for '${projectionName}': ` +
				`manifest=${plan.projection.nodeCount}/${plan.projection.relationshipCount}, ` +
				`live=${liveNodeCount}/${liveRelationshipCount}`,
			);
		}

		await session.run(
			`CALL gds.graph.nodeProperties.drop($graphName, [$mutateProperty])
			 YIELD propertiesRemoved RETURN propertiesRemoved`,
			{ graphName: projectionName, mutateProperty },
		).catch(() => undefined);

		const config: Record<string, unknown> = {
			dampingFactor: plan.parameters.dampingFactor,
			maxIterations: plan.parameters.maxIterations,
			tolerance: plan.parameters.tolerance,
			relationshipTypes: plan.parameters.relationshipTypes,
			mutateProperty,
			scaler: 'None',
		};
		if (plan.parameters.weighted && plan.parameters.relationshipWeightProperty) {
			config.relationshipWeightProperty = plan.parameters.relationshipWeightProperty;
		}
		if (plan.parameters.personalization.mode === 'PERSONALIZED') {
			config.sourceNodes = await resolvePersonalizationSourceNodes(session, plan);
		}

		const mutateResult = await session.run(
			`CALL gds.pageRank.mutate($graphName, $config)
			 YIELD ranIterations, didConverge, preProcessingMillis, computeMillis,
			       postProcessingMillis, nodePropertiesWritten
			 RETURN ranIterations, didConverge, preProcessingMillis, computeMillis,
			        postProcessingMillis, nodePropertiesWritten`,
			{ graphName: projectionName, config },
		);
		const stats = mutateResult.records[0];
		if (!stats) throw new Error('Neo4j GDS PageRank mutate returned no telemetry');

		const scoreResult = await session.run(
			`CALL gds.graph.nodeProperty.stream($graphName, $property)
			 YIELD nodeId, propertyValue
			 WITH nodeId, propertyValue, gds.util.asNode(nodeId) AS n
			 WITH nodeId, propertyValue, ${canonicalNodeExpression('n')} AS canonicalId
			 WHERE canonicalId IS NOT NULL
			 RETURN nodeId, canonicalId, propertyValue AS score
			 ORDER BY canonicalId ASC`,
			{ graphName: projectionName, property: mutateProperty },
		);
		const scores: RawPageRankScoreV1[] = scoreResult.records.map((record) => ({
			nodeId: Number(record.get('nodeId')),
			canonicalId: String(record.get('canonicalId')),
			score: Number(record.get('score')),
		}));
		if (scores.length !== liveNodeCount) {
			throw new Error(
				`PageRank canonical identity coverage mismatch: projection has ${liveNodeCount} nodes but only ${scores.length} have explicit canonical/packet/source identity`,
			);
		}
		const seenCanonicalIds = new Set<string>();
		for (const score of scores) {
			if (!Number.isFinite(score.score) || score.score < 0) {
				throw new Error(`invalid raw PageRank score for '${score.canonicalId}'`);
			}
			if (seenCanonicalIds.has(score.canonicalId)) {
				throw new Error(`duplicate explicit PageRank canonical identity '${score.canonicalId}'`);
			}
			seenCanonicalIds.add(score.canonicalId);
		}

		const rawOutputHash = createHash('sha256').update(JSON.stringify(scores)).digest('hex');
		const receipt = PageRankExecutionReceiptV1Schema.parse({
			schema: 'atlas.pagerank-execution-receipt.v1',
			runId: plan.runId,
			algorithmFamily: plan.algorithmFamily,
			algorithm: plan.algorithm,
			algorithmRevision: plan.algorithmRevision,
			graphRevision: plan.projection.graphRevision,
			projectionRevision: plan.projection.projectionRevision,
			projectionHash: plan.projection.projectionHash,
			projectionName,
			nodeCount: liveNodeCount,
			relationshipCount: liveRelationshipCount,
			telemetry: {
				executorId: 'NEO4J_GDS',
				convergenceStatus: Boolean(stats.get('didConverge')) ? 'CONVERGED' : 'NON_CONVERGED',
				ranIterations: Number(stats.get('ranIterations')),
				preProcessingMillis: Number(stats.get('preProcessingMillis')),
				computeMillis: Number(stats.get('computeMillis')),
				postProcessingMillis: Number(stats.get('postProcessingMillis')),
			},
			rawOutputHash,
			producerRevision: plan.producerRevision,
			completedAt: new Date().toISOString(),
		});
		return { scores, receipt };
	} finally {
		await session.run(
			`CALL gds.graph.nodeProperties.drop($graphName, [$mutateProperty])
			 YIELD propertiesRemoved RETURN propertiesRemoved`,
			{ graphName: projectionName, mutateProperty },
		).catch(() => undefined);
		await session.close();
	}
}
