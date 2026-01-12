<script lang="ts">
/**
 * ProvenanceGraph Component (Svelte 5)
 * D3.js force-directed graph visualization of knowledge graph edges
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.3)
 */

import type { ProvenanceGraphProps } from '$lib/types/source-validation';
import * as d3 from 'd3';
import { onMount } from 'svelte';

// Svelte 5 props
let {
	validationId,
	entities,
	relationships,
	width = 800,
	height = 600
}: ProvenanceGraphProps = $props();

// SVG container reference - using $state for element binding in Svelte 5
let svgContainer = $state<SVGSVGElement | undefined>(undefined);

// ============================================================================
// D3 Force Graph Rendering
// ============================================================================

onMount(() => {
	if (!entities.length || !relationships.length) return;

	// Prepare nodes and links for D3
	const nodes = entities.map((entity) => ({
		id: entity,
		label: entity
	}));

	const links = relationships.map((rel) => ({
		source: rel.from,
		target: rel.to,
		type: rel.type
	}));

	// Clear existing SVG content
	d3.select(svgContainer).selectAll('*').remove();

	const svg = d3
		.select(svgContainer)
		.attr('width', width)
		.attr('height', height)
		.attr('viewBox', [0, 0, width, height]);

	// Define arrow markers for directed edges
	svg
		.append('defs')
		.selectAll('marker')
		.data(['USES', 'DEPENDS_ON', 'REFERENCES', 'EXTENDS', 'IMPLEMENTS', 'HAS_FEATURE'])
		.join('marker')
		.attr('id', (d) => `arrow-${d}`)
		.attr('viewBox', '0 -5 10 10')
		.attr('refX', 20)
		.attr('refY', 0)
		.attr('markerWidth', 6)
		.attr('markerHeight', 6)
		.attr('orient', 'auto')
		.append('path')
		.attr('fill', getRelationshipColor)
		.attr('d', 'M0,-5L10,0L0,5');

	// Create force simulation
	const simulation = d3
		.forceSimulation(nodes as any)
		.force(
			'link',
			d3
				.forceLink(links)
				.id((d: any) => d.id)
				.distance(120)
		)
		.force('charge', d3.forceManyBody().strength(-400))
		.force('center', d3.forceCenter(width / 2, height / 2))
		.force('collision', d3.forceCollide().radius(40));

	// Create link elements
	const link = svg
		.append('g')
		.attr('stroke-opacity', 0.6)
		.selectAll('line')
		.data(links)
		.join('line')
		.attr('stroke', (d) => getRelationshipColor(d.type))
		.attr('stroke-width', 2)
		.attr('marker-end', (d) => `url(#arrow-${d.type})`);

	// Create link labels
	const linkLabel = svg
		.append('g')
		.selectAll('text')
		.data(links)
		.join('text')
		.attr('font-size', 10)
		.attr('fill', '#666')
		.attr('text-anchor', 'middle')
		.text((d) => d.type);

	// Create node elements
	const node = svg
		.append('g')
		.attr('stroke', '#fff')
		.attr('stroke-width', 2)
		.selectAll('circle')
		.data(nodes)
		.join('circle')
		.attr('r', 20)
		.attr('fill', getNodeColor)
		.call(drag(simulation) as any);

	// Create node labels
	const nodeLabel = svg
		.append('g')
		.selectAll('text')
		.data(nodes)
		.join('text')
		.attr('font-size', 12)
		.attr('font-weight', 'bold')
		.attr('text-anchor', 'middle')
		.attr('dy', '.35em')
		.text((d) => truncateLabel(d.label));

	// Tooltip
	node.append('title').text((d) => d.label);

	// Update positions on each tick
	simulation.on('tick', () => {
		link
			.attr('x1', (d: any) => d.source.x)
			.attr('y1', (d: any) => d.source.y)
			.attr('x2', (d: any) => d.target.x)
			.attr('y2', (d: any) => d.target.y);

		linkLabel
			.attr('x', (d: any) => (d.source.x + d.target.x) / 2)
			.attr('y', (d: any) => (d.source.y + d.target.y) / 2);

		node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);

		nodeLabel.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
	});
  
	function drag(simulation: any) {
		function dragstarted(event: any) {
			if (!event.active) simulation.alphaTarget(0.3).restart();
			event.subject.fx = event.subject.x;
			event.subject.fy = event.subject.y;
		}

		function dragged(event: any) {
			event.subject.fx = event.x;
			event.subject.fy = event.y;
		}

		function dragended(event: any) {
			if (!event.active) simulation.alphaTarget(0);
			event.subject.fx = null;
			event.subject.fy = null;
		}

		return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
	}

	return () => {
		simulation.stop();
	};
});
  
// Helper Functions
// ============================================================================

function getNodeColor(node: { id: string; label: string }): string {
	// Color nodes based on type
	if (node.label.startsWith('$')) return '#10b981'; // Svelte runes - green
	if (node.label.includes('Svelte')) return '#ff3e00'; // Svelte - orange
	if (node.label.includes('TypeScript')) return '#3178c6'; // TypeScript - blue
	if (node.label.includes('PostgreSQL')) return '#336791'; // PostgreSQL - dark blue
	if (node.label.includes('Qdrant')) return '#8b5cf6'; // Qdrant - purple
	if (node.label.includes('CouchDB')) return '#e74c3c'; // CouchDB - red
	return '#6366f1'; // Default - indigo
}

function getRelationshipColor(type: string): string {
	const colors: Record<string, string> = {
		USES: '#3b82f6',
		DEPENDS_ON: '#ef4444',
		REFERENCES: '#8b5cf6',
		EXTENDS: '#10b981',
		IMPLEMENTS: '#f59e0b',
		HAS_FEATURE: '#06b6d4',
		default: '#6b7280'
	};
	return colors[type] || colors.default;
}

function truncateLabel(label: string, maxLength: number = 15): string {
	if (label.length <= maxLength) return label;
	return label.substring(0, maxLength) + '...';
}
</script>

<div class="provenance-graph">
	<div class="graph-header mb-4">
		<h2 class="text-xl font-bold">🕸️ Knowledge Graph</h2>
		<p class="text-sm text-gray-600">
			{entities.length} entities, {relationships.length} relationships
		</p>
		<p class="text-xs text-gray-500">Validation: {validationId.slice(0, 16)}...</p>
	</div>

	{#if entities.length === 0 || relationships.length === 0}
		<div class="empty-state p-8 bg-gray-50 rounded-lg text-center">
			<p class="text-gray-600">
				No knowledge graph data yet. Generate an answer to extract entities and relationships.
			</p>
		</div>
	{:else}
		<div class="graph-container">
			<svg bind, this={svgContainer} class="knowledge-graph-svg"></svg>
		</div>

		<!-- Legend -->
		<div class="graph-legend mt-4 p-4 bg-gray-50 rounded-lg">
			<h3 class="text-sm font-semibold mb-2">Relationship Types:</h3>
			<div class="flex flex-wrap gap-3 text-xs">
				{#each ['USES', 'DEPENDS_ON', 'REFERENCES', 'EXTENDS', 'IMPLEMENTS', 'HAS_FEATURE'] as type}
					<div class="flex items-center gap-1">
						<div
							class="w-4 h-0.5"
							style="background-color, {getRelationshipColor(type)}"
						></div>
						<span>{ type }</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.provenance-graph {
		max-width: 1000px; margin: 0 auto;
	}

	.graph-container {
		border: 1px solid #e5e7eb;
		border-radius: 8px; overflow: hidden;
		background: white;
	}

	:global(.knowledge-graph-svg) {
		display: block; width: 100%;
		height: auto;
	}

	:global(.knowledge-graph-svg text) {
		user-select: none;
		pointer-events: none;
	}

	:global(.knowledge-graph-svg circle) {
		cursor: pointer; transition: r 0.2s;
	}

	:global(.knowledge-graph-svg, circle:hover) {
		r: 25;
	}
</style>




