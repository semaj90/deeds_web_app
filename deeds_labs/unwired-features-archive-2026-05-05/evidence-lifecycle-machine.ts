/**
 * Unified Evidence Lifecycle Machine (XState v5)
 *
 * Single machine covering the full evidence pipeline:
 *   idle → uploading → extracting → embedding → indexing → graphLinking → ready
 *   ready → retrieving → synthesizing → completed
 *   Any state → failed (with retry)
 *
 * Orchestrates client-side: uploads, polls server pipeline, and handles
 * retrieval + synthesis flows. RabbitMQ handles slow work server-side;
 * this machine tracks progress via polling.
 *
 * Usage:
 *   import { useMachine } from '$lib/utils/xstate-svelte5';
 *   const { snapshot, send } = useMachine(evidenceLifecycleMachine);
 *   const phase = $derived(snapshot.value);
 */

import { setup, assign, fromPromise } from 'xstate';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EvidenceLifecycleContext {
	evidenceId: string | null;
	caseId: string | null;
	file: File | null;

	// Upload
	uploadProgress: number;

	// Extraction
	extractedText: string;
	extractionMethod: string;

	// Embedding
	embeddingStatus: 'pending' | 'running' | 'done' | 'failed';
	vectorId: string | null;

	// Indexing (Qdrant + pgvector)
	indexStatus: 'pending' | 'running' | 'done' | 'failed';

	// Graph linking
	graphStatus: 'pending' | 'running' | 'done' | 'failed';
	graphConnectionsCreated: number;

	// Analysis (YOLO + LLM)
	yoloResult: {
		objects: Array<{ class: string; confidence: number }>;
		cacheHit: boolean;
	} | null;
	llmSynthesis: {
		summary: string;
		keyFindings: string[];
	} | null;

	// Retrieval (when querying evidence)
	retrievalQuery: string;
	retrievalResults: Array<{
		chunkId: string;
		score: number;
		text: string;
	}>;

	// Synthesis (final Gemma output)
	synthesisResponse: string;

	// Meta
	error: string | null;
	retryCount: number;
	timing: Record<string, number>;
}

export type EvidenceLifecycleEvent =
	| { type: 'UPLOAD'; file: File; caseId: string }
	| { type: 'UPLOAD_PROGRESS'; progress: number }
	| { type: 'RETRIEVE'; query: string; caseId: string; evidenceId: string }
	| { type: 'SYNTHESIZE' }
	| { type: 'RETRY' }
	| { type: 'RESET' };

// ── Actors ─────────────────────────────────────────────────────────────────

const uploadEvidence = fromPromise(
	async ({ input }: { input: { file: File; caseId: string } }) => {
		const start = performance.now();
		const formData = new FormData();
		formData.append('file', input.file);
		formData.append('caseId', input.caseId);

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
	}
);

const pollPipelineStage = fromPromise(
	async ({
		input,
	}: {
		input: { evidenceId: string; stage: string };
	}) => {
		const start = performance.now();
		let delay = 500;
		const deadline = performance.now() + 60_000;

		while (performance.now() < deadline) {
			await new Promise((r) => setTimeout(r, delay));
			delay = Math.min(delay * 1.5, 3000);

			const res = await fetch(
				`/api/evidence/analysis/cache?evidenceId=${input.evidenceId}&stage=${input.stage}`
			);
			if (!res.ok) continue;

			const data = await res.json();
			if (data.status === 'done' || data.data?.length > 0) {
				return {
					stage: input.stage,
					data: data.data ?? [],
					durationMs: Math.round(performance.now() - start),
				};
			}
			if (data.status === 'failed') {
				throw new Error(`${input.stage} failed on server`);
			}
		}

		// Timeout — treat as done (server pipeline continues in background)
		return {
			stage: input.stage,
			data: [],
			durationMs: Math.round(performance.now() - start),
			timedOut: true,
		};
	}
);

const runRetrieval = fromPromise(
	async ({
		input,
	}: {
		input: { query: string; caseId: string; evidenceId: string };
	}) => {
		const start = performance.now();
		const res = await fetch('/api/rag/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: input.query,
				caseId: input.caseId,
				evidenceFilter: input.evidenceId,
				limit: 10,
			}),
		});

		if (!res.ok) throw new Error(`Retrieval failed: ${res.status}`);
		const data = await res.json();
		return {
			results: (data.results ?? []).map((r: any) => ({
				chunkId: r.id ?? r.chunkId ?? '',
				score: r.score ?? 0,
				text: r.text ?? r.content ?? '',
			})),
			durationMs: Math.round(performance.now() - start),
		};
	}
);

const runSynthesis = fromPromise(
	async ({
		input,
	}: {
		input: { query: string; caseId: string; context: string };
	}) => {
		const start = performance.now();
		const res = await fetch('/api/sse/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				message: input.query,
				conversationId: `case-${input.caseId}`,
				model: 'gemma4-legal:latest',
			}),
		});

		if (!res.ok) throw new Error(`Synthesis failed: ${res.status}`);

		// Read SSE stream to completion
		const reader = res.body?.getReader();
		const decoder = new TextDecoder();
		let fullText = '';

		if (reader) {
			let streamComplete = false;
      while (!streamComplete) {
        const { done, value } = await reader.read();
        if (done) {
          streamComplete = true;
          continue;
        }
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE data lines
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullText = parsed.content;
            } catch {
              /* partial JSON */
            }
          }
        }
      }
		}

		return {
			response: fullText,
			durationMs: Math.round(performance.now() - start),
		};
	}
);

// ── Machine ────────────────────────────────────────────────────────────────

export const evidenceLifecycleMachine = setup({
	types: {
		context: {} as EvidenceLifecycleContext,
		events: {} as EvidenceLifecycleEvent,
	},
	actors: {
		uploadEvidence,
		pollPipelineStage,
		runRetrieval,
		runSynthesis,
	},
}).createMachine({
	id: 'evidenceLifecycle',
	initial: 'idle',
	context: {
		evidenceId: null,
		caseId: null,
		file: null,
		uploadProgress: 0,
		extractedText: '',
		extractionMethod: '',
		embeddingStatus: 'pending',
		vectorId: null,
		indexStatus: 'pending',
		graphStatus: 'pending',
		graphConnectionsCreated: 0,
		yoloResult: null,
		llmSynthesis: null,
		retrievalQuery: '',
		retrievalResults: [],
		synthesisResponse: '',
		error: null,
		retryCount: 0,
		timing: {},
	},
	states: {
		idle: {
			on: {
				UPLOAD: {
					target: 'uploading',
					actions: assign({
						file: ({ event }) => event.file,
						caseId: ({ event }) => event.caseId,
						error: () => null,
						retryCount: () => 0,
					}),
				},
				RETRIEVE: {
					target: 'retrieving',
					actions: assign({
						retrievalQuery: ({ event }) => event.query,
						caseId: ({ event }) => event.caseId,
						evidenceId: ({ event }) => event.evidenceId,
						error: () => null,
					}),
				},
			},
		},

		uploading: {
			invoke: {
				src: 'uploadEvidence',
				input: ({ context }) => ({
					file: context.file!,
					caseId: context.caseId!,
				}),
				onDone: {
					target: 'extracting',
					actions: assign({
						evidenceId: ({ event }) => event.output.evidenceId,
						extractedText: ({ event }) => event.output.text,
						extractionMethod: ({ event }) => event.output.method,
						timing: ({ context, event }) => ({
							...context.timing,
							uploadMs: event.output.uploadMs,
						}),
					}),
				},
				onError: {
					target: 'failed',
					actions: assign({
						error: ({ event }) =>
							event.error instanceof Error ? event.error.message : 'Upload failed',
					}),
				},
			},
			on: {
				UPLOAD_PROGRESS: {
					actions: assign({ uploadProgress: ({ event }) => event.progress }),
				},
			},
		},

		extracting: {
			invoke: {
				src: 'pollPipelineStage',
				input: ({ context }) => ({
					evidenceId: context.evidenceId!,
					stage: 'extraction',
				}),
				onDone: {
					target: 'embedding',
					actions: assign({
						timing: ({ context, event }) => ({
							...context.timing,
							extractionMs: event.output.durationMs,
						}),
					}),
				},
				onError: {
					target: 'failed',
					actions: assign({
						error: ({ event }) =>
							event.error instanceof Error ? event.error.message : 'Extraction failed',
					}),
				},
			},
		},

		embedding: {
			entry: assign({ embeddingStatus: () => 'running' as const }),
			invoke: {
				src: 'pollPipelineStage',
				input: ({ context }) => ({
					evidenceId: context.evidenceId!,
					stage: 'embedding',
				}),
				onDone: {
					target: 'indexing',
					actions: assign({
						embeddingStatus: () => 'done' as const,
						timing: ({ context, event }) => ({
							...context.timing,
							embeddingMs: event.output.durationMs,
						}),
					}),
				},
				onError: {
					target: 'failed',
					actions: assign({
						embeddingStatus: () => 'failed' as const,
						error: ({ event }) =>
							event.error instanceof Error ? event.error.message : 'Embedding failed',
					}),
				},
			},
		},

		indexing: {
			entry: assign({ indexStatus: () => 'running' as const }),
			invoke: {
				src: 'pollPipelineStage',
				input: ({ context }) => ({
					evidenceId: context.evidenceId!,
					stage: 'indexing',
				}),
				onDone: {
					target: 'graphLinking',
					actions: assign({
						indexStatus: () => 'done' as const,
						timing: ({ context, event }) => ({
							...context.timing,
							indexingMs: event.output.durationMs,
						}),
					}),
				},
				onError: {
					target: 'failed',
					actions: assign({
						indexStatus: () => 'failed' as const,
						error: ({ event }) =>
							event.error instanceof Error ? event.error.message : 'Indexing failed',
					}),
				},
			},
		},

		graphLinking: {
			entry: assign({ graphStatus: () => 'running' as const }),
			invoke: {
				src: 'pollPipelineStage',
				input: ({ context }) => ({
					evidenceId: context.evidenceId!,
					stage: 'graph',
				}),
				onDone: {
					target: 'ready',
					actions: assign({
						graphStatus: () => 'done' as const,
						timing: ({ context, event }) => ({
							...context.timing,
							graphMs: event.output.durationMs,
						}),
					}),
				},
				onError: {
					// Graph linking is non-fatal — proceed to ready
					target: 'ready',
					actions: assign({
						graphStatus: () => 'failed' as const,
					}),
				},
			},
		},

		ready: {
			on: {
				RETRIEVE: {
					target: 'retrieving',
					actions: assign({
						retrievalQuery: ({ event }) => event.query,
						caseId: ({ event }) => event.caseId,
						evidenceId: ({ event }) => event.evidenceId,
					}),
				},
				RESET: { target: 'idle' },
			},
		},

		retrieving: {
			invoke: {
				src: 'runRetrieval',
				input: ({ context }) => ({
					query: context.retrievalQuery,
					caseId: context.caseId!,
					evidenceId: context.evidenceId!,
				}),
				onDone: {
					target: 'synthesizing',
					actions: assign({
						retrievalResults: ({ event }) => event.output.results,
						timing: ({ context, event }) => ({
							...context.timing,
							retrievalMs: event.output.durationMs,
						}),
					}),
				},
				onError: {
					target: 'failed',
					actions: assign({
						error: ({ event }) =>
							event.error instanceof Error ? event.error.message : 'Retrieval failed',
					}),
				},
			},
		},

		synthesizing: {
			invoke: {
				src: 'runSynthesis',
				input: ({ context }) => ({
					query: context.retrievalQuery,
					caseId: context.caseId!,
					context: context.retrievalResults.map((r) => r.text).join('\n\n'),
				}),
				onDone: {
					target: 'completed',
					actions: assign({
						synthesisResponse: ({ event }) => event.output.response,
						timing: ({ context, event }) => ({
							...context.timing,
							synthesisMs: event.output.durationMs,
						}),
					}),
				},
				onError: {
					target: 'failed',
					actions: assign({
						error: ({ event }) =>
							event.error instanceof Error ? event.error.message : 'Synthesis failed',
					}),
				},
			},
		},

		completed: {
			on: {
				RETRIEVE: {
					target: 'retrieving',
					actions: assign({
						retrievalQuery: ({ event }) => event.query,
						caseId: ({ event }) => event.caseId,
						evidenceId: ({ event }) => event.evidenceId,
					}),
				},
				RESET: { target: 'idle' },
			},
		},

		failed: {
			on: {
				RETRY: {
					target: 'idle',
					actions: assign({
						error: () => null,
						retryCount: ({ context }) => context.retryCount + 1,
					}),
				},
				RESET: {
					target: 'idle',
					actions: assign({
						error: () => null,
						retryCount: () => 0,
					}),
				},
			},
		},
	},
});
