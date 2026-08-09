/**
 * Shared analysis run contract.
 *
 * This is the common lineage envelope for graph, sequence-model, vector,
 * ablation, and promotion-decision surfaces.
 */

export {
	AnalysisBackendSchema,
	AnalysisRunStatusSchema,
	AnalysisRunEnvelopeSchema as AnalysisRunBaseSchema,
} from './analysis-run-envelope.js';
export type {
	AnalysisBackend,
	AnalysisRunStatus,
	AnalysisRunEnvelope,
} from './analysis-run-envelope.js';
import type { AnalysisRunEnvelope } from './analysis-run-envelope.js';
export type AnalysisRunBase = AnalysisRunEnvelope;
