/**
 * ModelAnalysisRun / ExperimentRun sibling contract.
 *
 * This intentionally stays separate from graph analysis. It covers HMM/Viterbi
 * sequencing, Baum-Welch training, routing, and recommendation-model
 * experiments so the graph envelope does not become a catch-all.
 */

import { z } from 'zod';
import {
	AnalysisRunEnvelopeSchema,
	type AnalysisRunEnvelope,
} from './analysis-run-envelope.js';

export const ModelAlgorithmSchema = z.enum([
	'viterbi',
	'baum_welch',
	'hmm_section_classifier',
	'hmm_error_classifier',
	'hmm_kanban_diagnoser',
	'recommendation_router',
	'recommendation_engine',
	'tang_sampler',
]);
export type ModelAlgorithm = z.infer<typeof ModelAlgorithmSchema>;

export const ModelFamilySchema = z.enum(['hmm', 'router', 'recommendation', 'sampler']);
export type ModelFamily = z.infer<typeof ModelFamilySchema>;

export const ModelAnalysisRunSchema = AnalysisRunEnvelopeSchema.extend({
	algorithm: ModelAlgorithmSchema,
	modelFamily: ModelFamilySchema,
	modelRevision: z.string().min(1),
	corpusRevision: z.string().min(1).nullable(),
	sequenceLength: z.number().int().nonnegative().nullable(),
	observationCount: z.number().int().nonnegative().nullable(),
	stateCount: z.number().int().nonnegative().nullable(),
	decoderRevision: z.string().min(1).nullable(),
	trainable: z.boolean().default(false),
})
	.strict();

export type ModelAnalysisRun = z.infer<typeof ModelAnalysisRunSchema>;

export const ModelSequenceObservationSchema = z
	.object({
		sequenceId: z.string().min(1),
		position: z.number().int().nonnegative(),
		observation: z.string().min(1),
		weight: z.number().finite().default(1),
		sourceRef: z.string().min(1).nullable().default(null),
	})
	.strict();

export type ModelSequenceObservation = z.infer<typeof ModelSequenceObservationSchema>;

export const ModelAnalysisResultSchema = z
	.object({
		runId: z.string().min(1),
		sequenceId: z.string().min(1),
		decodedPath: z.array(z.string().min(1)).default([]),
		logProbability: z.number().finite().nullable(),
		confidence: z.number().finite().min(0).max(1).nullable(),
		recommendation: z.string().min(1).nullable(),
		gpuAccelerated: z.boolean().default(false),
		sidecarUsed: z.boolean().default(false),
		modelRevision: z.string().min(1),
		createdAt: z.string().datetime(),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();

export type ModelAnalysisResult = z.infer<typeof ModelAnalysisResultSchema>;

export const ExperimentKindSchema = z.enum([
	'ablation',
	'promotion_gate',
	'parity',
	'sidecar_comparison',
	'replay',
]);
export type ExperimentKind = z.infer<typeof ExperimentKindSchema>;

export const ExperimentAnalysisRunSchema = AnalysisRunEnvelopeSchema.extend({
	algorithm: z.literal('experiment'),
	experimentKind: ExperimentKindSchema,
	baselineRunId: z.string().min(1).nullable(),
	candidateRunIds: z.array(z.string().min(1)).default([]),
	metricNames: z.array(z.string().min(1)).default([]),
	passCriteria: z.record(z.string(), z.unknown()).default({}),
	comparisonSummary: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type ExperimentAnalysisRun = z.infer<typeof ExperimentAnalysisRunSchema>;

export const ExperimentAnalysisResultSchema = z
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

export type ExperimentAnalysisResult = z.infer<typeof ExperimentAnalysisResultSchema>;
