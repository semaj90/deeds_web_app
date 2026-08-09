/**
 * Model-analysis orchestration surface.
 *
 * This is the sibling to graph-analytics-service.ts:
 * - graph stays graph-specific
 * - HMM / Viterbi / Baum-Welch / routing stay here
 * - a sidecar can accelerate or replace the local path when present
 *
 * TODO: when a dedicated model sidecar API is frozen, the `sidecar` methods
 * below can become the default execution path for GPU-backed analysis.
 */

import { randomUUID } from 'node:crypto';
import { createModelAnalysisSidecarClient, type ModelAnalysisSidecarClient } from './model-analysis-sidecar.js';
import {
	ModelAnalysisRunSchema,
	type ModelAnalysisRun,
	type ModelAnalysisResult,
} from './model-analysis-types.js';
import { predictChunk, type HMMPrediction } from './hmm-section-classifier.js';
import { processTelemetryEvent } from './hmm-kanban-diagnoser.js';

export interface SectionAnalysisRequest {
	text: string;
	sequenceId?: string;
	corpusRevision?: string | null;
	modelRevision?: string;
	parameterRevision?: string;
	workspaceRevision: string;
	sourceRevision: string;
	runId?: string;
	sidecarUrl?: string | null;
}

export interface TelemetryAnalysisRequest {
	specId: string;
	events: string[];
	modelRevision?: string;
	parameterRevision?: string;
	workspaceRevision: string;
	sourceRevision: string;
	runId?: string;
	sidecarUrl?: string | null;
}

export interface BaumWelchRequest {
	corpusRevision: string;
	sequences: string[][];
	modelRevision?: string;
	parameterRevision?: string;
	workspaceRevision: string;
	sourceRevision: string;
	runId?: string;
	sidecarUrl?: string | null;
	maxIterations?: number;
}

export interface ModelAnalysisService {
	section(input: SectionAnalysisRequest): Promise<{ run: ModelAnalysisRun; prediction: HMMPrediction; result: ModelAnalysisResult }>;
	telemetry(input: TelemetryAnalysisRequest): Promise<{ run: ModelAnalysisRun; path: string[]; recommendation: string | null; result: ModelAnalysisResult }>;
	baumWelch(input: BaumWelchRequest): Promise<{ run: ModelAnalysisRun; adaptation: Record<string, unknown>; result: ModelAnalysisResult }>;
}

function makeRunBase(input: {
	runId?: string;
	algorithm: ModelAnalysisRun['algorithm'];
	parameterRevision?: string;
	workspaceRevision: string;
	sourceRevision: string;
	backendPreference?: ModelAnalysisRun['backendPreference'];
	backendActual?: ModelAnalysisRun['backendActual'];
	gpuAccelerated?: boolean;
	sidecarUrl?: string | null;
	parameters?: Record<string, unknown>;
	metrics?: Record<string, unknown>;
}) {
	const now = new Date().toISOString();
	return {
		runId: input.runId ?? randomUUID(),
		algorithm: input.algorithm,
		algorithmRevision: input.parameterRevision ?? 'local-v1',
		parameterRevision: input.parameterRevision ?? 'local-v1',
		workspaceRevision: input.workspaceRevision,
		sourceRevision: input.sourceRevision,
		startedAt: now,
		completedAt: now,
		status: 'succeeded' as const,
		parameters: input.parameters ?? {},
		metrics: input.metrics ?? {},
		backendPreference: input.backendPreference ?? 'native-ts',
		backendActual: input.backendActual ?? 'native-ts',
		gpuAccelerated: input.gpuAccelerated ?? false,
		sidecarUrl: input.sidecarUrl ?? null,
		inputHash: null,
		outputHash: null,
	};
}

function normalizePrediction(text: string, prediction: HMMPrediction): ModelAnalysisResult {
	return {
		runId: randomUUID(),
		sequenceId: `sequence:${Math.abs(text.length)}`,
		decodedPath: prediction.stateSequence,
		logProbability: null,
		confidence: prediction.confidence,
		recommendation: prediction.primaryState,
		gpuAccelerated: false,
		sidecarUsed: false,
		modelRevision: 'local-hmm-v1',
		createdAt: new Date().toISOString(),
		metadata: {
			primaryState: prediction.primaryState,
			stateProbabilities: prediction.stateProbabilities,
		},
	};
}

function normalizeTelemetryResult(specId: string, path: string[], recommendation: string | null): ModelAnalysisResult {
	return {
		runId: randomUUID(),
		sequenceId: specId,
		decodedPath: path,
		logProbability: null,
		confidence: path.length > 0 ? 0.75 : 0,
		recommendation,
		gpuAccelerated: false,
		sidecarUsed: false,
		modelRevision: 'local-hmm-v1',
		createdAt: new Date().toISOString(),
		metadata: { recommendation, pathLength: path.length },
	};
}

function normalizeBaumWelchResult(corpusRevision: string, adaptation: Record<string, unknown>): ModelAnalysisResult {
	const trained = adaptation['trained'];
	const modelRevision = adaptation['modelRevision'];
	return {
		runId: randomUUID(),
		sequenceId: corpusRevision,
		decodedPath: [],
		logProbability: null,
		confidence: null,
		recommendation: null,
		gpuAccelerated: false,
		sidecarUsed: Boolean(trained),
		modelRevision: typeof modelRevision === 'string' && modelRevision ? modelRevision : 'baum-welch-local-v1',
		createdAt: new Date().toISOString(),
		metadata: adaptation,
	};
}

export function getModelAnalysisService(sidecarClient?: ModelAnalysisSidecarClient): ModelAnalysisService {
	const sidecar = sidecarClient ?? createModelAnalysisSidecarClient();

	return {
		async section(input: SectionAnalysisRequest) {
			const sequenceId = input.sequenceId ?? `section:${randomUUID()}`;
			const base = makeRunBase({
				runId: input.runId,
				algorithm: 'hmm_section_classifier',
				parameterRevision: input.parameterRevision,
				workspaceRevision: input.workspaceRevision,
				sourceRevision: input.sourceRevision,
				sidecarUrl: input.sidecarUrl ?? sidecar.baseUrl,
				parameters: { sequenceId, corpusRevision: input.corpusRevision ?? null },
			});

			const sidecarResult = await sidecar.viterbi(
				{
					sequenceId,
					observations: [input.text],
					modelRevision: input.modelRevision ?? 'local-hmm-v1',
					corpusRevision: input.corpusRevision ?? null,
				},
				{ timeoutMs: 10_000 },
			);

			if (sidecarResult) {
				const parsed = ModelAnalysisRunSchema.parse({
					...base,
					algorithmRevision: input.parameterRevision ?? 'local-v1',
					modelFamily: 'hmm',
					modelRevision: input.modelRevision ?? 'local-hmm-v1',
					corpusRevision: input.corpusRevision ?? null,
					sequenceLength: 1,
					observationCount: 1,
					stateCount: sidecarResult.decodedPath.length,
					decoderRevision: input.modelRevision ?? 'local-hmm-v1',
					trainable: false,
					backendPreference: 'python-sidecar',
					backendActual: 'python-sidecar',
					gpuAccelerated: true,
				});
				return {
					run: parsed,
					prediction: {
						primaryState: String(sidecarResult.recommendation ?? 'UNKNOWN'),
						confidence: sidecarResult.confidence ?? 0,
						stateProbabilities: {},
						stateSequence: sidecarResult.decodedPath,
					} as HMMPrediction,
					result: sidecarResult,
				};
			}

			const prediction = predictChunk(input.text);
			const result = normalizePrediction(input.text, prediction);
			const run = ModelAnalysisRunSchema.parse({
				...base,
				modelFamily: 'hmm',
				modelRevision: input.modelRevision ?? 'local-hmm-v1',
				corpusRevision: input.corpusRevision ?? null,
				sequenceLength: input.text.length,
				observationCount: input.text.length > 0 ? 1 : 0,
				stateCount: prediction.stateSequence.length,
				decoderRevision: input.modelRevision ?? 'local-hmm-v1',
				trainable: false,
				backendPreference: 'native-ts',
				backendActual: 'native-ts',
				gpuAccelerated: false,
			});
			return { run, prediction, result };
		},

		async telemetry(input: TelemetryAnalysisRequest) {
			const base = makeRunBase({
				runId: input.runId,
				algorithm: 'hmm_kanban_diagnoser',
				parameterRevision: input.parameterRevision,
				workspaceRevision: input.workspaceRevision,
				sourceRevision: input.sourceRevision,
				sidecarUrl: input.sidecarUrl ?? sidecar.baseUrl,
				parameters: { specId: input.specId, eventCount: input.events.length },
			});

			const sidecarResult = await sidecar.diagnose(
				{ specId: input.specId, events: input.events },
				{ timeoutMs: 10_000 },
			);

			if (sidecarResult) {
				const run = ModelAnalysisRunSchema.parse({
					...base,
					modelFamily: 'router',
					modelRevision: input.modelRevision ?? 'local-hmm-v1',
					corpusRevision: null,
					sequenceLength: input.events.length,
					observationCount: input.events.length,
					stateCount: sidecarResult.decodedPath.length,
					decoderRevision: input.modelRevision ?? 'local-hmm-v1',
					trainable: false,
					backendPreference: 'python-sidecar',
					backendActual: 'python-sidecar',
					gpuAccelerated: true,
				});
				return {
					run,
					path: sidecarResult.decodedPath,
					recommendation: sidecarResult.recommendation ?? null,
					result: sidecarResult,
				};
			}

			const diagnosis = await processTelemetryEvent(input.specId, input.events.join('\n'));
			const run = ModelAnalysisRunSchema.parse({
				...base,
				modelFamily: 'router',
				modelRevision: input.modelRevision ?? 'local-hmm-v1',
				corpusRevision: null,
				sequenceLength: input.events.length,
				observationCount: input.events.length,
				stateCount: diagnosis.path.length,
				decoderRevision: input.modelRevision ?? 'local-hmm-v1',
				trainable: false,
				backendPreference: 'native-ts',
				backendActual: 'native-ts',
				gpuAccelerated: false,
			});
			return {
				run,
				path: diagnosis.path,
				recommendation: diagnosis.recommendation.recommendation,
				result: normalizeTelemetryResult(input.specId, diagnosis.path, diagnosis.recommendation.recommendation),
			};
		},

		async baumWelch(input: BaumWelchRequest) {
			const base = makeRunBase({
				runId: input.runId,
				algorithm: 'baum_welch',
				parameterRevision: input.parameterRevision,
				workspaceRevision: input.workspaceRevision,
				sourceRevision: input.sourceRevision,
				backendPreference: 'python-sidecar',
				backendActual: 'offline',
				sidecarUrl: input.sidecarUrl ?? sidecar.baseUrl,
				gpuAccelerated: true,
				parameters: {
					corpusRevision: input.corpusRevision,
					sequenceCount: input.sequences.length,
					maxIterations: input.maxIterations ?? 25,
				},
			});

			const adaptation = await sidecar.baumWelch(
				{
					corpusRevision: input.corpusRevision,
					sequences: input.sequences,
					maxIterations: input.maxIterations ?? 25,
					tolerance: 1e-4,
				},
				{ timeoutMs: 60_000 },
			);

			const run = ModelAnalysisRunSchema.parse({
				...base,
				modelFamily: 'hmm',
				modelRevision: input.modelRevision ?? 'baum-welch-local-v1',
				corpusRevision: input.corpusRevision,
				sequenceLength: input.sequences.reduce((sum, seq) => sum + seq.length, 0),
				observationCount: input.sequences.length,
				stateCount: null,
				decoderRevision: input.modelRevision ?? 'baum-welch-local-v1',
				trainable: true,
				backendPreference: 'python-sidecar',
				backendActual: adaptation ? 'python-sidecar' : 'offline',
				gpuAccelerated: Boolean(adaptation),
			});

			return {
				run,
				adaptation: adaptation ?? { trained: false, todo: 'wire dedicated Baum-Welch sidecar' },
				result: normalizeBaumWelchResult(input.corpusRevision, adaptation ?? { trained: false }),
			};
		},
	};
}
