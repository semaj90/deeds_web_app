<script lang="ts">
import { onMount } from 'svelte';
import Icon from '$lib/components/ui/Icon.svelte';
import CodebaseGraphCanvas from './CodebaseGraphCanvas.svelte';
import CodebaseGraphSidebar from './CodebaseGraphSidebar.svelte';

interface GraphNode {
	id: string;
	label: string;
	type: 'file' | 'directory';
	path: string;
	extension?: string;
	size: number;
	domain?: string;
	complexity?: string;
	group: number;
}

interface GraphEdge {
	source: string;
	target: string;
	type: string;
	weight: number;
}

interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	stats: {
		totalFiles: number;
		totalChunks: number;
		totalDirs: number;
		extensionBreakdown: Record<string, number>;
		domainBreakdown: Record<string, number>;
	};
}

let graphData = $state<GraphData | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let limit = $state(1000);
let searchQuery = $state('');
let filterExtension = $state<string | null>(null);
let selectedNode = $state<GraphNode | null>(null);

async function loadGraph() {
	loading = true;
	error = null;
	try {
		const res = await fetch(`/api/codebase-index/graph?limit=${limit}`);
		if (!res.ok) throw new Error('Failed to load graph data');
		graphData = await res.json();
	} catch (err) {
		error = err instanceof Error ? err.message : 'Unknown error';
		console.error('Graph load error:', err);
	} finally {
		loading = false;
	}
}

const filteredNodes = $derived.by(() => {
	if (!graphData) return [];
	let nodes = graphData.nodes;
	
	if (searchQuery) {
		const query = searchQuery.toLowerCase();
		nodes = nodes.filter(n => 
			n.label.toLowerCase().includes(query) ||
			n.path.toLowerCase().includes(query)
		);
	}
	
	if (filterExtension) {
		nodes = nodes.filter(n => n.extension === filterExtension);
	}
	
	return nodes;
});

const filteredEdges = $derived.by(() => {
	if (!graphData) return [];
	const nodeIds = new Set(filteredNodes.map(n => n.id));
	return graphData.edges.filter(e => 
		nodeIds.has(e.source) && nodeIds.has(e.target)
	);
});

onMount(() => {
	loadGraph();
});

function handleNodeClick(node: GraphNode) {
	selectedNode = node;
	console.log('Selected node:', node);
}

function clearFilters() {
	searchQuery = '';
	filterExtension = null;
	selectedNode = null;
}
</script>

<svelte:head>
	<title>Codebase Knowledge Graph | 15,651 Files</title>
</svelte:head>

<div class="flex h-screen bg-[var(--t-bg)] text-[var(--t-text)]">
	<CodebaseGraphSidebar
		{graphData}
		{loading}
		{error}
		{selectedNode}
		bind:limit
		bind:searchQuery
		bind:filterExtension
		onReload={loadGraph}
		onClearFilters={clearFilters}
	/>

	<div class="flex-1 relative">
		{#if loading}
			<div class="absolute inset-0 flex items-center justify-center bg-[var(--t-bg)]">
				<div class="text-center">
					<div class="animate-spin inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
					<p class="text-[var(--t-text-muted)]">Loading graph data...</p>
				</div>
			</div>
		{:else if error}
			<div class="absolute inset-0 flex items-center justify-center bg-[var(--t-bg)]">
				<div class="text-center max-w-md">
					<Icon name="alert-circle" class="inline w-16 h-16 text-red-500 mb-4" />
					<h2 class="text-xl font-bold mb-2">Failed to Load Graph</h2>
					<p class="text-[var(--t-text-muted)] mb-4">{error}</p>
					<button
						onclick={() => loadGraph()}
						class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
					>
						<Icon name="refresh-cw" class="inline w-4 h-4 mr-2" />
						Retry
					</button>
				</div>
			</div>
		{:else if graphData}
			<CodebaseGraphCanvas
				nodes={filteredNodes}
				edges={filteredEdges}
				onNodeClick={handleNodeClick}
			/>
		{/if}
	</div>
</div>
