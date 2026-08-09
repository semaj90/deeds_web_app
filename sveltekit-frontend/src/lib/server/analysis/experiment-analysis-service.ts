/**
 * Experiment-analysis orchestration surface.
 *
 * This is where ablation, parity, and promotion-gate comparisons live.
 * It should never become the canonical home for graph or model results;
 * it only compares already-produced runs.
 *
 * TODO: once the promotion policy is frozen, replace the stubbed local
 * comparison summary with a persisted evaluation record and optional GPU
 * sidecar execution path.
 */

import { randomUUID } from 'node:crypto';
import {
	createExperimentAnalysisSidecarClient,
	type ExperimentAnalysisSidecarClient,
	type ExperimentComparisonRequest,
	type ExperimentAblationRequest,
} from './experiment-analysis-sidecar.js';
import {
	ExperimentAnalysisRunSchema,
	type ExperimentAnalysisRun,
	type ExperimentAnalysisResult,
} from './model-analysis-types.js';

export interface ExperimentAnalysisService {
	compare(input: CompareRunsInput): Promise<{ run: ExperimentAnalysisRun; summary: Record<string, unknown>; results: ExperimentAnalysisResult[] }>;
	evaluate(input: EvaluateAblationInput): Promise<{ run: ExperimentAnalysisRun; results: ExperimentAnalysisResult[] }>;
}

export interface CompareRunsInput {
	workspaceRevision: string;
	sourceRevision: string;
	baselineRunId: string;
	candidateRunIds: string[];
	metricNames: string[];
	experimentKind?: ExperimentAnalysisRun['experimentKind'];
	parameterRevision?: string;
	runId?: string;
	sidecarUrl?: string | null;
}

export interface EvaluateAblationInput {
	workspaceRevision: string;
	sourceRevision: string;
	runIds: string[];
	metricNames: string[];
	experimentKind?: ExperimentAnalysisRun['experimentKind'];
	parameterRevision?: string;
	runId?: string;
	sidecarUrl?: string | null;
}

function makeRunBase(input: {
	runId?: string;
	workspaceRevision: string;
	sourceRevision: string;
	parameterRevision?: string;
	sidecarUrl?: string | null;
	backendPreference?: ExperimentAnalysisRun['backendPreference'];
	backendActual?: ExperimentAnalysisRun['backendActual'];
	gpuAccelerated?: boolean;
	parameters?: Record<string, unknown>;
	metrics?: Record<string, unknown>;
}) {
	const now = new Date().toISOString();
	return {
		runId: input.runId ?? randomUUID(),
		algorithm: 'experiment' as const,
		algorithmRevision: input.parameterRevision ?? 'local-experiment-v1',
		parameterRevision: input.parameterRevision ?? 'local-experiment-v1',
		workspaceRevision: input.workspaceRevision,
		sourceRevision: input.sourceRevision,
		startedAt: now,
		completedAt: now,
		status: 'succeeded' as const,
		parameters: input.parameters ?? {},
		metrics: input.metrics ?? {},
		backendPreference: input.backendPreference ?? 'native-ts',
		backendActual: input.backendActual ?? 'offline',
		gpuAccelerated: input.gpuAccelerated ?? false,
		sidecarUrl: input.sidecarUrl ?? null,
		inputHash: null,
		outputHash: null,
	};
}

function localComparisonSummary(input: CompareRunsInput | EvaluateAblationInput): Record<string, unknown> {
	return {
		todo: 'wire a persisted evaluation report when the promotion gate is frozen',
		experimentKind: input.experimentKind ?? 'parity',
		metricNames: input.metricNames,
		runCount: 'baselineRunId' in input ? 1 + input.candidateRunIds.length : input.runIds.length,
	};
}

export function getExperimentAnalysisService(sidecarClient?: ExperimentAnalysisSidecarClient): ExperimentAnalysisService {
	const sidecar = sidecarClient ?? createExperimentAnalysisSidecarClient();

	return {
		async compare(input: CompareRunsInput) {
			const base = makeRunBase({
				runId: input.runId,
				workspaceRevision: input.workspaceRevision,
				sourceRevision: input.sourceRevision,
				parameterRevision: input.parameterRevision,
				sidecarUrl: input.sidecarUrl ?? sidecar.baseUrl,
				parameters: {
					baselineRunId: input.baselineRunId,
					candidateRunIds: input.candidateRunIds,
					metricNames: input.metricNames,
				},
			});

			const request: ExperimentComparisonRequest = {
				baselineRunId: input.baselineRunId,
				candidateRunIds: input.candidateRunIds,
				metricNames: input.metricNames,
			};

			const remote = await sidecar.compareRuns(request, { timeoutMs: 10_000 });
			const summary = remote ?? localComparisonSummary(input);
			const run = ExperimentAnalysisRunSchema.parse({
				...base,
				experimentKind: input.experimentKind ?? 'parity',
				baselineRunId: input.baselineRunId,
				candidateRunIds: input.candidateRunIds,
				metricNames: input.metricNames,
				passCriteria: {
					todo: 'define pass criteria in the evaluation policy',
				},
				comparisonSummary: summary,
			});

			const results: ExperimentAnalysisResult[] = input.metricNames.map((metricName) => ({
				runId: run.runId,
				metricName,
				baselineValue: null,
				candidateValue: null,
				delta: null,
				passed: false,
				reason: 'TODO: no evaluator wired yet',
				createdAt: new Date().toISOString(),
				metadata: { baselineRunId: input.baselineRunId, candidateRunIds: input.candidateRunIds },
			}));

			return { run, summary, results };
		},

		async evaluate(input: EvaluateAblationInput) {
			const base = makeRunBase({
				runId: input.runId,
				workspaceRevision: input.workspaceRevision,
				sourceRevision: input.sourceRevision,
				parameterRevision: input.parameterRevision,
				sidecarUrl: input.sidecarUrl ?? sidecar.baseUrl,
				parameters: {
					runIds: input.runIds,
					metricNames: input.metricNames,
				},
			});

			const remote = await sidecar.evaluateAblation(
				{
					experimentKind: input.experimentKind ?? 'ablation',
					runIds: input.runIds,
					metricNames: input.metricNames,
				} satisfies ExperimentAblationRequest,
				{ timeoutMs: 10_000 },
			);

			const run = ExperimentAnalysisRunSchema.parse({
				...base,
				experimentKind: input.experimentKind ?? 'ablation',
				baselineRunId: null,
				candidateRunIds: input.runIds,
				metricNames: input.metricNames,
				passCriteria: { todo: 'promotion gate policy not frozen yet' },
				comparisonSummary: {
					todo: 'wire sidecar or persisted evaluator',
				},
			});

			return {
				run,
				results:
					remote ??
					input.metricNames.map((metricName) => ({
						runId: run.runId,
						metricName,
						baselineValue: null,
						candidateValue: null,
						delta: null,
						passed: false,
						reason: 'TODO: evaluator not yet wired',
						createdAt: new Date().toISOString(),
						metadata: { runIds: input.runIds },
					})),
			};
		},
	};
}
