<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	let {
		searchQuery = $bindable(''),
		typeFilter = $bindable('all'),
		viewMode = $bindable<'grid' | 'list'>('grid'),
		isSearching = false,
		searchMode = 'local',
		semanticResultsCount = 0,
		searchTiming = {},
		onToggleFilters
	}: {
		searchQuery?: string;
		typeFilter?: string;
		viewMode?: 'grid' | 'list';
		isSearching?: boolean;
		searchMode?: string;
		semanticResultsCount?: number;
		searchTiming?: Record<string, number>;
		onToggleFilters?: () => void;
	} = $props();

	const filterTabs = [
		{ value: 'all', label: 'All' },
		{ value: 'pdf', label: 'PDF' },
		{ value: 'image', label: 'Images' },
		{ value: 'document', label: 'Docs' }
	];
</script>

<div class="toolbar">
	<div class="toolbar-search">
		<Icon name="search" class="w-4 h-4 search-icon" />
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Search evidence (3+ chars for AI search)..."
			class="toolbar-input"
		/>
		{#if isSearching}
			<span class="search-status searching">
				<span class="search-dot"></span>
				Searching...
			</span>
		{:else if searchMode === 'semantic' && semanticResultsCount > 0}
			<span class="search-status semantic">
				{semanticResultsCount} results ({searchTiming.total_ms ?? '?'}ms)
			</span>
		{/if}
	</div>

	<div class="toolbar-filters">
		{#each filterTabs as ft (ft.value)}
			<button
				type="button"
				class="filter-chip"
				class:active={typeFilter === ft.value}
				onclick={() => (typeFilter = ft.value)}
			>
				{ft.label}
			</button>
		{/each}
	</div>

	<div class="toolbar-right">
		<button type="button" class="filter-toggle" onclick={onToggleFilters} title="Advanced filters">
			<Icon name="sliders-horizontal" class="w-4 h-4" />
		</button>

		<div class="view-toggle">
			<button
				type="button"
				class="view-btn"
				class:active={viewMode === 'grid'}
				onclick={() => (viewMode = 'grid')}
				title="Grid view"
			>
				<Icon name="grid-3x3" class="w-4 h-4" />
			</button>
			<button
				type="button"
				class="view-btn"
				class:active={viewMode === 'list'}
				onclick={() => (viewMode = 'list')}
				title="List view"
			>
				<Icon name="list" class="w-4 h-4" />
			</button>
		</div>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.015);
		flex-wrap: wrap;
	}
	.toolbar-search {
		flex: 1;
		min-width: 200px;
		position: relative;
		display: flex;
		align-items: center;
	}
	.toolbar-search :global(.search-icon) {
		position: absolute;
		left: 0.75rem;
		color: rgba(212, 199, 163, 0.3);
		pointer-events: none;
	}
	.toolbar-input {
		width: 100%;
		padding: 0.5rem 0.75rem 0.5rem 2.25rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.8rem;
		transition: all 0.15s;
	}
	.toolbar-input::placeholder {
		color: rgba(212, 199, 163, 0.3);
	}
	.toolbar-input:focus {
		outline: none;
		border-color: rgba(96, 165, 250, 0.4);
		background: rgba(255, 255, 255, 0.06);
	}
	.search-status {
		position: absolute;
		right: 0.75rem;
		font-size: 0.65rem;
		font-weight: 500;
		white-space: nowrap;
	}
	.search-status.searching {
		color: #60a5fa;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.search-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #60a5fa;
		animation: pulse 1s infinite;
	}
	.search-status.semantic {
		color: #a78bfa;
	}
	.toolbar-filters {
		display: flex;
		gap: 0.25rem;
	}
	.filter-chip {
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.4);
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.15s;
	}
	.filter-chip:hover {
		color: rgba(212, 199, 163, 0.7);
		background: rgba(255, 255, 255, 0.04);
	}
	.filter-chip.active {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.1);
		border-color: rgba(96, 165, 250, 0.2);
	}
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.filter-toggle {
		padding: 0.375rem;
		border-radius: 6px;
		color: rgba(212, 199, 163, 0.4);
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.06);
		cursor: pointer;
		transition: all 0.15s;
	}
	.filter-toggle:hover {
		color: rgba(212, 199, 163, 0.8);
		background: rgba(255, 255, 255, 0.06);
	}
	.view-toggle {
		display: flex;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		overflow: hidden;
	}
	.view-btn {
		padding: 0.375rem 0.5rem;
		color: rgba(212, 199, 163, 0.3);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.view-btn:first-child {
		border-right: 1px solid rgba(255, 255, 255, 0.08);
	}
	.view-btn:hover {
		color: rgba(212, 199, 163, 0.6);
		background: rgba(255, 255, 255, 0.04);
	}
	.view-btn.active {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.08);
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}
</style>