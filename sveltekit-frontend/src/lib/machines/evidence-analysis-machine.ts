/**
 * XState v5 Evidence Analysis Machine
 *
 * Client-side orchestration for evidence upload → analysis pipeline.
 * States: idle → uploading → extracting → analyzing → caching → done
 * On timeout/complexity → escalates to server LLM synthesis via SSE.
 *
 * Usage in Svelte 5:
 *   import { useMachine } from '$lib/utils/xstate-svelte5';
 *   const { snapshot, send } = useMachine(evidenceAnalysisMachine);
 *   const isUploading = $derived(snapshot.matches('uploading'));
 */

import { setup, assign, fromPromise } from 'xstate';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnalysisContext {
	evidenceId: string | null;
	caseId: string | null;
	file: File | null;
	uploadProgress: number;

	// Extraction
	extractedText: string;
	extractionMethod: string;

	// Analysis results
	yoloResult: {
		objects: Array<{ class: string; confidence: number }>;
		layout: { regions: Array<{ type: string; confidence: number }> };
		modelType: string;
		cacheHit: boolean;
	} | null;
	llmSynthesis: {
		summary: string;
		keyFindings: string[];
		caseRelevance: string;
		suggestedConnections: Array<{ targetType: string; reason: string; confidence: number }>;
	} | null;
	llmEscalated: boolean;

	// Cache
	cachedAnalysis: Array<{
		analysis_type: string;
		result: Record<string, unknown>;
		confidence: number;
		tags: string[];
	}>;
	cacheHit: 'memory' | 'redis' | false;

	// Graph
	graphConnectionsCreated: number;

	// Errors & timing
	errors: string[];
	timing: {
		uploadMs: number;
		extractionMs: number;
		analysisMs: number;
		cacheMs: number;
		totalMs: number;
	};
}

export type AnalysisEvent =
	| { type: 'UPLOAD'; file: File; caseId?: string }
	| { type: 'UPLOAD_PROGRESS'; progress: number }
	| { type: 'CHECK_CACHE'; evidenceId: string; caseId?: string }
	| { type: 'RETRY' }
	| { type: 'CANCEL' }
	| { type: 'RESET' };

// ── Actors (async service invocations) ─────────────────────────────────────

const uploadEvidence = fromPromise(async ({ input }: { input: { file: File; caseId?: string } }) => {
	const start = performance.now();
	const formData = new FormData();
	formData.append('file', input.file);
	if (input.caseId) {
    formData.append('case_id', input.caseId);
    formData.append('caseId', input.caseId);
  }
  formData.append('enableAiAnalysis', 'true');
  formData.append('enableOcr', 'true');
  formData.append('enableEmbeddings', 'true');
  formData.append('enableSummarization', 'true');

	const res = await fetch('/api/evidence/upload', {
		method: 'POST',
		body: formData,
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: 'Upload failed' }));
		throw new Error(err.error ?? `Upload failed: ${res.status}`);
	}

	const data = await res.json();
	return {
		evidenceId: data.evidenceId as string,
		text: (data.extractedText ?? '') as string,
		method: (data.extractionMethod ?? 'unknown') as string,
		uploadMs: Math.round(performance.now() - start),
	};
});

const fetchAnalysisCache = fromPromise(
	async ({ input }: { input: { evidenceId: string; caseId?: string } }) => {
		const start = performance.now();
		const params = new URLSearchParams({ evidenceId: input.evidenceId });
		if (input.caseId) params.set('caseId', input.caseId);

		const res = await fetch(`/api/evidence/analysis/cache?${params}`);
		if (!res.ok) throw new Error('Cache query failed');

		const result = await res.json();
		return {
			data: result.data ?? [],
			cacheHit: result.cacheHit ?? false,
			cacheMs: Math.round(performance.now() - start),
		};
	}
);

const pollAnalysisStatus = fromPromise(
	async ({ input }: { input: { evidenceId: string } }) => {
		const start = performance.now();

		// Poll for analysis completion (max 30s with exponential backoff)
		let delay = 500;
		const maxWait = 30_000;
		const deadline = performance.now() + maxWait;

		while (performance.now() < deadline) {
			await new Promise((r) => setTimeout(r, delay));
			delay = Math.min(delay * 1.5, 3000);

			const res = await fetch(`/api/evidence/analysis?evidenceId=${input.evidenceId}`);
			if (!res.ok) continue;

			const data = await res.json();
			const jobs = data.jobs ?? [];
			const allDone = jobs.length > 0 && jobs.every(
				(j: any) => j.status === 'completed' || j.status === 'failed'
			);

			if (allDone) {
				// Fetch cached results
				const cacheRes = await fetch(
					`/api/evidence/analysis/cache?evidenceId=${input.evidenceId}`
				);
				const cache = cacheRes.ok ? await cacheRes.json() : { data: [] };
				return {
					analyses: cache.data ?? [],
					analysisMs: Math.round(performance.now() - start),
				};
			}
		}

		// Timeout — return whatever we have
		const cacheRes = await fetch(
			`/api/evidence/analysis/cache?evidenceId=${input.evidenceId}`
		);
		const cache = cacheRes.ok ? await cacheRes.json() : { data: [] };
		return {
			analyses: cache.data ?? [],
			analysisMs: Math.round(performance.now() - start),
			timedOut: true,
		};
	}
);

// ── Machine Definition ─────────────────────────────────────────────────────

export const evidenceAnalysisMachine = setup({
	types: {
		context: {} as AnalysisContext,
		events: {} as AnalysisEvent,
	},
	actors: {
		uploadEvidence,
		fetchAnalysisCache,
		pollAnalysisStatus,
	},
}).createMachine({
	id: 'evidenceAnalysis',
	initial: 'idle',
	context: {
		evidenceId: null,
		caseId: null,
		file: null,
		uploadProgress: 0,
		extractedText: '',
		extractionMethod: '',
		yoloResult: null,
		llmSynthesis: null,
		llmEscalated: false,
		cachedAnalysis: [],
		cacheHit: false,
		graphConnectionsCreated: 0,
		errors: [],
		timing: { uploadMs: 0, extractionMs: 0, analysisMs: 0, cacheMs: 0, totalMs: 0 },
	},
	states: {
		idle: {
			on: {
				UPLOAD: {
					target: 'uploading',
					actions: assign({
						file: ({ event }) => event.file,
						caseId: ({ event }) => event.caseId ?? null,
						errors: () => [],
						uploadProgress: () => 0,
					}),
				},
				CHECK_CACHE: {
					target: 'checkingCache',
					actions: assign({
						evidenceId: ({ event }) => event.evidenceId,
						caseId: ({ event }) => event.caseId ?? null,
					}),
				},
			},
		},

		uploading: {
			invoke: {
				src: 'uploadEvidence',
				input: ({ context }) => ({
					file: context.file!,
					caseId: context.caseId ?? undefined,
				}),
				onDone: {
					target: 'analyzing',
					actions: assign({
						evidenceId: ({ event }) => event.output.evidenceId,
						extractedText: ({ event }) => event.output.text,
						extractionMethod: ({ event }) => event.output.method,
						uploadProgress: () => 100,
						timing: ({ context, event }) => ({
							...context.timing,
							uploadMs: event.output.uploadMs,
						}),
					}),
				},
				onError: {
					target: 'error',
					actions: assign({
						errors: ({ context, event }) => [
							...context.errors,
							`Upload: ${(event.error as Error).message}`,
						],
					}),
				},
			},
			on: {
				UPLOAD_PROGRESS: {
					actions: assign({
						uploadProgress: ({ event }) => event.progress,
					}),
				},
				CANCEL: 'idle',
			},
		},

		analyzing: {
			invoke: {
				src: 'pollAnalysisStatus',
				input: ({ context }) => ({
					evidenceId: context.evidenceId!,
				}),
				onDone: {
					target: 'checkingCache',
					actions: assign({
						timing: ({ context, event }) => ({
							...context.timing,
							analysisMs: event.output.analysisMs,
						}),
					}),
				},
				onError: {
					target: 'checkingCache', // Don't fail — try cache anyway
					actions: assign({
						errors: ({ context, event }) => [
							...context.errors,
							`Analysis poll: ${(event.error as Error).message}`,
						],
					}),
				},
			},
			on: {
				CANCEL: 'idle',
			},
		},

		checkingCache: {
			invoke: {
				src: 'fetchAnalysisCache',
				input: ({ context }) => ({
					evidenceId: context.evidenceId!,
					caseId: context.caseId ?? undefined,
				}),
				onDone: {
					target: 'done',
					actions: assign({
						cachedAnalysis: ({ event }) => event.output.data,
						cacheHit: ({ event }) => event.output.cacheHit,
						timing: ({ context, event }) => ({
							...context.timing,
							cacheMs: event.output.cacheMs,
							totalMs: context.timing.uploadMs + context.timing.analysisMs + event.output.cacheMs,
						}),
						// Extract YOLO + LLM from cached results
						yoloResult: ({ event }) => {
							const yoloEntry = event.output.data.find(
								(d: any) => d.analysis_type === 'yolo' || d.analysis_type === 'combined'
							);
							return yoloEntry?.result?.yolo ?? null;
						},
						llmSynthesis: ({ event }) => {
							const entry = event.output.data.find(
								(d: any) => d.analysis_type === 'combined' || d.analysis_type === 'llm_synthesis'
							);
							return entry?.result?.synthesis ?? null;
						},
						llmEscalated: ({ event }) =>
							event.output.data.some((d: any) => d.llm_escalated),
					}),
				},
				onError: {
					target: 'done',
					actions: assign({
						errors: ({ context, event }) => [
							...context.errors,
							`Cache: ${(event.error as Error).message}`,
						],
					}),
				},
			},
		},

		done: {
			on: {
				RESET: {
					target: 'idle',
					actions: assign({
						evidenceId: () => null,
						caseId: () => null,
						file: () => null,
						uploadProgress: () => 0,
						extractedText: () => '',
						extractionMethod: () => '',
						yoloResult: () => null,
						llmSynthesis: () => null,
						llmEscalated: () => false,
						cachedAnalysis: () => [],
						cacheHit: () => false as const,
						graphConnectionsCreated: () => 0,
						errors: () => [],
						timing: () => ({ uploadMs: 0, extractionMs: 0, analysisMs: 0, cacheMs: 0, totalMs: 0 }),
					}),
				},
				CHECK_CACHE: {
					target: 'checkingCache',
					actions: assign({
						evidenceId: ({ event }) => event.evidenceId,
						caseId: ({ event }) => event.caseId ?? null,
					}),
				},
			},
		},

		error: {
			on: {
				RETRY: {
					target: 'uploading',
					actions: assign({ errors: () => [] }),
				},
				RESET: {
					target: 'idle',
					actions: assign({
						errors: () => [],
						file: () => null,
						uploadProgress: () => 0,
					}),
				},
			},
		},
	},
});
