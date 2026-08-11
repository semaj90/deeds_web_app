/**
 * Representation-experiment contract.
 *
 * This is the eval gate for candidate representation lanes such as
 * CodeBERT and GraphCodeBERT. It stays separate from semantic_768 so
 * dimension equality never implies ownership or promotion.
 */

import { z } from 'zod';
import { AnalysisRunEnvelopeSchema } from './analysis-run-envelope.js';
import { SEMANTIC_REPRESENTATION_ID } from '../embedding/embedding-contract-768.js';

export const RepresentationFamilySchema = z.enum([
	SEMANTIC_REPRESENTATION_ID,
	'codebert_768',
	'graphcodebert_768',
]);
export type RepresentationFamily = z.infer<typeof RepresentationFamilySchema>;

export const RepresentationExperimentKindSchema = z.enum([
	'boundary_preservation',
	'retrieval_ablation',
	'parity',
	'replay',
	'promotion_gate',
]);
export type RepresentationExperimentKind = z.infer<typeof RepresentationExperimentKindSchema>;

export const RepresentationExperimentRunSchema = AnalysisRunEnvelopeSchema.extend({
	algorithm: z.literal('representation_experiment'),
	experimentKind: RepresentationExperimentKindSchema,
	baselineRepresentation: z.literal(SEMANTIC_REPRESENTATION_ID),
	candidateRepresentation: z.enum(['codebert_768', 'graphcodebert_768']),
	sourceDimension: z.number().int().positive(),
	targetDimension: z.number().int().positive(),
	metricNames: z.array(z.string().min(1)).default([]),
	passCriteria: z.record(z.string(), z.unknown()).default({}),
	comparisonSummary: z.record(z.string(), z.unknown()).default({}),
}).strict();
export type RepresentationExperimentRun = z.infer<typeof RepresentationExperimentRunSchema>;

export const RepresentationExperimentResultSchema = z
	.object({
		runId: z.string().min(1),
		metricName: z.string().min(1),
		baselineValue: z.number().finite().nullable(),
		candidateValue: z.number().finite().nullable(),
		delta: z.number().finite().nullable(),
		passed: z.boolean(),
		reason: z.string().min(1).nullable(),
		createdAt: z.string().datetime(),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();
export type RepresentationExperimentResult = z.infer<typeof RepresentationExperimentResultSchema>;
