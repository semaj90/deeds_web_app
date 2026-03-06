<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { BitsUI } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	interface Cluster { id: number, error_count: number;
		tags: string[];
		summary: string;
		error_ids: number[];
		centroid?: number[];
	}

	interface GraphNode { id: string, file_path: string;
		error_count: number;
		dependencies: string[];
	}

	interface VectorSearchResult { id: string, score: number;
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
				total_errors: data.postgres?.legal_ai?.error_instances ?? 0,
				total_clusters: 0,
				total_nodes: data.qdrant?.phase89_code_units ?? 0,
				qdrant_points: data.qdrant?.total_points ?? 0
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
				body: JSON.stringify({ query: searchQuery,
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

	$effect(() => {

		fetchStatus();
		fetchClusters();
		fetchGraph();

	});
</script>

<div class="min-h-screen p-8">
	<div class="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-4xl font-bold mb-2 text-black tracking-wide uppercase">
				PHASE 89: AGENTIC ERROR ANALYSIS
			</h1>
			<p class="text-black/60">GPU Clustering • Graph Analysis • Vector Search</p>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
			<div class="bg-panel backdrop-blur rounded-lg p-6 border border-black/20">
				<div class="text-sm text-black/60 mb-1">Total Errors</div>
				<div class="text-3xl font-bold text-accent">{stats.total_errors.toLocaleString()}</div>
			</div>

			<div class="bg-panel backdrop-blur rounded-lg p-6 border border-black/20">
				<div class="text-sm text-black/60 mb-1">Clusters Found</div>
				<div class="text-3xl font-bold text-accent">{stats.total_clusters}</div>
			</div>

			<div class="bg-panel backdrop-blur rounded-lg p-6 border border-black/20">
				<div class="text-sm text-black/60 mb-1">Code Units</div>
				<div class="text-3xl font-bold text-accent">{stats.total_nodes.toLocaleString()}</div>
			</div>

			<div class="bg-panel backdrop-blur rounded-lg p-6 border border-black/20">
				<div class="text-sm text-black/60 mb-1">Vector Points</div>
				<div class="text-3xl font-bold text-accent">{stats.qdrant_points.toLocaleString()}</div>
			</div>
		</div>

		<!-- Main Tabs -->
		<Tabs.Root value="search" class="w-full">
			<Tabs.List class="flex gap-2 border-b border-black/20 mb-6">
				<Tabs.Trigger
					value="search"
					class="px-4 py-2 rounded-t data-[state=active]:bg-accent data-[state=active]:text-white data-[state=inactive]:text-black/60 transition-colors"
				>
					🔍 Semantic Search
				</Tabs.Trigger>

				<Tabs.Trigger
					value="clusters"
					class="px-4 py-2 rounded-t data-[state=active]:bg-accent data-[state=active]:text-white data-[state=inactive]:text-black/60 transition-colors"
				>
					📊 Clusters
				</Tabs.Trigger>

				<Tabs.Trigger
					value="graph"
					class="px-4 py-2 rounded-t data-[state=active]:bg-accent data-[state=active]:text-white data-[state=inactive]:text-black/60 transition-colors"
				>
					🕸️ Graph Analysis
				</Tabs.Trigger>

				<Tabs.Trigger
					value="pipeline"
					class="px-4 py-2 rounded-t data-[state=active]:bg-accent data-[state=active]:text-white data-[state=inactive]:text-black/60 transition-colors"
				>
					⚡ Pipeline
				</Tabs.Trigger>
			</Tabs.List>

			<!-- Vector Search Tab -->
			<Tabs.Content value="search" class="bg-sand/10 backdrop-blur rounded-lg p-6 border border-black/20">
				<h2 class="text-2xl font-bold mb-4 text-black">Semantic Vector Search</h2>
				<p class="text-black/60 mb-6">
					Search errors using embeddinggemma:latest (768-dim) with cosine similarity ranking
				</p>

				<div class="flex gap-4 mb-6">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search for errors (e.g., 'svelte5 runes type error')"
						class="flex-1 bg-panel text-black px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder-black/40"
						onkeydown={(e) => e.key === 'Enter' && vectorSearch()}
					/>
					<button
						onclick={vectorSearch}
						disabled={loading}
						class="px-6 py-3 bg-accent hover:bg-accent/90 text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
					>
						{loading ? '🔄 Searching...' : '🔍 Search'}
					</button>
				</div>

				{#if searchResults.length > 0}
					<div class="space-y-4">
						{#each searchResults as result}
							<div class="bg-panel rounded-lg p-4 border border-black/20">
								<div class="flex justify-between items-start mb-2">
									<div class="text-sm text-black/60">Score: {result.score.toFixed(4)}</div>
									<div class="flex gap-2">
										{#if result.payload?.tags}
											{#each result.payload.tags.slice(0, 3) as tag}
												<span class="text-xs bg-accent/20 text-black px-2 py-1 rounded">
													{tag}
												</span>
											{/each}
										{/if}
									</div>
								</div>
								<div class="text-black font-mono text-sm">
									{(result.payload?.file_path ?? result.payload?.message) || 'No details'}
								</div>
							</div>
						{/each}
					</div>
				{:else if searchQuery}
					<div class="text-center text-black/60 py-12">
						No results found. Try a different query.
					</div>
				{/if}
			</Tabs.Content>

			<!-- Clusters Tab -->
			<Tabs.Content value="clusters" class="bg-sand/10 backdrop-blur rounded-lg p-6 border border-black/20">
				<div class="flex justify-between items-center mb-6">
					<h2 class="text-2xl font-bold text-black">Error Clusters</h2>
					<button
						onclick={fetchClusters}
						disabled={loading}
						class="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg disabled:opacity-50 transition-colors"
					>
						🔄 Refresh
					</button>
				</div>

				{#if clusters.length > 0}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each clusters as cluster}
							<Dialog.Root>
								<Dialog.Trigger class="text-left">
									<div class="bg-panel rounded-lg p-4 border border-black/20 hover:border-accent transition-colors cursor-pointer">
										<div class="flex justify-between items-start mb-2">
											<div class="text-lg font-bold text-accent">Cluster {cluster.id}</div>
											<div class="text-sm text-black/60">{cluster.error_count} errors</div>
										</div>

										<div class="flex gap-2 mb-2 flex-wrap">
											{#each cluster.tags.slice(0, 4) as tag}
												<span class="text-xs bg-accent/20 text-black px-2 py-1 rounded">
													{tag}
												</span>
											{/each}
										</div>

										<p class="text-sm text-black/80 line-clamp-2">
											{cluster.summary}
										</p>
									</div>
								</Dialog.Trigger>

								<Dialog.Portal>
									<Dialog.Overlay class="fixed inset-0 bg-black/10 backdrop-blur-sm" />
									<Dialog.Content class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-panel rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-accent">
										<Dialog.Title class="text-2xl font-bold mb-4 text-black">Cluster {cluster.id}</Dialog.Title>

										<div class="mb-4">
											<div class="text-sm text-black/60 mb-2">Tags:</div>
											<div class="flex gap-2 flex-wrap">
												{#each cluster.tags as tag}
													<span class="text-xs bg-accent/20 text-black px-2 py-1 rounded">
														{tag}
													</span>
												{/each}
											</div>
										</div>

										<div class="mb-4">
											<div class="text-sm text-black/60 mb-2">Summary:</div>
											<p class="text-black">{cluster.summary}</p>
										</div>

										<div class="mb-4">
											<div class="text-sm text-black/60 mb-2">Error IDs ({cluster.error_count}):</div>
											<div class="bg-sand/20 rounded p-3 font-mono text-xs text-black/80">
												{cluster.error_ids.slice(0, 20).join(', ')}
												{#if cluster.error_count > 20}...{/if}
											</div>
										</div>

										<Dialog.Close class="absolute top-4 right-4 text-black/60 hover:text-black">
											✕
										</Dialog.Close>
									</Dialog.Content>
								</Dialog.Portal>
							</Dialog.Root>
						{/each}
					</div>
				{:else}
					<div class="text-center text-black/60 py-12">
						No clusters found. Run the clustering pipeline first.
					</div>
				{/if}
			</Tabs.Content>

			<!-- Graph Analysis Tab -->
			<Tabs.Content value="graph" class="bg-sand/10 backdrop-blur rounded-lg p-6 border border-black/20">
				<h2 class="text-2xl font-bold mb-4 text-black">Codebase Dependency Graph</h2>
				<p class="text-black/60 mb-6">
					Visualize error propagation through import dependencies
				</p>

				{#if graphNodes.length > 0}
					<div class="space-y-2">
						{#each graphNodes.slice(0, 20) as node}
							<div class="bg-panel rounded p-3 border border-black/20">
								<div class="flex justify-between items-center">
									<div class="font-mono text-sm text-accent">{node.file_path}</div>
									<div class="text-xs text-black/60">{node.error_count} errors</div>
								</div>
								{#if node.dependencies.length > 0}
									<div class="text-xs text-black/50 mt-1">
										→ {node.dependencies.length} dependencies
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center text-black/60 py-12">
						No graph data available. Index codebase first.
					</div>
				{/if}
			</Tabs.Content>

			<!-- Pipeline Tab -->
			<Tabs.Content value="pipeline" class="bg-sand/10 backdrop-blur rounded-lg p-6 border border-black/20">
				<h2 class="text-2xl font-bold mb-4 text-black">Phase 89 Pipeline</h2>

				<div class="space-y-4">
					<button
						onclick={runClustering}
						disabled={loading}
						class="w-full px-6 py-4 bg-accent hover:bg-accent/90 text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
					>
						{loading ? '🚀 Pipeline Running...' : '🔥 Start All-in-One Analysis Pipeline'}
					</button>

					<div class="bg-sand/20 rounded-lg p-4 border border-black/20">
						<h3 class="font-bold mb-2 text-black">Pipeline Steps:</h3>
						<ol class="list-decimal list-inside space-y-2 text-sm text-black/80">
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
			</Tabs.Content>
		</Tabs.Root>
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
