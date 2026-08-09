/**
 * Sequence-model analysis contract.
 *
 * Covers HMM/Viterbi/Baum-Welch/recommendation-router style runs. This stays
 * distinct from graph analysis so sequence lineage never becomes a catch-all.
 */

import { z } from 'zod';
import {
	ModelAlgorithmSchema,
	ModelAnalysisRunSchema,
	ModelAnalysisResultSchema,
	ModelFamilySchema,
	ModelSequenceObservationSchema,
} from './model-analysis-types.js';

export const SequenceModelEngineSchema = z.enum([
	'native-ts',
	'rust',
	'python-sidecar',
	'gpu-sidecar',
	'offline',
]);
export type SequenceModelEngine = z.infer<typeof SequenceModelEngineSchema>;

export const SequenceAlgorithmSchema = ModelAlgorithmSchema;
export type SequenceAlgorithm = z.infer<typeof SequenceAlgorithmSchema>;

export const SequenceModelRunSchema = ModelAnalysisRunSchema;
export type SequenceModelRun = z.infer<typeof SequenceModelRunSchema>;

export const SequenceObservationSchema = ModelSequenceObservationSchema;
export type SequenceObservation = z.infer<typeof SequenceObservationSchema>;

export const SequenceModelResultSchema = ModelAnalysisResultSchema;
export type SequenceModelResult = z.infer<typeof SequenceModelResultSchema>;

export const SequenceModelFamilySchema = ModelFamilySchema;
export type SequenceModelFamily = z.infer<typeof SequenceModelFamilySchema>;
