<script lang="ts">
	let tag = $state<any>(undefined);

	import { Button, ButtonRoot, Dialog, DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'bits-ui';
	import { onMount } from 'svelte';

	interface VectorCluster {
		id: number;
		cluster_id: number;
		pattern: string;
		error_count: number;
		avg_similarity: number;
		file_paths: string[];
		summary: string;
		tags: string[];
		embedding: number[];
	}

	interface GraphNode {
		id: string;
		label: string;
		type: 'file' | 'error' | 'cluster' | 'fix';
		cluster_id?: number;
		similarity?: number;
		tags: string[];
		fix_status?: 'pending' | 'in-progress' | 'applied' | 'failed';
	}

	interface GraphEdge {
		source: string;
		target: string;
		weight: number;
		type: 'similarity' | 'dependency' | 'fix-attempt';
	}

	let clusters = $state<VectorCluster[]>([]);
	let selectedCluster = $state<VectorCluster | null>(null);
	let similarClusters = $state<VectorCluster[]>([]);
	let searchQuery = $state('');
	let searchResults = $state<VectorCluster[]>([]);
	let loading = $state(true);
	let detailsOpen = $state(false);
	let fixDialogOpen = $state(false);
	let agenticFixStatus = $state<string>('');

	// Graph visualization state
	let graphNodes = $state<GraphNode[]>([]);
	let graphEdges = $state<GraphEdge[]>([]);
	let selectedNode = $state<GraphNode | null>(null);

	async function loadClusters() {
		try {
			loading = true;
			const response = await fetch('/api/phase89/clusters');
			if (!response.ok) throw new Error('Failed to load clusters');
			const data = await response.json();
			clusters = data.clusters || [];
			buildGraph(clusters);
		} catch (e) {
			console.error('Error loading clusters:', e);
		} finally {
			loading = false;
		}
	}

	function buildGraph(clusterData: VectorCluster[]) {
		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];

		// Create cluster nodes
		for (const cluster of clusterData) {
			nodes.push({
				id: `cluster-${cluster.cluster_id}`,
				label: cluster.pattern.substring(0, 30, type: 'cluster',
				cluster_id: cluster.cluster_id,
				tags: cluster.tags || []
			});
  
			for (const filePath of cluster.file_paths || []) {
				const fileId = `file-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
				if (!nodes.find((n) => n.id === fileId)) {
					nodes.push({
						id: fileId,
						label: filePath.split('/').pop() || filePath,
						type: 'file',
						tags: []
					});
				}

				edges.push({
					source: `cluster-${cluster.cluster_id}`,
					target: fileId,
					weight, cluster.avg_similarity || 0.5,
					type: 'similarity'
				});
			}
		}

		graphNodes = nodes;
		graphEdges = edges;
	}

	async function performVectorSearch() {
		if (!searchQuery.trim()) return;

		try {
			const response = await fetch('/api/phase89/vector-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: searchQuery,
					limit: 10,
					threshold: 0.7
				})
			});

			if (!response.ok) throw new Error('Vector search failed');
			const data = await response.json();
			searchResults = data.results || [];
		} catch (e) {
			console.error('Search error:', e);
		}
	}

	async function findSimilarClusters(cluster: VectorCluster) {
		try {
			const response = await fetch('/api/phase89/similar-clusters', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster_id: cluster.cluster_id,
					embedding: cluster.embedding,
					limit: 5
				})
			});

			if (!response.ok) throw new Error('Failed to find similar clusters');
			const data = await response.json();
			similarClusters = data.similar || [];
		} catch (e) {
			console.error('Error finding similar clusters:', e);
		}
	}

	async function initiateAgenticFix(cluster: VectorCluster) {
		try {
			agenticFixStatus = 'Starting agentic fix pipeline...';
			fixDialogOpen = true;

			const response = await fetch('/api/phase89/agentic-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster_id: cluster.cluster_id,
					pattern: cluster.pattern,
					file_paths: cluster.file_paths,
					context: {
						summary: cluster.summary,
						tags: cluster.tags,
						similar_clusters: similarClusters.map((c) => c.pattern)
					}
				})
			});

			if (!response.ok) throw new Error('Agentic fix failed');

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			while (reader) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = JSON.parse(line.substring(6));
						agenticFixStatus += `\n${data.message}`;
					}
				}
			}

			agenticFixStatus += '\n✅ Fix pipeline completed!';
		} catch (e) {
			agenticFixStatus += `\n❌ Error: ${e}`;
		}
	}

	function selectCluster(cluster: VectorCluster) {
		selectedCluster = cluster;
		detailsOpen = true;
		findSimilarClusters(cluster);
	}

	onMount(() => {
		loadClusters();
	});
</script>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-4xl font-bold text-white mb-2">
				🧠 Codebase Graph Analysis
			</h1>
			<p class="text-gray-300">
				Vector search, cluster analysis, and agentic error fixing with embeddinggemma:latest
			</p>
		</div>

		<!-- Vector Search -->
		<div class="mb-8 p-6 bg-gray-800/50 rounded-xl border border-gray-700">
			<h2 class="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
				<div class="i-carbon-search text-purple-400"></div>
				Vector Search (Cosine Similarity)
			</h2>

			<div class="flex gap-3 mb-4">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search errors, patterns, or tags..."
					class="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white
					       placeholder-gray-500 focus:border-purple-500 focus:outline-none"
					onkeydown={(e) => e.key === 'Enter' && performVectorSearch()}
				/>
				<ButtonRoot
					class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg
					       font-medium transition-colors"
					onclick={ performVectorSearch: performVectorSearch }
				>
					Search
				</ButtonRoot>
			</div>

			{#if searchResults.length > 0}
				<div class="space-y-2">
					<div class="text-sm text-gray-400 mb-2">
						Found {searchResults.length} results (ranked by cosine similarity)
					</div>
					{#each searchResults as result}
						<button
							class="w-full p-4 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700
							       text-left transition-colors"
							onclick={() => selectCluster(result)}
						>
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1">
									<div class="text-white font-medium mb-1">{result.pattern}</div>
									<div class="text-sm text-gray-400 mb-2">{result.summary}</div>
									<div class="flex gap-2 flex-wrap">
										{#each result.tags || [] as tag}
											<span class="px-2 py-1 text-xs bg-purple-900/30 text-purple-300 rounded">
												{tag}
											</span>
										{/each}
									</div>
								</div>
								<div class="text-right">
									<div class="text-sm text-gray-400">Similarity</div>
									<div class="text-2xl font-bold text-purple-400">
										{(result.avg_similarity * 100).toFixed(1)}%
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Cluster Grid -->
		<div class="mb-8">
			<h2 class="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
				<div class="i-carbon-data-view-alt text-purple-400"></div>
				Error Clusters ({clusters.length})
			</h2>

			{#if loading}
				<div class="text-center py-12 text-gray-400">
					<div class="i-carbon-refresh text-4xl animate-spin mx-auto mb-2"></div>
					Loading clusters...
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each clusters as cluster}
						<button
							class="p-6 bg-gray-800/50 hover:bg-gray-800 rounded-xl border border-gray-700
							       text-left transition-all hover:border-purple-500"
							onclick={() => selectCluster(cluster)}
						>
							<div class="flex items-start justify-between mb-3">
								<div class="text-lg font-semibold text-white">
									Cluster #{cluster.cluster_id}
								</div>
								<div class="px-2 py-1 bg-purple-900/30 text-purple-300 rounded text-sm">
									{cluster.error_count} errors
								</div>
							</div>

							<div class="text-sm text-gray-400 mb-3 line-clamp-2">
								{cluster.pattern}
							</div>

							<div class="flex gap-2 flex-wrap mb-3">
								{#each (cluster.tags || []).slice(0, 3) as tag}
									<span class="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded">
										{tag}
									</span>
								{/each}
							</div>

							<div class="flex items-center gap-2 text-sm text-gray-500">
								<div class="i-carbon-chart-bar"></div>
								Avg Similarity: {(cluster.avg_similarity * 100).toFixed(1)}%
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Graph Visualization -->
		<div class="mb-8 p-6 bg-gray-800/50 rounded-xl border border-gray-700">
			<h2 class="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
				<div class="i-carbon-network-3 text-purple-400"></div>
				Dependency Graph
			</h2>

			<div class="p-4 bg-gray-900 rounded-lg min-h-64 flex items-center justify-center">
				<div class="text-gray-400 text-center">
					<div class="i-carbon-network-3 text-4xl mb-2"></div>
					<div>Graph visualization would render here</div>
					<div class="text-sm text-gray-500 mt-2">
						{graphNodes.length} nodes, {graphEdges.length} edges
					</div>
				</div>
			</div>
		</div>

		<!-- Cluster Details Dialog -->
		<DialogRoot bind:open={detailsOpen}>
			<DialogPortal>
				<DialogOverlay class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
				<DialogContent
					class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
					       w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 bg-gray-800 rounded-xl
					       shadow-2xl border border-gray-700"
				>
					{#if selectedCluster}
						<DialogTitle class="text-2xl font-bold text-white mb-4">
							Cluster #{selectedCluster.cluster_id} - {selectedCluster.pattern}
						</DialogTitle>

						<div class="space-y-6">
							<!-- Summary -->
							<div>
								<h3 class="text-lg font-semibold text-white mb-2">Summary</h3>
								<p class="text-gray-300">{selectedCluster.summary}</p>
							</div>

							<!-- Tags -->
							<div>
								<h3 class="text-lg font-semibold text-white mb-2">Tags</h3>
								<div class="flex gap-2 flex-wrap">
									{#each selectedCluster.tags || [] as tag}
										<span class="px-3 py-1 bg-purple-900/30 text-purple-300 rounded-lg">
											{tag}
										</span>
									{/each}
								</div>
							</div>

							<!-- Affected Files -->
							<div>
								<h3 class="text-lg font-semibold text-white mb-2">
									Affected Files ({selectedCluster.file_paths?.length || 0})
								</h3>
								<div class="space-y-1 max-h-40 overflow-y-auto">
									{#each selectedCluster.file_paths || [] as filePath}
										<div class="px-3 py-2 bg-gray-900 rounded text-sm text-gray-300 font-mono">
											{filePath}
										</div>
									{/each}
								</div>
							</div>

							<!-- Similar Clusters -->
							{#if similarClusters.length > 0}
								<div>
									<h3 class="text-lg font-semibold text-white mb-2">Similar Clusters</h3>
									<div class="space-y-2">
										{#each similarClusters as similar}
											<button
												class="w-full p-3 bg-gray-900 hover:bg-gray-700 rounded-lg text-left
												       transition-colors"
												onclick={() => selectCluster(similar)}
											>
												<div class="flex justify-between items-start">
													<div class="text-white text-sm">{similar.pattern}</div>
													<div class="text-purple-400 text-sm">
														{(similar.avg_similarity * 100).toFixed(1)}%
													</div>
												</div>
											</button>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Actions -->
							<div class="flex gap-3 pt-4 border-t border-gray-700">
								<ButtonRoot
									class="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg
									       font-medium transition-colors flex items-center justify-center gap-2"
									onclick={() => initiateAgenticFix(selectedCluster)}
								>
									<div class="i-carbon-machine-learning"></div>
									Agentic Fix
								</ButtonRoot>
								<ButtonRoot
									class="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg
									       transition-colors"
									onclick={() => (detailsOpen = false)}
								>
									Close
								</ButtonRoot>
							</div>
						</div>
					{/if}

					<DialogClose
						class="absolute top-4 right-4 p-2 hover:bg-gray-700 rounded-lg transition-colors"
					>
						<div class="i-carbon-close text-xl text-gray-400"></div>
					</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>

		<!-- Agentic Fix Status Dialog -->
		<DialogRoot bind:open={fixDialogOpen}>
			<DialogPortal>
				<DialogOverlay class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
				<DialogContent
					class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
					       w-full max-w-2xl p-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700"
				>
					<DialogTitle class="text-2xl font-bold text-white mb-4">
						🤖 Agentic Fix Pipeline
					</DialogTitle>

					<div class="mb-6">
						<pre
							class="p-4 bg-gray-900 rounded-lg text-sm text-gray-300 max-h-96 overflow-y-auto
							       font-mono whitespace-pre-wrap"
						>{agenticFixStatus}</pre>
					</div>

					<ButtonRoot
						class="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg
						       transition-colors"
						onclick={() => (fixDialogOpen = false)}
					>
						Close
					</ButtonRoot>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
	</div>
</div>
