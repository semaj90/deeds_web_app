/**
 * Representation-analysis orchestration surface.
 *
 * This is the eval gate for CodeBERT / GraphCodeBERT style representation
 * experiments. It compares candidate representations against semantic_768,
 * but it does not promote them or change any runtime retrieval owner.
 */

import { randomUUID } from 'node:crypto';
import {
	RepresentationExperimentKindSchema,
	RepresentationExperimentRunSchema,
	type RepresentationExperimentRun,
	type RepresentationExperimentResult,
} from './representation-experiment-contract.js';
import { SEMANTIC_REPRESENTATION_ID } from '../embedding/embedding-contract-768.js';

export interface CompareRepresentationInput {
	workspaceRevision: string;
	sourceRevision: string;
	candidateRepresentation: 'codebert_768' | 'graphcodebert_768';
	sourceDimension: number;
	targetDimension: number;
	metricNames: string[];
	experimentKind?: RepresentationExperimentRun['experimentKind'];
	parameterRevision?: string;
	runId?: string;
}

export interface RepresentationAnalysisService {
	compare(input: CompareRepresentationInput): Promise<{
		run: RepresentationExperimentRun;
		results: RepresentationExperimentResult[];
		summary: Record<string, unknown>;
	}>;
}

function localSummary(input: CompareRepresentationInput): Record<string, unknown> {
	return {
		todo: 'wire persisted representation evaluation before promotion',
		experimentKind: input.experimentKind ?? 'retrieval_ablation',
		baselineRepresentation: SEMANTIC_REPRESENTATION_ID,
		candidateRepresentation: input.candidateRepresentation,
		metricNames: input.metricNames,
	};
}

export function getRepresentationAnalysisService(): RepresentationAnalysisService {
	return {
		async compare(input: CompareRepresentationInput) {
			const now = new Date().toISOString();
			const run = RepresentationExperimentRunSchema.parse({
				runId: input.runId ?? randomUUID(),
				algorithm: 'representation_experiment',
				algorithmRevision: input.parameterRevision ?? 'representation-local-v1',
				parameterRevision: input.parameterRevision ?? 'representation-local-v1',
				workspaceRevision: input.workspaceRevision,
				sourceRevision: input.sourceRevision,
				startedAt: now,
				completedAt: now,
				status: 'succeeded',
				parameters: {
					candidateRepresentation: input.candidateRepresentation,
					sourceDimension: input.sourceDimension,
					targetDimension: input.targetDimension,
					metricNames: input.metricNames,
				},
				metrics: {},
				backendPreference: 'native-ts',
				backendActual: 'offline',
				gpuAccelerated: false,
				sidecarUrl: null,
				inputHash: null,
				outputHash: null,
				experimentKind: RepresentationExperimentKindSchema.parse(input.experimentKind ?? 'retrieval_ablation'),
				baselineRepresentation: SEMANTIC_REPRESENTATION_ID,
				candidateRepresentation: input.candidateRepresentation,
				sourceDimension: input.sourceDimension,
				targetDimension: input.targetDimension,
				metricNames: input.metricNames,
				passCriteria: { todo: 'representation promotion gate not frozen yet' },
				comparisonSummary: localSummary(input),
			});

			const results: RepresentationExperimentResult[] = input.metricNames.map((metricName) => ({
				runId: run.runId,
				metricName,
				baselineValue: null,
				candidateValue: null,
				delta: null,
				passed: false,
				reason: 'TODO: representation evaluator not yet wired',
				createdAt: now,
				metadata: {
					baselineRepresentation: SEMANTIC_REPRESENTATION_ID,
					candidateRepresentation: input.candidateRepresentation,
				},
			}));

			return {
				run,
				results,
				summary: localSummary(input),
			};
		},
	};
}
