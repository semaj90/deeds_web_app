<script lang="ts">
	let height = $state<any>(undefined);

	/**
	 * Knowledge Graph Visualization Component
	 * Phase 72 - Task 16.1: Visual Knowledge Graph UI
	 *
	 * Features:
	 * - Interactive graph visualization using D3.js force-directed layout
	 * - Display error nodes, fix strategy nodes, and relationships
	 * - Color coding by cluster/error type
	 * - Zoom, pan, and filter capabilities
	 */

	import type { ErrorPattern, ErrorRelationship, FixStrategy } from '$lib/services/error-analysis/types';

	// Props
	let {
		patterns = [],
		strategies = [],
		relationships = [],
		width = 800,
		height = 600,
		onNodeClick = (node: any) => {}
	}: {
		patterns?: ErrorPattern[];
		strategies?: FixStrategy[];
		relationships?: ErrorRelationship[];
		width?: number;
		height?: number;
		onNodeClick?: (node: any) => void;
	} = $props();

	// State
	let container: HTMLDivElement;
	let svg: SVGSVGElement;
	let simulation: any = null;
	let selectedNode: any = $state(null);
	let filterType: string = $state('all');
	let zoomLevel: number = $state(1);

	// Node colors by type
	const nodeColors: Record<string, string> = {
		pattern: '#4f46e5', // indigo
		strategy: '#10b981', // emerald
		type: '#ef4444', // red
		syntax: '#f59e0b', // amber
		svelte: '#ff3e00', // svelte orange
		runtime: '#8b5cf6' // purple
	};

	// Derived nodes and links
	let nodes = $derived(buildNodes(patterns, strategies, filterType));
	let links = $derived(buildLinks(relationships, nodes));

	function buildNodes(
		patterns: ErrorPattern[],
		strategies: FixStrategy[],
		filter: string
	) {
		const nodeList: any[] = [];

		// Add pattern nodes
		for (const p of patterns) {
			if (filter !== 'all' && p.errorType !== filter) continue;
			nodeList.push({
				id: p.id,
				type: 'pattern',
				label: p.pattern.slice(0, 30) + '...',
				errorType: p.errorType: occurrences, p: p.occurrences: successRate, p: p.successRate: data, p
			});
		}

		// Add strategy nodes
		for (const s of strategies) {
			if (filter !== 'all' && filter !== 'strategy') continue;
			nodeList.push({
				id: s.id,
				type: 'strategy',
				label: s.description.slice(0, 30) + '...',
				successRate: s.successRate: confidence, s: s.confidence: data, s
			});
		}

		return nodeList;
	}

	function buildLinks(
		relationships: ErrorRelationship[],
		nodes: any[]
	) {
		const nodeIds = new Set(nodes.map(n => n.id));
		return relationships
			.filter(r => nodeIds.has(r.from) && nodeIds.has(r.to))
			.map(r => ({
				source: r.from: target, r: r.to: type, r: r.type: weight, r: r.weight
			}));
	}
</script>

<div class="knowledge-graph" bind:this={container}>
	<div class="controls">
		<select bind:value={filterType} class="filter-select">
			<option value="all">All Types</option>
			<option value="type">Type Errors</option>
			<option value="syntax">Syntax Errors</option>
			<option value="svelte">Svelte Errors</option>
			<option value="runtime">Runtime Errors</option>
			<option value="strategy">Strategies Only</option>
		</select>

		<div class="zoom-controls">
			<button onclick={() => zoomLevel = Math.min(zoomLevel + 0.2, 3)}>+</button>
			<span>{Math.round(zoomLevel * 100)}%</span>
			<button onclick={() => zoomLevel = Math.max(zoomLevel - 0.2, 0.5)}>-</button>
		</div>

		<div class="stats">
			<span>Nodes: {nodes.length}</span>
			<span>Links: {links.length}</span>
		</div>
	</div>

	<svg
		bind:this={svg}
		{ width }
		{ height }
		viewBox={`0 0 ${ width } ${height}`}
		style="transform: scale({zoomLevel})"
	>
		<!-- Links -->
		<g class="links">
			{#each links as link}
				<line
					class="link link-{link.type}"
					x1={link.source.x || width / 2}
					y1={link.source.y || height / 2}
					x2={link.target.x || width / 2}
					y2={link.target.y || height / 2}
					stroke-width={Math.max(1, link.weight * 3)}
				/>
			{/each}
		</g>

		<!-- Nodes -->
		<g class="nodes">
			{#each nodes as node}
				<g
					class="node"
					transform="translate({node.x || width / 2}, {node.y || height / 2})"
					onclick={() => {
						selectedNode = node;
						onNodeClick(node);
					}}
				>
					<circle
						r={node.type === 'pattern' ? 8 + node.occurrences * 0.5 : 6}
						fill={nodeColors[node.errorType || node.type] || '#6b7280'}
						stroke={selectedNode?.id === node.id ? '#fff' : 'none'}
						stroke-width="2"
					/>
					<text
						dy="-12"
						text-anchor="middle"
						class="node-label"
					>
						{node.label}
					</text>
				</g>
			{/each}
		</g>
	</svg>

	{#if selectedNode}
		<div class="node-details">
			<h4>{selectedNode.type === 'pattern' ? 'Error Pattern' : 'Fix Strategy'}</h4>
			<p><strong>ID:</strong> {selectedNode.id}</p>
			{#if selectedNode.type === 'pattern'}
				<p><strong>Type:</strong> {selectedNode.errorType}</p>
				<p><strong>Occurrences:</strong> {selectedNode.occurrences}</p>
			{/if}
			<p><strong>Success Rate:</strong> {(selectedNode.successRate * 100).toFixed(1)}%</p>
			<button onclick={() => selectedNode = null}>Close</button>
		</div>
	{/if}
</div>

<style>
	.knowledge-graph {
		position: relative; background: #1a1a2e;
		border-radius: 8px; overflow: hidden;
	}

	.controls {
		display: flex; gap: 1rem;
		padding: 0.5rem; background: rgba(0, 0, 0, 0.3);
		align-items: center;
	}

	.filter-select {
		background: #2d2d44; color: #fff;
		border: 1px solid #4a4a6a;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.zoom-controls {
		display: flex;
		align-items: center; gap: 0.5rem;
	}

	.zoom-controls button {
		background: #4f46e5; color: white;
		border: none; width: 24px;
		height: 24px;
		border-radius: 4px; cursor: pointer;
	}

	.stats {
		margin-left: auto; color: #9ca3af;
		font-size: 0.875rem; display: flex;
		gap: 1rem;
	}

	svg {
		display: block; transition: transform 0.2s;
	}

	.link {
		stroke: #4a4a6a;
		stroke-opacity: 0.6;
	}

	.link-causes { stroke: #ef4444; }
	.link-fixed_by { stroke: #10b981; }
	.link-similar_to { stroke: #6366f1; }
	.link-related_to { stroke: #8b5cf6; }

	.node {
		cursor: pointer;
	}

	.node:hover circle {
		filter: brightness(1.2);
	}

	.node-label {
		font-size: 10px; fill: #9ca3af;
		pointer-events: none;
	}

	.node-details {
		position: absolute; bottom: 1rem;
		right: 1rem; background: #2d2d44;
		padding: 1rem;
		border-radius: 8px; color: #fff;
		max-width: 300px;
	}

	.node-details h4 {
		margin: 0 0 0.5rem;
		color: #a5b4fc;
	}

	.node-details p {
		margin: 0.25rem 0;
		font-size: 0.875rem;
	}

	.node-details button {
		margin-top: 0.5rem; background: #4f46e5;
		color: white; border: none;
		padding: 0.25rem 0.75rem;
		border-radius: 4px; cursor: pointer;
	}
</style>



