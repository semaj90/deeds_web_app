/**
 * Shared analysis run envelope.
 *
 * This stays intentionally generic so graph analysis, model/HMM analysis, and
 * experiment/ablation runs can share the same lineage core without collapsing
 * into one catch-all schema.
 */

import { z } from 'zod';

export const AnalysisBackendSchema = z.enum(['native-ts', 'rust', 'python-sidecar', 'gpu-sidecar', 'offline']);
export type AnalysisBackend = z.infer<typeof AnalysisBackendSchema>;

export const AnalysisRunStatusSchema = z.enum(['running', 'succeeded', 'failed']);
export type AnalysisRunStatus = z.infer<typeof AnalysisRunStatusSchema>;

export const AnalysisRunEnvelopeSchema = z
	.object({
		runId: z.string().min(1),
		algorithm: z.string().min(1),
		algorithmRevision: z.string().min(1),
		parameterRevision: z.string().min(1),
		workspaceRevision: z.string().min(1),
		sourceRevision: z.string().min(1),
		startedAt: z.string().datetime(),
		completedAt: z.string().datetime().nullable(),
		status: AnalysisRunStatusSchema,
		parameters: z.record(z.string(), z.unknown()).default({}),
		metrics: z.record(z.string(), z.unknown()).default({}),
		backendPreference: AnalysisBackendSchema.default('native-ts'),
		backendActual: AnalysisBackendSchema.default('offline'),
		gpuAccelerated: z.boolean().default(false),
		sidecarUrl: z.string().url().nullable().default(null),
		inputHash: z.string().min(1).nullable().default(null),
		outputHash: z.string().min(1).nullable().default(null),
	})
	.strict();

export type AnalysisRunEnvelope = z.infer<typeof AnalysisRunEnvelopeSchema>;
