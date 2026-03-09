<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade, slide } from 'svelte/transition';

	const dispatch = createEventDispatcher();

	let {
		isSearching = $bindable(false),
		searchResults = $bindable<any[]>([]),
		searchQuery = $bindable(''),
		searchFilters = $bindable({
			type: 'all',
			dateRange: 'all',
			source: 'all',
			minConfidence: 0
		})
	} = $props();

	let advancedMode = false;
	let searchInput: HTMLInputElement;

	function performSearch() {
		if (!searchQuery.trim()) return;

		dispatch('search', {
			query: searchQuery,
			filters: searchFilters
		});
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			performSearch();
		}
	}

	function clearSearch() {
		searchQuery = '';
		searchResults = [];
		dispatch('clear');
	}

	function toggleAdvanced() {
		advancedMode = !advancedMode;
	}

	function updateFilter(filter: string, value: any) {
		searchFilters = { ...searchFilters, [filter]: value };
		dispatch('filterChange', { filters: searchFilters });
	}

	let hasActiveFilters = $derived(Object.values(searchFilters).some(value =>
		value !== 'all' && value !== 0
	));
</script>

<div class="search-interface" transition:fade={{ duration: 300 }}>
	<!-- Main Search Bar -->
	<div class="search-bar">
		<div class="search-input-container">
			<div class="search-icon">🔍</div>
			<input
				bind:this={searchInput}
				bind:value={searchQuery}
				onkeypress={handleKeyPress}
				placeholder="Search legal evidence, documents, cases..."
				class="search-input"
				disabled={isSearching}
			/>
			{#if searchQuery}
				<button class="clear-btn" onclick={clearSearch} title="Clear search">×</button>
			{/if}
		</div>
		<div class="search-actions">
			<button
				class="search-btn"
				onclick={performSearch}
				disabled={!searchQuery.trim() || isSearching}
			>
				{#if isSearching}
					<div class="search-spinner"></div>
					Searching...
				{:else}
					Search
				{/if}
			</button>
			<button class="advanced-toggle" onclick={toggleAdvanced}>
				Advanced
				<span class="toggle-icon">{advancedMode ? '▼' : '▶'}</span>
			</button>
		</div>
	</div>

	<!-- Advanced Filters -->
	{#if advancedMode}
		<div class="advanced-filters" transition:slide={{ duration: 200 }}>
			<div class="filter-grid">
				<div class="filter-group">
					<label for="type-filter">Evidence Type</label>
					<select
						id="type-filter"
						bind:value={searchFilters.type}
						onchange={(e) => updateFilter('type', e.target.value)}
					>
						<option value="all">All Types</option>
						<option value="document">Documents</option>
						<option value="contract">Contracts</option>
						<option value="case">Case Law</option>
						<option value="image">Images</option>
						<option value="video">Video</option>
						<option value="audio">Audio</option>
						<option value="email">Emails</option>
					</select>
				</div>

				<div class="filter-group">
					<label for="date-filter">Date Range</label>
					<select
						id="date-filter"
						bind:value={searchFilters.dateRange}
						onchange={(e) => updateFilter('dateRange', e.target.value)}
					>
						<option value="all">All Time</option>
						<option value="today">Today</option>
						<option value="week">This Week</option>
						<option value="month">This Month</option>
						<option value="quarter">This Quarter</option>
						<option value="year">This Year</option>
						<option value="custom">Custom Range</option>
					</select>
				</div>

				<div class="filter-group">
					<label for="source-filter">Source</label>
					<select
						id="source-filter"
						bind:value={searchFilters.source}
						onchange={(e) => updateFilter('source', e.target.value)}
					>
						<option value="all">All Sources</option>
						<option value="internal">Internal</option>
						<option value="external">External</option>
						<option value="court">Court Records</option>
						<option value="public">Public Records</option>
						<option value="client">Client Provided</option>
					</select>
				</div>

				<div class="filter-group">
					<label for="confidence-filter">Min Confidence</label>
					<div class="confidence-slider">
						<input
							type="range"
							id="confidence-filter"
							min="0"
							max="100"
							step="5"
							bind:value={searchFilters.minConfidence}
							oninput={(e) => updateFilter('minConfidence', parseInt(e.target.value))}
						/>
						<span class="confidence-value">{searchFilters.minConfidence}%</span>
					</div>
				</div>
			</div>

			{#if hasActiveFilters}
				<div class="active-filters">
					<span class="filters-label">Active Filters:</span>
				{#if searchFilters.type !== 'all'}
					<span class="filter-tag" onclick={() => updateFilter('type', 'all')}>
						Type: {searchFilters.type} ×
					</span>
				{/if}
				{#if searchFilters.dateRange !== 'all'}
					<span class="filter-tag" onclick={() => updateFilter('dateRange', 'all')}>
						Date: {searchFilters.dateRange} ×
					</span>
				{/if}
				{#if searchFilters.source !== 'all'}
					<span class="filter-tag" onclick={() => updateFilter('source', 'all')}>
						Source: {searchFilters.source} ×
					</span>
				{/if}
				{#if searchFilters.minConfidence > 0}
					<span class="filter-tag" onclick={() => updateFilter('minConfidence', 0)}>
						Confidence: {searchFilters.minConfidence}% ×
					</span>
				{/if}
					<button class="clear-all-btn" onclick={() => {
						searchFilters = { type: 'all', dateRange: 'all', source: 'all', minConfidence: 0 };
						dispatch('filterChange', { filters: searchFilters });
					}}>
						Clear All
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Search Results Summary -->
	{#if searchResults.length > 0}
		<div class="search-summary">
			<span class="result-count">
				{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
			</span>
			{#if hasActiveFilters}
				<span class="filtered-note">(filtered)</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-interface {
		background: #1a1a1a;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.search-bar {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
	}

	.search-input-container {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 1rem;
		color: #888;
		font-size: 1.2rem;
		z-index: 1;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 1rem 0.75rem 3rem;
		background: #2a2a2a;
		border: 2px solid #444;
		border-radius: 25px;
		color: #e0e0e0;
		font-size: 1rem;
		transition: border-color 0.3s ease;
	}

	.search-input:focus {
		outline: none;
		border-color: #ff6b6b;
		box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.1);
	}

	.search-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.clear-btn {
		position: absolute;
		right: 1rem;
		background: none;
		border: none;
		color: #888;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: background 0.2s;
	}

	.clear-btn:hover {
		background: #444;
		color: #e0e0e0;
	}

	.search-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.search-btn {
		background: #ff6b6b;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 25px;
		cursor: pointer;
		font-weight: bold;
		transition: background 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.search-btn:hover:not(:disabled) {
		background: #ff5252;
	}

	.search-btn:disabled {
		background: #666;
		cursor: not-allowed;
	}

	.search-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid #ffffff;
		border-top: 2px solid transparent;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.advanced-toggle {
		background: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		padding: 0.75rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.advanced-toggle:hover {
		background: #444;
	}

	.toggle-icon {
		font-size: 0.8rem;
		transition: transform 0.2s;
	}

	.advanced-filters {
		border-top: 1px solid #444;
		padding-top: 1.5rem;
		margin-top: 1rem;
	}

	.filter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.filter-group label {
		color: #e0e0e0;
		font-weight: bold;
		font-size: 0.9rem;
	}

	.filter-group select {
		padding: 0.5rem;
		background: #2a2a2a;
		border: 1px solid #555;
		border-radius: 4px;
		color: #e0e0e0;
	}

	.filter-group select:focus {
		outline: none;
		border-color: #ff6b6b;
	}

	.confidence-slider {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.confidence-slider input[type="range"] {
		flex: 1;
		-webkit-appearance: none;
		height: 6px;
		background: #444;
		border-radius: 3px;
		outline: none;
	}

	.confidence-slider input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 20px;
		height: 20px;
		background: #ff6b6b;
		border-radius: 50%;
		cursor: pointer;
	}

	.confidence-slider input[type="range"]::-moz-range-thumb {
		width: 20px;
		height: 20px;
		background: #ff6b6b;
		border-radius: 50%;
		cursor: pointer;
		border: none;
	}

	.confidence-value {
		color: #4ecdc4;
		font-weight: bold;
		min-width: 40px;
		text-align: right;
	}

	.active-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		background: #222;
		border-radius: 6px;
	}

	.filters-label {
		color: #bbb;
		font-size: 0.9rem;
	}

	.filter-tag {
		background: #444;
		color: #e0e0e0;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		font-size: 0.8rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.filter-tag:hover {
		background: #555;
	}

	.clear-all-btn {
		background: #ff6b6b;
		color: white;
		border: none;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		cursor: pointer;
		font-size: 0.8rem;
		margin-left: auto;
		transition: background 0.2s;
	}

	.clear-all-btn:hover {
		background: #ff5252;
	}

	.search-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: #2a2a2a;
		border-radius: 6px;
		margin-top: 1rem;
	}

	.result-count {
		color: #4ecdc4;
		font-weight: bold;
	}

	.filtered-note {
		color: #888;
		font-size: 0.9rem;
	}

	@media (max-width: 768px) {
		.search-bar {
			flex-direction: column;
			align-items: stretch;
		}

		.search-actions {
			justify-content: space-between;
		}

		.filter-grid {
			grid-template-columns: 1fr;
		}

		.active-filters {
			flex-direction: column;
			align-items: stretch;
		}

		.clear-all-btn {
			margin-left: 0;
			margin-top: 0.5rem;
		}
	}
</style>