<script lang="ts">
	import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, TabsContent, TabsList, TabsRoot, TabsTrigger } from 'bits-ui';

	import * as Dialog from 'bits-ui';
	import { onMount } from 'svelte';

	interface Cluster {
		id: number;
		error_count: number;
		tags: string[];
		summary: string;
		error_ids: number[];
		centroid?: number[];
	}

	interface GraphNode {
		id: string;
		file_path: string;
		error_count: number;
		dependencies: string[];
	}

	interface VectorSearchResult {
		id: string;
		score: number;
		payload: any;
	}

	let clusters = $state<Cluster[]>([]);
	let graphNodes = $state<GraphNode[]>([]);
	let searchQuery = $state('');
	let searchResults = $state<VectorSearchResult[]>([]);
	let selectedCluster = $state<Cluster | null>(null);
	let loading = $state(false);
	let stats = $state({
		total_errors: 0,
		total_clusters: 0,
		total_nodes: 0,
		qdrant_points: 0
	});

	async function fetchStatus() {
		loading = true;
		try {
			const res = await fetch('/api/phase89/status');
			const data = await res.json();

			stats = {
				total_errors: data.postgres?.legal_ai?.error_instances || 0,
				total_clusters: 0,
				total_nodes: data.qdrant?.phase89_code_units || 0,
				qdrant_points: data.qdrant?.total_points || 0
			};
		} catch (err) {
			console.error('Failed to fetch status:', err);
		} finally {
			loading = false;
		}
	}

	// Fetch clusters from Redis
	async function fetchClusters() {
		loading = true;
		try {
			const res = await fetch('/api/phase89/clusters');
			const data = await res.json();
			clusters = data.clusters || [];
			stats.total_clusters = clusters.length;
		} catch (err) {
			console.error('Failed to fetch clusters:', err);
		} finally {
			loading = false;
		}
	}

	// Fetch graph nodes from Qdrant
	async function fetchGraph() {
		loading = true;
		try {
			const res = await fetch('/api/phase89/graph');
			const data = await res.json();
			graphNodes = data.nodes || [];
		} catch (err) {
			console.error('Failed to fetch graph:', err);
		} finally {
			loading = false;
		}
	}

	// Vector search with embeddinggemma + cosine similarity
	async function vectorSearch() {
		if (!searchQuery.trim()) return;

		loading = true;
		try {
			const res = await fetch('/api/phase89/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: searchQuery,
					top_k: 10,
					similarity: 'cosine'
				})
			});
			const data = await res.json();
			searchResults = data.results || [];
		} catch (err) {
			console.error('Search failed:', err);
		} finally {
			loading = false;
		}
	}

	// Run clustering pipeline
	async function runClustering() {
		loading = true;
		try {
			const res = await fetch('/api/phase89/pipeline', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'cluster' })
			});
			const data = await res.json();
			if (data.success) {
				await fetchClusters();
				await fetchStatus();
			}
		} catch (err) {
			console.error('Clustering failed:', err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchStatus();
		fetchClusters();
		fetchGraph();
	});
</script>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white p-8">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
				Phase 89: Agentic Error Analysis
			</h1>
			<p class="text-gray-400">GPU Clustering • Graph Analysis • Vector Search</p>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
			<div class="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-purple-500/20">
				<div class="text-sm text-gray-400 mb-1">Total Errors</div>
				<div class="text-3xl font-bold text-purple-400">{stats.total_errors.toLocaleString()}</div>
			</div>

			<div class="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-blue-500/20">
				<div class="text-sm text-gray-400 mb-1">Clusters Found</div>
				<div class="text-3xl font-bold text-blue-400">{stats.total_clusters}</div>
			</div>

			<div class="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-green-500/20">
				<div class="text-sm text-gray-400 mb-1">Code Units</div>
				<div class="text-3xl font-bold text-green-400">{stats.total_nodes.toLocaleString()}</div>
			</div>

			<div class="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-pink-500/20">
				<div class="text-sm text-gray-400 mb-1">Vector Points</div>
				<div class="text-3xl font-bold text-pink-400">{stats.qdrant_points.toLocaleString()}</div>
			</div>
		</div>

		<!-- Main Tabs -->
		<TabsRoot value="search" class="w-full">
			<TabsList class="flex gap-2 mb-6 border-b border-gray-700 pb-2">
				<TabsTrigger
					value="search"
					class="px-4 py-2 rounded-t data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=inactive]:text-gray-400 transition-colors"
				>
					🔍 Vector Search
				</TabsTrigger>

				<TabsTrigger
					value="clusters"
					class="px-4 py-2 rounded-t data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=inactive]:text-gray-400 transition-colors"
				>
					📊 Clusters
				</TabsTrigger>

				<TabsTrigger
					value="graph"
					class="px-4 py-2 rounded-t data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=inactive]:text-gray-400 transition-colors"
				>
					🕸️ Graph Analysis
				</TabsTrigger>

				<TabsTrigger
					value="pipeline"
					class="px-4 py-2 rounded-t data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=inactive]:text-gray-400 transition-colors"
				>
					⚡ Pipeline
				</TabsTrigger>
			</TabsList>

			<!-- Vector Search Tab -->
			<TabsContent value="search" class="bg-gray-800/30 backdrop-blur rounded-lg p-6 border border-gray-700">
				<h2 class="text-2xl font-bold mb-4">Semantic Vector Search</h2>
				<p class="text-gray-400 mb-6">
					Search errors using embeddinggemma:latest (768-dim) with cosine similarity ranking
				</p>

				<div class="flex gap-4 mb-6">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search for errors (e.g., 'svelte5 runes type error')"
						class="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
						onkeydown={(e) => e.key === 'Enter' && vectorSearch()}
					/>
					<button
						onclick={vectorSearch}
						disabled={loading}
						class="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold disabled:opacity-50 transition-colors"
					>
						{loading ? '🔄 Searching...' : '🔍 Search'}
					</button>
				</div>

				{#if searchResults.length > 0}
					<div class="space-y-4">
						{#each searchResults as result}
							<div class="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
								<div class="flex justify-between items-start mb-2">
									<div class="text-sm text-gray-400">Score: {result.score.toFixed(4)}</div>
									<div class="flex gap-2">
										{#if result.payload?.tags}
											{#each result.payload.tags.slice(0, 3) as tag}
												<span class="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
													{tag}
												</span>
											{/each}
										{/if}
									</div>
								</div>
								<div class="text-white font-mono text-sm">
									{result.payload?.file_path || result.payload?.message || 'No details'}
								</div>
							</div>
						{/each}
					</div>
				{:else if searchQuery}
					<div class="text-center text-gray-400 py-12">
						No results found. Try a different query.
					</div>
				{/if}
			</TabsContent>

			<!-- Clusters Tab -->
			<TabsContent value="clusters" class="bg-gray-800/30 backdrop-blur rounded-lg p-6 border border-gray-700">
				<div class="flex justify-between items-center mb-6">
					<h2 class="text-2xl font-bold">Error Clusters</h2>
					<button
						onclick={fetchClusters}
						disabled={loading}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
					>
						🔄 Refresh
					</button>
				</div>

				{#if clusters.length > 0}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each clusters as cluster}
							<DialogRoot>
								<Dialog.Trigger class="text-left">
									<div class="bg-gray-700/50 rounded-lg p-4 border border-gray-600 hover:border-purple-500 transition-colors cursor-pointer">
										<div class="flex justify-between items-start mb-2">
											<div class="text-lg font-bold text-purple-400">Cluster {cluster.id}</div>
											<div class="text-sm text-gray-400">{cluster.error_count} errors</div>
										</div>

										<div class="flex gap-2 mb-2 flex-wrap">
											{#each cluster.tags.slice(0, 4) as tag}
												<span class="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
													{tag}
												</span>
											{/each}
										</div>

										<p class="text-sm text-gray-300 line-clamp-2">
											{cluster.summary}
										</p>
									</div>
								</Dialog.Trigger>

								<DialogPortal>
									<DialogOverlay class="fixed inset-0 bg-black/50 backdrop-blur-sm" />
									<DialogContent class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-purple-500">
										<DialogTitle class="text-2xl font-bold mb-4">Cluster {cluster.id}</DialogTitle>

										<div class="mb-4">
											<div class="text-sm text-gray-400 mb-2">Tags:</div>
											<div class="flex gap-2 flex-wrap">
												{#each cluster.tags as tag}
													<span class="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
														{tag}
													</span>
												{/each}
											</div>
										</div>

										<div class="mb-4">
											<div class="text-sm text-gray-400 mb-2">Summary:</div>
											<p class="text-white">{cluster.summary}</p>
										</div>

										<div class="mb-4">
											<div class="text-sm text-gray-400 mb-2">Error IDs ({cluster.error_count}):</div>
											<div class="bg-gray-700 rounded p-3 font-mono text-xs">
												{cluster.error_ids.slice(0, 20).join(', ')}
												{#if cluster.error_count > 20}...{/if}
											</div>
										</div>

										<DialogClose class="absolute top-4 right-4 text-gray-400 hover:text-white">
											✕
										</DialogClose>
									</DialogContent>
								</DialogPortal>
							</DialogRoot>
						{/each}
					</div>
				{:else}
					<div class="text-center text-gray-400 py-12">
						No clusters found. Run the clustering pipeline first.
					</div>
				{/if}
			</TabsContent>

			<!-- Graph Analysis Tab -->
			<TabsContent value="graph" class="bg-gray-800/30 backdrop-blur rounded-lg p-6 border border-gray-700">
				<h2 class="text-2xl font-bold mb-4">Codebase Dependency Graph</h2>
				<p class="text-gray-400 mb-6">
					Visualize error propagation through import dependencies
				</p>

				{#if graphNodes.length > 0}
					<div class="space-y-2">
						{#each graphNodes.slice(0, 20) as node}
							<div class="bg-gray-700/50 rounded p-3 border border-gray-600">
								<div class="flex justify-between items-center">
									<div class="font-mono text-sm text-purple-300">{node.file_path}</div>
									<div class="text-xs text-gray-400">{node.error_count} errors</div>
								</div>
								{#if node.dependencies.length > 0}
									<div class="text-xs text-gray-500 mt-1">
										→ {node.dependencies.length} dependencies
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center text-gray-400 py-12">
						No graph data available. Index codebase first.
					</div>
				{/if}
			</TabsContent>

			<!-- Pipeline Tab -->
			<TabsContent value="pipeline" class="bg-gray-800/30 backdrop-blur rounded-lg p-6 border border-gray-700">
				<h2 class="text-2xl font-bold mb-4">Clustering Pipeline</h2>

				<div class="space-y-4">
					<button
						onclick={runClustering}
						disabled={loading}
						class="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg font-semibold disabled:opacity-50 transition-colors"
					>
						{loading ? '🔄 Running Pipeline...' : '🚀 Run GPU Clustering'}
					</button>

					<div class="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
						<h3 class="font-bold mb-2">Pipeline Steps:</h3>
						<ol class="list-decimal list-inside space-y-2 text-sm text-gray-300">
							<li>Stream errors from PostgreSQL (batch_size=5000)</li>
							<li>Generate embeddings with embeddinggemma:latest (768-dim)</li>
							<li>CUDA GPU clustering with DBSCAN (cosine similarity)</li>
							<li>LLM summarization with Ollama gemma3-legal</li>
							<li>Auto-tag with ripgrep pattern detection</li>
							<li>Store in Qdrant for vector search</li>
							<li>Update copilot.md knowledge base</li>
						</ol>
					</div>
				</div>
			</TabsContent>
		</TabsRoot>
	</div>
</div>

<style>
	:global(body) {
		@apply bg-gray-900;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
