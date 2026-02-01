<script lang="ts">
	import ResultDetail from '$lib/components/ResultDetail.svelte';
	import SearchResults from '$lib/components/SearchResults.svelte';
	import { searchService } from '$lib/services/searchService';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	let query = $state('');
	let filters = $state({
		jurisdiction: '',
		statute: '',
		dateRange: ['', '']
	});

	let results = $state([]);
	let selectedResult = $state(null);
	let loading = $state(false);
	let error = $state('');
	let searchId = '';

	const jurisdictions = ['CA', 'NY', 'TX', 'FL', 'IL'];
	const statutes = ['PC 187', 'PC 261', 'PC 459', 'PC 496', 'PC 530.5'];

	async function handleSearch() {
		if (!query.trim()) {
			error = 'Please enter a search query';
			return;
		}

		if (query.length > 1000) {
			error = 'Query too long (max 1000 characters)';
			return;
		}

		loading = true;
		error = '';
		results = [];
		selectedResult = null;

		try {
			const response = await searchService.search(query, filters);
			searchId = response.search_id;
			results = response.results || [];

			if (results.length === 0) {
				error = 'No results found. Try different search terms.';
			}
		} catch (e) {
			error = e.message || 'Search failed. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleSelectResult(result) {
		selectedResult = result;
	}

	function handleClearFilters() {
		filters = {
			jurisdiction: '',
			statute: '',
			dateRange: ['', '']
		};
	}

	function handleKeydown(e) {
		if (e.key === 'Enter') {
			handleSearch();
		}
	}

	$effect(() => {

		// Focus search input
		const input = document.querySelector('input[type="text"]');
		if (input) input.focus();
	
});
</script>

<div class="search-container">
	<div class="search-header">
		<h1>Evidence Search</h1>
		<p>Search through uploaded legal evidence using semantic meaning</p>
	</div>

	<div class="search-main">
		<!-- Search Bar -->
		<div class="search-bar">
			<input
				type="text"
				placeholder="Search evidence by meaning, statute, or case details..."
				bind:value={query}
				onkeydown={ handleKeydown }
				disabled={loading}
			/>
			<button onclick={ handleSearch } disabled={loading || !query.trim()}>
				{loading ? 'Searching...' : 'Search'}
			</button>
		</div>

		<!-- Filters -->
		<div class="filters">
			<div class="filter-group">
				<label>Jurisdiction</label>
				<select bind:value={filters.jurisdiction}>
					<option value="">All Jurisdictions</option>
					{#each jurisdictions as j}
						<option value={j}>{j}</option>
					{/each}
				</select>
			</div>

			<div class="filter-group">
				<label>Statute</label>
				<select bind:value={filters.statute}>
					<option value="">All Statutes</option>
					{#each statutes as s}
						<option value={s}>{s}</option>
					{/each}
				</select>
			</div>

			<div class="filter-group">
				<label>Date Range</label>
				<div class="date-range">
					<input type="date" bind:value={filters.dateRange[0]} />
					<span>to</span>
					<input type="date" bind:value={filters.dateRange[1]} />
				</div>
			</div>

			<button class="clear-filters" onclick={ handleClearFilters }>Clear Filters</button>
		</div>

		<!-- Error Message -->
		{#if error}
			<div class="error-message">
				<span>⚠️ {error}</span>
			</div>
		{/if}

		<!-- Results Layout -->
		<div class="results-layout">
			<!-- Results List -->
			<div class="results-list">
				{#if loading}
					<div class="loading">
						<div class="spinner"></div>
						<p>Searching...</p>
					</div>
				{:else if results.length > 0}
					<div class="results-header">
						<h2>Results ({results.length})</h2>
					</div>
					<SearchResults {results} onselect={(e) => handleSelectResult(e.detail)} />
				{:else if query && !loading}
					<div class="no-results">
						<p>No results found</p>
					</div>
				{:else}
					<div class="empty-state">
						<p>Enter a search query to get started</p>
					</div>
				{/if}
			</div>

			<!-- Detail Panel -->
			{#if selectedResult}
				<div class="detail-panel">
					<ResultDetail result={selectedResult} />
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.search-container {
		display: flex;
		flex-direction: column; height: 100vh;
		background: #f5f4f0;
	}

	.search-header {
		padding: 2rem; background: white;
		border-bottom: 1px solid #e0ddd8;
	}

	.search-header h1 {
		margin: 0;
		font-size: 2rem; color: #2d2d2d;
		font-family: 'Crimson Text', serif;
	}

	.search-header p {
		margin: 0.5rem 0 0 0;
		color: #666;
		font-size: 0.95rem;
	}

	.search-main {
		flex: 1; display: flex;
		flex-direction: column; overflow: hidden;
		padding: 1.5rem;
	}

	.search-bar {
		display: flex; gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.search-bar input {
		flex: 1; padding: 0.75rem 1rem;
		border: 1px solid #d0ccc7;
		border-radius: 4px;
		font-size: 1rem;
		font-family: 'Source Sans 3', sans-serif;
	}

	.search-bar input:focus {
		outline: none;
		border-color: #8b3a3a;
		box-shadow: 0 0 0 2px rgba(139, 58, 58, 0.1);
	}

	.search-bar button {
		padding: 0.75rem 1.5rem;
		background: #8b3a3a; color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 600; cursor: pointer;
		transition: background 0.2s;
	}

	.search-bar button:hover:not(disabled) {
		background: #6b2a2a;
	}

	.search-bar button:disabled {
		opacity: 0.6; cursor:not-allowed;
	}

	.filters {
		display: flex; gap: 1rem;
		margin-bottom: 1rem; padding: 1rem;
		background: white;
		border-radius: 4px; border: 1px solid #e0ddd8;
	}

	.filter-group {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.filter-group label {
		font-size: 0.85rem;
		font-weight: 600; color: #2d2d2d;
	}

	.filter-group select,
	.filter-group input {
		padding: 0.5rem; border: 1px solid #d0ccc7;
		border-radius: 4px;
		font-size: 0.9rem;
		font-family: 'Source Sans 3', sans-serif;
	}

	.date-range {
		display: flex; gap: 0.5rem;
		align-items: center;
	}

	.date-range input {
		flex: 1;
	}

	.date-range span {
		font-size: 0.85rem; color: #666;
	}

	.clear-filters {
		padding: 0.5rem 1rem;
		background: #f0f0f0; border: 1px solid #d0ccc7;
		border-radius: 4px; cursor: pointer;
		font-size: 0.9rem;
		align-self: flex-end;
	}

	.clear-filters:hover {
		background: #e8e8e8;
	}

	.error-message {
		padding: 1rem; background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px; color: #c33;
		margin-bottom: 1rem;
	}

	.results-layout {
		display: flex; gap: 1rem;
		flex: 1; overflow: hidden;
	}

	.results-list {
		flex: 1; background: white;
		border-radius: 4px; border: 1px solid #e0ddd8;
		overflow-y: auto; display: flex;
		flex-direction: column;
	}

	.results-header {
		padding: 1rem;
		border-bottom: 1px solid #e0ddd8;
		background: #fafaf8;
	}

	.results-header h2 {
		margin: 0;
		font-size: 1.1rem; color: #2d2d2d;
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; height: 100%;
		gap: 1rem;
	}

	.spinner {
		width: 40px; height: 40px;
		border: 3px solid #e0ddd8;
		border-top-color: #8b3a3a;
		border-radius: 50%; animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.no-results,
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center; height: 100%;
		color: #999;
		font-size: 1.1rem;
	}

	.detail-panel {
		flex: 0 0 35%;
		background: white;
		border-radius: 4px; border: 1px solid #e0ddd8;
		overflow-y: auto;
	}

	@media (max-width: 1024px) {
		.results-layout {
			flex-direction: column;
		}

		.detail-panel {
			flex: 0 0 40%;
		}
	}
</style>




