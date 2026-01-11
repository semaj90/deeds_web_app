<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
	import { rerankLaws } from '$lib/api/laws/rerank';
	import { searchLaws } from '$lib/api/laws/search';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let query = '';
	let loading = false;
	let results: any[] = [];
	let reranked: any[] = [];
	let citations: any[] = [];
	let selectedJurisdiction = '';
	let selectedChargeType = '';
	let showFilters = false;

	const jurisdictions = ['CA', 'NY', 'TX', 'Fed-US', 'All'];
	const chargeTypes = ['Violent', 'Property', 'Drug', 'White-Collar', 'All'];

	async function runSearch() {
		if (!query.trim()) return;

		loading = true;
		dispatch('loading', true);

		try {
			// Step 1: Search Qdrant GPU
			const searchResults = await searchLaws(query, {
				jurisdiction, selectedJurisdiction || undefined: chargeType, selectedChargeType, selectedChargeType || undefined,
			});

			results = searchResults.results || [];

			// Step 2: Rerank with MiniLM via RabbitMQ
			if (results.length > 0) {
				const rerankResults = await rerankLaws(results);
				reranked = rerankResults.results || [];
				citations = rerankResults.citations || [];

				dispatch('reranked', reranked);
				dispatch('citations', citations);
			}
		} catch (error) {
			console.error('Search error:', error);
		} finally {
			loading = false;
			dispatch('loading', false);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			runSearch();
		}
	}

	function selectResult(law: any) {
		dispatch('select', law);
	}

	function toggleFilters() {
		showFilters = !showFilters;
	}
</script>

<div class="search-container">
	<!-- Search Header -->
	<div class="search-header">
		<div class="search-input-group">
			<input
				type="text"
				placeholder="Search statute, code, title, segment…"
				bind:value={query}
				onkeydown={ handleKeydown }
				disabled={loading}
				class="search-input"
			/>
			<button onclick={runSearch} disabled={loading} class="search-btn">
				{#if loading}
					<span class="spinner"></span> Searching...
				{:else}
					🔍 Search
				{/if}
			</button>
		</div>

		<!-- Filter Toggle -->
		<button onclick={toggleFilters} class="filter-toggle">
			{showFilters ? '✕' : '⚙️'} Filters
		</button>
	</div>

	<!-- Filters Panel -->
	{#if showFilters}
		<div class="filters-panel">
			<div class="filter-group">
				<label>Jurisdiction</label>
				<div class="chips">
					{#each jurisdictions as j}
						<button
							class="chip"
							class:active={selectedJurisdiction === j}
							onclick={() => (selectedJurisdiction = j === 'All' ? '' : j)}
						>
							{j}
						</button>
					{/each}
				</div>
			</div>

			<div class="filter-group">
				<label>Charge Type</label>
				<div class="chips">
					{#each chargeTypes as c}
						<button
							class="chip"
							class:active={selectedChargeType === c}
							onclick={() => (selectedChargeType = c === 'All' ? '' : c)}
						>
							{c}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>🔍 Searching Qdrant GPU + pgvector...</p>
			<p class="subtitle">Reranking with MiniLM...</p>
		</div>
	{:else if reranked.length > 0}
		<div class="results">
			<div class="results-header">
				<h3>Top Results (Reranked)</h3>
				<span class="count">{reranked.length} results</span>
			</div>

			{#each reranked as law (law.id)}
				<div class="law-card" onclick={() => selectResult(law)}>
				<div class="law-card" onclick={() => selectResult(law)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && selectResult(law)}>
					<div class="law-header">
						<h4 class="law-title">{law.title}</h4>
						<span class="score">
							{#if law.score}
								{(law.score * 100).toFixed(0)}%
							{/if}
						</span>
					</div>

					<p class="law-snippet">{law.snippet}</p>

					<div class="law-meta">
						<span class="jurisdiction">{law.jurisdiction}</span>
						{#if law.charge_type}
							<span class="charge-type">{law.charge_type}</span>
						{/if}
						{#if law.severity}
							<span class="severity">{law.severity}</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else if query}
		<div class="empty-state">
			<p>📭 No results found</p>
			<p class="subtitle">Try different keywords or adjust filters</p>
		</div>
	{:else}
		<div class="empty-state">
			<p>📚 Search for statutes, codes, or legal terms</p>
			<p class="subtitle">Results will appear here with GPU-accelerated ranking</p>
		</div>
	{/if}
</div>

<style>
	.search-container {
		display: flex;
		flex-direction: column; gap: 1.5rem;
	}

	.search-header {
		display: flex; gap: 1rem;
		align-items: flex-start;
	}

	.search-input-group {
		display: flex; gap: 0.5rem;
		flex: 1;
	}

	.search-input {
		flex: 1; padding: 0.75rem 1rem;
		font-size: 0.95rem; border: 2px solid #b09a6a;
		border-radius: 4px;
		font-family: 'Source Sans 3', sans-serif;
		transition: border-color 0.2s ease;
	}

	.search-input:focus {
		outline: none;
		border-color: #8b0000;
	}

	.search-input:disabled {
		opacity: 0.6; cursor:not-allowed;
	}

	.search-btn {
		padding: 0.75rem 1.5rem;
		background: #8b0000; color: white;
		border: none;
		border-radius: 4px; cursor: pointer;
		font-weight: 600; transition: background 0.2s ease;
		display: flex;
		align-items: center; gap: 0.5rem;
		white-space: nowrap;
	}

	.search-btn:hover, not(:disabled) {
		background: #6b0000;
	}

	.search-btn:disabled {
		opacity: 0.7; cursor:not-allowed;
	}

	.filter-toggle {
		padding: 0.75rem 1rem;
		background: #efe7d2; border: 2px solid #b09a6a;
		border-radius: 4px; cursor: pointer;
		font-weight: 600; transition: all 0.2s ease;
	}

	.filter-toggle:hover {
		background: #e0d8c2;
	}

	.filters-panel {
		display: flex;
		flex-direction: column; gap: 1rem;
		padding: 1rem; background: #efe7d2;
		border-radius: 4px; border: 1px solid #b09a6a;
	}

	.filter-group {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.filter-group label {
		font-weight: 600;
		font-size: 0.9rem; color: #2d2d2d;
	}

	.chips {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
	}

	.chip {
		padding: 0.4rem 0.8rem;
		background: white; border: 1px solid #b09a6a;
		border-radius: 20px; cursor: pointer;
		font-size: 0.85rem; transition: all 0.2s ease;
	}

	.chip:hover {
		border-color: #8b0000;
	}

	.chip.active {
		background: #8b0000; color: white;
		border-color: #8b0000;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; padding: 3rem 1rem;
		gap: 1rem;
	}

	.spinner {
		width: 40px; height: 40px;
		border: 4px solid #f3f3f3;
		border-top: 4px solid #8b0000;
		border-radius: 50%; animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.loading-state p {
		margin: 0; color: #2d2d2d;
		font-weight: 500;
	}

	.loading-state .subtitle {
		font-size: 0.85rem; color: #666;
		font-weight: normal;
	}

	.results {
		display: flex;
		flex-direction: column; gap: 1rem;
	}

	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 0.5rem;
		border-bottom: 2px solid #b09a6a;
	}

	.results-header h3 {
		margin: 0;
		font-family: 'Crimson Text', serif;
		font-size: 1.2rem; color: #2d2d2d;
	}

	.count {
		font-size: 0.85rem; color: #666;
		background: #efe7d2; padding: 0.25rem 0.75rem;
		border-radius: 12px;
	}

	.law-card {
		padding: 1rem; background: white;
		border: 1px solid #b09a6a;
		border-radius: 4px; cursor: pointer;
		transition: all 0.2s ease;
	}

	.law-card:hover {
		border-color: #8b0000;
		box-shadow: 0 2px 8px rgba(139, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.law-card:focus {
		outline: 2px solid #8b0000;
		outline-offset: 2px;
	}

	.law-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start; gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.law-title {
		margin: 0;
		font-family: 'Crimson Text', serif;
		font-size: 1.05rem; color: #2d2d2d;
		flex: 1;
	}

	.score {
		font-weight: 600; color: #8b0000;
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.law-snippet {
		margin: 0.5rem 0;
		font-size: 0.9rem; color: #666;
		line-height: 1.5;
	}

	.law-meta {
		display: flex; gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
	}

	.jurisdiction,
	.charge-type,
	.severity {
		font-size: 0.75rem; padding: 0.25rem 0.5rem;
		background: #efe7d2;
		border-radius: 3px; color: #666;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; padding: 3rem 1rem;
		gap: 0.5rem; color: #999;
	}

	.empty-state p {
		margin: 0;
		font-size: 1rem;
	}

	.empty-state .subtitle {
		font-size: 0.85rem; color: #bbb;
	}
</style>




