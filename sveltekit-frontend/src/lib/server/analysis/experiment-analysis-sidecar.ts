/**
 * Optional experiment-analysis sidecar.
 *
 * This is intentionally thin. It gives us a separate place for ablations,
 * parity checks, and promotion gates without forcing those concerns into the
 * graph or HMM contracts.
 *
 * TODO: replace the stub endpoint shapes with a frozen sidecar API once the
 * promotion/evaluation workflow is finalized.
 */

import { ENV } from '$lib/server/env.server.js';
import type { ExperimentAnalysisResult } from './model-analysis-types.js';

export interface ExperimentComparisonRequest {
	baselineRunId: string;
	candidateRunIds: string[];
	metricNames: string[];
}

export interface ExperimentAblationRequest {
	experimentKind: 'ablation' | 'promotion_gate' | 'parity' | 'sidecar_comparison' | 'replay';
	runIds: string[];
	metricNames: string[];
}

export interface ExperimentAnalysisSidecarClient {
	baseUrl: string;
	health(options?: { timeoutMs?: number }): Promise<{ status: string; backend?: string } | null>;
	compareRuns(request: ExperimentComparisonRequest, options?: { timeoutMs?: number }): Promise<Record<string, unknown> | null>;
	evaluateAblation(request: ExperimentAblationRequest, options?: { timeoutMs?: number }): Promise<ExperimentAnalysisResult[] | null>;
}

function resolveBaseUrl(baseUrl?: string): string {
	return (
		baseUrl ??
		process.env.EXPERIMENT_ANALYSIS_SIDECAR_URL ??
		ENV.LANGGRAPH_URL ??
		'http://127.0.0.1:8091'
	).replace(/\/+$/, '');
}

async function readJson<T>(response: Response, context: string): Promise<T> {
	if (!response.ok) {
		let body = '';
		try {
			body = await response.text();
		} catch {
			body = '';
		}
		throw new Error(
			`[experiment-analysis-sidecar] ${context} failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
		);
	}
	return (await response.json()) as T;
}

async function postJson<T>(baseUrl: string, path: string, payload: unknown, timeoutMs: number): Promise<T | null> {
	try {
		const response = await fetch(`${baseUrl}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(timeoutMs),
		});
		return await readJson<T>(response, path);
	} catch {
		return null;
	}
}

export function createExperimentAnalysisSidecarClient(baseUrl?: string): ExperimentAnalysisSidecarClient {
	const resolvedBaseUrl = resolveBaseUrl(baseUrl);

	return {
		baseUrl: resolvedBaseUrl,

		async health(options: { timeoutMs?: number } = {}) {
			try {
				const response = await fetch(`${resolvedBaseUrl}/health`, {
					signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
				});
				return await readJson<{ status: string; backend?: string }>(response, 'health');
			} catch {
				return null;
			}
		},

		async compareRuns(
			request: ExperimentComparisonRequest,
			options: { timeoutMs?: number } = {},
		): Promise<Record<string, unknown> | null> {
			// TODO: define the stable compare payload when promotion gates are frozen.
			return postJson<Record<string, unknown>>(resolvedBaseUrl, '/experiment/compare', request, options.timeoutMs ?? 10_000);
		},

		async evaluateAblation(
			request: ExperimentAblationRequest,
			options: { timeoutMs?: number } = {},
		): Promise<ExperimentAnalysisResult[] | null> {
			// TODO: this should eventually drive GA8/GA9 promotion decisions.
			return postJson<ExperimentAnalysisResult[]>(resolvedBaseUrl, '/experiment/ablation', request, options.timeoutMs ?? 10_000);
		},
	};
}
