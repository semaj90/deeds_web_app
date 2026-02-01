<script lang="ts">
	import type { CitationSearchResult, SavedCitation } from '$lib/types/citations';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	interface Props {
		searchQuery?: string;
		sourceTypeFilter?: string;
		limit?: number;
		caseId?: string;
	}

	let {
		searchQuery = '',
		sourceTypeFilter = '',
		limit = 20,
		caseId = undefined
	}: Props = $props();

	let citations: SavedCitation[] = $state([]);
	let isLoading = $state(false);
	let error: string | null = $state(null);
	let total = $state(0);
	let offset = $state(0);
	let hasMore = $state(false);

	const sourceTypes = [
		{ value: '', label: 'All Types' },
	{ value: 'statute', label: 'Statute' },
	{ value: 'case_law', label: 'Case Law' },
	{ value: 'regulation', label: 'Regulation' },
	{ value: 'manual', label: 'Manual Entry' }
	];

	async function loadCitations() {
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams();
			if (searchQuery) params.append('q', searchQuery);
			if (sourceTypeFilter) params.append('sourceType', sourceTypeFilter);
			if (caseId) params.append('caseId', caseId);
			params.append('limit', limit.toString());
			params.append('offset', offset.toString());

			const response = await fetch(`/api/citations?${params}`);
			if (!response.ok) throw new Error('Failed to load citations');

			const result: CitationSearchResult = await response.json();
			citations = result.citations;
			total = result.total;
			hasMore = offset + limit < total;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load citations';
			console.error('Error loading citations:', err);
		} finally {
			isLoading = false;
		}
	}

	function handleSearch() {
		offset = 0;
		loadCitations();
	}

	function handleLoadMore() {
		offset += limit;
		loadCitations();
	}

	async function handleDelete(citationId: string) {
		if (!confirm('Are you sure you want to delete this citation?')) return;

		try {
			const response = await fetch(`/api/citations/${citationId}`, {
				method: 'DELETE'
			});

			if (!response.ok) throw new Error('Failed to delete citation');

			citations = citations.filter(c => c.id !== citationId);
			total--;
		} catch (err) {
			console.error('Error deleting citation:', err);
			alert('Failed to delete citation');
		}
	}

	$effect(() => {

		loadCitations();
	
});

	$effect(() => {
		if (searchQuery !== undefined || sourceTypeFilter !== undefined) {
			handleSearch();
		}
	});
</script>

<div class="citation-list">
	<!-- Search and Filter -->
	<div class="search-bar">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Search citations..."
			onkeydown={(e) => e.key === 'Enter' && handleSearch()}
			disabled={isLoading}
		/>
		<select bind:value={sourceTypeFilter} onchange={handleSearch} disabled={isLoading}>
			{#each sourceTypes as type}
				<option value={type.value}>{type.label}</option>
			{/each}
		</select>
		<button onclick={handleSearch} disabled={isLoading} class="btn-search">
			{isLoading ? '⟳' : '🔍'}
		</button>
	</div>

	<!-- Results Info -->
	<div class="results-info">
		<p>
			{#if total === 0}
				No citations found
			{:else}
				Showing {citations.length} of {total} citations
			{/if}
		</p>
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="error-message">
			<p>⚠️ {error}</p>
		</div>
	{/if}

	<!-- Citations List -->
	{#if isLoading && citations.length === 0}
		<div class="loading">
			<p>Loading citations...</p>
		</div>
	{:else if citations.length === 0}
		<div class="empty-state">
			<p>No citations yet. Start by saving your first citation!</p>
		</div>
	{:else}
		<div class="citations-grid">
			{#each citations as citation (citation.id)}
				<div class="citation-card">
					<!-- Header -->
					<div class="citation-header">
						<div class="citation-meta">
							<span class="source-badge" data-type={citation.sourceType}>
								{citation.sourceType}
							</span>
							<span class="date">
								{new Date(citation.createdAt).toLocaleDateString()}
							</span>
						</div>
						<button
							onclick={() => handleDelete(citation.id)}
							class="btn-delete"
							title="Delete citation"
						>
							🗑️
						</button>
					</div>

					<!-- Citation Text -->
					<div class="citation-text">
						<p>{citation.citationText}</p>
					</div>

					<!-- Statute Info -->
					{#if citation.statuteCode || citation.statuteTitle}
						<div class="statute-info">
							{#if citation.statuteCode}
								<p class="statute-code">{citation.statuteCode}</p>
							{/if}
							{#if citation.statuteTitle}
								<p class="statute-title">{citation.statuteTitle}</p>
							{/if}
						</div>
					{/if}

					<!-- Context -->
					{#if citation.contextText}
						<div class="context">
							<p class="context-label">Context:</p>
							<p class="context-text">{citation.contextText}</p>
						</div>
					{/if}

					<!-- Notes -->
					{#if citation.notes}
						<div class="notes">
							<p class="notes-label">Notes:</p>
							<p class="notes-text">{citation.notes}</p>
						</div>
					{/if}

					<!-- Tags -->
					{#if citation.tags && citation.tags.length > 0}
						<div class="tags">
							{#each citation.tags as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					{/if}

					<!-- Relevance Score -->
					{#if citation.relevanceScore > 0}
						<div class="relevance">
							<p class="relevance-label">Relevance:</p>
							<div class="relevance-bar">
								<div
									class="relevance-fill"
									style:width="{citation.relevanceScore * 100}%"
								></div>
							</div>
							<p class="relevance-value">{(citation.relevanceScore * 100).toFixed(0)}%</p>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Load More Button -->
		{#if hasMore}
			<div class="load-more">
				<button onclick={handleLoadMore} disabled={isLoading} class="btn-load-more">
					{isLoading ? 'Loading...' : 'Load More'}
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.citation-list {
		display: flex;
		flex-direction: column;
	gap: 20px;
	}

	.search-bar {
		display: flex;
	gap: 12px;
		background: var(--color-parchment);
	padding: 16px;
		border-radius: 8px;
	border: 1px solid var(--color-tan);
	}

	.search-bar input,
	.search-bar select {
		padding: 10px 12px;
		border: 1px solid var(--color-tan);
		border-radius: 4px;
		font-size: 14px;
	background: white;
	}

	.search-bar input {
		flex: 1;
	}

	.search-bar input:focus,
	.search-bar select:focus {
		outline: none;
		border-color: var(--color-burgundy);
		box-shadow: 0 0 0 3px rgba(139, 35, 50, 0.1);
	}

	.btn-search {
		padding: 10px 16px;
		background: var(--color-burgundy);
	color: white;
		border: none;
		border-radius: 4px;
	cursor: pointer;
		font-size: 16px;
	transition: all 150ms ease;
	}

	.btn-search:hover:not(:disabled) {
		background: var(--color-dark-burgundy);
	transform: translateY(-1px);
	}

	.btn-search:disabled {
		background: var(--color-light-gray);
	cursor: not-allowed;
	}

	.results-info {
		padding: 0 16px;
		color: var(--color-medium-gray);
		font-size: 14px;
	}

	.error-message {
		background: #fee;
	border: 1px solid #fcc;
		border-radius: 4px;
	padding: 12px 16px;
		color: #c33;
	}

	.loading,
	.empty-state {
		text-align: center;
	padding: 40px 20px;
		color: var(--color-medium-gray);
	}

	.citations-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 16px;
	}

	.citation-card {
		background: white;
	border: 1px solid var(--color-tan);
		border-radius: 8px;
	padding: 16px;
		display: flex;
		flex-direction: column;
	gap: 12px;
		transition: all 150ms ease;
	}

	.citation-card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		border-color: var(--color-burgundy);
	}

	.citation-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	gap: 12px;
	}

	.citation-meta {
		display: flex;
	gap: 8px;
		align-items: center;
	}

	.source-badge {
		display: inline-block;
	padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.source-badge[data-type='statute'] {
		background: #e8f4f8;
	color: #0066cc;
	}

	.source-badge[data-type='case_law'] {
		background: #f0e8f8;
	color: #6600cc;
	}

	.source-badge[data-type='regulation'] {
		background: #f8f0e8;
	color: #cc6600;
	}

	.source-badge[data-type='manual'] {
		background: #e8f8e8;
	color: #00cc00;
	}

	.date {
		font-size: 12px;
	color: var(--color-medium-gray);
	}

	.btn-delete {
		background: none;
	border: none;
		cursor: pointer;
		font-size: 16px;
	padding: 4px;
		opacity: 0.6;
	transition: opacity 150ms ease;
	}

	.btn-delete:hover {
		opacity: 1;
	}

	.citation-text {
		font-weight: 600;
	color: var(--color-burgundy);
		line-height: 1.4;
	}

	.statute-info {
		padding: 8px;
	background: var(--color-parchment);
		border-radius: 4px;
		font-size: 13px;
	}

	.statute-code {
		font-weight: 600;
	color: var(--color-dark);
		margin: 0;
	}

	.statute-title {
		color: var(--color-medium-gray);
	margin: 4px 0 0 0;
	}

	.context,
	.notes {
		font-size: 13px;
	}

	.context-label,
	.notes-label,
	.relevance-label {
		font-weight: 600;
	color: var(--color-dark);
		margin: 0 0 4px 0;
	}

	.context-text,
	.notes-text {
		color: var(--color-medium-gray);
	margin: 0;
		line-height: 1.4;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
	gap: 6px;
	}

	.tag {
		display: inline-block;
	background: var(--color-burgundy);
		color: white;
	padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
	}

	.relevance {
		font-size: 13px;
	}

	.relevance-bar {
		height: 6px;
	background: var(--color-light-gray);
		border-radius: 3px;
	overflow: hidden;
		margin: 4px 0;
	}

	.relevance-fill {
		height: 100%;
	background: var(--color-burgundy);
		transition: width 300ms ease;
	}

	.relevance-value {
		color: var(--color-medium-gray);
	margin: 4px 0 0 0;
	}

	.load-more {
		text-align: center;
	padding: 20px;
	}

	.btn-load-more {
		padding: 10px 24px;
		background: var(--color-tan);
	color: var(--color-dark);
		border: none;
		border-radius: 4px;
	cursor: pointer;
		font-weight: 600;
	transition: all 150ms ease;
	}

	.btn-load-more:hover:not(:disabled) {
		background: var(--color-dark-tan);
	transform: translateY(-1px);
	}

	.btn-load-more:disabled {
		background: var(--color-light-gray);
	cursor: not-allowed;
	}
</style>
