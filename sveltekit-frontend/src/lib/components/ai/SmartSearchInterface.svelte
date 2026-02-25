<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		contextMode?: 'legal' | 'technical' | 'general';
		maxResults?: number;
		class?: string;
	}

	let {
		contextMode = 'legal',
		maxResults = 10,
		class: className = ''
	}: Props = $props();

	interface SearchResult {
		text: string;
		score: number;
		metadata?: {
			source?: string;
			semanticGroup?: string;
		};
	}

	let query = $state('');
	let isSearching = $state(false);
	let results = $state<SearchResult[]>([]);
	let searchError = $state<string | null>(null);
	let searchHistory = $state<string[]>([]);
	let selectedMode = $state(contextMode);

	async function performSearch() {
		if (!query.trim() || isSearching) return;
		isSearching = true;
		searchError = null;

		try {
			const res = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: query.trim(),
					context: selectedMode,
					top_k: maxResults
				}),
				signal: AbortSignal.timeout(10000)
			});

			if (!res.ok) throw new Error(`Search failed (${res.status})`);

			const data = await res.json();
			results = data.results ?? data.chunks ?? [];

			// Track history
			if (!searchHistory.includes(query.trim())) {
				searchHistory = [query.trim(), ...searchHistory.slice(0, 9)];
			}
		} catch (e) {
			searchError = e instanceof Error ? e.message : 'Search failed';
			results = [];
		} finally {
			isSearching = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			performSearch();
		}
	}

	function selectHistoryItem(item: string) {
		query = item;
		performSearch();
	}
</script>

<div class="smart-search {className}">
	<div class="search-header">
		<Icon name="search" size={16} />
		<h3>Smart Legal AI Search</h3>
	</div>

	<!-- Mode selector -->
	<div class="search-config">
		<label class="mode-label" for="search-context">Context:</label>
		<select id="search-context" bind:value={selectedMode} class="mode-select">
			<option value="legal">Legal</option>
			<option value="technical">Technical</option>
			<option value="general">General</option>
		</select>
	</div>

	<!-- Search input -->
	<div class="search-input-row">
		<input
			type="text"
			bind:value={query}
			placeholder="Search legal concepts, cases, evidence..."
			class="search-input"
			onkeydown={handleKeydown}
			disabled={isSearching}
		/>
		<Button
			size="sm"
			onclick={performSearch}
			disabled={isSearching || !query.trim()}
		>
			{isSearching ? 'Searching...' : 'Search'}
		</Button>
	</div>

	<!-- Search history -->
	{#if searchHistory.length > 0}
		<div class="search-history">
			{#each searchHistory.slice(0, 5) as item}
				<button class="history-chip" onclick={() => selectHistoryItem(item)}>
					{item.length > 30 ? item.slice(0, 30) + '...' : item}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Error -->
	{#if searchError}
		<p class="search-error">{searchError}</p>
	{/if}

	<!-- Results -->
	{#if results.length > 0}
		<div class="search-results">
			<div class="results-header">
				<span>{results.length} results found</span>
			</div>
			{#each results as result, i}
				<div class="result-item">
					<div class="result-meta">
						<span class="result-rank">#{i + 1}</span>
						{#if result.metadata?.source}
							<span class="result-source">{result.metadata.source}</span>
						{/if}
						<span class="result-score">
							{(result.score * 100).toFixed(1)}%
						</span>
					</div>
					<p class="result-text">
						{result.text.length > 300 ? result.text.slice(0, 300) + '...' : result.text}
					</p>
				</div>
			{/each}
		</div>
	{:else if !isSearching && query.trim() && !searchError}
		<p class="no-results">No results found. Try a different query.</p>
	{/if}
</div>

<style>
	.smart-search {
		padding: 1rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.search-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.search-header h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		margin: 0;
	}
	.search-config {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.mode-label {
		font-size: 0.8125rem;
		opacity: 0.7;
	}
	.mode-select {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.25rem;
		background: var(--color-panel, #0c0a09);
		color: inherit;
		font-size: 0.8125rem;
	}
	.search-input-row {
		display: flex;
		gap: 0.5rem;
	}
	.search-input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		background: var(--color-panel, #0c0a09);
		color: inherit;
		font-size: 0.875rem;
	}
	.search-input:focus {
		outline: none;
		border-color: var(--color-accent, #a51c30);
	}
	.search-history {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.history-chip {
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 1rem;
		background: transparent;
		color: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.15s;
	}
	.history-chip:hover {
		opacity: 1;
	}
	.search-error {
		font-size: 0.8125rem;
		color: var(--color-danger, #ef4444);
		margin: 0;
	}
	.no-results {
		font-size: 0.8125rem;
		opacity: 0.5;
		margin: 0;
	}
	.search-results {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.results-header {
		font-size: 0.75rem;
		opacity: 0.6;
	}
	.result-item {
		padding: 0.5rem;
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
	}
	.result-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}
	.result-rank {
		font-size: 0.6875rem;
		font-weight: 600;
		opacity: 0.5;
	}
	.result-source {
		font-size: 0.6875rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 0.25rem;
		background: rgba(59, 130, 246, 0.1);
		color: var(--color-info, #3b82f6);
	}
	.result-score {
		margin-left: auto;
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--color-accent, #22c55e);
	}
	.result-text {
		font-size: 0.8125rem;
		line-height: 1.5;
		margin: 0;
		opacity: 0.9;
	}
</style>
