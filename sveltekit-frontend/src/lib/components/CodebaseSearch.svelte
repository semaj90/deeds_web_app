<script lang="ts">
	/**
	 * Codebase Search — Command Palette / Search Panel
	 *
	 * XState v5 retrieval machine orchestration: Fuse.js recall → Qdrant re-rank → assembly.
	 * Keyboard shortcut: Ctrl+K or Cmd+K to toggle.
	 *
	 * Uses Svelte 5 runes + native <dialog> (no bits-ui Dialog needed).
	 */
	import { useMachine } from '$lib/utils/xstate-svelte5.svelte.js';
	import { retrievalMachine } from '$lib/machines/retrieval-machine.js';
	import type { RankedChunk } from '$lib/machines/retrieval-machine.js';

	const { snapshot, send } = useMachine(retrievalMachine);

	let query = $state('');
	let isOpen = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let dialogEl: HTMLDialogElement | undefined;

	// Derive state from machine snapshot
	let isLoading = $derived(
		snapshot.matches('recalling') ||
		snapshot.matches('reranking') ||
		snapshot.matches('assembling')
	);

	let results = $derived<RankedChunk[]>(snapshot.context.reranked ?? []);
	let error = $derived<string | null>(snapshot.context.error);
	let timing = $derived(snapshot.context.timing);

	let currentStage = $derived.by(() => {
		if (snapshot.matches('recalling')) return 'Recalling...';
		if (snapshot.matches('reranking')) return 'Reranking...';
		if (snapshot.matches('assembling')) return 'Assembling...';
		return '';
	});

	// Grouped results derived from machine context
	let groupedResults = $derived.by(() => {
		const groups: Record<string, RankedChunk[]> = {};
		for (const r of results) {
			const key = r.kind === 'route-handler' ? 'API Routes'
				: r.kind === 'table-def' ? 'Schema'
				: r.kind === 'function' || r.kind === 'class' ? 'Functions'
				: r.kind === 'type' ? 'Types'
				: r.tags.includes('test') ? 'Tests'
				: 'Other';
			(groups[key] ??= []).push(r);
		}
		return groups;
	});

	let resultCount = $derived(results.length);
	let hasResults = $derived(results.length > 0);

	function open() {
		isOpen = true;
		dialogEl?.showModal();
		setTimeout(() => {
			const input = dialogEl?.querySelector('input');
			input?.focus();
		}, 50);
	}

	function close() {
		isOpen = false;
		dialogEl?.close();
		query = '';
		send({ type: 'RESET' });
	}

	function search(q: string) {
		if (q.length < 2) return;
		send({ type: 'SEARCH', query: q });
	}

	// Debounced search on query change
	$effect(() => {
		const q = query;
		clearTimeout(debounceTimer);
		if (q.length >= 2) {
			debounceTimer = setTimeout(() => search(q), 250);
		}
	});

	// Escape key to close (Ctrl+K is handled by GlobalCommandPalette in root layout)
	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			close();
		}
	}

	function kindBadge(kind: string): string {
		switch (kind) {
			case 'route-handler': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
			case 'table-def': return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
			case 'function': return 'bg-green-500/20 text-green-300 border-green-500/40';
			case 'class': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
			case 'type': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
			default: return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
		}
	}

	function methodBadge(method: string): string {
		switch (method) {
			case 'GET': return 'bg-emerald-500/30 text-emerald-200';
			case 'POST': return 'bg-blue-500/30 text-blue-200';
			case 'PATCH': return 'bg-amber-500/30 text-amber-200';
			case 'DELETE': return 'bg-red-500/30 text-red-200';
			default: return 'bg-slate-500/30 text-slate-200';
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- biome-ignore: native dialog -->
<dialog
	bind:this={dialogEl}
	class="codebase-search-dialog"
	onclick={(e) => { if (e.target === dialogEl) close(); }}
>
	<div class="search-container">
		<!-- Search Input -->
		<div class="search-header">
			<div class="search-icon">&#128269;</div>
			<input
				type="text"
				bind:value={query}
				placeholder="Search codebase... (functions, routes, schemas)"
				class="search-input"
				data-testid="codebase-search-input"
			/>
			{#if isLoading}
				<div class="search-spinner"></div>
				<span class="search-stage">{currentStage}</span>
			{/if}
			<kbd class="search-kbd">ESC</kbd>
		</div>

		<!-- Results -->
		<div class="search-results" data-testid="codebase-search-results">
			{#if error}
				<div class="search-error">{error}</div>
			{:else if query.length < 2}
				<div class="search-hint">
					<p>Type 2+ characters to search</p>
					<p class="search-hint-examples">
						Try: "seed cases" &middot; "POST /api/cases" &middot; "pgTable users" &middot; "auth session"
					</p>
				</div>
			{:else if !isLoading && !hasResults && query.length >= 2}
				<div class="search-empty">No results for "{query}"</div>
			{:else}
				{#each Object.entries(groupedResults) as [group, items]}
					<div class="result-group">
						<div class="result-group-label">{group} ({items.length})</div>
						{#each items as result}
							<button
								class="result-item"
								onclick={() => {
									navigator.clipboard.writeText(result.relativePath);
									close();
								}}
								data-testid="codebase-search-result"
							>
								<div class="result-header">
									<span class="result-symbol">{result.symbol}</span>
									{#if result.httpMethod}
										<span class="result-method {methodBadge(result.httpMethod)}">{result.httpMethod}</span>
									{/if}
									<span class="result-kind {kindBadge(result.kind)}">{result.kind}</span>
									<span class="result-score">{(result.score * 100).toFixed(0)}%</span>
								</div>
								<div class="result-path">{result.relativePath}:{result.lineStart}</div>
								{#if result.tags.length > 0}
									<div class="result-tags">
										{#each result.tags.slice(0, 5) as tag}
											<span class="result-tag">{tag}</span>
										{/each}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			{/if}
		</div>

		<!-- Footer -->
		{#if hasResults}
			<div class="search-footer">
				<span>{resultCount} results</span>
				<span class="search-timing">
					recall {timing.recallMs}ms &middot; rerank {timing.rerankMs}ms &middot; total {timing.totalMs}ms
				</span>
			</div>
		{/if}
	</div>
</dialog>

<style>
	.codebase-search-dialog {
		position: fixed;
		top: 10vh;
		left: 50%;
		transform: translateX(-50%);
		width: 90%;
		max-width: 640px;
		max-height: 75vh;
		padding: 0;
		border: 1px solid rgba(100, 116, 139, 0.4);
		border-radius: 12px;
		background: rgb(15 23 42 / 0.97);
		color: #e2e8f0;
		backdrop-filter: blur(16px);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}
	.codebase-search-dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
	}
	.search-container {
		display: flex;
		flex-direction: column;
		max-height: 75vh;
	}
	.search-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(100, 116, 139, 0.3);
	}
	.search-icon { font-size: 18px; opacity: 0.5; }
	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		color: #e2e8f0;
		font-size: 15px;
		outline: none;
	}
	.search-input::placeholder { color: rgb(100 116 139); }
	.search-spinner {
		width: 18px; height: 18px;
		border: 2px solid rgba(100, 116, 139, 0.3);
		border-top-color: #10b981;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}
	.search-stage {
		font-size: 11px;
		color: #10b981;
		white-space: nowrap;
		font-family: monospace;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.search-kbd {
		padding: 2px 6px;
		border: 1px solid rgba(100, 116, 139, 0.4);
		border-radius: 4px;
		font-size: 11px;
		color: rgb(148 163 184);
		font-family: monospace;
	}
	.search-results {
		overflow-y: auto;
		max-height: 55vh;
		padding: 8px 0;
	}
	.search-hint, .search-empty, .search-error {
		padding: 24px 16px;
		text-align: center;
		color: rgb(148 163 184);
		font-size: 14px;
	}
	.search-hint-examples { font-size: 12px; margin-top: 8px; opacity: 0.6; }
	.search-error { color: #ef4444; }
	.result-group { padding: 4px 0; }
	.result-group-label {
		padding: 4px 16px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(100 116 139);
	}
	.result-item {
		display: block;
		width: 100%;
		padding: 8px 16px;
		text-align: left;
		background: transparent;
		border: none;
		color: #e2e8f0;
		cursor: pointer;
		transition: background 0.1s;
	}
	.result-item:hover { background: rgba(100, 116, 139, 0.15); }
	.result-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 2px;
	}
	.result-symbol {
		font-weight: 600;
		font-size: 14px;
		color: #f1f5f9;
	}
	.result-method {
		padding: 1px 5px;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 700;
		font-family: monospace;
	}
	.result-kind {
		padding: 1px 5px;
		border-radius: 3px;
		border: 1px solid;
		font-size: 10px;
	}
	.result-score {
		margin-left: auto;
		font-size: 11px;
		color: rgb(100 116 139);
		font-family: monospace;
	}
	.result-path {
		font-size: 12px;
		color: rgb(100 116 139);
		font-family: monospace;
	}
	.result-tags {
		display: flex;
		gap: 4px;
		margin-top: 3px;
	}
	.result-tag {
		padding: 1px 5px;
		border-radius: 3px;
		font-size: 10px;
		background: rgba(100, 116, 139, 0.15);
		color: rgb(148 163 184);
	}
	.search-footer {
		display: flex;
		justify-content: space-between;
		padding: 8px 16px;
		border-top: 1px solid rgba(100, 116, 139, 0.3);
		font-size: 11px;
		color: rgb(100 116 139);
	}
	.search-timing { font-family: monospace; }
</style>