<script lang="ts">
	import { onMount } from 'svelte';
	import ProvenanceGraph from '$lib/components/source-validation/ProvenanceGraph.svelte';

	interface GraphNode {
		id: string;
		label: string;
		type: 'file' | 'directory';
		path: string;
		extension?: string;
		size: number;
		domain?: string;
		group: number;
	}

	interface GraphEdge {
		source: string;
		target: string;
		type: 'contains' | 'imports' | 'exports';
		weight: number;
	}

	interface GraphData {
		nodes: GraphNode[];
		edges: GraphEdge[];
		stats: {
			totalFiles: number;
			totalChunks: number;
			totalDirs: number;
			importEdges: number;
			extensionBreakdown: Record<string, number>;
			domainBreakdown: Record<string, number>;
		};
	}

	let graphData = $state<GraphData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let limit = $state(500); // Start with smaller subset for performance
	let includeImports = $state(true);
	let filterType = $state<'all' | 'imports' | 'contains'>('all');

	// Convert graph data to ProvenanceGraph format
	let entities = $derived(graphData?.nodes.map(n => n.label) || []);
	let relationships = $derived.by(() => {
		if (!graphData) return [];

		const edges = graphData.edges;
		const filtered = filterType === 'all'
			? edges
			: edges.filter(e => e.type === filterType);

		return filtered.map(edge => ({
			from: extractLabel(edge.source),
			to: extractLabel(edge.target),
			type: edge.type.toUpperCase()
		}));
	});

	function extractLabel(id: string): string {
		const node = graphData?.nodes.find(n => n.id === id);
		return node?.label || id;
	}

	async function loadGraph() {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				limit: limit.toString(),
				includeImports: includeImports.toString()
			});

			const response = await fetch(`/api/codebase-index/graph?${params}`);
			if (!response.ok) {
				throw new Error(`Failed to load graph: ${response.statusText}`);
			}

			graphData = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			console.error('Graph load error:', err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadGraph();
	});
</script>

<div class="codebase-graph-page p-6">
	<div class="header mb-6">
		<h1 class="text-3xl font-bold mb-2">📊 Codebase Knowledge Graph</h1>
		<p class="text-sm text-sand/60">
			Visual representation of {graphData?.stats.totalFiles || 0} indexed files with import relationships
		</p>
	</div>

	<!-- Controls -->
	<div class="controls mb-6 p-4 bg-panel rounded-lg">
		<div class="flex flex-wrap gap-4 items-end">
			<div class="flex flex-col">
				<label for="limit" class="text-xs font-semibold mb-1">File Limit</label>
				<input
					id="limit"
					type="number"
					bind:value={limit}
					min="100"
					max="5000"
					step="100"
					class="px-3 py-1.5 bg-sand/5 border border-sand/20 rounded text-sm"
				/>
			</div>

			<div class="flex items-center gap-2">
				<input
					id="includeImports"
					type="checkbox"
					bind:checked={includeImports}
					class="w-4 h-4"
				/>
				<label for="includeImports" class="text-sm">Include Import Edges</label>
			</div>

			<div class="flex flex-col">
				<label for="filter" class="text-xs font-semibold mb-1">Edge Filter</label>
				<select
					id="filter"
					bind:value={filterType}
					class="px-3 py-1.5 bg-sand/5 border border-sand/20 rounded text-sm"
				>
					<option value="all">All Edges</option>
					<option value="imports">Import Edges Only</option>
					<option value="contains">Containment Only</option>
				</select>
			</div>

			<button
				onclick={() => loadGraph()}
				class="px-4 py-1.5 bg-accent text-white rounded text-sm font-semibold hover:bg-accent/90"
			>
				Reload Graph
			</button>
		</div>

		{#if graphData}
			<div class="stats mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
				<div class="stat p-2 bg-sand/5 rounded">
					<div class="text-sand/60">Files</div>
					<div class="text-lg font-bold">{graphData.stats.totalFiles.toLocaleString()}</div>
				</div>
				<div class="stat p-2 bg-sand/5 rounded">
					<div class="text-sand/60">Chunks</div>
					<div class="text-lg font-bold">{graphData.stats.totalChunks.toLocaleString()}</div>
				</div>
				<div class="stat p-2 bg-sand/5 rounded">
					<div class="text-sand/60">Directories</div>
					<div class="text-lg font-bold">{graphData.stats.totalDirs}</div>
				</div>
				<div class="stat p-2 bg-sand/5 rounded">
					<div class="text-sand/60">Import Edges</div>
					<div class="text-lg font-bold">{graphData.stats.importEdges}</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Graph Visualization -->
	{#if loading}
		<div class="loading p-12 bg-sand/5 rounded-lg text-center">
			<div class="text-lg">Loading codebase graph...</div>
			<div class="text-sm text-sand/60 mt-2">Analyzing {limit} files</div>
		</div>
	{:else if error}
		<div class="error p-6 bg-danger/10 border border-danger rounded-lg">
			<h3 class="font-bold text-danger mb-2">Failed to load graph</h3>
			<p class="text-sm">{error}</p>
		</div>
	{:else if graphData}
		<ProvenanceGraph
			validationId="codebase-graph"
			{entities}
			{relationships}
			width={1200}
			height={800}
		/>

		<!-- Extension Breakdown -->
		<div class="extension-breakdown mt-6 p-4 bg-panel rounded-lg">
			<h3 class="text-sm font-semibold mb-3">File Types</h3>
			<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
				{#each Object.entries(graphData.stats.extensionBreakdown).sort((a, b) => b[1] - a[1]) as [ext, count]}
					<div class="ext-item p-2 bg-sand/5 rounded">
						<div class="font-mono text-accent">.{ext}</div>
						<div class="text-sand/60">{count} files</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Domain Breakdown (if available) -->
		{#if Object.keys(graphData.stats.domainBreakdown).length > 0}
			<div class="domain-breakdown mt-4 p-4 bg-panel rounded-lg">
				<h3 class="text-sm font-semibold mb-3">Domains</h3>
				<div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
					{#each Object.entries(graphData.stats.domainBreakdown).sort((a, b) => b[1] - a[1]) as [domain, count]}
						<div class="domain-item p-2 bg-sand/5 rounded">
							<div class="font-semibold">{domain}</div>
							<div class="text-sand/60">{count} files</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.codebase-graph-page {
		max-width: 1400px;
		margin: 0 auto;
	}
</style>
