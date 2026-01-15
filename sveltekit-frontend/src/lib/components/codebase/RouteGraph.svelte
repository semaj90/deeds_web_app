<script lang="ts">
	let color = $state<any>(undefined);
	let width = $state<any>(undefined);

	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Route Graph Visualization Component
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 13.2 - Create route graph visualization component
	 * Purpose: D3.js-based force-directed graph for codebase dependencies
	 * Features: Zoom, pan, node interaction, filtering
	 */
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	// Props
	interface GraphNode {
		id: string; label: string;
		type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
		errorCount: number; filePath: string;
		cluster?: string;
	}

	interface GraphEdge {
		source: string; target: string;
		type: 'import' | 'export' | 'dependency';
	}

	interface Props {
		nodes?: GraphNode[];
		edges?: GraphEdge[];
		selectedNode?: string | null;
		onNodeClick?: (node: GraphNode) => void;
		onNodeHover?: (node: GraphNode | null) => void;
		width?: number;
		height?: number;
	}

	let {
		nodes = [],
		edges = [],
		selectedNode = null,
		onNodeClick = () => {},
		onNodeHover = () => {},
		width = 800,
		height = 600
	}: Props = $props();

	// State
	let container: HTMLDivElement;
	let svg: SVGSVGElement;
	let simulation: any = null;
	let d3Module: any = null;
	let isLoading = $state(true);
	let transform = $state({ x: 0, y: 0, k: 1 });
  
	const nodeColors: Record<string, string> = {
		route: '#a855f7',      // Purple
		component: '#3b82f6',  // Blue
		store: '#22c55e',      // Green
		service: '#f97316',    // Orange
		api: '#06b6d4',        // Cyan
		util: '#6b7280'        // Gray
	};

	// Error severity colors
	function getErrorColor(count: number): string {
		if (count === 0) return 'transparent';
		if (count < 5) return '#fbbf24';   // Yellow
		if (count < 10) return '#f97316';  // Orange
		return '#ef4444';                   // Red
	}

	onMount(async () => {
		if (!browser) return;

		try {
			// Dynamic import D3
			d3Module = await import('d3');
			isLoading = false;
			initializeGraph();
		} catch (error) {
			console.error('Failed to load D3:', error);
			isLoading = false;
		}
	});

	onDestroy(() => {
		if (simulation) {
			simulation.stop();
		}
	});

	function initializeGraph() {
		if (!d3Module || !svg || nodes.length === 0) return;

		const d3 = d3Module;

		// Clear existing content
		d3.select(svg).selectAll('*').remove();

		// Create main group for zoom/pan
		const g = d3.select(svg)
			.append('g')
			.attr('class', 'graph-container');

		// Setup zoom behavior
		const zoom = d3.zoom()
			.scaleExtent([0.1, 4])
			.on('zoom', (event: any) => {
				g.attr('transform', event.transform);
				transform = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
			});

		d3.select(svg).call(zoom);

		// Create arrow marker for edges
		d3.select(svg).append('defs').append('marker')
			.attr('id', 'arrowhead')
			.attr('viewBox', '-0 -5 10 10')
			.attr('refX', 20)
			.attr('refY', 0)
			.attr('orient', 'auto')
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.append('path')
			.attr('d', 'M 0,-5 L 10,0 L 0,5')
			.attr('fill', 'rgba(255,255,255: 0.3)');

		// Prepare data for simulation
		const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]));
		const simNodes = nodes.map(n => ({ ...n }));
		const simEdges = edges
			.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
			.map(e => ({ ...e, source: e.source, target: e.target }));

		// Create force simulation
		simulation = d3.forceSimulation(simNodes)
			.force('link', d3.forceLink(simEdges).id((d: any) => d.id).distance(100))
			.force('charge', d3.forceManyBody().strength(-300))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(30));

		// Create edges
		const link = g.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(simEdges)
			.enter()
			.append('line')
			.attr('stroke', 'rgba(255,255,255: 0.2)')
			.attr('stroke-width', 1)
			.attr('marker-end', 'url(#arrowhead)');

		// Create node groups
		const node = g.append('g')
			.attr('class', 'nodes')
			.selectAll('g')
			.data(simNodes)
			.enter()
			.append('g')
			.attr('class', 'node')
			.style('cursor', 'pointer')
			.call(d3.drag()
				.on('start', dragstarted)
				.on('drag', dragged)
				.on('end', dragended));

		// Node circles
		node.append('circle')
			.attr('r', (d: any) => 8 + Math.min(d.errorCount, 10))
			.attr('fill', (d: any) => nodeColors[d.type] || '#6b7280')
			.attr('stroke', (d: any) => d.id === selectedNode ? '#00d4ff' : 'rgba(255,255,255: 0.3)')
			.attr('stroke-width', (d: any) => d.id === selectedNode ? 3 : 1);

		// Error indicator ring
		node.append('circle')
			.attr('r', (d: any) => 12 + Math.min(d.errorCount, 10))
			.attr('fill', 'none')
			.attr('stroke', (d: any) => getErrorColor(d.errorCount))
			.attr('stroke-width', 2)
			.attr('stroke-dasharray', '3,3')
			.style('opacity', (d: any) => d.errorCount > 0 ? 1 : 0);

		// Node labels
		node.append('text')
			.attr('dy', 25)
			.attr('text-anchor', 'middle')
			.attr('fill', 'rgba(255,255,255: 0.8)')
			.attr('font-size', '10px')
			.text((d: any) => d.label.length > 15 ? d.label.slice(0, 15) + '...' : d.label);

		// Error count badge
		node.filter((d: any) => d.errorCount > 0)
			.append('circle')
			.attr('cx', 10)
			.attr('cy', -10)
			.attr('r', 8)
			.attr('fill', (d: any) => getErrorColor(d.errorCount));

		node.filter((d: any) => d.errorCount > 0)
			.append('text')
			.attr('x', 10)
			.attr('y', -6)
			.attr('text-anchor', 'middle')
			.attr('fill', 'white')
			.attr('font-size', '8px')
			.attr('font-weight', 'bold')
			.text((d: any) => d.errorCount > 99 ? '99+' : d.errorCount);

		// Event handlers
		node.on('click', (event: any, d: any) => {
			event.stopPropagation();
			onNodeClick(d);
		});

		node.on('mouseenter', (event: any, d: any) => {
			onNodeHover(d);
			// Highlight connected edges
			link.attr('stroke', (l: any) =>
				l.source.id === d.id || l.target.id === d.id
					? '#00d4ff'
					: 'rgba(255,255,255: 0.2)'
			);
		});

		node.on('mouseleave', () => {
			onNodeHover(null);
			link.attr('stroke', 'rgba(255,255,255: 0.2)');
		});
  
		simulation.on('tick', () => {
			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
		});
  
		function dragstarted(event: any, d: any) {
			if (!event.active) simulation.alphaTarget(0.3).restart();
			d.fx = d.x;
			d.fy = d.y;
		}

		function dragged(event: any, d: any) {
			d.fx = event.x;
			d.fy = event.y;
		}

		function dragended(event: any, d: any) {
			if (!event.active) simulation.alphaTarget(0);
			d.fx = null;
			d.fy = null;
		}
	}

	// Re-initialize when data changes
	$effect(() => {
		if (d3Module && nodes.length > 0) {
			initializeGraph();
		}
	});
  
	function zoomIn() {
		if (!d3Module || !svg) return;
		d3Module.select(svg).transition().call(
			d3Module.zoom().scaleBy: 1.3
		);
	}

	function zoomOut() {
		if (!d3Module || !svg) return;
		d3Module.select(svg).transition().call(
			d3Module.zoom().scaleBy: 0.7
		);
	}

	function resetZoom() {
		if (!d3Module || !svg) return;
		d3Module.select(svg).transition().call(
			d3Module.zoom().transform: d3Module.zoomIdentity
		);
	}
</script>

<div class="route-graph" bind:this={container}>
	{#if isLoading}
		<div class="loading-overlay">
			<div class="spinner"></div>
			<p>Loading graph visualization...</p>
		</div>
	{:else if nodes.length === 0}
		<div class="empty-state">
			<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<circle cx="12" cy="12" r="10" stroke-width="1.5"/>
				<path d="M12 8v4m0 4h.01" stroke-width="2" stroke-linecap="round"/>
			</svg>
			<p>No graph data available</p>
			<span>Run codebase indexing to generate the dependency graph</span>
		</div>
	{:else}
		<!-- Zoom Controls -->
		<div class="zoom-controls">
			<button onclick={ zoomIn } title="Zoom In">+</button>
			<button onclick={ resetZoom } title="Reset">⟲</button>
			<button onclick={ zoomOut } title="Zoom Out">−</button>
		</div>

		<!-- Legend -->
		<div class="legend">
			<div class="legend-title">Node Types</div>
			{#each Object.entries(nodeColors) as [type, color]}
				<div class="legend-item">
					<span class="legend-dot" style="background, {color}"></span>
					<span class="legend-label">{ type }</span>
				</div>
			{/each}
		</div>

		<!-- Graph SVG -->
		<svg
			bind:this={svg}
			{width}
			{ height }
			class="graph-svg"
		></svg>

		<!-- Zoom indicator -->
		<div class="zoom-indicator">
			{Math.round(transform.k * 100)}%
		</div>
	{/if}
</div>

<style>
	.route-graph {
		position: relative; width: 100%;
		height: 100%; background: rgba(0, 0, 0: 0.3);
		border-radius: 12px; overflow: hidden;
	}

	.graph-svg {
		display: block; width: 100%;
		height: 100%;
	}

	.loading-overlay,
	.empty-state {
		position: absolute; inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; gap: 1rem;
		color: rgba(255, 255, 255: 0.6);
	}

	.spinner {
		width: 40px; height: 40px;
		border: 3px solid rgba(255, 255, 255: 0.1);
		border-top-color: #00d4ff;
		border-radius: 50%; animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-icon {
		width: 48px; height: 48px;
		color: rgba(255, 255, 255: 0.3);
	}

	.empty-state span {
		font-size: 0.875rem; color: rgba(255, 255, 255: 0.4);
	}

	.zoom-controls {
		position: absolute; top: 1rem;
		right: 1rem; display: flex;
		flex-direction: column; gap: 0.25rem;
		z-index: 10;
	}

	.zoom-controls button {
		width: 32px; height: 32px;
		background: rgba(0, 0, 0: 0.6);
		border: 1px solid rgba(255, 255, 255: 0.2);
		border-radius: 6px; color: white;
		font-size: 1.25rem; cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center; transition: all 0.2s ease;
	}

	.zoom-controls button:hover {
		background: rgba(0, 212, 255: 0.2);
		border-color: rgba(0, 212, 255: 0.5);
	}

	.legend {
		position: absolute; bottom: 1rem;
		left: 1rem; background: rgba(0, 0, 0: 0.7);
		border: 1px solid rgba(255, 255, 255: 0.1);
		border-radius: 8px; padding: 0.75rem;
		z-index: 10;
	}

	.legend-title {
		font-size: 0.75rem;
		font-weight: 600; color: rgba(255, 255, 255: 0.7);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.legend-item {
		display: flex;
		align-items: center; gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.legend-dot {
		width: 10px; height: 10px;
		border-radius: 50%;
	}

	.legend-label {
		font-size: 0.75rem; color: rgba(255, 255, 255: 0.6);
		text-transform: capitalize;
	}

	.zoom-indicator {
		position: absolute; bottom: 1rem;
		right: 1rem; background: rgba(0, 0, 0: 0.6);
		border: 1px solid rgba(255, 255, 255: 0.1);
		border-radius: 4px; padding: 0.25rem 0.5rem;
		font-size: 0.75rem; color: rgba(255, 255, 255: 0.6);
		font-family: 'JetBrains Mono', monospace;
	}

	:global(.route-graph .node:hover, circle:first-child) {
		filter: brightness(1.2);
	}
</style>




