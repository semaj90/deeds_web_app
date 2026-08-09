/**
 * Vector-experiment contract.
 *
 * This is the lane for PCA/SVD/autoencoder/L2-sampler style experiments.
 * Keep it separate from sequence-model contracts so vector geometry work can
 * evolve independently.
 */

import { z } from 'zod';
import { AnalysisRunEnvelopeSchema } from './analysis-run-envelope.js';

export const VectorEngineSchema = z.enum([
	'native-ts',
	'rust',
	'gpu-sidecar',
	'python-sidecar',
	'offline',
]);
export type VectorEngine = z.infer<typeof VectorEngineSchema>;

export const VectorAlgorithmSchema = z.enum([
	'pca',
	'svd',
	'autoencoder',
	'length_squared_sampling',
	'projection_parity',
]);
export type VectorAlgorithm = z.infer<typeof VectorAlgorithmSchema>;

export const VectorExperimentRunSchema = AnalysisRunEnvelopeSchema.extend({
	algorithm: VectorAlgorithmSchema,
	vectorRevision: z.string().min(1),
	sourceDimension: z.number().int().positive(),
	targetDimension: z.number().int().positive(),
	distanceMetric: z.enum(['l2', 'cosine', 'dot', 'manhattan']).default('l2'),
	trainable: z.boolean().default(false),
}).strict();
export type VectorExperimentRun = z.infer<typeof VectorExperimentRunSchema>;

export const VectorExperimentResultSchema = z
	.object({
		runId: z.string().min(1),
		vectorId: z.string().min(1),
		loss: z.number().finite().nullable(),
		score: z.number().finite().nullable(),
		passed: z.boolean(),
		reason: z.string().min(1).nullable(),
		createdAt: z.string().datetime(),
	})
	.strict();
export type VectorExperimentResult = z.infer<typeof VectorExperimentResultSchema>;
