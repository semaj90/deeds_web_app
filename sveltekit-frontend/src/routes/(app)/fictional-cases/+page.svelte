<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/ui/Icon.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let categoryFilter = $state('');
	let jurisdictionFilter = $state('');
	let searchQuery = $state('');
	let expandedCase = $state<string | null>(null);

	// Sync filter state from server data on navigation
	$effect(() => {
		categoryFilter = data.filters?.category ?? '';
		jurisdictionFilter = data.filters?.jurisdiction ?? '';
		searchQuery = data.filters?.q ?? '';
	});

	let categories = $derived(data.categoryStats ?? []);

	function formatCategory(cat: string): string {
		return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (categoryFilter) params.set('category', categoryFilter);
		if (jurisdictionFilter) params.set('jurisdiction', jurisdictionFilter);
		if (searchQuery) params.set('q', searchQuery);
		goto(`/fictional-cases?${params.toString()}`);
	}

	function clearFilters() {
		categoryFilter = '';
		jurisdictionFilter = '';
		searchQuery = '';
		goto('/fictional-cases');
	}

	function formatDate(val: string | null | undefined) {
		if (!val) return '—';
		const d = new Date(val);
		if (isNaN(d.getTime())) return val;
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatMoney(val: number | null | undefined) {
		if (!val) return '—';
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
	}

	function categoryColor(cat: string): string {
		const colors: Record<string, string> = {
			wire_fraud: '#f59e0b',
			cybercrime: '#8b5cf6',
			firearms: '#ef4444',
			obstruction: '#f97316',
			drug_trafficking: '#ec4899',
			verbal_contracts: '#06b6d4',
			tort_federal: '#10b981',
			federal_employee_liability: '#6366f1',
		};
		return colors[cat] ?? '#94a3b8';
	}

	let hasActiveFilters = $derived(!!categoryFilter || !!jurisdictionFilter || !!searchQuery);
</script>

<svelte:head>
	<title>Fictional Cases | Prosecutor Simulation</title>
</svelte:head>

<div class="fc-page">
	<!-- Header -->
	<header class="fc-header">
		<div class="fc-header-left">
			<div class="fc-icon-badge">
				<Icon name="scale" />
			</div>
			<div>
				<h1 class="fc-title">Fictional Cases</h1>
				<p class="fc-subtitle">
					{data.total} cases across {categories.length} categories
					{#if hasActiveFilters}
						<span class="fc-filter-dot"></span> filtered
					{/if}
				</p>
			</div>
		</div>
		<div class="fc-header-right">
			<span class="fc-sim-tag">
				<Icon name="flask-conical" />
				SIMULATION DATA
			</span>
		</div>
	</header>

	<!-- Category Stats -->
	<div class="fc-stats-row">
		{#each categories as cat}
			<button
				class="fc-stat-chip"
				class:active={categoryFilter === cat.category}
				onclick={() => { categoryFilter = categoryFilter === cat.category ? '' : cat.category; applyFilters(); }}
				style="--cat-color: {categoryColor(cat.category)}"
			>
				<span class="fc-stat-value">{cat.count}</span>
				<span class="fc-stat-label">{formatCategory(cat.category)}</span>
			</button>
		{/each}
	</div>

	<!-- Search + Filters -->
	<div class="fc-filter-bar">
		<div class="fc-filter-row">
			<div class="fc-search-wrap">
				<SearchBar
					placeholder="Search charges, defendants, statutes, narratives..."
					value={searchQuery}
					onsearch={(q) => { searchQuery = q; applyFilters(); }}
				/>
			</div>
			<select
				bind:value={jurisdictionFilter}
				onchange={applyFilters}
				class="fc-select"
			>
				<option value="">All Jurisdictions</option>
				<option value="US-FED">Federal</option>
				<option value="CA">California</option>
				<option value="NY">New York</option>
				<option value="TX">Texas</option>
				<option value="FL">Florida</option>
				<option value="IL">Illinois</option>
			</select>
			{#if hasActiveFilters}
				<button onclick={clearFilters} class="fc-clear-btn">
					<Icon name="x" /> Clear
				</button>
			{/if}
		</div>
	</div>

	<!-- Cases List -->
	<div class="fc-list-area">
		<div class="fc-container">
			{#if data.loadError}
				<div class="fc-alert fc-alert-warning">
					<Icon name="triangle-alert" /> {data.loadError}
				</div>
			{/if}

			{#if data.cases.length === 0}
				<div class="fc-empty">
					<div class="fc-empty-icon"><Icon name="search" /></div>
					<h2 class="fc-empty-title">No Cases Found</h2>
					<p class="fc-empty-desc">
						{#if hasActiveFilters}
							Try adjusting your search criteria or clearing filters.
						{:else}
							No fictional cases have been generated yet.
						{/if}
					</p>
				</div>
			{:else}
				<div class="fc-case-list">
					{#each data.cases as caseItem (caseItem.id)}
						{@const isExpanded = expandedCase === caseItem.id}
						<div class="fc-case-card" class:expanded={isExpanded}>
							<button
								class="fc-case-header"
								onclick={() => { expandedCase = isExpanded ? null : caseItem.id; }}
							>
								<div class="fc-case-left">
									<span
										class="fc-cat-badge"
										style="--cat-color: {categoryColor(caseItem.category)}"
									>
										{formatCategory(caseItem.category)}
									</span>
									<div class="fc-case-info">
										<h3 class="fc-case-charge">{caseItem.charge}</h3>
										<p class="fc-case-meta">
											<span class="fc-defendant">{caseItem.defendantName}</span>
											{#if caseItem.primaryStatute}
												<span class="fc-statute">{caseItem.primaryStatute}</span>
											{/if}
										</p>
									</div>
								</div>
								<div class="fc-case-right">
									{#if caseItem.financialLoss}
										<span class="fc-loss">{formatMoney(caseItem.financialLoss)}</span>
									{/if}
									<span class="fc-jurisdiction">{caseItem.jurisdiction ?? '—'}</span>
									<span class="fc-date">{formatDate(caseItem.incidentDate)}</span>
									<span class="fc-chevron" class:rotated={isExpanded}>
										<Icon name="chevron-down" />
									</span>
								</div>
							</button>

							{#if isExpanded}
								<div class="fc-case-body">
									<div class="fc-detail-grid">
										<div class="fc-detail-item">
											<span class="fc-detail-label">Case ID</span>
											<span class="fc-detail-value fc-mono">{caseItem.caseId}</span>
										</div>
										<div class="fc-detail-item">
											<span class="fc-detail-label">City</span>
											<span class="fc-detail-value">{caseItem.jurisdictionCity ?? '—'}</span>
										</div>
										<div class="fc-detail-item">
											<span class="fc-detail-label">Generated By</span>
											<span class="fc-detail-value">{caseItem.generatedBy ?? '—'}</span>
										</div>
										<div class="fc-detail-item">
											<span class="fc-detail-label">Created</span>
											<span class="fc-detail-value">{formatDate(caseItem.createdAt)}</span>
										</div>
									</div>
									<div class="fc-actions-row">
										<a
											href="/fictional-cases/{caseItem.id}"
											class="fc-view-btn"
										>
											<Icon name="file-text" />
											Full Case Details
										</a>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Pagination -->
				{#if data.pagination.hasMore || data.pagination.offset > 0}
					<div class="fc-pagination">
						{#if data.pagination.offset > 0}
							<a
								href="/fictional-cases?offset={Math.max(0, data.pagination.offset - data.pagination.limit)}&category={categoryFilter}&jurisdiction={jurisdictionFilter}&q={searchQuery}"
								class="fc-page-btn"
							>
								<Icon name="chevron-left" /> Previous
							</a>
						{/if}
						<span class="fc-page-info">
							{data.pagination.offset + 1}–{data.pagination.offset + data.cases.length} of {data.total}
						</span>
						{#if data.pagination.hasMore}
							<a
								href="/fictional-cases?offset={data.pagination.offset + data.pagination.limit}&category={categoryFilter}&jurisdiction={jurisdictionFilter}&q={searchQuery}"
								class="fc-page-btn"
							>
								Next <Icon name="chevron-right" />
							</a>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.fc-page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--t-bg, #0e0d0b);
		margin: -2.5rem;
		color: var(--t-text, rgba(212, 199, 163, 0.85));
	}

	.fc-page :global(h1), .fc-page :global(h2), .fc-page :global(h3), .fc-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.fc-page :global(a) { color: inherit; border-bottom: none; text-decoration: none; }
	.fc-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.fc-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }

	/* Header */
	.fc-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		background: var(--t-bg-elevated, rgba(0, 0, 0, 0.4));
		backdrop-filter: blur(8px);
	}

	.fc-header-left { display: flex; align-items: flex-start; gap: 0.875rem; }
	.fc-header-right { display: flex; align-items: center; gap: 0.75rem; }

	.fc-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, #8b5cf6 12%, transparent);
		border: 1px solid color-mix(in srgb, #8b5cf6 25%, transparent);
		color: #a78bfa;
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.fc-title { font-size: 1.25rem; font-weight: 700; color: var(--t-text, rgba(212, 199, 163, 0.95)); line-height: 1.3; }
	.fc-subtitle { font-size: 0.75rem; color: var(--t-text-muted, rgba(212, 199, 163, 0.4)); margin-top: 0.125rem; display: flex; align-items: center; gap: 0.5rem; }
	.fc-filter-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--t-accent, #34d399); }

	.fc-sim-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		background: rgba(139, 92, 246, 0.12);
		border: 1px solid rgba(139, 92, 246, 0.3);
		color: #a78bfa;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	/* Stats Row */
	.fc-stats-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		background: color-mix(in srgb, var(--t-bg-elevated, #000) 50%, transparent);
		overflow-x: auto;
		flex-wrap: wrap;
	}

	.fc-stat-chip {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid color-mix(in srgb, var(--cat-color) 30%, transparent);
		background: color-mix(in srgb, var(--cat-color) 6%, transparent);
		color: var(--cat-color);
		font-size: 0.75rem;
		white-space: nowrap;
		cursor: pointer;
		transition: all 0.15s;
	}

	.fc-stat-chip:hover { background: color-mix(in srgb, var(--cat-color) 12%, transparent); }
	.fc-stat-chip.active { background: color-mix(in srgb, var(--cat-color) 18%, transparent); border-color: color-mix(in srgb, var(--cat-color) 50%, transparent); }

	.fc-stat-value { font-weight: 700; font-size: 0.875rem; }
	.fc-stat-label { opacity: 0.8; }

	/* Filter Bar */
	.fc-filter-bar {
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		background: color-mix(in srgb, var(--t-bg-elevated, #000) 60%, transparent);
		padding: 0.75rem 1.5rem;
	}

	.fc-filter-row {
		max-width: 80rem;
		margin: 0 auto;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}

	.fc-search-wrap { flex: 1; min-width: 200px; }

	.fc-select {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		font-size: 0.875rem;
		outline: none;
	}

	.fc-clear-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		color: var(--t-text-muted, rgba(212, 199, 163, 0.5));
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.fc-clear-btn:hover { color: var(--t-text); border-color: var(--t-text-muted); }

	/* List Area */
	.fc-list-area { flex: 1; overflow-y: auto; padding: 1.5rem; }
	.fc-container { max-width: 80rem; margin: 0 auto; }

	/* Alerts */
	.fc-alert { margin-bottom: 1rem; border-radius: 0.5rem; padding: 0.75rem 1rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; }
	.fc-alert-warning { border: 1px solid rgba(251, 191, 36, 0.25); background: rgba(251, 191, 36, 0.06); color: rgba(251, 191, 36, 0.9); }

	/* Empty State */
	.fc-empty { display: flex; flex-direction: column; align-items: center; padding: 5rem 1.5rem; text-align: center; }
	.fc-empty-icon { font-size: 2.5rem; margin-bottom: 1rem; color: var(--t-text-muted); opacity: 0.5; }
	.fc-empty-title { font-size: 1.25rem; font-weight: 600; color: var(--t-text); margin-bottom: 0.5rem; }
	.fc-empty-desc { color: var(--t-text-muted); font-size: 0.875rem; }

	/* Case Cards */
	.fc-case-list { display: flex; flex-direction: column; gap: 0.5rem; }

	.fc-case-card {
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		border-radius: 0.5rem;
		background: var(--t-panel, rgba(0, 0, 0, 0.25));
		transition: all 0.15s;
		overflow: hidden;
	}
	.fc-case-card:hover { border-color: color-mix(in srgb, var(--t-text, #fff) 12%, transparent); }
	.fc-case-card.expanded { border-color: color-mix(in srgb, #a78bfa 30%, transparent); }

	.fc-case-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.875rem 1.25rem;
		cursor: pointer;
		gap: 1rem;
		text-align: left;
	}

	.fc-case-left { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; }

	.fc-cat-badge {
		display: inline-flex;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background: color-mix(in srgb, var(--cat-color) 15%, transparent);
		color: var(--cat-color);
		border: 1px solid color-mix(in srgb, var(--cat-color) 30%, transparent);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.fc-case-info { min-width: 0; }

	.fc-case-charge {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fc-case-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.4));
		margin-top: 0.125rem;
	}

	.fc-defendant { font-weight: 500; color: var(--t-text-muted, rgba(212, 199, 163, 0.55)); }
	.fc-statute { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; opacity: 0.7; }

	.fc-case-right {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.4));
		flex-shrink: 0;
	}

	.fc-loss { color: rgba(239, 68, 68, 0.8); font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; }
	.fc-jurisdiction { white-space: nowrap; }
	.fc-date { white-space: nowrap; }

	.fc-chevron { transition: transform 0.2s; display: flex; }
	.fc-chevron.rotated { transform: rotate(180deg); }

	/* Expanded Body */
	.fc-case-body {
		padding: 0 1.25rem 1rem;
		border-top: 1px solid var(--t-border, rgba(212, 199, 163, 0.06));
	}

	.fc-detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.fc-detail-item { display: flex; flex-direction: column; gap: 0.125rem; }
	.fc-detail-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--t-text-muted, rgba(212, 199, 163, 0.35)); }
	.fc-detail-value { font-size: 0.8125rem; color: var(--t-text, rgba(212, 199, 163, 0.8)); }
	.fc-mono { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; }

	.fc-actions-row {
		margin-top: 1rem;
		display: flex;
		gap: 0.5rem;
	}

	.fc-view-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		background: color-mix(in srgb, #a78bfa 12%, transparent);
		border: 1px solid color-mix(in srgb, #a78bfa 30%, transparent);
		color: #a78bfa;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.fc-view-btn:hover { background: color-mix(in srgb, #a78bfa 20%, transparent); }

	/* Pagination */
	.fc-pagination {
		margin-top: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}

	.fc-page-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		color: var(--t-text-muted, rgba(212, 199, 163, 0.6));
		font-size: 0.8125rem;
		transition: all 0.15s;
	}
	.fc-page-btn:hover { color: var(--t-text); border-color: var(--t-text-muted); }

	.fc-page-info { font-size: 0.75rem; color: var(--t-text-muted, rgba(212, 199, 163, 0.4)); }
</style>