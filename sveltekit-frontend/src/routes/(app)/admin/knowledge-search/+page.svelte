<script lang="ts">
	import { onMount } from 'svelte';

	interface PageData {
		collections: string[];
		stats: {
			totalCollections: number;
			timestamp: string;
		};
	}

	let { data }: { data: PageData } = $props();

	// Search State
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let isSearching = $state(false);
	let selectedCollection = $state('all');

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

	// Vector Search with embeddinggemma + Qdrant
	async function vectorSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		try {
			// 1. Generate embedding
			const embedRes = await fetch('http://localhost:11434/api/embeddings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'embeddinggemma:latest',
					prompt: searchQuery
				})
			});

			const { embedding } = await embedRes.json();

			// 2. Search Qdrant collections
			const collections =
				selectedCollection === 'all'
					? data.collections
					: [selectedCollection];

			const results: any[] = [];
			for (const collection of collections) {
				const qdrantRes = await fetch(
					`http://localhost:6333/collections/${collection}/points/search`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							vector: embedding,
							limit: 10,
							with_payload: true,
							with_vector: false
						})
					}
				);

				const data = await qdrantRes.json();
				if (data.result) {
					results.push(
						...data.result.map((r: any) => ({
							...r,
							collection
						}))
					);
				}
			}

			// Sort by score
			searchResults = results.sort((a, b) => b.score - a.score);
		} catch (err) {
			console.error('Search failed:', err);
		} finally {
			isSearching = false;
		}
	}

	// Enhance Qdrant tags with AI summary + metadata
	async function enhanceTags() {
		isEnhancingTags = true;
		try {
			// Get unique tags from search results
			const tags = new Set<string>();
			searchResults.forEach((r) => {
				if (r.payload?.tags) {
					r.payload.tags.forEach((t: string) => tags.add(t));
				}
			});
  
			for (const tag of tags) {
				const response = await fetch('/api/analyze-tag', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ tag, collection: selectedCollection })
				});

				const analysis = await response.json();
				tagEnhancements.set(tag, analysis);
			}

			// Store enhanced tags in Qdrant metadata
			await fetch('/api/update-tag-metadata', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					enhancements: Array.from(tagEnhancements.entries())
				})
			});
		} catch (err) {
			console.error('Tag enhancement failed:', err);
		} finally {
			isEnhancingTags = false;
		}
	}

	// Analyze file with ripgrep + gemma3-legal
	async function analyzeFile(filePath: string) {
		isAnalyzingFile = true;
		selectedFile = filePath;

		try {
			const response = await fetch('/api/analyze-file', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath })
			});

			fileAnalysis = await response.json();
		} catch (err) {
			console.error('File analysis failed:', err);
		} finally {
			isAnalyzingFile = false;
		}
	}

	// Generate cluster summaries with CUDA + embeddings
	async function generateClusterSummaries() {
		try {
			const response = await fetch('/api/generate-cluster-summaries', {
				method: 'POST'
			});

			const data = await response.json();
			clusterSummaries = data.summaries;
		} catch (err) {
			console.error('Cluster summary generation failed:', err);
		}
	}

	// Load Neo4j graph
	async function loadGraph() {
		try {
			const response = await fetch('/api/neo4j/graph');
			graphData = await response.json();
		} catch (err) {
			console.error('Graph load failed:', err);
		}
	}

	onMount(() => {
		loadGraph();
		generateClusterSummaries();
	});
</script>

<div class="knowledge-search-container">
	<header class="search-header">
		<h1>🔍 Knowledge Base Search</h1>
		<p class="text-sm text-gray-600">
			Search 72K+ points across 21 Qdrant collections with embeddinggemma
		</p>
	</header>

	<!-- Tabs -->
	<div class="tabs">
		<button
			class:active={activeTab === 'search'}
			onclick={() => (activeTab = 'search')}
		>
			🔍 Search
		</button>
		<button
			class:active={activeTab === 'tags'}
			onclick={() => (activeTab = 'tags')}
		>
			🏷️ Enhanced Tags
		</button>
		<button
			class:active={activeTab === 'graph'}
			onclick={() => (activeTab = 'graph')}
		>
			🌐 Neo4j Graph
		</button>
		<button
			class:active={activeTab === 'files'}
			onclick={() => (activeTab = 'files')}
		>
			📄 File Analysis
		</button>
		<button
			class:active={activeTab === 'clusters'}
			onclick={() => (activeTab === 'clusters')}
		>
			📊 Cluster Summaries
		</button>
	</div>

	<!-- Search Tab -->
	{#if activeTab === 'search'}
		<div class="search-panel">
			<div class="search-controls">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search knowledge base with semantic vectors..."
					class="search-input"
					onkeydown={(e) => e.key === 'Enter' && vectorSearch()}
				/>

				<select bind:value={selectedCollection} class="collection-select">
					<option value="all">All Collections</option>
					{#each data.collections as collection}
						<option value={collection}>{collection}</option>
					{/each}
				</select>

				<button onclick={vectorSearch} disabled={isSearching} class="btn-primary">
					{isSearching ? '🔄 Searching...' : '🔍 Search'}
				</button>
			</div>

			<!-- Results -->
			<div class="results-grid">
				{#each searchResults as result}
					<div class="result-card">
						<div class="result-header">
							<span class="score">{(result.score * 100).toFixed(1)}%</span>
							<span class="collection-badge">{result.collection}</span>
						</div>

						<div class="result-content">
							{#if result.payload?.message}
								<p class="text-sm">{result.payload.message}</p>
							{/if}

							{#if result.payload?.file_path}
								<button
									class="file-link"
									onclick={() => analyzeFile(result.payload.file_path)}
								>
									📄 {result.payload.file_path}
								</button>
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
			</div>
		</div>
	{/if}

	<!-- Enhanced Tags Tab -->
	{#if activeTab === 'tags'}
		<div class="tags-panel">
			<button
				onclick={enhanceTags}
				disabled={isEnhancingTags || searchResults.length === 0}
				class="btn-primary"
			>
				{isEnhancingTags ? '🔄 Enhancing...' : '🚀 Enhance Tags with AI'}
			</button>

			<div class="tags-grid">
				{#each Array.from(tagEnhancements.entries()) as [tag, enhancement]}
					<div class="tag-card">
						<h3>{tag}</h3>
						<p class="text-sm text-gray-600">{enhancement.summary}</p>

						<div class="meta">
							<span>Occurrences: {enhancement.count}</span>
							<span>Last updated: {enhancement.timestamp}</span>
						</div>

						{#if enhancement.relatedTags}
							<div class="related-tags">
								<strong>Related:</strong>
								{#each enhancement.relatedTags as related}
									<span class="tag-sm">{related}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Neo4j Graph Tab -->
	{#if activeTab === 'graph'}
		<div class="graph-panel">
			{#if graphData}
				<div class="graph-visualization">
					<!-- Graph visualization would go here (D3.js or similar) -->
					<pre>{JSON.stringify(graphData, null, 2)}</pre>
				</div>
			{:else}
				<p>Loading graph...</p>
			{/if}
		</div>
	{/if}

	<!-- File Analysis Tab -->
	{#if activeTab === 'files'}
		<div class="files-panel">
			{#if fileAnalysis}
				<div class="file-analysis-card">
					<h2>📄 {selectedFile}</h2>

					<section>
						<h3>AI Summary (gemma3-legal)</h3>
						<p>{fileAnalysis.summary}</p>
					</section>

					<section>
						<h3>Comments Extracted (ripgrep)</h3>
						<ul>
							{#each fileAnalysis.comments as comment}
								<li>{comment}</li>
							{/each}
						</ul>
					</section>

					<section>
						<h3>Error Patterns</h3>
						<ul>
							{#each fileAnalysis.errors as error}
								<li class="error-item">
									<strong>{error.code}</strong>: {error.message}
								</li>
							{/each}
						</ul>
					</section>

					<section>
						<h3>Recommendations</h3>
						<ul>
							{#each fileAnalysis.recommendations as rec}
								<li>{rec}</li>
							{/each}
						</ul>
					</section>

					{#if fileAnalysis.qdrantTag}
						<div class="enhanced-tag">
							<strong>Enhanced Qdrant Tag:</strong>
							<code>{fileAnalysis.qdrantTag.name}</code>
							<p>{fileAnalysis.qdrantTag.summary}</p>
							<span class="timestamp">{fileAnalysis.qdrantTag.timestamp}</span>
						</div>
					{/if}
				</div>
			{:else}
				<p class="text-gray-500">
					Select a file from search results to analyze
				</p>
			{/if}
		</div>
	{/if}

	<!-- Cluster Summaries Tab -->
	{#if activeTab === 'clusters'}
		<div class="clusters-panel">
			<div class="clusters-grid">
				{#each clusterSummaries as cluster}
					<div class="cluster-card">
						<div class="cluster-header">
							<h3>Cluster {cluster.id}</h3>
							<span class="count">{cluster.errorCount} errors</span>
						</div>

						<p class="summary">{cluster.summary}</p>

						<div class="cluster-tags">
							{#each cluster.tags as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>

						<div class="cluster-meta">
							<span>CUDA analyzed: {cluster.cudaAnalysis ? '✅' : '❌'}</span>
							<span>Cached: {cluster.redisCached ? '✅' : '❌'}</span>
						</div>

						{#if cluster.neo4jPath}
							<button
								class="btn-sm"
								onclick={() => {
									selectedCluster = cluster.id;
									loadGraph();
								}}
							>
								🌐 View Graph
							</button>
						{/if}
					</div>
				{/each}
			</div>
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

	.tabs {
		display: flex;
		gap: 0.5rem;
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

	.search-controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.search-input {
		flex: 1;
		padding: 0.75rem 1rem;
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

	.btn-primary:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1.5rem;
	}

	.result-card {
		background: white;
		border: 1px solid #e5e7eb;
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

	.collection-badge {
		background: #e0e7ff;
		color: #4f46e5;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.file-link {
		background: #f3f4f6;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
		margin: 0.5rem 0;
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

	.tag {
		background: #dbeafe;
		color: #1e40af;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
	}

	.tags-grid,
	.clusters-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.tag-card,
	.cluster-card,
	.file-analysis-card {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.enhanced-tag {
		background: #f0fdf4;
		border: 1px solid #86efac;
		border-radius: 0.5rem;
		padding: 1rem;
		margin-top: 1rem;
	}

	.timestamp {
		font-size: 0.75rem;
		color: #6b7280;
	}
</style>
