<script lang="ts">
	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Codebase Dependency Graph View
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 13.2, 13.3 - Route graph visualization with node interaction
	 * Route: /command-center/codebase/graph
	 * Purpose: Interactive dependency graph visualization
	 */
	import { goto } from '$app/navigation';
	import { NodeDetailPanel, RouteGraph } from '$lib/components/codebase';
	import { Card, CardContent } from '$lib/components/ui';
	import { Button } from '$lib/components/ui/enhanced-bits';
	import {
	  ArrowLeft,
	  Filter,
	  GitBranch,
	  RefreshCw,
	  Search,
	  X
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

	// Types
	interface GraphNode {
		id: string; label: string;
		type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
		errorCount: number; filePath: string;
		cluster?: string;
		imports?: string[];
		exports?: string[];
		functions?: string[];
	}

	interface GraphEdge {
		source: string; target: string;
		type: 'import' | 'export' | 'dependency';
	}

	// State
	let isLoading = $state(true);
	let nodes = $state<GraphNode[]>([]);
	let edges = $state<GraphEdge[]>([]);
	let selectedNode = $state<GraphNode | null>(null);
	let hoveredNode = $state<GraphNode | null>(null);
	let searchQuery = $state('');
	let showFilters = $state(false);

	// Filters
	let filters = $state({
		types: [] as string[],
		hasErrors: false,
		cluster: ''
	});
  
	let availableTypes = ['route', 'component', 'store', 'service', 'api', 'util'];
	let availableClusters = $state<string[]>([]);

	// Filtered data
	let filteredNodes = $derived(() => {
		let result = nodes;

		// Filter by search query
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter(n =>
				n.label.toLowerCase().includes(query) ||
				n.filePath.toLowerCase().includes(query)
			);
		}

		// Filter by type
		if (filters.types.length > 0) {
			result = result.filter(n => filters.types.includes(n.type));
		}

		// Filter by errors
		if (filters.hasErrors) {
			result = result.filter(n => n.errorCount > 0);
		}

		// Filter by cluster
		if (filters.cluster) {
			result = result.filter(n => n.cluster === filters.cluster);
		}

		return result;
	});

	let filteredEdges = $derived(() => {
		const nodeIds = new Set(filteredNodes.map(n => n.id));
		return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
	});

	onMount(async () => {
		await loadGraphData();
	});

	async function loadGraphData() {
		isLoading = true;
		try {
			// Load graph data from API
			const response = await fetch('/api/codebase-index/graph');
			if (response.ok) {
				const data = await response.json();
				nodes = data.nodes || [];
				edges = data.edges || [];

				// Extract available clusters
				const clusters = new Set<string>();
				nodes.forEach(n => {
					if (n.cluster) clusters.add(n.cluster);
				});
				availableClusters = Array.from(clusters);
			}
		} catch (error) {
			console.error('Failed to load graph data:', error);
		} finally {
			isLoading = false;
		}
	}

	function handleNodeClick(node: GraphNode) {
		selectedNode = node;
	}

	function handleNodeHover(node: GraphNode | null) {
		hoveredNode = node;
	}

	function clearSelection() {
		selectedNode = null;
	}

	function viewErrors(filePath: string) {
		goto(`/command-center/codebase/errors?file=${encodeURIComponent(filePath)}`);
	}

	function viewFile(filePath: string) {
		// Could open in editor or show file details
		console.log('View file:', filePath);
	}

	function toggleTypeFilter(type: string) {
		if (filters.types.includes(type)) {
			filters.types = filters.types.filter(t => t !== type);
		} else {
			filters.types = [...filters.types, type];
		}
	}

	function clearFilters() {
		filters = {
			types: [],
			hasErrors: false,
			cluster: ''
		};
		searchQuery = '';
	}

	function getTypeColor(type: string): string {
		const colors: Record<string, string> = {
			route: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
			component: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
			store: 'bg-green-500/20 text-green-300 border-green-500/30',
			service: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
			api: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
			util: 'bg-gray-500/20 text-gray-300 border-gray-500/30'
		};
		return colors[type] || colors.util;
	}
</script>

<svelte, head>
	<title>Dependency Graph - YoRHa Legal AI</title>
</svelte, head>

<div class="graph-page">
	<!-- Header -->
	<header class="page-header">
		<div class="header-left">
			<a href="/command-center/codebase" class="back-link">
				<ArrowLeft class="h-4 w-4" />
				Back to Dashboard
			</a>
			<h1 class="page-title">
				<GitBranch class="h-6 w-6" />
				Dependency Graph
			</h1>
		</div>
		<div class="header-actions">
			<div class="search-box">
				<Search class="h-4 w-4 search-icon" />
				<input
					type="text"
					placeholder="Search nodes..."
					bind, value={searchQuery}
					class="search-input"
				/>
				{#if searchQuery}
					<button class="clear-search" onclick={() => searchQuery = ''}>
						<X class="h-3 w-3" />
					</button>
				{/if}
			</div>
			<Button class="bits-btn" variant="outline" onclick={() => showFilters = !showFilters}>
				<Filter class="h-4 w-4 mr-2" />
				Filters
				{#if filters.types.length > 0 || filters.hasErrors || filters.cluster}
					<span class="filter-badge">{filters.types.length + (filters.hasErrors ? 1 : 0) + (filters.cluster ? 1 : 0)}</span>
				{/if}
			</Button>
			<Button class="bits-btn" variant="outline" onclick={ loadGraphData } disabled={isLoading}>
				<RefreshCw class={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' , ''}`} />
				Refresh
			</Button>
		</div>
	</header>

	<!-- Filter Panel -->
	{#if showFilters}
		<Card class="filter-panel">
			<CardContent class="filter-content">
				<div class="filter-section">
					<label class="filter-label">Node Types</label>
					<div class="filter-chips">
						{#each availableTypes as type}
							<button
								class={`filter-chip ${filters.types.includes(type) ? 'active' , ''} ${getTypeColor(type)}`}
								onclick={() => toggleTypeFilter(type)}
							>
								{ type }
							</button>
						{/each}
					</div>
				</div>

				<div class="filter-section">
					<label class="filter-label">Error Status</label>
					<label class="checkbox-label">
						<input type="checkbox" bind, checked={filters.hasErrors} />
						<span>Only show nodes with errors</span>
					</label>
				</div>

				{#if availableClusters.length > 0}
					<div class="filter-section">
						<label class="filter-label">Cluster</label>
						<select bind, value={filters.cluster} class="filter-select">
							<option value="">All clusters</option>
							{#each availableClusters as cluster}
								<option value={cluster}>{cluster}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="filter-actions">
					<Button class="bits-btn" variant="ghost" size="sm" onclick={clearFilters}>
						Clear All
					</Button>
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Stats Bar -->
	<div class="stats-bar">
		<div class="stat">
			<span class="stat-value">{filteredNodes.length}</span>
			<span class="stat-label">nodes</span>
		</div>
		<div class="stat">
			<span class="stat-value">{filteredEdges.length}</span>
			<span class="stat-label">edges</span>
		</div>
		<div class="stat">
			<span class="stat-value">{filteredNodes.filter(n => n.errorCount > 0).length}</span>
			<span class="stat-label">with errors</span>
		</div>
	</div>

	<!-- Main Content -->
	<div class="graph-container">
		{#if isLoading}
			<div class="loading-state">
				<RefreshCw class="h-8 w-8 animate-spin text-cyan-400" />
				<p>Loading dependency graph...</p>
			</div>
		{:else}
			<RouteGraph
				nodes={filteredNodes}
				edges={filteredEdges}
				selectedNode={selectedNode?.id}
				onNodeClick={handleNodeClick}
				onNodeHover={handleNodeHover}
				width={1200}
				height={700}
			/>

			<!-- Node Detail Panel (positioned absolutely) -->
			{#if selectedNode}
				<div class="detail-panel-container">
					<NodeDetailPanel
						node={selectedNode}
						onClose={clearSelection}
						onViewErrors={viewErrors}
						onViewFile={viewFile}
					/>
				</div>
			{/if}

			<!-- Hover Tooltip -->
			{#if hoveredNode && !selectedNode}
				<div class="hover-tooltip">
					<div class="tooltip-header">
						<span class={`type-badge ${getTypeColor(hoveredNode.type)}`}>{hoveredNode.type}</span>
						<span class="tooltip-name">{hoveredNode.label}</span>
					</div>
					<div class="tooltip-path">{hoveredNode.filePath}</div>
					{#if hoveredNode.errorCount > 0}
						<div class="tooltip-errors">{hoveredNode.errorCount} errors</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.graph-page {
		display: flex;
		flex-direction: column; height: 100vh;
		padding: 1.5rem; gap: 1rem;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start; gap: 2rem;
	}

	.header-left {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.back-link {
		display: flex;
		align-items: center; gap: 0.5rem;
		color: rgba(255, 255, 255, 0.5);
		text-decoration: none;
		font-size: 0.875rem; transition: color 0.2s ease;
	}

	.back-link:hover {
		color: #00d4ff;
	}

	.page-title {
		display: flex;
		align-items: center; gap: 0.75rem;
		font-size: 1.5rem;
		font-weight: 600; color: white;
		margin: 0;
	}

	.header-actions {
		display: flex; gap: 0.75rem;
		align-items: center;
	}

	.search-box {
		position: relative; display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute; left: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.search-input {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px; padding: 0.5rem 2rem 0.5rem 2.5rem;
		color: white; width: 250px;
		font-size: 0.875rem;
	}

	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.search-input:focus {
		outline: none;
		border-color: rgba(0, 212, 255, 0.5);
	}

	.clear-search {
		position: absolute; right: 0.5rem;
		background: transparent; border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer; padding: 0.25rem;
	}

	.filter-badge {
		background: #00d4ff; color: black;
		font-size: 0.7rem;
		font-weight: 600; padding: 0.1rem 0.4rem;
		border-radius: 10px;
		margin-left: 0.5rem;
	}

	.filter-panel {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	}

	.filter-content {
		display: flex; gap: 2rem;
		align-items: flex-start; padding: 1rem;
	}

	.filter-section {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.filter-label {
		font-size: 0.75rem;
		font-weight: 500; color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.filter-chips {
		display: flex; gap: 0.5rem;
		flex-wrap: wrap;
	}

	.filter-chip {
		font-size: 0.75rem; padding: 0.25rem 0.75rem;
		border-radius: 20px; border: 1px solid;
		cursor: pointer; transition: all 0.2s ease;
		opacity: 0.6;
	}

	.filter-chip.active {
		opacity: 1;
	}

	.filter-chip:hover {
		opacity: 1;
	}

	.checkbox-label {
		display: flex;
		align-items: center; gap: 0.5rem;
		font-size: 0.875rem; color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
	}

	.checkbox-label input {
		accent-color: #00d4ff;
	}

	.filter-select {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px; padding: 0.5rem;
		color: white;
		font-size: 0.875rem;
	}

	.filter-actions {
		margin-left: auto; display: flex;
		align-items: center;
	}

	.stats-bar {
		display: flex; gap: 2rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
	}

	.stat {
		display: flex;
		align-items: baseline; gap: 0.5rem;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 600; color: white;
	}

	.stat-label {
		font-size: 0.875rem; color: rgba(255, 255, 255, 0.5);
	}

	.graph-container {
		flex: 1; position: relative;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 12px; overflow: hidden;
	}

	.loading-state {
		position: absolute; inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; gap: 1rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.detail-panel-container {
		position: absolute; top: 1rem;
		left: 1rem;
		z-index: 20;
	}

	.hover-tooltip {
		position: absolute; bottom: 1rem;
		left: 50%; transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px; padding: 0.75rem 1rem;
		z-index: 15;
		min-width: 200px;
	}

	.tooltip-header {
		display: flex;
		align-items: center; gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.type-badge {
		font-size: 0.65rem;
		font-weight: 500; padding: 0.15rem 0.4rem;
		border-radius: 4px; border: 1px solid;
		text-transform: uppercase;
	}

	.tooltip-name {
		font-weight: 500; color: white;
	}

	.tooltip-path {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 0.25rem;
	}

	.tooltip-errors {
		font-size: 0.75rem; color: #f87171;
	}
</style>



