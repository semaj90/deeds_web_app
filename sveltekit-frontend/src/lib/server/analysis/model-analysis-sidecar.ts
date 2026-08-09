/**
 * Optional model-analysis sidecar.
 *
 * This isolates HMM/Viterbi/Baum-Welch concerns from graph analysis so the
 * graph contract can stay graph-specific while still allowing GPU/Rust/Python
 * acceleration to plug in behind the same port.
 *
 * TODO: wire to a dedicated service once the model-analysis sidecar contract
 * is formally frozen. For now, callers can use the local deterministic
 * fallback if the sidecar is absent or returns an error.
 */

import { ENV } from '$lib/server/env.server.js';
import type { ModelAnalysisResult, ModelSequenceObservation } from './model-analysis-types.js';

export type ModelAnalysisBackend = 'native-ts' | 'rust' | 'python-sidecar' | 'gpu-sidecar' | 'offline';

export interface ModelAnalysisHealthResponse {
	status: string;
	backend?: ModelAnalysisBackend;
	version?: string;
	gpu?: boolean;
	hmm?: boolean;
	baumWelch?: boolean;
	viterbi?: boolean;
	timestamp?: string;
}

export interface ModelViterbiRequest {
	sequenceId: string;
	observations: string[];
	modelRevision: string;
	corpusRevision?: string | null;
}

export interface ModelBaumWelchRequest {
	corpusRevision: string;
	sequences: Array<Array<string | ModelSequenceObservation>>;
	maxIterations?: number;
	tolerance?: number;
}

export interface ModelDiagnoseRequest {
	specId: string;
	events: string[];
}

export interface ModelAnalysisSidecarClient {
	baseUrl: string;
	health(options?: { timeoutMs?: number }): Promise<ModelAnalysisHealthResponse | null>;
	viterbi(request: ModelViterbiRequest, options?: { timeoutMs?: number }): Promise<ModelAnalysisResult | null>;
	baumWelch(request: ModelBaumWelchRequest, options?: { timeoutMs?: number }): Promise<Record<string, unknown> | null>;
	diagnose(request: ModelDiagnoseRequest, options?: { timeoutMs?: number }): Promise<ModelAnalysisResult | null>;
}

function resolveBaseUrl(baseUrl?: string): string {
	return (
		baseUrl ??
		process.env.MODEL_ANALYSIS_SIDECAR_URL ??
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
			`[model-analysis-sidecar] ${context} failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
		);
	}
	return (await response.json()) as T;
}

async function postJson<TResponse>(
	baseUrl: string,
	path: string,
	payload: unknown,
	timeoutMs: number,
): Promise<TResponse | null> {
	try {
		const response = await fetch(`${baseUrl}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(timeoutMs),
		});
		return await readJson<TResponse>(response, path);
	} catch {
		return null;
	}
}

export function createModelAnalysisSidecarClient(baseUrl?: string): ModelAnalysisSidecarClient {
	const resolvedBaseUrl = resolveBaseUrl(baseUrl);

	return {
		baseUrl: resolvedBaseUrl,

		async health(options: { timeoutMs?: number } = {}): Promise<ModelAnalysisHealthResponse | null> {
			try {
				const response = await fetch(`${resolvedBaseUrl}/health`, {
					signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
				});
				return await readJson<ModelAnalysisHealthResponse>(response, 'health');
			} catch {
				return null;
			}
		},

		async viterbi(
			request: ModelViterbiRequest,
			options: { timeoutMs?: number } = {},
		): Promise<ModelAnalysisResult | null> {
			// TODO: formalize the GPU/Rust sidecar shape before using this in prod.
			return postJson<ModelAnalysisResult>(resolvedBaseUrl, '/hmm/viterbi', request, options.timeoutMs ?? 10_000);
		},

		async baumWelch(
			request: ModelBaumWelchRequest,
			options: { timeoutMs?: number } = {},
		): Promise<Record<string, unknown> | null> {
			// TODO: dedicate a training lane before enabling corpus adaptation.
			return postJson<Record<string, unknown>>(resolvedBaseUrl, '/hmm/baum-welch', request, options.timeoutMs ?? 60_000);
		},

		async diagnose(
			request: ModelDiagnoseRequest,
			options: { timeoutMs?: number } = {},
		): Promise<ModelAnalysisResult | null> {
			return postJson<ModelAnalysisResult>(resolvedBaseUrl, '/hmm/diagnose', request, options.timeoutMs ?? 10_000);
		},
	};
}
