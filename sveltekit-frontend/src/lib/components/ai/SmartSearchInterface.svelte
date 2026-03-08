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
	let selectedMode = $state<Props['contextMode']>('legal');
	$effect(() => { selectedMode = contextMode; });

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

<div class="p-4 border border-sand-dark rounded-lg bg-panel-soft flex flex-col gap-3 {className}">
	<div class="flex items-center gap-2">
		<Icon name="search" size={16} />
		<h3 class="text-[15px] font-semibold m-0">Smart Legal AI Search</h3>
	</div>

	<div class="flex items-center gap-2">
		<label class="text-[13px] opacity-70" for="search-context">Context:</label>
		<select id="search-context" bind:value={selectedMode} class="px-2 py-1 border border-sand-dark rounded bg-panel text-inherit text-[13px]">
			<option value="legal">Legal</option>
			<option value="technical">Technical</option>
			<option value="general">General</option>
		</select>
	</div>

	<div class="flex gap-2">
		<input
			type="text"
			bind:value={query}
			placeholder="Search legal concepts, cases, evidence..."
			class="flex-1 px-3 py-2 border border-sand-dark rounded-md bg-panel text-inherit text-sm focus:outline-none focus:border-accent"
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

	{#if searchHistory.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each searchHistory.slice(0, 5) as item}
				<button class="px-2 py-0.5 border border-sand-dark rounded-full bg-transparent text-inherit text-xs cursor-pointer opacity-60 hover:opacity-100" onclick={() => selectHistoryItem(item)}>
					{item.length > 30 ? item.slice(0, 30) + '...' : item}
				</button>
			{/each}
		</div>
	{/if}

	{#if searchError}
		<p class="text-[13px] text-danger m-0">{searchError}</p>
	{/if}

	{#if results.length > 0}
		<div class="flex flex-col gap-2">
			<div class="text-xs opacity-60">
				<span>{results.length} results found</span>
			</div>
			{#each results as result, i}
				<div class="p-2 rounded-md bg-white/3 border border-white/4">
					<div class="flex items-center gap-2 mb-1">
						<span class="text-[11px] font-semibold opacity-50">#{i + 1}</span>
						{#if result.metadata?.source}
							<span class="text-[11px] px-1.5 py-px rounded bg-blue-500/10 text-info">{result.metadata.source}</span>
						{/if}
						<span class="ml-auto text-[11px] font-medium text-green-500">
							{(result.score * 100).toFixed(1)}%
						</span>
					</div>
					<p class="text-[13px] leading-relaxed m-0 opacity-90">
						{result.text.length > 300 ? result.text.slice(0, 300) + '...' : result.text}
					</p>
				</div>
			{/each}
		</div>
	{:else if !isSearching && query.trim() && !searchError}
		<p class="text-[13px] opacity-50 m-0">No results found. Try a different query.</p>
	{/if}
</div>
