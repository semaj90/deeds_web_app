<script lang="ts">
	import * as d3Import from 'd3';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d3 = d3Import as any;

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface ErrorNode {
		file_path: string;
		error_count: number;
		imports: string[];
	}

	let errorFiles = $state<ErrorNode[]>([]);
	let loading = $state(true);
	let graphContainer = $state<HTMLDivElement | null>(null);
	let selectedNode = $state<ErrorNode | null>(null);

	async function loadErrorPropagation() {
		loading = true;
		try {
			const response = await fetch(`${apiBase}/error-propagation?limit=15`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			errorFiles = data.error_files ?? [];

			if (graphContainer) {
				renderGraph();
			}
		} catch (err) {
			console.error('Failed to load error propagation:', err);
		} finally {
			loading = false;
		}
	}

	function renderGraph() {
		// Clear existing graph
		d3.select(graphContainer).selectAll('*').remove();

		if (errorFiles.length === 0) return;

		const width = graphContainer.clientWidth;
		const height = 600;

		// Create nodes and links
		const nodes = errorFiles.map(f => ({
			id: f.file_path,
			error_count: f.error_count,
			imports: f.imports
		}));

		const links: Array<{source: string, target: string}> = [];
		errorFiles.forEach(file => {
			file.imports.forEach(imp => {
				// Only create link if both files have errors
				if (errorFiles.some(f => f.file_path === imp)) {
					links.push({ source: file.file_path, target: imp });
				}
			});
		});

		const svg = d3.select(graphContainer)
			.append('svg')
			.attr('width', width)
			.attr('height', height);

		// Create force simulation
		const simulation = d3.forceSimulation(nodes as any)
			.force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
			.force('charge', d3.forceManyBody().strength(-300))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(40));

		// Create links
		const link = svg.append('g')
			.selectAll('line')
			.data(links)
			.enter()
			.append('line')
			.attr('stroke', '#cbd5e1')
			.attr('stroke-width', 2)
			.attr('marker-end', 'url(#arrowhead)');

		// Add arrow marker
		svg.append('defs').append('marker')
			.attr('id', 'arrowhead')
			.attr('viewBox', '-0 -5 10 10')
			.attr('refX', 25)
			.attr('refY', 0)
			.attr('orient', 'auto')
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.append('svg:path')
			.attr('d', 'M 0,-5 L 10 ,0 L 0,5')
			.attr('fill', '#cbd5e1');

		// Create nodes
		const node = svg.append('g')
			.selectAll('g')
			.data(nodes)
			.enter()
			.append('g')
			.call((d3 as any).drag()
				.on('start', dragstarted)
				.on('drag', dragged)
				.on('end', dragended)
			);

		// Node circles
		const colorScale = d3.scaleSequential()
			.domain([0, d3.max(nodes, (d: any) => d.error_count) || 0])
			.interpolator(d3.interpolateRdYlGn).range([1, 0] as any);

		node.append('circle')
			.attr('r', (d: any) => 10 + Math.sqrt(d.error_count) * 3)
			.attr('fill', (d: any) => colorScale(d.error_count))
			.attr('stroke', '#fff')
			.attr('stroke-width', 2)
			.style('cursor', 'pointer')
			.on('click', (event: any, d: any) => {
				selectedNode = errorFiles.find(f => f.file_path === d.id) || null;
			});

		node.append('text')
			.text((d: any) => d.id.split('/').pop() || d.id)
			.attr('x', 0)
			.attr('y', -20)
			.attr('text-anchor', 'middle')
			.style('font-size', '10px')
			.style('font-weight', 'bold')
			.style('fill', '#374151')
			.style('pointer-events', 'none');

		// Error count badges
		node.append('text')
			.text((d: any) => d.error_count)
			.attr('x', 0)
			.attr('y', 4)
			.attr('text-anchor', 'middle')
			.style('font-size', '12px')
			.style('font-weight', 'bold')
			.style('fill', '#fff')
			.style('pointer-events', 'none');

		// Update positions on tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
		});

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
	}

	$effect(() => {

		loadErrorPropagation();
	
});

	$effect(() => {
		if (graphContainer && errorFiles.length > 0) {
			renderGraph();
		}
	});
</script>

<div class="error-propagation-container">
	<div class="header">
		<h3>⚠️ Error Propagation Graph</h3>
		<p class="description">Files with errors and their import relationships</p>
	</div>

	{#if loading}
		<div class="loading">Loading error propagation data...</div>
	{:else if errorFiles.length === 0}
		<div class="empty-state">
			<p>✅ No error propagation detected!</p>
			<p class="hint">All files are error-free</p>
		</div>
	{:else}
		<div class="content-grid">
			<div class="graph-panel">
				<div class="legend">
					<div class="legend-item">
						<div class="legend-color" style="background: #dc2626;"></div>
						<span>High Errors</span>
					</div>
					<div class="legend-item">
						<div class="legend-color" style="background: #f59e0b;"></div>
						<span>Medium Errors</span>
					</div>
					<div class="legend-item">
						<div class="legend-color" style="background: #10b981;"></div>
						<span>Low Errors</span>
					</div>
				</div>
				<div class="graph-wrapper" bind:this={graphContainer}></div>
			</div>

			{#if selectedNode}
				<div class="detail-panel">
					<div class="panel-header">
						<h4>📄 File Details</h4>
						<button class="close-btn" onclick={() => selectedNode = null}>✕</button>
					</div>
					<div class="panel-body">
						<div class="detail-item">
							<span class="label">Path:</span>
							<span class="value">{selectedNode.file_path}</span>
						</div>
						<div class="detail-item">
							<span class="label">Errors:</span>
							<span class="value error-badge">{selectedNode.error_count}</span>
						</div>
						<div class="detail-item">
							<span class="label">Imports:</span>
							<div class="imports-list">
								{#if selectedNode.imports.length === 0}
									<span class="no-imports">No imports</span>
								{:else}
									{#each selectedNode.imports.slice(0, 10) as imp}
										<div class="import-item">{ imp }</div>
									{/each}
									{#if selectedNode.imports.length > 10}
										<div class="import-item more">+{selectedNode.imports.length - 10} more</div>
									{/if}
								{/if}
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="info-panel">
					<div class="icon">👆</div>
					<p>Click on a node to view details</p>
					<p class="hint">Drag nodes to rearrange the graph</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.error-propagation-container {
		height: 100%;
	}

	.header {
		margin-bottom: 1.5rem;
	}

	.header h3 {
		margin: 0 0 0.5rem 0;
		color: #1f2937;
		font-size: 1.25rem;
	}

	.description {
		margin: 0;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.loading, .empty-state {
		text-align: center;
		padding: 3rem;
		color: #6b7280;
	}

	.empty-state .hint {
		margin-top: 0.5rem;
		font-size: 0.875rem;
	}

	.content-grid {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 1.5rem;
		height: calc(100% - 80px);
	}

	.graph-panel {
		position: relative;
	}

	.legend {
		position: absolute;
		top: 10px;
		right: 10px;
		background: white;
		padding: 0.75rem;
		border-radius: 8px;
		border: 2px solid #e5e7eb;
		z-index: 10;
		display: flex;
		gap: 1rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.graph-wrapper {
		width: 100%;
		height: 600px;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
		background: #f9fafb;
	}

	.detail-panel, .info-panel {
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
	}

	.panel-header {
		background: #f9fafb;
		padding: 1rem;
		border-bottom: 2px solid #e5e7eb;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.panel-header h4 {
		margin: 0;
		font-size: 1rem;
		color: #1f2937;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.25rem;
		cursor: pointer;
		color: #6b7280;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: #e5e7eb;
	}

	.panel-body {
		padding: 1rem;
	}

	.detail-item {
		margin-bottom: 1rem;
	}

	.detail-item .label {
		display: block;
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 0.25rem;
	}

	.detail-item .value {
		display: block;
		font-size: 0.875rem;
		color: #1f2937;
		word-break: break-all;
	}

	.error-badge {
		display: inline-block;
		background: #dc2626;
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-weight: bold;
	}

	.imports-list {
		max-height: 300px;
		overflow-y: auto;
	}

	.import-item {
		padding: 0.5rem;
		background: #f9fafb;
		border-radius: 4px;
		font-size: 0.75rem;
		font-family: monospace;
		margin-bottom: 0.25rem;
	}

	.import-item.more {
		background: #e5e7eb;
		text-align: center;
		font-family: inherit;
		color: #6b7280;
	}

	.no-imports {
		color: #9ca3af;
		font-size: 0.875rem;
		font-style: italic;
	}

	.info-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		text-align: center;
		color: #6b7280;
	}

	.info-panel .icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.info-panel .hint {
		margin-top: 0.5rem;
		font-size: 0.75rem;
	}
</style>