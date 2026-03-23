<script lang="ts">
	interface Cluster {
		id: number;
		error_count: number;
		tags: string[];
		summary: string;
		error_ids: number[];
	}

	interface AnalysisResult {
		pattern_name: string;
		root_cause: string;
		fix_strategy: string[];
		code_transformations?: Array<{ from: string; to: string; description: string }>;
		priority_files?: string[];
		estimated_effort?: string;
		confidence?: number;
	}

	let clusters = $state<Cluster[]>([]);
	let selectedCluster = $state<Cluster | null>(null);
	let analysis = $state<AnalysisResult | null>(null);
	let fixLog = $state<Array<{ message: string; type: string }>>([]);
	let loading = $state(false);
	let analyzing = $state(false);
	let fixing = $state(false);

	async function fetchClusters() {
		loading = true;
		try {
			const res = await fetch('/api/phase89/clusters');
			const data = await res.json();
			clusters = data.clusters || [];
		} catch (err) {
			console.error('Failed to fetch clusters:', err);
		} finally {
			loading = false;
		}
	}

	async function analyzeCluster(cluster: Cluster) {
		selectedCluster = cluster;
		analysis = null;
		analyzing = true;
		try {
			const res = await fetch('/api/phase89/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster_id: cluster.id,
					model: 'gemma3-legal',
					ace_context: true
				})
			});
			const data = await res.json();
			if (data.success) {
				analysis = data.analysis;
			}
		} catch (err) {
			console.error('Analysis failed:', err);
		} finally {
			analyzing = false;
		}
	}

	async function runAgenticFix(cluster: Cluster) {
		fixing = true;
		fixLog = [];
		try {
			const res = await fetch('/api/phase89/agentic-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster_id: cluster.id,
					pattern: cluster.summary,
					file_paths: [],
					context: {
						summary: cluster.summary,
						tags: cluster.tags,
						similar_clusters: []
					}
				})
			});

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			if (!reader) return;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const text = decoder.decode(value);
				for (const line of text.split('\n')) {
					if (line.startsWith('data: ')) {
						try {
							const event = JSON.parse(line.slice(6));
							fixLog = [...fixLog, event];
						} catch {}
					}
				}
			}
		} catch (err) {
			fixLog = [...fixLog, { message: `Error: ${err}`, type: 'error' }];
		} finally {
			fixing = false;
		}
	}

	$effect(() => {
		fetchClusters();
	});
</script>

<svelte:head>
	<title>RAG+KAG Pipeline - Agentic Errors</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-black tracking-wide uppercase">RAG+KAG Error Pipeline</h1>
		<p class="text-black/60 mt-2">
			Select error clusters for LLM analysis (Ollama gemma3-legal) and agentic fix recommendations
		</p>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Cluster List -->
		<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-bold text-black uppercase tracking-wide">Error Clusters</h2>
				<button
					onclick={fetchClusters}
					disabled={loading}
					class="px-3 py-1.5 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
				>
					{loading ? 'Loading...' : 'Refresh'}
				</button>
			</div>

			{#if clusters.length > 0}
				<div class="space-y-3 max-h-[60vh] overflow-y-auto">
					{#each clusters as cluster}
						<button
							onclick={() => analyzeCluster(cluster)}
							class="w-full text-left p-4 rounded-lg border-2 transition-colors {
								selectedCluster?.id === cluster.id
									? 'border-accent bg-accent/10'
									: 'border-black/20 bg-sand/10 hover:border-accent/50'
							}"
						>
							<div class="flex justify-between items-start mb-2">
								<span class="font-bold text-accent">Cluster #{cluster.id}</span>
								<span class="text-xs text-black/60">{cluster.error_count} errors</span>
							</div>
							<p class="text-sm text-black/80 line-clamp-2 mb-2">{cluster.summary}</p>
							<div class="flex gap-1 flex-wrap">
								{#each cluster.tags.slice(0, 3) as tag}
									<span class="text-xs bg-accent/20 text-black px-2 py-0.5 rounded">{tag}</span>
								{/each}
							</div>
						</button>
					{/each}
				</div>
			{:else if !loading}
				<div class="text-center text-black/60 py-12">
					No clusters found. Run the clustering pipeline on the Dashboard tab first.
				</div>
			{/if}
		</div>

		<!-- Analysis Panel -->
		<div class="space-y-4">
			{#if analyzing}
				<div class="bg-panel border-2 border-accent rounded-lg p-6 text-center">
					<div class="text-4xl mb-4 animate-pulse">🧠</div>
					<p class="text-black font-bold">Analyzing with gemma3-legal...</p>
					<p class="text-black/60 text-sm mt-2">LLM is generating root cause analysis and fix recommendations</p>
				</div>
			{:else if analysis && selectedCluster}
				<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
					<h2 class="text-xl font-bold text-black mb-4 uppercase tracking-wide">
						Analysis: {analysis.pattern_name}
					</h2>

					<div class="space-y-4">
						<div>
							<h3 class="text-sm text-black/60 uppercase tracking-wide mb-1">Root Cause</h3>
							<p class="text-black">{analysis.root_cause}</p>
						</div>

						{#if analysis.fix_strategy?.length}
							<div>
								<h3 class="text-sm text-black/60 uppercase tracking-wide mb-1">Fix Strategy</h3>
								<ol class="list-decimal list-inside space-y-1 text-sm text-black/80">
									{#each analysis.fix_strategy as step}
										<li>{step}</li>
									{/each}
								</ol>
							</div>
						{/if}

						{#if analysis.code_transformations?.length}
							<div>
								<h3 class="text-sm text-black/60 uppercase tracking-wide mb-2">Code Transformations</h3>
								{#each analysis.code_transformations as transform}
									<div class="bg-sand/10 border border-black/20 rounded p-3 mb-2">
										<div class="text-xs text-black/60 mb-1">{transform.description}</div>
										<div class="grid grid-cols-2 gap-2 text-xs font-mono">
											<div class="bg-danger/10 p-2 rounded">
												<span class="text-danger">-</span> {transform.from}
											</div>
											<div class="bg-green-600/10 p-2 rounded">
												<span class="text-green-600">+</span> {transform.to}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}

						<div class="flex items-center gap-4 text-sm">
							{#if analysis.estimated_effort}
								<span class="px-2 py-1 rounded border {
									analysis.estimated_effort === 'quick-fix' ? 'bg-green-600/20 border-green-600 text-green-700' :
									analysis.estimated_effort === 'moderate' ? 'bg-warning/20 border-warning text-warning' :
									'bg-danger/20 border-danger text-danger'
								}">
									{analysis.estimated_effort}
								</span>
							{/if}
							{#if analysis.confidence != null}
								<span class="text-black/60">
									Confidence: {(analysis.confidence * 100).toFixed(0)}%
								</span>
							{/if}
						</div>

						<!-- Run Agentic Fix -->
						<button
							onclick={() => selectedCluster && runAgenticFix(selectedCluster)}
							disabled={fixing}
							class="w-full mt-4 px-4 py-3 bg-accent hover:bg-accent/80 text-white rounded-lg font-bold disabled:opacity-50 transition-colors"
						>
							{fixing ? 'Running Fix Pipeline...' : 'Run Agentic Fix Pipeline'}
						</button>
					</div>
				</div>
			{:else}
				<div class="bg-panel border-2 border-black/20 rounded-lg p-12 text-center">
					<div class="text-4xl mb-4">📊</div>
					<p class="text-black/60">Select a cluster to analyze with RAG+KAG</p>
				</div>
			{/if}

			<!-- Fix Log -->
			{#if fixLog.length > 0}
				<div class="bg-black/90 border-2 border-accent/30 rounded-lg p-4 max-h-[40vh] overflow-y-auto">
					<h3 class="text-accent font-bold text-sm mb-3 uppercase tracking-wide">Fix Pipeline Log</h3>
					<div class="space-y-1 font-mono text-xs">
						{#each fixLog as entry}
							<div class="{
								entry.type === 'error' ? 'text-red-400' :
								entry.type === 'success' ? 'text-green-400' :
								entry.type === 'warning' ? 'text-yellow-400' :
								entry.type === 'progress' ? 'text-blue-400' :
								'text-white/70'
							}">
								<span class="text-white/30">[{entry.type}]</span> {entry.message}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
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
