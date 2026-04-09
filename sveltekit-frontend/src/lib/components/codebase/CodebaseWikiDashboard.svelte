<!--
  GPU-Accelerated Semantic Codebase Wiki Dashboard

  Features:
  - Semantic search with cosine similarity
  - Real-time indexing job progress (SSE)
  - Category filtering by domain
  - Graph-aware retrieval results
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { Dialog } from 'bits-ui';

	interface WikiPage {
		id: string;
		file_path: string;
		title: string;
		summary: string;
		category: string;
		pagerank_score: number;
		view_count: number;
		created_at: string;
	}

	interface SearchResult {
		file_path: string;
		chunk_text: string;
		similarity_score: number;
		chunk_index: number;
	}

	interface IndexingJob {
		id: string;
		status: 'pending' | 'running' | 'completed' | 'failed';
		total_files: number;
		processed_files: number;
		progress: number;
		error?: string;
	}

	// State
	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let isSearching = $state(false);
	let selectedCategory = $state<string | null>(null);
	let wikiPages = $state<WikiPage[]>([]);
	let isLoadingPages = $state(false);

	// Indexing job state
	let currentJob = $state<IndexingJob | null>(null);
	let isIndexing = $state(false);
	let showIndexDialog = $state(false);
	let indexPatterns = $state('sveltekit-frontend/src/lib/**/*.ts\nsveltekit-frontend/src/lib/**/*.svelte');

	// SSE connection for job progress
	let eventSource: EventSource | null = null;

	const categories = [
		{ value: null, label: 'All Categories', icon: 'folder-open' },
		{ value: 'auth', label: 'Authentication', icon: 'shield-check' },
		{ value: 'rag', label: 'RAG Pipeline', icon: 'sparkles' },
		{ value: 'evidence', label: 'Evidence', icon: 'file-text' },
		{ value: 'chat', label: 'Chat', icon: 'message-square' },
		{ value: 'vector', label: 'Vector Search', icon: 'search' },
		{ value: 'gpu', label: 'GPU Compute', icon: 'cpu' }
	];

	// Load wiki pages on mount
	onMount(() => {
		loadWikiPages();
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
		}
	});

	async function loadWikiPages() {
		isLoadingPages = true;
		try {
			const url = selectedCategory
				? `/api/codebase/wiki?limit=20&category=${selectedCategory}`
				: '/api/codebase/wiki?limit=20';

			const response = await fetch(url);
			const data = await response.json();
			wikiPages = data.pages || [];
		} catch (error) {
			console.error('Failed to load wiki pages:', error);
			wikiPages = [];
		} finally {
			isLoadingPages = false;
		}
	}

	async function performSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		searchResults = [];

		try {
			const response = await fetch('/api/codebase/wiki', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: searchQuery,
					limit: 10,
					domain: selectedCategory
				})
			});

			const data = await response.json();
			searchResults = data.results || [];
		} catch (error) {
			console.error('Search error:', error);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	async function startIndexing() {
		if (isIndexing) return;

		const patterns = indexPatterns.split('\n').filter(p => p.trim());
		if (patterns.length === 0) return;

		isIndexing = true;
		showIndexDialog = false;

		try {
			const response = await fetch('/api/codebase/wiki/index', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ patterns })
			});

			const data = await response.json();
			if (data.success && data.jobId) {
				currentJob = {
					id: data.jobId,
					status: 'running',
					total_files: 0,
					processed_files: 0,
					progress: 0
				};
				watchJobProgress(data.jobId);
			}
		} catch (error) {
			console.error('Failed to start indexing:', error);
			isIndexing = false;
		}
	}

	async function watchJobProgress(jobId: string) {
		// Poll for job status every 2 seconds
		const pollInterval = setInterval(async () => {
			try {
				const response = await fetch(`/api/codebase/wiki/index?jobId=${jobId}`);
				const data = await response.json();

				if (data.success && data.job) {
					const job = data.job;
					currentJob = {
						id: job.id,
						status: job.status,
						total_files: job.total_files || 0,
						processed_files: job.processed_files || 0,
						progress: job.total_files > 0
							? (job.processed_files / job.total_files) * 100
							: 0,
						error: job.error
					};

					if (job.status === 'completed' || job.status === 'failed') {
						clearInterval(pollInterval);
						isIndexing = false;

						if (job.status === 'completed') {
							// Reload wiki pages to show new content
							loadWikiPages();
						}
					}
				}
			} catch (error) {
				console.error('Failed to check job status:', error);
			}
		}, 2000);
	}

	function handleCategoryChange(category: string | null) {
		selectedCategory = category;
		loadWikiPages();
	}

	function formatTimestamp(timestamp: string) {
		return new Date(timestamp).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="codebase-wiki-dashboard">
	<!-- Header -->
	<div class="dashboard-header">
		<div class="header-content">
			<h1 class="dashboard-title">
				<Icon name="book-open" class="title-icon" />
				Codebase Semantic Wiki
			</h1>
			<p class="dashboard-subtitle">
				GPU-accelerated semantic search with cosine retrieval
			</p>
		</div>

		<Button onclick={() => (showIndexDialog = true)} variant="primary">
			<Icon name="refresh-cw" />
			Reindex Codebase
		</Button>
	</div>

	<!-- Indexing Progress -->
	{#if isIndexing && currentJob}
		<div class="indexing-progress">
			<div class="progress-header">
				<Icon name="loader-2" class="animate-spin" />
				<span>Indexing in progress...</span>
				<span class="progress-percent">{currentJob.progress.toFixed(1)}%</span>
			</div>
			<div class="progress-bar">
				<div class="progress-fill" style="width: {currentJob.progress}%"></div>
			</div>
			<div class="progress-stats">
				<span>{currentJob.processed_files} / {currentJob.total_files} files</span>
				<span class="status-badge status-{currentJob.status}">{currentJob.status}</span>
			</div>
		</div>
	{/if}

	<!-- Category Filter -->
	<div class="category-filter">
		{#each categories as category}
			<button
				class="category-btn"
				class:active={selectedCategory === category.value}
				onclick={() => handleCategoryChange(category.value)}
			>
				<Icon name={category.icon} />
				{category.label}
			</button>
		{/each}
	</div>

	<!-- Semantic Search -->
	<div class="search-section">
		<div class="search-bar">
			<Icon name="search" class="search-icon" />
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Semantic search: e.g., 'authentication middleware', 'vector similarity'..."
				class="search-input"
				onkeydown={(e) => e.key === 'Enter' && performSearch()}
			/>
			<Button onclick={performSearch} disabled={isSearching || !searchQuery.trim()}>
				{isSearching ? 'Searching...' : 'Search'}
			</Button>
		</div>

		<!-- Search Results -->
		{#if searchResults.length > 0}
			<div class="search-results">
				<h3 class="results-header">
					Search Results ({searchResults.length})
				</h3>
				{#each searchResults as result}
					<div class="result-card">
						<div class="result-header">
							<code class="result-path">{result.file_path}</code>
							<span class="similarity-score">
								{(result.similarity_score * 100).toFixed(1)}% match
							</span>
						</div>
						<pre class="result-content">{result.chunk_text.slice(0, 300)}{result.chunk_text.length > 300 ? '...' : ''}</pre>
						<div class="result-meta">
							Chunk {result.chunk_index}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Wiki Pages Grid -->
	<div class="wiki-pages-section">
		<h2 class="section-title">Wiki Pages</h2>

		{#if isLoadingPages}
			<div class="loading-state">
				<Icon name="loader-2" class="animate-spin" />
				Loading pages...
			</div>
		{:else if wikiPages.length === 0}
			<div class="empty-state">
				<Icon name="inbox" />
				<p>No wiki pages found. Start by indexing your codebase.</p>
			</div>
		{:else}
			<div class="wiki-grid">
				{#each wikiPages as page}
					<div class="wiki-card">
						<div class="wiki-card-header">
							<h3 class="wiki-title">{page.title}</h3>
							<span class="pagerank-badge">
								PR: {page.pagerank_score.toFixed(3)}
							</span>
						</div>
						<code class="wiki-path">{page.file_path}</code>
						<p class="wiki-summary">{page.summary}</p>
						<div class="wiki-meta">
							<span class="category-tag">{page.category}</span>
							<span class="view-count">
								<Icon name="eye" />
								{page.view_count} views
							</span>
							<span class="wiki-date">{formatTimestamp(page.created_at)}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Indexing Dialog -->
	<Dialog.Root bind:open={showIndexDialog}>
		<Dialog.Portal>
			<Dialog.Overlay class="dialog-overlay" />
			<Dialog.Content class="dialog-content">
				<Dialog.Title class="dialog-title">Reindex Codebase</Dialog.Title>
				<Dialog.Description class="dialog-description">
					Enter file patterns to index (one per line). Uses glob syntax.
				</Dialog.Description>

				<div class="dialog-body">
					<label for="patterns">File Patterns:</label>
					<textarea
						id="patterns"
						bind:value={indexPatterns}
						rows="6"
						class="patterns-textarea"
						placeholder="sveltekit-frontend/src/lib/**/*.ts&#10;sveltekit-frontend/src/routes/**/*.svelte"
					></textarea>

					<div class="help-text">
						<Icon name="info" />
						<span>GPU batch size: 32 | Workers: 4 | Target: ~1200 chunks/min</span>
					</div>
				</div>

				<div class="dialog-footer">
					<Dialog.Close asChild>
						{#snippet child({ props })}
							<Button {...props} variant="ghost">Cancel</Button>
						{/snippet}
					</Dialog.Close>
					<Button onclick={startIndexing} variant="primary">
						<Icon name="play" />
						Start Indexing
					</Button>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</div>

<style>
	.codebase-wiki-dashboard {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	/* Header */
	.dashboard-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--t-border);
	}

	.header-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.dashboard-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 1.75rem;
		font-weight: 600;
		color: var(--t-text-primary);
	}

	.title-icon {
		color: var(--t-accent);
	}

	.dashboard-subtitle {
		color: var(--t-text-secondary);
		font-size: 0.875rem;
	}

	/* Indexing Progress */
	.indexing-progress {
		background: var(--t-panel-soft);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.progress-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
		color: var(--t-text-primary);
	}

	.progress-percent {
		margin-left: auto;
		color: var(--t-accent);
		font-weight: 600;
	}

	.progress-bar {
		height: 8px;
		background: var(--t-bg);
		border-radius: 9999px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--t-accent), var(--t-accent-soft));
		transition: width 0.3s ease;
	}

	.progress-stats {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.status-badge {
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.status-running {
		background: var(--t-info);
		color: white;
	}

	.status-completed {
		background: #22c55e;
		color: white;
	}

	.status-failed {
		background: var(--t-danger);
		color: white;
	}

	/* Category Filter */
	.category-filter {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.category-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		color: var(--t-text-secondary);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.category-btn:hover {
		background: var(--t-panel-soft);
		color: var(--t-text-primary);
	}

	.category-btn.active {
		background: var(--t-accent);
		color: white;
		border-color: var(--t-accent);
	}

	/* Search Section */
	.search-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.search-bar {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 1rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
	}

	.search-icon {
		color: var(--t-text-secondary);
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--t-text-primary);
		font-size: 0.9375rem;
	}

	.search-input::placeholder {
		color: var(--t-text-secondary);
	}

	/* Search Results */
	.search-results {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.results-header {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--t-text-primary);
	}

	.result-card {
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.result-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.result-path {
		color: var(--t-accent);
		font-size: 0.875rem;
	}

	.similarity-score {
		background: var(--t-accent-soft);
		color: var(--t-accent);
		padding: 0.25rem 0.625rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.result-content {
		background: var(--t-bg);
		padding: 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		color: var(--t-text-primary);
		overflow-x: auto;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.result-meta {
		color: var(--t-text-secondary);
		font-size: 0.8125rem;
	}

	/* Wiki Pages Grid */
	.wiki-pages-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.section-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--t-text-primary);
	}

	.wiki-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	.wiki-card {
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: border-color 0.2s;
	}

	.wiki-card:hover {
		border-color: var(--t-accent);
	}

	.wiki-card-header {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 0.5rem;
	}

	.wiki-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--t-text-primary);
		flex: 1;
	}

	.pagerank-badge {
		background: var(--t-bg);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--t-text-secondary);
	}

	.wiki-path {
		color: var(--t-text-secondary);
		font-size: 0.8125rem;
	}

	.wiki-summary {
		color: var(--t-text-primary);
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.wiki-meta {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		font-size: 0.75rem;
		color: var(--t-text-secondary);
		padding-top: 0.5rem;
		border-top: 1px solid var(--t-border);
	}

	.category-tag {
		background: var(--t-accent-soft);
		color: var(--t-accent);
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		font-weight: 600;
	}

	.view-count {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.wiki-date {
		margin-left: auto;
	}

	/* Loading/Empty States */
	.loading-state,
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 3rem;
		color: var(--t-text-secondary);
	}

	.empty-state {
		flex-direction: column;
	}

	/* Dialog Styles */
	:global(.dialog-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 50;
	}

	:global(.dialog-content) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1.5rem;
		width: 90%;
		max-width: 500px;
		z-index: 51;
	}

	:global(.dialog-title) {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--t-text-primary);
		margin-bottom: 0.5rem;
	}

	:global(.dialog-description) {
		color: var(--t-text-secondary);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.dialog-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.dialog-body label {
		font-weight: 500;
		color: var(--t-text-primary);
		font-size: 0.875rem;
	}

	.patterns-textarea {
		width: 100%;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		padding: 0.75rem;
		color: var(--t-text-primary);
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		resize: vertical;
	}

	.help-text {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		color: var(--t-text-secondary);
		font-size: 0.8125rem;
		padding: 0.5rem;
		background: var(--t-bg);
		border-radius: 0.25rem;
	}

	.dialog-footer {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}
</style>
