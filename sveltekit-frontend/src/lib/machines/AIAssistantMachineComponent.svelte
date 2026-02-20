<script lang="ts">
/**
 * AIAssistantMachineComponent - RAG-powered AI Assistant
 * Uses XState v5 state machine with Svelte 5 runes
 * Queries /api/rag/search for semantic retrieval + confidence ranking
 */
import { createMachine, createActor, assign, fromPromise } from 'xstate';
import { fade } from 'svelte/transition';

interface SearchChunk {
	chunk_id: string;
	text: string;
	snippet: string;
	score: number;
	confidence: 'high' | 'medium' | 'low' | 'marginal';
	source_title: string;
	source_type: string;
	page_num?: number;
	has_table?: boolean;
	has_image?: boolean;
	related_entities: string[];
}

interface AssistantContext {
	query: string;
	chunks: SearchChunk[];
	totalFound: number;
	searchTimeMs: number;
	embeddingTimeMs: number;
	error: string | null;
	history: Array<{ query: string; resultCount: number }>;
}

const assistantMachine = createMachine({
	id: 'aiAssistant',
	initial: 'idle',
	context: {
		query: '',
		chunks: [] as SearchChunk[],
		totalFound: 0,
		searchTimeMs: 0,
		embeddingTimeMs: 0,
		error: null as string | null,
		history: [] as Array<{ query: string; resultCount: number }>
	},
	states: {
		idle: {
			on: {
				UPDATE_QUERY: {
					actions: assign({
						query: ({ event }) => (event as any).query
					})
				},
				SEARCH: {
					target: 'searching',
					guard: ({ context }) => context.query.trim().length > 0
				}
			}
		},
		searching: {
			invoke: {
				id: 'ragSearch',
				src: fromPromise(async ({ input }: { input: AssistantContext }) => {
					const response = await fetch('/api/rag/search', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							query: input.query.trim(),
							top_k: 5,
							min_score: 0.3
						}),
						signal: AbortSignal.timeout(15000)
					});
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.error || `Search failed (${response.status})`);
					}
					return response.json();
				}),
				input: ({ context }) => context,
				onDone: {
					target: 'results',
					actions: assign({
						chunks: ({ event }) => event.output.chunks ?? [],
						totalFound: ({ event }) => event.output.total_found ?? 0,
						searchTimeMs: ({ event }) => event.output.search_time_ms ?? 0,
						embeddingTimeMs: ({ event }) => event.output.embedding_time_ms ?? 0,
						error: null,
						history: ({ context, event }) => [
							...context.history.slice(-9),
							{ query: context.query, resultCount: event.output.total_found ?? 0 }
						]
					})
				},
				onError: {
					target: 'error',
					actions: assign({
						error: ({ event }) =>
							(event as any).error?.message || 'Search failed',
						chunks: [],
						totalFound: 0
					})
				}
			}
		},
		results: {
			on: {
				UPDATE_QUERY: {
					actions: assign({
						query: ({ event }) => (event as any).query
					})
				},
				SEARCH: {
					target: 'searching',
					guard: ({ context }) => context.query.trim().length > 0
				},
				CLEAR: {
					target: 'idle',
					actions: assign({
						query: '',
						chunks: [],
						totalFound: 0,
						error: null
					})
				}
			}
		},
		error: {
			on: {
				UPDATE_QUERY: {
					actions: assign({
						query: ({ event }) => (event as any).query
					})
				},
				SEARCH: {
					target: 'searching',
					guard: ({ context }) => context.query.trim().length > 0
				},
				CLEAR: {
					target: 'idle',
					actions: assign({
						query: '',
						chunks: [],
						error: null
					})
				}
			}
		}
	}
});

const actor = createActor(assistantMachine).start();

let snapshot = $state(actor.getSnapshot());

$effect(() => {
	const sub = actor.subscribe((s) => {
		snapshot = s;
	});
	return () => {
		sub.unsubscribe();
		actor.stop();
	};
});

const ctx = $derived(snapshot.context);
const isSearching = $derived(snapshot.matches('searching'));
const hasResults = $derived(snapshot.matches('results'));
const hasError = $derived(snapshot.matches('error'));

function handleSearch() {
	actor.send({ type: 'SEARCH' });
}

function handleClear() {
	actor.send({ type: 'CLEAR' });
}

function getConfidenceBadge(confidence: string): { class: string; label: string } {
	switch (confidence) {
		case 'high':
			return { class: 'badge-high', label: 'HIGH' };
		case 'medium':
			return { class: 'badge-medium', label: 'MED' };
		case 'low':
			return { class: 'badge-low', label: 'LOW' };
		default:
			return { class: 'badge-marginal', label: 'MARG' };
	}
}

function truncate(text: string, max: number = 120): string {
	if (!text || text.length <= max) return text || '';
	return text.slice(0, max) + '...';
}
</script>

<div class="assistant-container font-mono border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
	<!-- Query Input -->
	<div class="search-bar">
		<input
			type="text"
			value={ctx.query}
			oninput={(e) => actor.send({ type: 'UPDATE_QUERY', query: (e.currentTarget as HTMLInputElement).value })}
			onkeydown={(e) => e.key === 'Enter' && handleSearch()}
			placeholder="ASK_LEGAL_AI..."
			disabled={isSearching}
			class="query-input"
		/>
		<button
			onclick={handleSearch}
			disabled={isSearching || !ctx.query.trim()}
			class="btn-query"
		>
			{isSearching ? '...' : '>'}
		</button>
	</div>

	<!-- Searching State -->
	{#if isSearching}
		<div class="status-line animate-pulse" in:fade>
			> QUERYING_KNOWLEDGE_BASE...
		</div>
	{/if}

	<!-- Results -->
	{#if hasResults && ctx.chunks.length > 0}
		<div class="results-section" in:fade>
			<div class="results-header">
				<span class="text-[10px] text-sand/40 uppercase">
					{ctx.totalFound} RESULTS IN {ctx.searchTimeMs}ms (embed: {ctx.embeddingTimeMs}ms)
				</span>
				<button onclick={handleClear} class="btn-clear">CLEAR</button>
			</div>

			<div class="results-list">
				{#each ctx.chunks as chunk, i (chunk.chunk_id)}
					{@const badge = getConfidenceBadge(chunk.confidence)}
					<div class="result-item" in:fade={{ delay: i * 50 }}>
						<div class="result-meta">
							<span class="result-rank">#{i + 1}</span>
							<span class="confidence-badge {badge.class}">{badge.label}</span>
							<span class="score-text">{(chunk.score * 100).toFixed(0)}%</span>
						</div>
						<div class="result-title">{chunk.source_title}</div>
						<div class="result-snippet">{truncate(chunk.snippet, 150)}</div>
						{#if chunk.related_entities.length > 0}
							<div class="result-entities">
								{#each chunk.related_entities.slice(0, 3) as entity}
									<span class="entity-tag">{entity}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else if hasResults && ctx.chunks.length === 0}
		<div class="no-results" in:fade>
			> NO_MATCHING_DOCUMENTS_FOUND
		</div>
	{/if}

	<!-- Error -->
	{#if hasError}
		<div class="error-line" in:fade>
			> ERROR: {ctx.error}
			<button onclick={handleClear} class="btn-clear ml-2">RESET</button>
		</div>
	{/if}

	<!-- History -->
	{#if ctx.history.length > 0 && !hasResults}
		<div class="history-section">
			<div class="text-[9px] text-sand/30 uppercase mb-1">RECENT_QUERIES:</div>
			{#each ctx.history.slice(-3).reverse() as h}
				<button
					class="history-item"
					onclick={() => {
						actor.send({ type: 'UPDATE_QUERY', query: h.query });
						actor.send({ type: 'SEARCH' });
					}}
				>
					{h.query} ({h.resultCount})
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.assistant-container {
		font-size: 12px;
	}

	.search-bar {
		display: flex;
		gap: 0;
		margin-bottom: 8px;
	}

	.query-input {
		flex: 1;
		padding: 8px 10px;
		border: 2px solid black;
		border-right: none;
		font-family: inherit;
		font-size: 12px;
		background: white;
	}

	.query-input:focus {
		outline: none;
		background: #f8f8f8;
	}

	.query-input:disabled {
		opacity: 0.5;
	}

	.btn-query {
		padding: 8px 14px;
		border: 2px solid black;
		background: black;
		color: white;
		font-family: inherit;
		font-weight: bold;
		cursor: pointer;
		font-size: 14px;
	}

	.btn-query:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-query:hover:not(:disabled) {
		background: #333;
	}

	.status-line {
		padding: 6px 0;
		color: #667eea;
		font-size: 11px;
	}

	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
		padding-bottom: 4px;
		border-bottom: 1px solid #eee;
	}

	.btn-clear {
		font-family: inherit;
		font-size: 9px;
		padding: 2px 6px;
		border: 1px solid #ccc;
		background: white;
		cursor: pointer;
		color: #999;
	}

	.btn-clear:hover {
		border-color: black;
		color: black;
	}

	.results-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 280px;
		overflow-y: auto;
	}

	.result-item {
		padding: 8px;
		border: 1px solid #eee;
		background: #fafafa;
	}

	.result-item:hover {
		border-color: #667eea;
	}

	.result-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.result-rank {
		font-size: 10px;
		font-weight: bold;
		color: #999;
	}

	.confidence-badge {
		font-size: 9px;
		font-weight: bold;
		padding: 1px 5px;
		letter-spacing: 0.5px;
	}

	.badge-high {
		background: #dcfce7;
		color: #166534;
	}

	.badge-medium {
		background: #fef9c3;
		color: #854d0e;
	}

	.badge-low {
		background: #fee2e2;
		color: #991b1b;
	}

	.badge-marginal {
		background: #f3f4f6;
		color: #6b7280;
	}

	.score-text {
		font-size: 9px;
		color: #999;
		margin-left: auto;
	}

	.result-title {
		font-size: 11px;
		font-weight: 600;
		color: #333;
		margin-bottom: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-snippet {
		font-size: 10px;
		color: #666;
		line-height: 1.4;
	}

	.result-entities {
		display: flex;
		gap: 4px;
		margin-top: 4px;
		flex-wrap: wrap;
	}

	.entity-tag {
		font-size: 8px;
		padding: 1px 4px;
		background: #e8f0ff;
		color: #667eea;
		border-radius: 2px;
	}

	.no-results {
		padding: 12px 0;
		color: #999;
		font-size: 11px;
	}

	.error-line {
		padding: 8px;
		color: #dc2626;
		font-size: 11px;
		background: #fef2f2;
		border: 1px solid #fecaca;
	}

	.history-section {
		margin-top: 8px;
		padding-top: 6px;
		border-top: 1px dashed #eee;
	}

	.history-item {
		display: block;
		font-family: inherit;
		font-size: 10px;
		color: #667eea;
		background: none;
		border: none;
		cursor: pointer;
		padding: 1px 0;
		text-align: left;
	}

	.history-item:hover {
		text-decoration: underline;
	}
</style>
