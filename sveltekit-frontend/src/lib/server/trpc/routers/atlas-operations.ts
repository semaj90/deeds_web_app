import { z } from 'zod';
import { publicProcedure, router } from '../init.js';
import {
	createDomainClassifyOperationRequestV1,
	createSomNeighborhoodOperationRequestV1,
	executeAtlasOperationV1,
} from '$lib/server/atlas/operations/atlas-operation-runtime-v1.js';

const DomainClassifyInputSchema = z.object({
	sourceRef: z.string().nullish(),
	featureId: z.string().nullish(),
	summary: z.string().nullish(),
	title: z.string().nullish(),
	symbol: z.string().nullish(),
	imports: z.array(z.string()).nullish(),
	routes: z.array(z.string()).nullish(),
	schema: z.array(z.string()).nullish(),
	dependencies: z.array(z.string()).nullish(),
	neighbors: z.array(z.string()).nullish(),
	metadata: z.array(z.string()).nullish(),
});

const DomainClassifyOutputSchema = z.object({
	primary_domain: z.string().nullable(),
	secondary_domains: z.array(z.string()),
	labels: z.array(z.object({
		label: z.string(),
		score: z.number(),
		source: z.enum(['deterministic', 'learned', 'weak_label', 'reviewed', 'fallback']),
		evidence_kinds: z.array(z.string()),
	})),
	confidence: z.number(),
	evidence: z.array(z.object({
		kind: z.string(),
		value: z.string(),
		weight: z.number(),
		source_ref: z.string().optional(),
	})),
	fallback_label: z.literal('general').nullable(),
	classifier_version: z.string(),
});

const SomNeighborhoodInputSchema = z.object({
	neuronOrdinal: z.number().int().min(0).max(399),
	radius: z.number().int().min(0).max(19).default(1),
});

const SomNeighborhoodOutputSchema = z.object({
	neuronOrdinal: z.number().int(),
	row: z.number().int(),
	col: z.number().int(),
	radius: z.number().int(),
	neuronOrdinals: z.array(z.number().int()),
});

export const atlasOperationsRouter = router({
	somNeighborhood: publicProcedure
		.input(SomNeighborhoodInputSchema)
		.output(SomNeighborhoodOutputSchema)
		.query(async ({ input }) => {
			const operation = await executeAtlasOperationV1(
				createSomNeighborhoodOperationRequestV1(input, crypto.randomUUID()),
			);
			if (!operation.payload || operation.status === 'FAILED') {
				throw new Error(operation.errorCode ?? 'ATLAS_OPERATION_FAILED');
			}
			return SomNeighborhoodOutputSchema.parse(operation.payload);
		}),
	domainClassify: publicProcedure
		.input(DomainClassifyInputSchema)
		.output(DomainClassifyOutputSchema)
		.query(async ({ input }) => {
			const operation = await executeAtlasOperationV1(
				createDomainClassifyOperationRequestV1(input, crypto.randomUUID()),
			);
			if (!operation.payload || operation.status === 'FAILED') {
				throw new Error(operation.errorCode ?? 'ATLAS_OPERATION_FAILED');
			}
			return DomainClassifyOutputSchema.parse(operation.payload);
		}),
});
