
<script lang="ts">
	// Migrated to $effect
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: {
	data: PageData, form: ActionData } = $props();

	// Search State
	let searchQuery = $state('');
	let selectedCollection = $state('all');
	let isSearching = $state(false);

	// Derived results from server action
	let searchResults = $derived(form?.results ?? []);

	// Tag Enhancement State
	let selectedTags = $state<string[]>([]);
	let tagEnhancements = $state<Map<string, any>>(new Map());
	let isEnhancingTags = $state(false);

	// Neo4j Graph State
	let graphData = $state<any>(null);
	let selectedNode = $state<any>(null);

	// File Analysis State
	let selectedFile = $state<string | null>(null);
	let fileAnalysis = $state<any>(null);
	let isAnalyzingFile = $state(false);

	// Cluster Summary State
	let clusterSummaries = $state<any[]>([]);
	let selectedCluster = $state<number | null>(null);

	// Active Tab
	let activeTab = $state<'search' | 'tags' | 'graph' | 'files' | 'clusters'>('search');

	// Actions
	function handleEnhance() {
		return async ({ update }: {
	update: () => Promise<void> }) => {
			isSearching = true;
			await update();
			isSearching = false;
		};
	}

	// Analyze file (still client fetch for now unless we move to action)
	// migrating to action:
	function handleAnalyze() {
		return async ({ update }: any) => {
			isAnalyzingFile = true;
			await update();
			isAnalyzingFile = false;
		};
	}

	// Placeholder loaders corresponding to actions
	$effect(() => {

		// loadGraph();
		// generateClusterSummaries();
	
});
</script>

<div class="knowledge-search-container">
	<header class="search-header">
		<h1>🔍 Knowledge Base Search</h1>
		<p class="text-sm text-gray-600">
			Search 72K+ points across 21 Qdrant collections with embeddinggemma (SSR Enforced)
		</p>
	</header>

	<!-- Tabs -->
	<div class="tabs">
		<button class:active={activeTab === 'search'} onclick={() => (activeTab = 'search')}>🔍 Search</button>
		<button class:active={activeTab === 'tags'} onclick={() => (activeTab = 'tags')}>🏷️ Enhanced Tags</button>
		<button class:active={activeTab === 'graph'} onclick={() => (activeTab = 'graph')}>🌐 Neo4j Graph</button>
		<button class:active={activeTab === 'files'} onclick={() => (activeTab = 'files')}>📄 File Analysis</button>
		<button class:active={activeTab === 'clusters'} onclick={() => (activeTab = 'clusters')}>📊 Cluster Summaries</button>
	</div>

	<!-- Search Tab -->
	{#if activeTab === 'search'}
		<div class="search-panel">
			<form method="POST" action="?/vectorSearch" use:enhance={handleEnhance} class="search-controls">
				<input
					type="text"
					name="query"
					bind:value={searchQuery}
					placeholder="Search knowledge base with semantic vectors..."
					class="search-input"
				/>

				<select name="collection" bind:value={selectedCollection} class="collection-select">
					<option value="all">All Collections</option>
					{#if data?.collections}
						{#each data.collections as collection}
							<option value={collection}>{collection}</option>
						{/each}
					{/if}
				</select>

				<button type="submit" disabled={isSearching} class="btn-primary">
					{isSearching ? '🔄 Searching...' : '🔍 Search'}
				</button>
			</form>

			<!-- Results -->
			<div class="results-grid">
				{#each searchResults as result}
					<div class="result-card">
						<div class="result-header">
							<span class="score">{(result.score * 100).toFixed(1)}%</span>
							<span class="collection-badge">{result.collection || 'unknown'}</span>
						</div>

						<div class="result-content">
							{#if result.payload?.message}
								<p class="text-sm text-gray-800 mb-2">{result.payload.message}</p>
							{/if}

							{#if result.payload?.file_path}
								<form method="POST" action="?/analyzeFile" use:enhance={handleAnalyze}>
									<input type="hidden" name="filePath" value={result.payload.file_path} />
									<button type="submit" class="file-link">
										📄 {result.payload.file_path}
									</button>
								</form>
							{/if}

							{#if result.payload?.tags}
								<div class="tags">
									{#each result.payload.tags as tag}
										<span class="tag">{tag}</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}
				{#if searchResults.length === 0 && !isSearching && form?.success}
					<p class="text-gray-500">No results found.</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Other tabs (placeholders for now) -->
	{#if activeTab === 'tags'}
		<div class="tags-panel">
			<form method="POST" action="?/enhanceTags" use:enhance>
				<button type="submit" class="btn-primary">🚀 Enhance Tags with AI</button>
			</form>
			<p class="mt-4 text-gray-500">Tag enhancement results will appear here.</p>
		</div>
	{/if}

	{#if activeTab === 'graph'}
		<div class="graph-panel">
			<form method="POST" action="?/loadGraph" use:enhance>
				<button type="submit" class="btn-secondary">Reload Graph</button>
			</form>
			<div class="graph-placeholder mt-4 p-8 border rounded-lg bg-gray-50 text-center">
				Graph visualization pending implementation.
			</div>
		</div>
	{/if}

	{#if activeTab === 'files'}
		<div class="files-panel">
			<p class="text-gray-500">Select a file from search results to analyze.</p>
		</div>
	{/if}

	{#if activeTab === 'clusters'}
		<div class="clusters-panel">
			<form method="POST" action="?/generateClusterSummaries" use:enhance>
				<button type="submit" class="btn-secondary">Generate Summaries</button>
			</form>
			<p class="mt-4 text-gray-500">Cluster summaries will appear here.</p>
		</div>
	{/if}
</div>

<style>
	.knowledge-search-container {
		padding: 2rem;
		max-width: 1400px;
	margin: 0 auto;
	}

	.search-header {
		margin-bottom: 2rem;
	}

	.search-header h1 {
		font-size: 2rem;
		font-weight: bold;
		margin-bottom: 0.5rem;
	}

	.tabs { display: flex; gap: 0.5rem;
		margin-bottom: 2rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.tabs button {
		padding: 0.75rem 1.5rem;
		background: none;
	border: none;
		border-bottom: 3px solid transparent;
		cursor: pointer;
		font-weight: 500;
	transition: all 0.2s;
	}

	.tabs button:hover {
		background: #f3f4f6;
	}

	.tabs button.active {
		border-bottom-color: #3b82f6;
	color: #3b82f6;
	}

	.search-controls { display: flex; gap: 1rem;
		margin-bottom: 2rem;
	}

	.search-input { flex: 1; padding: 0.75rem 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		font-size: 1rem;
	}

	.collection-select {
		padding: 0.75rem 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.btn-primary {
		padding: 0.75rem 2rem;
		background: #3b82f6;
	color: white;
		border: none;
		border-radius: 0.5rem;
		font-weight: 600;
	cursor: pointer;
	}

	.btn-primary:hover {
		background: #2563eb;
	}

	.btn-primary:disabled { background: #9ca3af; cursor:not-allowed;
	}

    .btn-secondary {
        padding: 0.5rem 1rem;
        background: white;
	border: 1px solid #d1d5db;
        border-radius: 0.375rem;
	cursor: pointer;
    }

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1.5rem;
	}

	.result-card { background: white; border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
	padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.result-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.score {
		font-weight: bold;
	color: #10b981;
	}

	.collection-badge { background: #e0e7ff; color: #4f46e5;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.file-link { background: #f3f4f6; border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
	cursor: pointer;
		font-size: 0.875rem;
	margin: 0.5rem 0;
        width: 100%;
        text-align: left;
	}

	.file-link:hover {
		background: #e5e7eb;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
	gap: 0.5rem;
		margin-top: 1rem;
	}

	.tag { background: #dbeafe; color: #1e40af;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
	}
</style>




