<script lang="ts">
  let { data }: { data: PageData } = $props();

	// Migrated to $effect
	import type { PageData } from './$types';

	// TODO: Convert to $props - // TODO: Convert to $props -

	// Tabs state
	let activeTab = $state<'search' | 'clusters' | 'graph' | 'pipeline' | 'analysis' | 'knowledge'>('search');

	// Search state
	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let isSearching = $state(false);

	// Clusters state
	let clusters = $state<Cluster[]>([]);
	let selectedCluster = $state<Cluster | null>(null);

	$effect(() => {
		if (clusters.length === 0 && data.clusters?.length) {
			clusters = [...data.clusters];
		}
	});

	// Merge summaries into clusters
	$effect(() => {
		if (data.summaries && clusters.length > 0) {
			const summaryMap = new Map<string, { title?: string; description?: string; tags?: string[] }>(data.summaries.map((s: any) => {
				const meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : s.metadata;
				// Handle both string and number cluster_id
				return [String(meta.cluster_id), s] as [string, { title?: string; description?: string; tags?: string[] }];
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

	interface SearchResult { id: string, score: number;
		text: string;
	source: string;
		tags: string[];
		cluster_id?: number;
	}

	interface Cluster { cluster_id: number, error_count: number;
		first_seen: string;
	last_seen: string;
		sample_message: string;
	sample_source: string;
		// Optional fields from KB cards
		title?: string;
		description?: string;
		tags?: string[];
		fix_strategy?: string;
	}

	interface GraphNode { id: string, label: string;
		type: 'component' | 'module' | 'route' | 'error';
		errorCount: number;
	}

	interface GraphEdge { from: string, to: string;
		type: 'imports' | 'uses' | 'depends';
	}

	// Vector search via server-side proxy (embeds + Qdrant search in one call)
	async function performSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		try {
			const res = await fetch('/api/phase89/vector-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQuery, limit: 20, threshold: 0.5 })
			});

			if (!res.ok) throw new Error('Search failed');
			const data = await res.json();

			searchResults = (data.results || []).map((r: any) => ({
				id: r.cluster_id ?? r.id,
				score: r.avg_similarity ?? r.score ?? 0,
				text: r.summary ?? r.pattern ?? '',
				source: (r.file_paths ?? [])[0] ?? '',
				tags: r.tags ?? [],
				cluster_id: r.cluster_id
			}));
		} catch (e) {
			console.error('Search error:', e);
		} finally {
			isSearching = false;
		}
	}

	// Fetch clusters via server-side API proxy
	async function fetchClusters() {
		try {
			const res = await fetch('/api/phase89/clusters');

			if (!res.ok) return;
			const data = await res.json();

			clusters = (data.clusters ?? data.result?.points ?? []).map((p: any) => ({
				cluster_id: p.cluster_id ?? p.payload?.cluster_id ?? p.id,
				cluster_size: p.error_count ?? p.payload?.cluster_size ?? 0,
				pattern_name: p.title ?? p.payload?.pattern_name ?? '',
				root_cause: p.description ?? p.payload?.root_cause ?? '',
				fix_strategy: p.fix_strategy ?? p.payload?.fix_strategy ?? '',
				priority: p.payload?.priority ?? 'medium',
				tags: p.payload?.tags ?? [],
				sources: p.payload?.sources ?? [],
				sample_errors: p.payload?.sample_errors ?? []
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
	body: JSON.stringify({
action: 'cluster', chunkSize: 500 })
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
				},
	2000);
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

	// ── Analysis / Recommendations ────────────────────────────────────────────
	interface AnalysisRec {
		priority: 'HIGH' | 'MED' | 'LOW';
		category: 'indexing' | 'retrieval' | 'health' | 'pipeline';
		title: string;
		detail: string;
		action: string;
		estimatedImpact: string;
	}
	interface AnalysisResult {
		metadata: { totalCollections: number; totalPoints: number; healthyCollections: number };
		knowledge: { collections: Array<{ name: string; points: number; status: string }> };
		recommendations: AnalysisRec[];
		clusterHealth: { totalClusters: number; errorEvents: number; codebaseChunksInQdrant: number; phase89ChunksInQdrant: number; phase90CardsInQdrant: number } | null;
		analysis: string | null;
	}

	let analysisData = $state<AnalysisResult | null>(null);
	let analysisLoading = $state(false);
	let analysisError = $state<string | null>(null);
	let reindexLoading = $state(false);
	let reindexMessage = $state<string | null>(null);
	let expandedRec = $state<number | null>(null);

	// ── Knowledge Base (Karpathy-tag + Obsidian export + LLM ACE Fix) ─────────

	interface KbStatus {
		vocabulary: string[];
		tagged: number;
		total: number;
		pct: number;
		semanticTagDist: Record<string, number>;
		model: string;
	}

	let kbStatus        = $state<KbStatus | null>(null);
	let kbLoading       = $state(false);
	let kbTagging       = $state(false);
	let kbTagMsg        = $state('');
	let kbExporting     = $state(false);
	let kbExportMsg     = $state('');
	let kbExportFolder  = $state('Codebase Intelligence');
	let kbExportTopN    = $state(150);
	let kbAceFix        = $state('');
	let kbAceFixLoading = $state(false);
	let kbAceErrorId    = $state('');
	let kbAceResult     = $state('');

	async function loadKbStatus() {
		kbLoading = true;
		try {
			const res = await fetch('/api/codebase-index/karpathy-tag');
			if (res.ok) kbStatus = await res.json();
		} catch {}
		kbLoading = false;
	}

	async function runKbTagging(batchSize = 20) {
		kbTagging = true;
		kbTagMsg  = '';
		try {
			const res = await fetch('/api/codebase-index/karpathy-tag', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ batchSize, dryRun: false }),
			});
			const d = await res.json();
			kbTagMsg = d.error
				? `Error: ${d.error}`
				: `Tagged ${d.tagged}/${d.processed} chunks (${Object.keys(d.semanticTagDist).length} categories). ${d.hasMore ? 'More chunks available.' : 'Done.'}`;
			await loadKbStatus();
		} catch (e) {
			kbTagMsg = `Network error: ${e}`;
		}
		kbTagging = false;
	}

	async function runObsidianExport(writeVault = false) {
		kbExporting = true;
		kbExportMsg = '';
		try {
			const action = writeVault ? 'write-vault' : 'generate';
			const res = await fetch('/api/codebase-index/export/obsidian', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ action, folder: kbExportFolder, topN: kbExportTopN }),
			});
			const d = await res.json();
			if (writeVault) {
				kbExportMsg = d.error
					? `Error: ${d.error}`
					: `Written ${d.written}/${d.total} notes to Obsidian (${d.failed} failed). Folder: ${kbExportFolder}`;
			} else {
				kbExportMsg = d.error
					? `Error: ${d.error}`
					: `Generated ${d.files?.length ?? 0} notes (${d.stats?.totalFiles ?? 0} unique files, ${d.stats?.totalChunks ?? 0} chunks).`;
			}
		} catch (e) {
			kbExportMsg = `Network error: ${e}`;
		}
		kbExporting = false;
	}

	async function runLlmAceFix() {
		if (!kbAceErrorId.trim()) { kbAceResult = 'Enter an error ID first.'; return; }
		kbAceFixLoading = true;
		kbAceResult     = '';
		try {
			const res = await fetch('/api/codebase-index/kag-notebook', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ action: 'llm-ace-fix', errorId: kbAceErrorId.trim() }),
			});
			const d = await res.json();
			kbAceResult = d.fixText ?? d.error ?? 'No response from LLM.';
		} catch (e) {
			kbAceResult = `Network error: ${e}`;
		}
		kbAceFixLoading = false;
	}

	async function loadAnalysis() {
		analysisLoading = true;
		analysisError = null;
		try {
			const res = await fetch('/api/phase89/analysis', { method: 'POST' });
			const json = await res.json();
			if (json.success) {
				analysisData = json.analysis;
			} else {
				analysisError = 'Analysis failed — check Qdrant health';
				analysisData = json.analysis ?? null;
			}
		} catch (e) {
			analysisError = `Network error: ${e}`;
		} finally {
			analysisLoading = false;
		}
	}

	async function triggerReindex() {
		reindexLoading = true;
		reindexMessage = null;
		try {
			const res = await fetch('/api/phase89/reindex', { method: 'POST' });
			const json = await res.json();
			reindexMessage = json.message ?? (json.success ? 'Re-index triggered' : 'Re-index failed');
			if (json.success) setTimeout(loadAnalysis, 3000);
		} catch (e) {
			reindexMessage = `Error: ${e}`;
		} finally {
			reindexLoading = false;
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

	$effect(() => {
		fetchClusters();
		fetchGraph();
		connectSSE();

		return () => {
			eventSource?.close();
		};
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
		<button class="tab" class:active={activeTab === 'analysis'} onclick={() => { activeTab = 'analysis'; if (!analysisData) loadAnalysis(); }}>
			🧠 Analysis
		</button>
		<button class="tab" class:active={activeTab === 'knowledge'} onclick={() => { activeTab = 'knowledge'; if (!kbStatus) loadKbStatus(); }}>
			📚 Knowledge Base
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
							<h3>{cluster.title ?? 'Untitled Cluster'}</h3>
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
						<p>Nodes: Components: Modules, Routes</p>
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
					<button onclick={ fetchClusters } class="refresh-btn">
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
						<li>📊 Embeddings: embeddinggemma, latest (768-dim)</li>
						<li>💾 Cache: Redis (7-day TTL)</li>
						<li>🎯 Clustering: DBSCAN with cosine similarity</li>
						<li>🧠 Summarization: gemma4-legal</li>
					</ul>
				</div>
			</section>
		{/if}
		<!-- Analysis Tab -->
		{#if activeTab === 'analysis'}
			<section class="analysis-section">
				<div class="analysis-toolbar">
					<button onclick={loadAnalysis} class="run-btn" disabled={analysisLoading}>
						{analysisLoading ? '⏳ Analyzing…' : '🔍 Run Analysis'}
					</button>
					<button onclick={triggerReindex} class="reindex-btn" disabled={reindexLoading}>
						{reindexLoading ? '⏳ Re-indexing…' : '♻️ Re-index Codebase'}
					</button>
					{#if reindexMessage}
						<span class="reindex-msg" class:ok={reindexMessage.includes('triggered') || reindexMessage.includes('Previous')}>
							{reindexMessage}
						</span>
					{/if}
				</div>

				{#if analysisError}
					<div class="analysis-error">{analysisError}</div>
				{/if}

				{#if analysisData}
					<!-- Metadata stats row -->
					<div class="analysis-stats">
						<div class="astat">
							<span class="astat-val">{analysisData.metadata.totalPoints.toLocaleString()}</span>
							<span class="astat-lbl">Total Vectors</span>
						</div>
						<div class="astat">
							<span class="astat-val">{analysisData.metadata.healthyCollections}/{analysisData.metadata.totalCollections}</span>
							<span class="astat-lbl">Collections Healthy</span>
						</div>
						{#if analysisData.clusterHealth}
							<div class="astat">
								<span class="astat-val">{analysisData.clusterHealth.totalClusters}</span>
								<span class="astat-lbl">Error Clusters</span>
							</div>
							<div class="astat">
								<span class="astat-val">{analysisData.clusterHealth.codebaseChunksInQdrant.toLocaleString()}</span>
								<span class="astat-lbl">Codebase Chunks</span>
							</div>
							<div class="astat">
								<span class="astat-val">{analysisData.clusterHealth.phase89ChunksInQdrant.toLocaleString()}</span>
								<span class="astat-lbl">Phase89 Chunks</span>
							</div>
						{/if}
					</div>

					<!-- Ollama narrative -->
					{#if analysisData.analysis}
						<div class="ollama-summary">
							<span class="ollama-badge">gemma4-legal</span>
							<p>{analysisData.analysis}</p>
						</div>
					{/if}

					<!-- Recommendations -->
					<div class="recs-header">
						<h3>Recommendations ({analysisData.recommendations.length})</h3>
					</div>
					<div class="recs-list">
						{#each analysisData.recommendations as rec, i (i)}
							{@const priorityColor = rec.priority === 'HIGH' ? '#ef4444' : rec.priority === 'MED' ? '#f59e0b' : '#10b981'}
							{@const catIcon = rec.category === 'indexing' ? '📦' : rec.category === 'retrieval' ? '🔍' : rec.category === 'health' ? '❤️' : '🔧'}
							<div class="rec-card" style="--pc: {priorityColor}">
								<div class="rec-header">
									<span class="rec-priority" style="background: {priorityColor}22; color: {priorityColor}; border: 1px solid {priorityColor}55">{rec.priority}</span>
									<span class="rec-cat">{catIcon} {rec.category}</span>
									<button class="rec-toggle" onclick={() => expandedRec = expandedRec === i ? null : i}>
										{expandedRec === i ? '▲' : '▼'}
									</button>
								</div>
								<h4 class="rec-title">{rec.title}</h4>
								{#if expandedRec === i}
									<p class="rec-detail">{rec.detail}</p>
									<p class="rec-impact">Impact: {rec.estimatedImpact}</p>
								{/if}
								<div class="rec-action">
									<code>{rec.action}</code>
								</div>
							</div>
						{/each}
						{#if analysisData.recommendations.length === 0}
							<p class="no-results">✅ No issues detected</p>
						{/if}
					</div>

					<!-- Collection table -->
					<details class="collections-detail">
						<summary>Collection breakdown ({analysisData.knowledge.collections.length})</summary>
						<table class="coll-table">
							<thead><tr><th>Collection</th><th>Points</th><th>Status</th></tr></thead>
							<tbody>
								{#each analysisData.knowledge.collections as c (c.name)}
									<tr class="coll-row status-{c.status}">
										<td class="coll-name">{c.name}</td>
										<td class="coll-points">{c.points.toLocaleString()}</td>
										<td class="coll-status">{c.status === 'green' ? '🟢' : c.status === 'yellow' ? '🟡' : '⚫'} {c.status}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</details>
				{:else if !analysisLoading}
					<div class="analysis-empty">
						<p>Click "Run Analysis" to inspect Qdrant health, cluster centroids, and get AI-driven recommendations.</p>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Knowledge Base Tab (Karpathy-tag + Obsidian export + LLM ACE Fix) -->
		{#if activeTab === 'knowledge'}
			<section class="kb-section">

				<!-- Status card -->
				<div class="kb-card">
					<div class="kb-card-header">
						<h3>📚 Karpathy Knowledge Base</h3>
						<button class="kb-btn" onclick={loadKbStatus} disabled={kbLoading}>
							{kbLoading ? '⏳ Loading…' : '🔄 Refresh Status'}
						</button>
					</div>

					{#if kbStatus}
						<div class="kb-stats-row">
							<div class="kb-stat">
								<span class="kb-stat-val">{kbStatus.tagged.toLocaleString()}</span>
								<span class="kb-stat-lbl">Tagged Chunks</span>
							</div>
							<div class="kb-stat">
								<span class="kb-stat-val">{kbStatus.total.toLocaleString()}</span>
								<span class="kb-stat-lbl">Total Chunks</span>
							</div>
							<div class="kb-stat">
								<span class="kb-stat-val">{kbStatus.pct}%</span>
								<span class="kb-stat-lbl">Coverage</span>
							</div>
							<div class="kb-stat">
								<span class="kb-stat-val">{Object.keys(kbStatus.semanticTagDist).length}</span>
								<span class="kb-stat-lbl">Active Categories</span>
							</div>
						</div>

						<!-- Coverage bar -->
						<div class="kb-progress-bar">
							<div class="kb-progress-fill" style="width: {kbStatus.pct}%"></div>
						</div>

						<!-- Tag distribution -->
						{#if Object.keys(kbStatus.semanticTagDist).length > 0}
							<div class="kb-tag-dist">
								{#each Object.entries(kbStatus.semanticTagDist).sort((a, b) => b[1] - a[1]) as [tag, count] (tag)}
									<span class="kb-tag-badge">{tag} <em>{count}</em></span>
								{/each}
							</div>
						{/if}

						<p class="kb-model-note">Model: {kbStatus.model} · Bifrost L1/L2/L3 cache · zero API cost</p>
					{:else if !kbLoading}
						<p class="kb-empty">Click "Refresh Status" to check tagging coverage.</p>
					{/if}
				</div>

				<!-- Semantic Tagging -->
				<div class="kb-card">
					<h3>🏷️ Semantic Tagging (Karpathy-style)</h3>
					<p class="kb-desc">
						Classify untagged <code>codebase_chunks_768</code> chunks into semantic categories using
						Ollama + Bifrost cache. Repeated similar chunks resolve instantly from L1/L2 cache.
					</p>
					<div class="kb-actions">
						<button class="kb-btn kb-btn-primary" onclick={() => runKbTagging(20)} disabled={kbTagging}>
							{kbTagging ? '⏳ Tagging…' : '▶ Tag Next 20 Chunks'}
						</button>
						<button class="kb-btn" onclick={() => runKbTagging(50)} disabled={kbTagging}>
							▶▶ Tag Next 50
						</button>
						<button class="kb-btn" onclick={() => runKbTagging(100)} disabled={kbTagging}>
							▶▶▶ Tag Batch 100
						</button>
					</div>
					{#if kbTagMsg}
						<p class="kb-msg" class:kb-error={kbTagMsg.startsWith('Error')}>{kbTagMsg}</p>
					{/if}
				</div>

				<!-- Obsidian Export -->
				<div class="kb-card">
					<h3>🗂️ Obsidian Vault Export</h3>
					<p class="kb-desc">
						Export top files by PageRank as Karpathy-style knowledge cards with YAML frontmatter,
						wikilinks between related files, and domain subfolders.
					</p>
					<div class="kb-form-row">
						<label class="kb-label">
							Vault folder:
							<input class="kb-input" bind:value={kbExportFolder} placeholder="Codebase Intelligence" />
						</label>
						<label class="kb-label">
							Top N files:
							<input class="kb-input kb-input-num" type="number" bind:value={kbExportTopN} min="10" max="500" />
						</label>
					</div>
					<div class="kb-actions">
						<button class="kb-btn" onclick={() => runObsidianExport(false)} disabled={kbExporting}>
							{kbExporting ? '⏳ Generating…' : '📋 Preview (generate only)'}
						</button>
						<button class="kb-btn kb-btn-primary" onclick={() => runObsidianExport(true)} disabled={kbExporting}>
							{kbExporting ? '⏳ Writing…' : '📤 Write to Obsidian Vault'}
						</button>
					</div>
					{#if kbExportMsg}
						<p class="kb-msg" class:kb-error={kbExportMsg.startsWith('Error')}>{kbExportMsg}</p>
					{/if}
				</div>

				<!-- LLM ACE Fix (KAG + DAG + RAG via Bifrost cache) -->
				<div class="kb-card">
					<h3>🔧 LLM ACE Error Fix</h3>
					<p class="kb-desc">
						Synthesize a fix plan for any error ID using KAG context + codebase chunks.
						Calls Ollama via Bifrost L1→L2→L3 cache — repeated error patterns resolve instantly.
					</p>
					<div class="kb-form-row">
						<label class="kb-label" style="flex: 1">
							Error ID / Cluster ID:
							<input class="kb-input" bind:value={kbAceErrorId} placeholder="e.g. TS2345 or cluster-7" />
						</label>
						<button class="kb-btn kb-btn-primary" onclick={runLlmAceFix} disabled={kbAceFixLoading || !kbAceErrorId.trim()}>
							{kbAceFixLoading ? '⏳ Fixing…' : '🚀 Generate Fix'}
						</button>
					</div>
					{#if kbAceResult}
						<div class="kb-ace-result">
							<pre>{kbAceResult}</pre>
						</div>
					{/if}
				</div>

			</section>
		{/if}
	</main>
</div>

<style>
	/* Knowledge Base tab styles */
	.kb-section {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.kb-card {
		background: rgba(255,255,255,0.04);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 0.75rem;
		padding: 1.25rem 1.5rem;
	}
	.kb-card h3 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		color: #e0e0e0;
	}
	.kb-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.kb-card-header h3 { margin: 0; }
	.kb-stats-row {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 0.75rem;
	}
	.kb-stat {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.kb-stat-val {
		font-size: 1.5rem;
		font-weight: 700;
		color: #00d4ff;
	}
	.kb-stat-lbl {
		font-size: 0.7rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.kb-progress-bar {
		height: 6px;
		background: rgba(255,255,255,0.1);
		border-radius: 3px;
		margin-bottom: 0.75rem;
		overflow: hidden;
	}
	.kb-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #00d4ff, #7c3aed);
		border-radius: 3px;
		transition: width 0.4s ease;
	}
	.kb-tag-dist {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}
	.kb-tag-badge {
		background: rgba(0,212,255,0.1);
		border: 1px solid rgba(0,212,255,0.25);
		color: #00d4ff;
		border-radius: 0.9rem;
		padding: 0.15rem 0.6rem;
		font-size: 0.72rem;
	}
	.kb-tag-badge em {
		font-style: normal;
		color: #aaa;
		margin-left: 0.25rem;
	}
	.kb-model-note {
		font-size: 0.7rem;
		color: #666;
		margin: 0.5rem 0 0;
	}
	.kb-empty { color: #666; font-size: 0.875rem; }
	.kb-desc {
		font-size: 0.8rem;
		color: #888;
		margin: 0 0 0.75rem;
		line-height: 1.5;
	}
	.kb-desc code {
		background: rgba(255,255,255,0.08);
		padding: 0.1rem 0.35rem;
		border-radius: 0.25rem;
		font-size: 0.78rem;
	}
	.kb-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.kb-btn {
		background: rgba(255,255,255,0.07);
		border: 1px solid rgba(255,255,255,0.15);
		color: #e0e0e0;
		border-radius: 0.5rem;
		padding: 0.45rem 1rem;
		font-size: 0.8rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.kb-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
	.kb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.kb-btn-primary {
		background: rgba(0,212,255,0.15);
		border-color: rgba(0,212,255,0.4);
		color: #00d4ff;
	}
	.kb-btn-primary:hover:not(:disabled) { background: rgba(0,212,255,0.25); }
	.kb-msg {
		font-size: 0.8rem;
		color: #10b981;
		margin: 0.5rem 0 0;
	}
	.kb-error { color: #ef4444 !important; }
	.kb-form-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.kb-label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: #aaa;
	}
	.kb-input {
		background: rgba(255,255,255,0.07);
		border: 1px solid rgba(255,255,255,0.15);
		color: #e0e0e0;
		border-radius: 0.4rem;
		padding: 0.4rem 0.7rem;
		font-size: 0.82rem;
		min-width: 220px;
	}
	.kb-input-num { min-width: 80px; }
	.kb-ace-result {
		background: rgba(0,0,0,0.3);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 0.5rem;
		padding: 1rem;
		margin-top: 0.5rem;
		max-height: 400px;
		overflow-y: auto;
	}
	.kb-ace-result pre {
		margin: 0;
		white-space: pre-wrap;
		font-size: 0.8rem;
		color: #c0c0c0;
		font-family: 'Fira Code', 'Cascadia Code', monospace;
		line-height: 1.6;
	}

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

	.tabs { display: flex;
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

	.tab:hover { color: #fff;
		background: rgba(255, 255, 255, 0.05);
	}

	.tab.active { color: #00d4ff;
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
	.search-box { display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.search-input { flex: 1;
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
		border-left: 3px solid hsl(calc(var(--score, 0.5) * 120) 70% 50%);
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

	.fix-btn { width: 100%;
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

	.graph-stats { display: flex;
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

	.node-item { display: flex;
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
	.pipeline-controls { display: flex;
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

	.progress-bar { height: 24px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	overflow: hidden;
		position: relative;
		margin-bottom: 1.5rem;
	}

	.progress-fill { height: 100%;
		background: linear-gradient(90deg, #7c3aed, #00d4ff);
		transition: width 0.3s;
	}

	.progress-text { position: absolute;
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

	/* Analysis Section */
	.analysis-section { display: flex; flex-direction: column; gap: 1.25rem; }

	.analysis-toolbar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

	.reindex-btn {
		padding: 0.75rem 1.5rem;
		background: rgba(16, 185, 129, 0.15);
		border: 1px solid rgba(16, 185, 129, 0.4);
		border-radius: 10px;
		color: #10b981;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.reindex-btn:hover:not(:disabled) { background: rgba(16, 185, 129, 0.25); }
	.reindex-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.reindex-msg { font-size: 0.8rem; color: #888; }
	.reindex-msg.ok { color: #10b981; }

	.analysis-error {
		padding: 0.75rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 8px;
		color: #ef4444;
		font-size: 0.875rem;
	}

	.analysis-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.astat {
		display: flex;
		flex-direction: column;
		align-items: center;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		padding: 0.75rem 1.25rem;
		min-width: 110px;
	}
	.astat-val { font-size: 1.5rem; font-weight: 700; color: #00d4ff; }
	.astat-lbl { font-size: 0.7rem; color: #888; margin-top: 0.2rem; text-align: center; }

	.ollama-summary {
		background: rgba(124, 58, 237, 0.08);
		border: 1px solid rgba(124, 58, 237, 0.25);
		border-radius: 10px;
		padding: 1rem 1.25rem;
		position: relative;
	}
	.ollama-badge {
		display: inline-block;
		font-size: 0.65rem;
		padding: 0.15rem 0.5rem;
		background: rgba(124, 58, 237, 0.3);
		border-radius: 4px;
		color: #a78bfa;
		margin-bottom: 0.5rem;
	}
	.ollama-summary p { margin: 0; color: #ddd; font-size: 0.9rem; line-height: 1.6; }

	.recs-header h3 { margin: 0; font-size: 1rem; color: #aaa; }

	.recs-list { display: flex; flex-direction: column; gap: 0.75rem; }

	.rec-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-left: 3px solid var(--pc, #888);
		border-radius: 10px;
		padding: 0.875rem 1rem;
	}
	.rec-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
	.rec-priority {
		font-size: 0.65rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		letter-spacing: 0.05em;
	}
	.rec-cat { font-size: 0.75rem; color: #888; flex: 1; }
	.rec-toggle {
		background: transparent;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 0.7rem;
		padding: 0.2rem;
	}
	.rec-title { margin: 0 0 0.5rem; font-size: 0.9rem; color: #e0e0e0; }
	.rec-detail { margin: 0 0 0.4rem; font-size: 0.8rem; color: #aaa; line-height: 1.5; }
	.rec-impact { margin: 0 0 0.5rem; font-size: 0.75rem; color: #888; font-style: italic; }
	.rec-action code {
		display: block;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 6px;
		padding: 0.4rem 0.75rem;
		font-size: 0.75rem;
		color: #10b981;
		word-break: break-all;
	}

	.collections-detail {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		padding: 0.75rem 1rem;
	}
	.collections-detail summary { cursor: pointer; color: #888; font-size: 0.85rem; }

	.coll-table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.8rem; }
	.coll-table th { text-align: left; color: #888; padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
	.coll-row td { padding: 0.35rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
	.coll-name { color: #ccc; font-family: monospace; }
	.coll-points { color: #00d4ff; text-align: right; }
	.coll-status { color: #888; }
	.status-green .coll-name { color: #e0e0e0; }
	.status-yellow .coll-name { color: #aaa; }
	.status-unavailable .coll-name { color: #555; }

	.analysis-empty { text-align: center; padding: 3rem; color: #555; }
	.analysis-empty p { font-size: 0.9rem; max-width: 400px; margin: 0 auto; }
</style>





