<script lang="ts">
	import * as publicEnv from '$env/static/public';

	interface Props {
		placeholder?: string;
		searchEndpoint?: string;
		onResults?: (results: any[]) => void;
		className?: string;
	}

	let {
		placeholder = 'Search legal documents...',
		searchEndpoint = '/search',
		onResults = () => {},
		className = '',
	}: Props = $props();

	let query = $state('');
	let results = $state<any[]>([]);
	let isLoading = $state(false);
	let isExpanded = $state(false);
	let searchInput: HTMLInputElement | null = null;

	const API_BASE = ((publicEnv as Record<string, string>)['PUBLIC_API_URL'] ?? '').replace(/\/$/, '');

	async function performSearch() {
		if (!query?.trim() || query.length < 2) {
			results = [];
			isExpanded = false;
			return;
		}

		isLoading = true;
		isExpanded = true;

		try {
			const base = API_BASE || '';
			const endpoint = searchEndpoint.startsWith('/') ? searchEndpoint : `/${searchEndpoint}`;
			const url = `${base}${endpoint}?q=${encodeURIComponent(query)}&limit=10`;
			const response = await fetch(url, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
			});

			if (!response.ok) {
				throw new Error(`Search failed: ${response.statusText}`);
			}

			const data = await response.json();
			results = data.results || [];
			onResults(results);
		} catch (error) {
			console.error('Search error:', error);
			results = [];
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			performSearch();
		} else if (event.key === 'Escape') {
			query = '';
			results = [];
			isExpanded = false;
			searchInput?.blur();
		}
	}

	function selectResult(result: any) {
		query = result.content ? result.content.substring(0, 100) + '...' : (result.title || '');
		results = [];
		isExpanded = false;
		onResults([result]);
	}

	function clearSearch() {
		query = '';
		results = [];
		isExpanded = false;
		searchInput?.focus();
	}

	$effect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Element | null;
			if (!target || !target.closest('.search-container')) {
				isExpanded = false;
			}
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

<div class="search-container {className}">
	<div class="relative">
		<label for="search-input" class="block text-xs font-semibold text-sand/60 mb-1">
			Legal AI Search
		</label>
		<div class="relative flex items-center">
			<input
				bind:this={searchInput}
				bind:value={query}
				onkeydown={handleKeydown}
				oninput={performSearch}
				id="search-input"
				type="text"
				class="w-full pl-3 pr-20 py-2 border border-sand/20 rounded-lg text-sm bg-panelSoft text-sand outline-none focus:border-info"
				{placeholder}
				autocomplete="off"
			/>
			{#if query}
				<button onclick={clearSearch} class="absolute right-10 px-2 py-1 text-sm text-danger" type="button" title="Clear search">
					&times;
				</button>
			{/if}
			{#if isLoading}
				<div class="absolute right-2 animate-spin">
					<span class="text-sand/40">...</span>
				</div>
			{/if}
		</div>
	</div>

	{#if isExpanded && (results.length > 0 || isLoading)}
		<div class="absolute z-50 mt-1 w-full bg-panel border border-sand/20 rounded-lg shadow-lg max-h-[400px] overflow-y-auto">
			{#if isLoading}
				<div class="p-4 text-center text-sm text-sand/40">
					Searching legal documents...
				</div>
			{:else if results.length > 0}
				<div class="px-3 py-2 border-b border-sand/20 text-xs text-sand/50 bg-panelSoft">
					Found {results.length} results
				</div>
				{#each results as result, index}
					<button onclick={() => selectResult(result)} class="w-full text-left px-3 py-2 border-b border-sand/10 hover:bg-panelSoft transition-colors" type="button">
						<div class="text-sm font-medium text-sand">
							{result.title || `Document ${index + 1}`}
						</div>
						{#if result.content}
							<div class="text-xs text-sand/50 mt-1">
								{result.content.substring(0, 120)}...
							</div>
						{/if}
						{#if result.metadata}
							<div class="flex gap-2 mt-1">
								{#if result.metadata.caseId}
									<span class="text-xs px-1.5 py-0.5 rounded bg-info/10 text-info">case {result.metadata.caseId}</span>
								{/if}
								{#if result.metadata.documentType}
									<span class="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">{result.metadata.documentType}</span>
								{/if}
							</div>
						{/if}
						{#if result.similarity}
							<div class="text-xs text-info mt-1 text-right">
								Relevance: {Math.round(result.similarity * 100)}%
							</div>
						{/if}
					</button>
				{/each}
			{:else}
				<div class="p-4 text-center text-sm text-sand/40">
					No documents found for "{query}"
				</div>
			{/if}
		</div>
	{/if}
</div>