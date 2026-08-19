import { z } from 'zod';
import {
	GraphProjectionManifestV3Schema,
	type GraphProjectionManifestV3,
} from './graph-projection-manifest.js';

export const PageRankAlgorithmFamilySchema = z.literal('PAGERANK');
export const PageRankVariantSchema = z.enum(['pagerank', 'personalized_pagerank']);
export type PageRankVariant = z.infer<typeof PageRankVariantSchema>;

export const PageRankCanonicalRunOwnerSchema = z.literal('PARENT_ATLAS_GRAPH_ANALYSIS');

export const PageRankExecutorIdSchema = z.enum([
	'NEO4J_GDS',
	'CUGRAPH',
	'NETWORKX_REFERENCE',
	'PYTORCH_DENSE_REFERENCE',
	'NON_AUTHORITATIVE_SIMULATION',
]);
export type PageRankExecutorId = z.infer<typeof PageRankExecutorIdSchema>;

export const PageRankExecutorSelectionSchema = z.discriminatedUnion('executorId', [
	z.object({
		executorId: z.literal('NEO4J_GDS'),
		role: z.enum(['REFERENCE_EXECUTOR', 'CANONICAL_EXECUTOR']),
	}).strict(),
	z.object({
		executorId: z.literal('CUGRAPH'),
		role: z.enum(['GPU_CHALLENGER', 'CANONICAL_EXECUTOR']),
	}).strict(),
	z.object({
		executorId: z.literal('NETWORKX_REFERENCE'),
		role: z.literal('REFERENCE_ORACLE'),
	}).strict(),
	z.object({
		executorId: z.literal('PYTORCH_DENSE_REFERENCE'),
		role: z.literal('REFERENCE_SMALL_GRAPH_ONLY'),
	}).strict(),
	z.object({
		executorId: z.literal('NON_AUTHORITATIVE_SIMULATION'),
		role: z.literal('NON_AUTHORITATIVE'),
	}).strict(),
]);
export type PageRankExecutorSelection = z.infer<typeof PageRankExecutorSelectionSchema>;

export const PageRankPersonalizationSchema = z.discriminatedUnion('mode', [
	z.object({ mode: z.literal('GLOBAL') }).strict(),
	z.object({
		mode: z.literal('PERSONALIZED'),
		seeds: z
			.array(
				z.object({
					canonicalId: z.string().min(1),
					weight: z.number().finite().positive(),
				}).strict(),
			)
			.min(1),
	}).strict(),
]);
export type PageRankPersonalization = z.infer<typeof PageRankPersonalizationSchema>;

export const PageRankParametersSchema = z
	.object({
		dampingFactor: z.number().finite().min(0).lt(1),
		maxIterations: z.number().int().positive(),
		tolerance: z.number().finite().positive(),
		relationshipTypes: z.array(z.string().min(1)).min(1),
		weighted: z.boolean(),
		relationshipWeightProperty: z.string().min(1).nullable(),
		personalization: PageRankPersonalizationSchema,
	})
	.strict();
export type PageRankParameters = z.infer<typeof PageRankParametersSchema>;

export const PageRankExecutorCapabilitiesV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-executor-capabilities.v1'),
		executorId: PageRankExecutorIdSchema,
		supportsGlobal: z.boolean(),
		supportsPersonalization: z.boolean(),
		supportsWeightedEdges: z.boolean(),
		supportsPrecomputedOutWeight: z.boolean(),
		reportsConvergence: z.boolean(),
		reportsObservedIterations: z.boolean(),
		dampingRange: z
			.object({
				min: z.number().finite(),
				minInclusive: z.boolean(),
				max: z.number().finite(),
				maxInclusive: z.boolean(),
			})
			.strict(),
		canonicalEligible: z.boolean(),
		productionGraphSize: z.enum(['FULL', 'SMALL_ONLY', 'NONE']),
		capabilityRevision: z.string().min(1),
	})
	.strict();
export type PageRankExecutorCapabilitiesV1 = z.infer<typeof PageRankExecutorCapabilitiesV1Schema>;

export const PAGE_RANK_EXECUTOR_CAPABILITIES = {
	NEO4J_GDS: PageRankExecutorCapabilitiesV1Schema.parse({
		schema: 'atlas.pagerank-executor-capabilities.v1',
		executorId: 'NEO4J_GDS',
		supportsGlobal: true,
		supportsPersonalization: true,
		supportsWeightedEdges: true,
		supportsPrecomputedOutWeight: false,
		reportsConvergence: true,
		reportsObservedIterations: true,
		dampingRange: { min: 0, minInclusive: true, max: 1, maxInclusive: false },
		canonicalEligible: true,
		productionGraphSize: 'FULL',
		capabilityRevision: 'neo4j-gds-pagerank-capabilities-v1',
	}),
	CUGRAPH: PageRankExecutorCapabilitiesV1Schema.parse({
		schema: 'atlas.pagerank-executor-capabilities.v1',
		executorId: 'CUGRAPH',
		supportsGlobal: true,
		supportsPersonalization: true,
		supportsWeightedEdges: true,
		supportsPrecomputedOutWeight: true,
		reportsConvergence: true,
		reportsObservedIterations: false,
		dampingRange: { min: 0, minInclusive: false, max: 1, maxInclusive: false },
		canonicalEligible: false,
		productionGraphSize: 'FULL',
		capabilityRevision: 'cugraph-pagerank-capabilities-v1',
	}),
	NETWORKX_REFERENCE: PageRankExecutorCapabilitiesV1Schema.parse({
		schema: 'atlas.pagerank-executor-capabilities.v1',
		executorId: 'NETWORKX_REFERENCE',
		supportsGlobal: true,
		supportsPersonalization: true,
		supportsWeightedEdges: true,
		supportsPrecomputedOutWeight: false,
		reportsConvergence: true,
		reportsObservedIterations: false,
		dampingRange: { min: 0, minInclusive: true, max: 1, maxInclusive: false },
		canonicalEligible: false,
		productionGraphSize: 'SMALL_ONLY',
		capabilityRevision: 'networkx-pagerank-reference-capabilities-v1',
	}),
	PYTORCH_DENSE_REFERENCE: PageRankExecutorCapabilitiesV1Schema.parse({
		schema: 'atlas.pagerank-executor-capabilities.v1',
		executorId: 'PYTORCH_DENSE_REFERENCE',
		supportsGlobal: true,
		supportsPersonalization: true,
		supportsWeightedEdges: false,
		supportsPrecomputedOutWeight: false,
		reportsConvergence: true,
		reportsObservedIterations: true,
		dampingRange: { min: 0, minInclusive: true, max: 1, maxInclusive: true },
		canonicalEligible: false,
		productionGraphSize: 'SMALL_ONLY',
		capabilityRevision: 'pytorch-dense-pagerank-reference-capabilities-v1',
	}),
	NON_AUTHORITATIVE_SIMULATION: PageRankExecutorCapabilitiesV1Schema.parse({
		schema: 'atlas.pagerank-executor-capabilities.v1',
		executorId: 'NON_AUTHORITATIVE_SIMULATION',
		supportsGlobal: false,
		supportsPersonalization: false,
		supportsWeightedEdges: false,
		supportsPrecomputedOutWeight: false,
		reportsConvergence: false,
		reportsObservedIterations: false,
		dampingRange: { min: 0, minInclusive: false, max: 0, maxInclusive: false },
		canonicalEligible: false,
		productionGraphSize: 'NONE',
		capabilityRevision: 'non-authoritative-simulation-v1',
	}),
} as const satisfies Record<PageRankExecutorId, PageRankExecutorCapabilitiesV1>;

export const PageRankOwnerPolicyV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-owner-policy.v1'),
		algorithmFamily: PageRankAlgorithmFamilySchema,
		canonicalRunOwner: PageRankCanonicalRunOwnerSchema,
		canonicalExecutor: z.literal('NEO4J_GDS'),
		gpuChallenger: z.literal('CUGRAPH'),
		referenceOracle: z.literal('NETWORKX_REFERENCE'),
		denseReference: z.literal('PYTORCH_DENSE_REFERENCE'),
		simulationExecutor: z.literal('NON_AUTHORITATIVE_SIMULATION'),
		policyRevision: z.string().min(1),
	})
	.strict();
export type PageRankOwnerPolicyV1 = z.infer<typeof PageRankOwnerPolicyV1Schema>;

export const PAGE_RANK_OWNER_POLICY_V1 = PageRankOwnerPolicyV1Schema.parse({
	schema: 'atlas.pagerank-owner-policy.v1',
	algorithmFamily: 'PAGERANK',
	canonicalRunOwner: 'PARENT_ATLAS_GRAPH_ANALYSIS',
	canonicalExecutor: 'NEO4J_GDS',
	gpuChallenger: 'CUGRAPH',
	referenceOracle: 'NETWORKX_REFERENCE',
	denseReference: 'PYTORCH_DENSE_REFERENCE',
	simulationExecutor: 'NON_AUTHORITATIVE_SIMULATION',
	policyRevision: 'pagerank-owner-policy-v1',
});

export const PageRankExecutionPlanV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-execution-plan.v1'),
		runId: z.string().min(1),
		canonicalRunOwner: PageRankCanonicalRunOwnerSchema,
		algorithmFamily: PageRankAlgorithmFamilySchema,
		algorithm: PageRankVariantSchema,
		algorithmRevision: z.string().min(1),
		executor: PageRankExecutorSelectionSchema,
		projection: GraphProjectionManifestV3Schema,
		parameters: PageRankParametersSchema,
		producerRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict()
	.superRefine((plan, ctx) => {
		const projectedTypes = new Set(Object.keys(plan.projection.relationships));
		for (const [index, relationshipType] of plan.parameters.relationshipTypes.entries()) {
			if (!projectedTypes.has(relationshipType)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['parameters', 'relationshipTypes', index],
					message: `relationship '${relationshipType}' is absent from projection '${plan.projection.projectionName}'`,
				});
			}
		}
		if (new Set(plan.parameters.relationshipTypes).size !== plan.parameters.relationshipTypes.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameters', 'relationshipTypes'],
				message: 'relationshipTypes must be unique',
			});
		}

		const personalized = plan.parameters.personalization.mode === 'PERSONALIZED';
		if (plan.algorithm === 'pagerank' && personalized) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameters', 'personalization'],
				message: 'pagerank requires GLOBAL personalization mode',
			});
		}
		if (plan.algorithm === 'personalized_pagerank' && !personalized) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameters', 'personalization'],
				message: 'personalized_pagerank requires PERSONALIZED mode',
			});
		}
		if (personalized) {
			const seeds = plan.parameters.personalization.seeds;
			if (new Set(seeds.map((seed) => seed.canonicalId)).size !== seeds.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['parameters', 'personalization', 'seeds'],
					message: 'personalization seed canonicalIds must be unique',
				});
			}
		}

		if (plan.parameters.weighted && !plan.parameters.relationshipWeightProperty) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameters', 'relationshipWeightProperty'],
				message: 'weighted PageRank requires relationshipWeightProperty',
			});
		}
		if (!plan.parameters.weighted && plan.parameters.relationshipWeightProperty) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameters', 'relationshipWeightProperty'],
				message: 'unweighted PageRank must not provide relationshipWeightProperty',
			});
		}
		if (plan.parameters.weighted && plan.parameters.relationshipWeightProperty) {
			for (const relationshipType of plan.parameters.relationshipTypes) {
				const relationship = plan.projection.relationships[relationshipType];
				if (!relationship?.properties[plan.parameters.relationshipWeightProperty]) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['parameters', 'relationshipWeightProperty'],
						message: `weight property '${plan.parameters.relationshipWeightProperty}' is not projected for '${relationshipType}'`,
					});
				}
			}
		}

		const capabilities = PAGE_RANK_EXECUTOR_CAPABILITIES[plan.executor.executorId];
		if (plan.parameters.personalization.mode === 'GLOBAL' && !capabilities.supportsGlobal) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executor'], message: 'executor does not support global PageRank' });
		}
		if (plan.parameters.personalization.mode === 'PERSONALIZED' && !capabilities.supportsPersonalization) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executor'], message: 'executor does not support personalized PageRank' });
		}
		if (plan.parameters.weighted && !capabilities.supportsWeightedEdges) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executor'], message: 'executor does not support weighted PageRank' });
		}
		const damping = plan.parameters.dampingFactor;
		const { min, minInclusive, max, maxInclusive } = capabilities.dampingRange;
		const belowMin = minInclusive ? damping < min : damping <= min;
		const aboveMax = maxInclusive ? damping > max : damping >= max;
		if (belowMin || aboveMax) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameters', 'dampingFactor'],
				message: `dampingFactor ${damping} is outside executor range ${minInclusive ? '[' : '('}${min}, ${max}${maxInclusive ? ']' : ')'}`,
			});
		}
		if (
			(plan.executor.role === 'CANONICAL_EXECUTOR' || plan.executor.role === 'REFERENCE_EXECUTOR') &&
			!capabilities.canonicalEligible
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['executor', 'role'],
				message: `${plan.executor.executorId} is not currently eligible for canonical execution`,
			});
		}
	});
export type PageRankExecutionPlanV1 = z.infer<typeof PageRankExecutionPlanV1Schema>;

export const PageRankConvergenceStatusSchema = z.enum(['CONVERGED', 'NON_CONVERGED', 'UNKNOWN']);

export const PageRankExecutorTelemetrySchema = z.discriminatedUnion('executorId', [
	z.object({
		executorId: z.literal('NEO4J_GDS'),
		convergenceStatus: PageRankConvergenceStatusSchema,
		ranIterations: z.number().int().positive(),
		preProcessingMillis: z.number().finite().nonnegative(),
		computeMillis: z.number().finite().nonnegative(),
		postProcessingMillis: z.number().finite().nonnegative(),
	}).strict(),
	z.object({
		executorId: z.literal('CUGRAPH'),
		convergenceStatus: PageRankConvergenceStatusSchema,
		ranIterations: z.null(),
		failOnNonconvergence: z.boolean(),
		atlasMeasuredMillis: z.number().finite().nonnegative(),
	}).strict(),
	z.object({
		executorId: z.literal('NETWORKX_REFERENCE'),
		convergenceStatus: PageRankConvergenceStatusSchema,
		ranIterations: z.number().int().positive().nullable(),
		atlasMeasuredMillis: z.number().finite().nonnegative(),
	}).strict(),
	z.object({
		executorId: z.literal('PYTORCH_DENSE_REFERENCE'),
		convergenceStatus: PageRankConvergenceStatusSchema,
		ranIterations: z.number().int().positive(),
		atlasMeasuredMillis: z.number().finite().nonnegative(),
	}).strict(),
	z.object({
		executorId: z.literal('NON_AUTHORITATIVE_SIMULATION'),
		convergenceStatus: z.literal('UNKNOWN'),
		ranIterations: z.null(),
		atlasMeasuredMillis: z.number().finite().nonnegative(),
	}).strict(),
]);

export const PageRankExecutionReceiptV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-execution-receipt.v1'),
		runId: z.string().min(1),
		algorithmFamily: PageRankAlgorithmFamilySchema,
		algorithm: PageRankVariantSchema,
		algorithmRevision: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		nodeCount: z.number().int().nonnegative(),
		relationshipCount: z.number().int().nonnegative(),
		telemetry: PageRankExecutorTelemetrySchema,
		rawOutputHash: z.string().min(1),
		producerRevision: z.string().min(1),
		completedAt: z.string().datetime(),
	})
	.strict();
export type PageRankExecutionReceiptV1 = z.infer<typeof PageRankExecutionReceiptV1Schema>;

export function assertPageRankPlanProjection(
	plan: PageRankExecutionPlanV1,
	projection: GraphProjectionManifestV3,
): void {
	if (plan.projection.graphRevision !== projection.graphRevision) throw new Error('PageRank plan graphRevision mismatch');
	if (plan.projection.projectionRevision !== projection.projectionRevision) throw new Error('PageRank plan projectionRevision mismatch');
	if (plan.projection.projectionHash !== projection.projectionHash) throw new Error('PageRank plan projectionHash mismatch');
	if (plan.projection.projectionName !== projection.projectionName) throw new Error('PageRank plan projectionName mismatch');
}
