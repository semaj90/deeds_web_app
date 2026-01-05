<script lang="ts">
	let tag = $state<any>(undefined);
	let log = $state<any>(undefined);

	import { onDestroy, onMount } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// Tabs state
	let activeTab = $state<'search' | 'clusters' | 'graph' | 'pipeline'>('search');

	// Search state
	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let isSearching = $state(false);

	// Clusters state
	let clusters = $state<Cluster[]>(data.clusters || []);
	let selectedCluster = $state<Cluster | null>(null);

	// Merge summaries into clusters
	$effect(() => {
		if (data.summaries && clusters.length > 0) {
			const summaryMap = new Map(data.summaries.map((s: any) => {
				const meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : s.metadata;
				// Handle both string and number cluster_id
				return [String(meta.cluster_id), s];
			}));

			clusters = clusters.map(c => {
				const summary = summaryMap.get(String(c.cluster_id));
				if (summary) {
					return {
						...c,
						title: summary.title,
						description: summary.description,
						tags: summary.tags
					};
				}
				return c;
			});
		}
	});
  
	let graphNodes = $state<GraphNode[]>([]);
	let graphEdges = $state<GraphEdge[]>([]);

	// Pipeline state
	let pipelineStatus = $state<'idle' | 'running' | 'complete'>('idle');
	let pipelineProgress = $state(0);
	let pipelineLogs = $state<string[]>([]);

	// Real-time SSE
	let eventSource: EventSource | null = null;

	interface SearchResult {
		id: string;
		score: number;
		text: string;
		source: string;
		tags: string[];
		cluster_id?: number;
	}

	interface Cluster {
		cluster_id: number;
		error_count: number;
		first_seen: string;
		last_seen: string;
		sample_message: string;
		sample_source: string;
		// Optional fields from KB cards
		title?: string;
		description?: string;
		tags?: string[];
	}

	interface GraphNode {
		id: string;
		label: string;
		type: 'component' | 'module' | 'route' | 'error';
		errorCount: number;
	}

	interface GraphEdge {
		from: string;
		to: string;
		type: 'imports' | 'uses' | 'depends';
	}

	// Vector search with embeddinggemma
	async function performSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		try {
			// First get embedding from Ollama
			const embedRes = await fetch('http://localhost:11434/api/embed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'embeddinggemma:latest', input: searchQuery })
			});

			if (!embedRes.ok) throw new Error('Embedding failed');
			const embedData = await embedRes.json();
			const vector = embedData.embeddings?.[0] || embedData.embedding;

			// Search Qdrant with cosine similarity
			const searchRes = await fetch('http://localhost:6333/collections/phase89_error_chunks/points/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vector,
					limit: 20,
					with_payload: true,
					score_threshold: 0.5
				})
			});

			if (!searchRes.ok) throw new Error('Search failed');
			const searchData = await searchRes.json();

			searchResults = (searchData.result || []).map((r: any) => ({
				id: r.id,
				score: r.score,
				text: r.payload?.raw_text || r.payload?.text || '',
				source: r.payload?.source || '',
				tags: r.payload?.tags || r.payload?.auto_tags || [],
				cluster_id: r.payload?.cluster_id
			}));
		} catch (e) {
			console.error('Search error:', e);
		} finally {
			isSearching = false;
		}
	}

	// Fetch clusters from Qdrant
	async function fetchClusters() {
		try {
			const res = await fetch('http://localhost:6333/collections/phase89_error_clusters/points/scroll', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ limit: 50, with_payload: true })
			});

			if (!res.ok) return;
			const data = await res.json();

			clusters = (data.result?.points || []).map((p: any) => ({
				cluster_id: p.payload?.cluster_id || p.id,
				cluster_size: p.payload?.cluster_size || 0,
				pattern_name: p.payload?.pattern_name || '',
				root_cause: p.payload?.root_cause || '',
				fix_strategy: p.payload?.fix_strategy || '',
				priority: p.payload?.priority || 'medium',
				tags: p.payload?.tags || [],
				sources: p.payload?.sources || [],
				sample_errors: p.payload?.sample_errors || []
			}));
		} catch (e) {
			console.error('Fetch clusters error:', e);
		}
	}

	// Fetch graph data
	async function fetchGraph() {
		try {
			const res = await fetch('/api/phase89/topology');
			if (!res.ok) return;
			const data = await res.json();

			graphNodes = data.nodes || [];
			graphEdges = data.edges || [];
		} catch (e) {
			console.error('Fetch graph error:', e);
		}
	}

	// Run pipeline
	async function runPipeline() {
		pipelineStatus = 'running';
		pipelineProgress = 0;
		pipelineLogs = ['Starting CUDA clustering pipeline...'];

		try {
			const res = await fetch('/api/phase89/pipeline', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'cluster', chunkSize: 500 })
			});

			if (res.ok) {
				pipelineLogs = [...pipelineLogs, 'Pipeline submitted successfully'];

				// Poll for progress
				const pollInterval = setInterval(async () => {
					try {
						const statusRes = await fetch('/api/phase89/status');
						if (statusRes.ok) {
							const status = await statusRes.json();
							pipelineProgress = status.progress || 0;
							if (status.complete) {
								clearInterval(pollInterval);
								pipelineStatus = 'complete';
								pipelineLogs = [...pipelineLogs, `Complete! Processed ${status.processed} errors`];
							}
						}
					} catch {}
				}, 2000);
			}
		} catch (e) {
			pipelineLogs = [...pipelineLogs, `Error: ${e}`];
			pipelineStatus = 'idle';
		}
	}

	// Trigger agentic fix for cluster
	async function triggerAgenticFix(cluster: Cluster) {
		try {
			const res = await fetch('/api/phase89/fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster_id: cluster.cluster_id,
					strategy: cluster.fix_strategy,
					ace_context: true
				})
			});

			if (res.ok) {
				pipelineLogs = [...pipelineLogs, `Started agentic fix for cluster ${cluster.cluster_id}`];
			}
		} catch (e) {
			console.error('Agentic fix error:', e);
		}
	}

	// Connect SSE for real-time updates
	function connectSSE() {
		if (typeof window !== 'undefined') {
			eventSource = new EventSource('/api/phase89/stream');

			eventSource.onmessage = (e) => {
				try {
					const data = JSON.parse(e.data);
					if (data.type === 'progress') {
						pipelineProgress = data.progress;
					} else if (data.type === 'log') {
						pipelineLogs = [...pipelineLogs.slice(-49), data.message];
					} else if (data.type === 'cluster_update') {
						fetchClusters();
					}
				} catch {}
			};

			eventSource.onerror = () => {
				eventSource?.close();
				setTimeout(connectSSE, 5000);
			};
		}
	}

	onMount(() => {
		fetchClusters();
		fetchGraph();
		connectSSE();
	});

	onDestroy(() => {
		eventSource?.close();
	});
</script>

<svelte:head>
	<title>Phase 89: ACE Admin | Vector Search & Analysis</title>
</svelte:head>

<div class="container">
	<header class="header">
		<h1>🔬 Phase 89: ACE Admin</h1>
		<span class="subtitle">Vector Search • Clustering • Graph Analysis • Agentic Fixing</span>
	</header>

	<!-- Tab Navigation -->
	<nav class="tabs">
		<button class="tab" class:active={activeTab === 'search'} onclick={() => activeTab = 'search'}>
			🔍 Vector Search
		</button>
		<button class="tab" class:active={activeTab === 'clusters'} onclick={() => activeTab = 'clusters'}>
			📊 Clusters
		</button>
		<button class="tab" class:active={activeTab === 'graph'} onclick={() => activeTab = 'graph'}>
			🕸️ Graph Analysis
		</button>
		<button class="tab" class:active={activeTab === 'pipeline'} onclick={() => activeTab = 'pipeline'}>
			🚀 Pipeline
		</button>
	</nav>

	<main class="main-content">
		<!-- Vector Search Tab -->
		{#if activeTab === 'search'}
			<section class="search-section">
				<div class="search-box">
					<input
						type="text"
						placeholder="Search errors with embeddinggemma (768-dim cosine similarity)..."
						bind:value={searchQuery}
						onkeydown={(e) => e.key === 'Enter' && performSearch()}
						class="search-input"
					/>
					<button onclick={performSearch} class="search-btn" disabled={isSearching}>
						{isSearching ? '⏳' : '🔍'} Search
					</button>
				</div>

				<div class="results-grid">
					{#each searchResults as result (result.id)}
						<div class="result-card" style="--score: {result.score}">
							<div class="result-header">
								<span class="score">{(result.score * 100).toFixed(1)}%</span>
								<span class="source">{result.source}</span>
							</div>
							<p class="result-text">{result.text.slice(0, 200)}...</p>
							<div class="result-tags">
								{#each result.tags.slice(0, 5) as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						</div>
					{/each}
					{#if searchResults.length === 0 && !isSearching}
						<p class="no-results">Enter a query to search 40K+ embedded errors</p>
					{/if}
				</div>
			</section>
		{/if}

		<!-- Clusters Tab -->
		{#if activeTab === 'clusters'}
			<section class="clusters-section">
				<div class="clusters-grid">
					{#each clusters as cluster (cluster.cluster_id)}
						<button
							class="cluster-card"
							class:selected={selectedCluster?.cluster_id === cluster.cluster_id}
							onclick={() => selectedCluster = cluster}
						>
							<div class="cluster-header">
								<span class="cluster-id">Cluster {cluster.cluster_id}</span>
								<span class="cluster-size">{cluster.error_count} errors</span>
							</div>
							<h3>{cluster.title || 'Untitled Cluster'}</h3>
							<p class="root-cause">{(cluster.description || cluster.sample_message || '').slice(0, 100)}...</p>
							<div class="cluster-tags">
								{#each (cluster.tags || []).slice(0, 4) as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						</button>
					{/each}
				</div>

				{#if selectedCluster}
					<div class="cluster-detail">
						<h2>Cluster {selectedCluster.cluster_id} Details</h2>
						<dl class="detail-grid">
							<dt>Title</dt>
							<dd>{selectedCluster.title || 'Untitled'}</dd>
							<dt>Description</dt>
							<dd>{selectedCluster.description || selectedCluster.sample_message}</dd>
							<dt>Sample Source</dt>
							<dd>{selectedCluster.sample_source}</dd>
							<dt>First Seen</dt>
							<dd>{new Date(selectedCluster.first_seen).toLocaleString()}</dd>
							<dt>Last Seen</dt>
							<dd>{new Date(selectedCluster.last_seen).toLocaleString()}</dd>
						</dl>
						<form method="POST" action="?/analyze">
							<input type="hidden" name="clusterId" value={selectedCluster.cluster_id} />
							<button type="submit" class="fix-btn">
								🧠 Analyze with Gemini
							</button>
						</form>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Graph Analysis Tab -->
		{#if activeTab === 'graph'}
			<section class="graph-section">
				<div class="graph-stats">
					<div class="stat">
						<span class="stat-value">{graphNodes.length}</span>
						<span class="stat-label">Nodes</span>
					</div>
					<div class="stat">
						<span class="stat-value">{graphEdges.length}</span>
						<span class="stat-label">Edges</span>
					</div>
					<div class="stat">
						<span class="stat-value">{graphNodes.filter(n => n.errorCount > 0).length}</span>
						<span class="stat-label">With Errors</span>
					</div>
				</div>

				<div class="graph-container">
					<div class="graph-placeholder">
						<p>📊 Force-directed graph visualization</p>
						<p>Nodes: Components, Modules, Routes</p>
						<p>Edges: Imports, Dependencies</p>
						<p class="info">Use AST Topology Explorer for full interactive graph</p>
						<a href="/ast-topology" class="graph-link">Open AST Topology →</a>
					</div>
				</div>

				<div class="node-list">
					<h3>Top Error Nodes</h3>
					{#each graphNodes.filter(n => n.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount).slice(0, 10) as node (node.id)}
						<div class="node-item">
							<span class="node-type type-{node.type}">{node.type}</span>
							<span class="node-label">{node.label}</span>
							<span class="node-errors">{node.errorCount} errors</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Pipeline Tab -->
		{#if activeTab === 'pipeline'}
			<section class="pipeline-section">
				<div class="pipeline-controls">
					<button onclick={runPipeline} class="run-btn" disabled={pipelineStatus === 'running'}>
						{#if pipelineStatus === 'running'}
							⏳ Running...
						{:else}
							🚀 Run CUDA Pipeline
						{/if}
					</button>
					<button onclick={ fetchClusters: fetchClusters } class="refresh-btn">
						🔄 Refresh Clusters
					</button>
				</div>

				<div class="progress-bar">
					<div class="progress-fill" style="width: {pipelineProgress}%"></div>
					<span class="progress-text">{pipelineProgress}%</span>
				</div>

				<div class="pipeline-logs">
					<h3>Pipeline Logs</h3>
					<div class="log-container">
						{#each pipelineLogs as log}
							<div class="log-line">{log}</div>
						{/each}
					</div>
				</div>

				<div class="pipeline-info">
					<h3>Pipeline Configuration</h3>
					<ul>
						<li>🔥 GPU: RTX 3060 Ti (CUDA)</li>
						<li>📊 Embeddings: embeddinggemma:latest (768-dim)</li>
						<li>💾 Cache: Redis (7-day TTL)</li>
						<li>🎯 Clustering: DBSCAN with cosine similarity</li>
						<li>🧠 Summarization: gemma3-legal</li>
					</ul>
				</div>
			</section>
		{/if}
	</main>
</div>

<style>
	.container {
		min-height: 100vh;
		background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%);
		color: #e0e0e0;
		padding: 1.5rem;
		font-family: 'Inter', system-ui, sans-serif;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.header h1 {
		font-size: 2rem;
		background: linear-gradient(135deg, #00d4ff, #7c3aed, #ff6b6b);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		margin: 0;
	}

	.subtitle {
		color: #888;
		font-size: 0.875rem;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 0.5rem;
	}

	.tab {
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		color: #888;
		cursor: pointer;
		border-radius: 8px 8px 0 0;
		transition: all 0.2s;
	}

	.tab:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.05);
	}

	.tab.active {
		color: #00d4ff;
		background: rgba(0, 212, 255, 0.1);
		border-bottom: 2px solid #00d4ff;
	}

	.main-content {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		min-height: 60vh;
	}

	/* Search Section */
	.search-box {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.search-input {
		flex: 1;
		padding: 1rem 1.5rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		color: #fff;
		font-size: 1rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #00d4ff;
	}

	.search-btn {
		padding: 1rem 2rem;
		background: linear-gradient(135deg, #7c3aed, #00d4ff);
		border: none;
		border-radius: 12px;
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
	}

	.result-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		border-left: 3px solid hsl(calc(var(--score, 0.5) * 120), 70%, 50%);
	}

	.result-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.score {
		color: #10b981;
		font-weight: 600;
	}

	.source {
		color: #888;
		font-size: 0.75rem;
	}

	.result-text {
		font-size: 0.875rem;
		color: #ccc;
		margin: 0.5rem 0;
	}

	.result-tags, .cluster-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.tag {
		padding: 0.125rem 0.5rem;
		background: rgba(0, 212, 255, 0.2);
		border-radius: 4px;
		font-size: 0.625rem;
		color: #00d4ff;
	}

	.no-results {
		grid-column: 1 / -1;
		text-align: center;
		color: #888;
		padding: 3rem;
	}

	/* Clusters Section */
	.clusters-section {
		display: grid;
		grid-template-columns: 1fr 400px;
		gap: 1.5rem;
	}

	.clusters-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 1rem;
	}

	.cluster-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s;
		color: inherit;
	}

	.cluster-card:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.cluster-card.selected {
		border-color: #00d4ff;
	}

	.cluster-card.priority-high {
		border-left: 3px solid #ff6b6b;
	}

	.cluster-card.priority-medium {
		border-left: 3px solid #ffc107;
	}

	.cluster-card.priority-low {
		border-left: 3px solid #10b981;
	}

	.cluster-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: #888;
		margin-bottom: 0.5rem;
	}

	.cluster-card h3 {
		font-size: 0.875rem;
		margin: 0 0 0.5rem 0;
	}

	.root-cause {
		font-size: 0.75rem;
		color: #aaa;
		margin: 0 0 0.5rem 0;
	}

	.cluster-detail {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.cluster-detail h2 {
		font-size: 1.25rem;
		margin: 0 0 1rem 0;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		margin-bottom: 1rem;
	}

	.detail-grid dt {
		color: #888;
	}

	.detail-grid dd {
		margin: 0;
	}

	.fix-btn {
		width: 100%;
		padding: 1rem;
		background: linear-gradient(135deg, #10b981, #00d4ff);
		border: none;
		border-radius: 8px;
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}

	/* Graph Section */
	.graph-section {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 1.5rem;
	}

	.graph-stats {
		display: flex;
		gap: 1rem;
		grid-column: 1 / -1;
	}

	.stat {
		background: rgba(255, 255, 255, 0.05);
		padding: 1rem 2rem;
		border-radius: 8px;
		text-align: center;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #00d4ff;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #888;
	}

	.graph-container {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 12px;
		min-height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.graph-placeholder {
		text-align: center;
		color: #888;
	}

	.graph-link {
		display: inline-block;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, #7c3aed, #00d4ff);
		border-radius: 6px;
		color: #fff;
		text-decoration: none;
	}

	.node-list {
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		padding: 1rem;
	}

	.node-list h3 {
		font-size: 0.875rem;
		margin: 0 0 1rem 0;
	}

	.node-item {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.node-type {
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.625rem;
	}

	.type-component { background: rgba(124, 58, 237, 0.3); }
	.type-module { background: rgba(0, 212, 255, 0.3); }
	.type-route { background: rgba(16, 185, 129, 0.3); }
	.type-error { background: rgba(255, 107, 107, 0.3); }

	.node-label {
		flex: 1;
		font-size: 0.75rem;
	}

	.node-errors {
		color: #ff6b6b;
		font-size: 0.75rem;
	}

	/* Pipeline Section */
	.pipeline-controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.run-btn {
		padding: 1rem 2rem;
		background: linear-gradient(135deg, #ff6b6b, #ffc107);
		border: none;
		border-radius: 12px;
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}

	.refresh-btn {
		padding: 1rem 2rem;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 12px;
		color: #fff;
		cursor: pointer;
	}

	.progress-bar {
		height: 24px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		overflow: hidden;
		position: relative;
		margin-bottom: 1.5rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #7c3aed, #00d4ff);
		transition: width 0.3s;
	}

	.progress-text {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.pipeline-logs {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.log-container {
		max-height: 200px;
		overflow-y: auto;
		font-family: monospace;
		font-size: 0.75rem;
	}

	.log-line {
		padding: 0.25rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.pipeline-info {
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		padding: 1rem;
	}

	.pipeline-info h3 {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
	}

	.pipeline-info ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.pipeline-info li {
		padding: 0.5rem 0;
		font-size: 0.875rem;
	}

	.priority-high { color: #ff6b6b; }
	.priority-medium { color: #ffc107; }
	.priority-low { color: #10b981; }
</style>
