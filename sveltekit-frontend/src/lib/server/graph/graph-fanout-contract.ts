import { z } from 'zod';
import { GraphProjectionManifestV3Schema } from './graph-projection-manifest.js';

export const GraphTraversalDirectionSchema = z.enum(['OUT', 'IN', 'BOTH']);
export type GraphTraversalDirection = z.infer<typeof GraphTraversalDirectionSchema>;

export const GraphFanoutRelationshipSchema = z
	.object({
		relationshipType: z.string().min(1),
		direction: GraphTraversalDirectionSchema,
		maxNeighbors: z.number().int().positive(),
	})
	.strict();

export const GraphFanoutBudgetV1Schema = z
	.object({
		maxHops: z.number().int().positive(),
		maxNodes: z.number().int().positive(),
		maxEdges: z.number().int().positive(),
		maxNeighborsPerNode: z.number().int().positive(),
		candidateBudget: z.number().int().positive(),
		timeBudgetMs: z.number().int().positive(),
	})
	.strict();

export const GraphFanoutPlanV1Schema = z
	.object({
		schema: z.literal('atlas.graph-fanout-plan.v1'),
		requestId: z.string().min(1),
		seedCanonicalIds: z.array(z.string().min(1)).min(1),
		projection: GraphProjectionManifestV3Schema,
		relationships: z.array(GraphFanoutRelationshipSchema).min(1),
		budget: GraphFanoutBudgetV1Schema,
		producerRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict()
	.superRefine((plan, ctx) => {
		if (new Set(plan.seedCanonicalIds).size !== plan.seedCanonicalIds.length) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['seedCanonicalIds'], message: 'seedCanonicalIds must be unique' });
		}
		const relationshipKeys = new Set<string>();
		for (const [index, relation] of plan.relationships.entries()) {
			if (!plan.projection.relationships[relation.relationshipType]) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['relationships', index, 'relationshipType'],
					message: `relationship '${relation.relationshipType}' is absent from projection '${plan.projection.projectionName}'`,
				});
			}
			const key = `${relation.relationshipType}:${relation.direction}`;
			if (relationshipKeys.has(key)) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationships', index], message: `duplicate fanout relationship policy '${key}'` });
			}
			relationshipKeys.add(key);
		}
		if (plan.budget.candidateBudget > plan.budget.maxNodes) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['budget', 'candidateBudget'], message: 'candidateBudget must be <= maxNodes' });
		}
	});
export type GraphFanoutPlanV1 = z.infer<typeof GraphFanoutPlanV1Schema>;

export const GraphFanoutReceiptV1Schema = z
	.object({
		schema: z.literal('atlas.graph-fanout-receipt.v1'),
		requestId: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		executorId: z.enum(['NEO4J_APOC', 'NEO4J_CYPHER', 'CUGRAPH_BFS']),
		seedCount: z.number().int().positive(),
		visitedNodeCount: z.number().int().nonnegative(),
		visitedEdgeCount: z.number().int().nonnegative(),
		returnedCandidateCount: z.number().int().nonnegative(),
		maxObservedHop: z.number().int().nonnegative(),
		budgetExhausted: z.boolean(),
		elapsedMillis: z.number().finite().nonnegative(),
		outputHash: z.string().min(1),
		producerRevision: z.string().min(1),
		completedAt: z.string().datetime(),
	})
	.strict();
export type GraphFanoutReceiptV1 = z.infer<typeof GraphFanoutReceiptV1Schema>;
