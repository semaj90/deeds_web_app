/**
 * XState v5 Retrieval State Machine
 *
 * Orchestrates the 2-stage retrieval pipeline:
 *   idle → recalling → reranking → assembling → done
 *
 * Stage A (recalling): Fuse.js fuzzy match on local metadata cache
 * Stage B (reranking): Embed query + Qdrant vector search + path boosting
 * Stage C (assembling): Open/parse top hits, build context window
 *
 * Client-side: uses LokiJS/IndexedDB cached metadata + Fuse.js
 * Server-side: uses Qdrant dual-vector search
 */
import { assign, setup, fromPromise } from 'xstate';

// ── Types ────────────────────────────────────────────────────────────────

export interface RetrievalContext {
	query: string;
	candidates: CandidateChunk[];
	reranked: RankedChunk[];
	assembled: AssembledContext | null;
	error: string | null;
	timing: {
		recallMs: number;
		rerankMs: number;
		assembleMs: number;
		totalMs: number;
	};
	config: RetrievalConfig;
}

export interface CandidateChunk {
	path: string;
	symbol: string;
	kind: string;
	tags: string[];
	fuseScore: number;
}

export interface RankedChunk {
	path: string;
	relativePath: string;
	symbol: string;
	kind: string;
	content: string;
	signature: string;
	httpMethod?: string;
	routeId?: string;
	tags: string[];
	score: number;
	lineStart: number;
	lineEnd: number;
}

export interface AssembledContext {
	chunks: RankedChunk[];
	totalTokensEstimate: number;
	sources: string[];
}

export interface RetrievalConfig {
	maxCandidates: number;
	maxResults: number;
	contentWeight: number;
	signatureWeight: number;
	pathBoosts: Record<string, number>;
}

type RetrievalEvent =
	| { type: 'SEARCH'; query: string }
	| { type: 'RESET' }
	| { type: 'UPDATE_CONFIG'; config: Partial<RetrievalConfig> };

// ── Default config ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: RetrievalConfig = {
	maxCandidates: 100,
	maxResults: 10,
	contentWeight: 0.6,
	signatureWeight: 0.4,
	pathBoosts: {
		'+server.ts': 1.3,    // API routes get priority
		'+page.server.ts': 1.2,
		'schema-postgres.ts': 1.2,
		'tests/': 1.1,
		'lib/server/': 1.15,
		'lib/ai/': 1.1
	}
};

// ── Actor logic (fromPromise) ────────────────────────────────────────────

const recallActor = fromPromise<CandidateChunk[], { query: string; maxCandidates: number }>(
	async ({ input }) => {
		const start = performance.now();

		// POST to recall API endpoint (Fuse.js server-side)
		const res = await fetch('/api/codebase/recall', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: input.query,
				limit: input.maxCandidates
			})
		});

		if (!res.ok) throw new Error(`Recall failed: ${res.status}`);
		const data = await res.json();
		const elapsed = performance.now() - start;
		console.debug(`[retrieval] recall: ${data.candidates?.length ?? 0} hits in ${elapsed.toFixed(0)}ms`);
		return data.candidates ?? [];
	}
);

const rerankActor = fromPromise<
	RankedChunk[],
	{ query: string; candidates: CandidateChunk[]; config: RetrievalConfig }
>(async ({ input }) => {
	const start = performance.now();

	// POST to rerank API endpoint (Qdrant dual-vector search)
	const res = await fetch('/api/codebase/rerank', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query: input.query,
			candidatePaths: input.candidates.map((c) => c.path),
			limit: input.config.maxResults,
			contentWeight: input.config.contentWeight,
			signatureWeight: input.config.signatureWeight,
			pathBoosts: input.config.pathBoosts
		})
	});

	if (!res.ok) throw new Error(`Rerank failed: ${res.status}`);
	const data = await res.json();
	const elapsed = performance.now() - start;
	console.debug(`[retrieval] rerank: ${data.results?.length ?? 0} hits in ${elapsed.toFixed(0)}ms`);
	return data.results ?? [];
});

const assembleActor = fromPromise<AssembledContext, { reranked: RankedChunk[] }>(
	async ({ input }) => {
		const start = performance.now();
		const chunks = input.reranked;

		// Estimate token count (~4 chars per token)
		const totalChars = chunks.reduce((acc, c) => acc + c.content.length, 0);
		const totalTokensEstimate = Math.ceil(totalChars / 4);
		const sources = [...new Set(chunks.map((c) => c.relativePath))];

		const elapsed = performance.now() - start;
		console.debug(`[retrieval] assemble: ~${totalTokensEstimate} tokens from ${sources.length} files in ${elapsed.toFixed(0)}ms`);

		return { chunks, totalTokensEstimate, sources };
	}
);

// ── Machine definition ───────────────────────────────────────────────────

export const retrievalMachine = setup({
	types: {
		context: {} as RetrievalContext,
		events: {} as RetrievalEvent
	},
	actors: {
		recall: recallActor,
		rerank: rerankActor,
		assemble: assembleActor
	}
}).createMachine({
	id: 'retrieval',
	initial: 'idle',
	context: {
		query: '',
		candidates: [],
		reranked: [],
		assembled: null,
		error: null,
		timing: { recallMs: 0, rerankMs: 0, assembleMs: 0, totalMs: 0 },
		config: DEFAULT_CONFIG
	},
	states: {
		idle: {
			on: {
				SEARCH: {
					target: 'recalling',
					actions: assign({
						query: ({ event }) => event.query,
						candidates: () => [],
						reranked: () => [],
						assembled: () => null,
						error: () => null,
						timing: () => ({ recallMs: 0, rerankMs: 0, assembleMs: 0, totalMs: 0 })
					})
				},
				UPDATE_CONFIG: {
					actions: assign({
						config: ({ context, event }) => ({ ...context.config, ...event.config })
					})
				}
			}
		},
		recalling: {
			invoke: {
				src: 'recall',
				input: ({ context }) => ({
					query: context.query,
					maxCandidates: context.config.maxCandidates
				}),
				onDone: {
					target: 'reranking',
					actions: assign({
						candidates: ({ event }) => event.output
					})
				},
				onError: {
					target: 'error',
					actions: assign({ error: ({ event }) => String(event.error) })
				}
			}
		},
		reranking: {
			invoke: {
				src: 'rerank',
				input: ({ context }) => ({
					query: context.query,
					candidates: context.candidates,
					config: context.config
				}),
				onDone: {
					target: 'assembling',
					actions: assign({
						reranked: ({ event }) => event.output
					})
				},
				onError: {
					target: 'error',
					actions: assign({ error: ({ event }) => String(event.error) })
				}
			}
		},
		assembling: {
			invoke: {
				src: 'assemble',
				input: ({ context }) => ({ reranked: context.reranked }),
				onDone: {
					target: 'done',
					actions: assign({
						assembled: ({ event }) => event.output
					})
				},
				onError: {
					target: 'error',
					actions: assign({ error: ({ event }) => String(event.error) })
				}
			}
		},
		done: {
			on: {
				SEARCH: {
					target: 'recalling',
					actions: assign({
						query: ({ event }) => event.query,
						candidates: () => [],
						reranked: () => [],
						assembled: () => null,
						error: () => null
					})
				},
				RESET: { target: 'idle' }
			}
		},
		error: {
			on: {
				SEARCH: {
					target: 'recalling',
					actions: assign({
						query: ({ event }) => event.query,
						error: () => null
					})
				},
				RESET: { target: 'idle' }
			}
		}
	}
});
