// scripts/phase89-graph-visualizer.mjs
// D3-based graph logic for AST topology (can be used by Svelte component)

import * as d3 from 'd3';

export class ASTGraphVisualizer {
	constructor(container, options = {}) {
		this.container = container;
		this.width = options.width || container.clientWidth;
		this.height = options.height || 600;
		this.onNodeClick = options.onNodeClick || (() => {});

		this.svg = null;
		this.simulation = null;
		this.nodes = [];
		this.edges = [];
	}

	init() {
		// Clear existing
		d3.select(this.container).selectAll('*').remove();

		this.svg = d3.select(this.container)
			.append('svg')
			.attr('width', this.width)
			.attr('height', this.height)
			.attr('class', 'ast-graph-canvas');

		const g = this.svg.append('g');

		// Zoom behavior
		const zoom = d3.zoom()
			.scaleExtent([0.1, 4])
			.on('zoom', (event) => {
				g.attr('transform', event.transform);
			});

		this.svg.call(zoom);

		return g;
	}

	setData(nodes, edges) {
		this.nodes = nodes;
		this.edges = edges;
	}

	render() {
		if (!this.svg) return;

		const g = this.svg.select('g');
		g.selectAll('*').remove();

		// Force simulation
		this.simulation = d3.forceSimulation(this.nodes)
			.force('link', d3.forceLink(this.edges)
				.id(d => d.id)
				.distance(100))
			.force('charge', d3.forceManyBody().strength(-300))
			.force('center', d3.forceCenter(this.width / 2, this.height / 2))
			.force('collision', d3.forceCollide().radius(30));

		// Render edges
		const link = g.append('g')
			.selectAll('path')
			.data(this.edges)
			.join('path')
			.attr('class', d => `graph-edge ${d.type === 'error-propagation' ? 'error-path' : ''}`)
			.attr('stroke-width', 1.5);

		// Render nodes
		const node = g.append('g')
			.selectAll('g')
			.data(this.nodes)
			.join('g')
			.attr('class', 'graph-node')
			.call(d3.drag()
				.on('start', (event, d) => this.dragstarted(event, d))
				.on('drag', (event, d) => this.dragged(event, d))
				.on('end', (event, d) => this.dragended(event, d)))
			.on('click', (event, d) => this.onNodeClick(d));

		node.append('circle')
			.attr('r', d => (d.type === 'route' ? 12 : 8))
			.attr('class', d => `${d.status}-node`);

		node.append('text')
			.attr('dy', -15)
			.attr('text-anchor', 'middle')
			.attr('fill', '#e5e7eb')
			.attr('font-size', '10px')
			.text(d => d.label);

		// Error count badges
		node.filter(d => d.errorCount > 0)
			.append('circle')
			.attr('cx', 10)
			.attr('cy', -10)
			.attr('r', 8)
			.attr('fill', '#ef4444');

		node.filter(d => d.errorCount > 0)
			.append('text')
			.attr('x', 10)
			.attr('y', -7)
			.attr('text-anchor', 'middle')
			.attr('fill', 'white')
			.attr('font-size', '8px')
			.text(d => d.errorCount);

		// Update positions on tick
		this.simulation.on('tick', () => {
			link.attr('d', d => {
				const dx = d.target.x - d.source.x;
				const dy = d.target.y - d.source.y;
				const dr = Math.sqrt(dx * dx + dy * dy) * 2;
				return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
			});

			node.attr('transform', d => `translate(${d.x},${d.y})`);
		});
	}

	update() {
		if (!this.svg) return;

		// Update node classes based on status changes
		this.svg.selectAll('g.graph-node circle')
			.attr('class', d => `${d.status}-node`);
	}

	dragstarted(event, d) {
		if (!event.active) this.simulation.alphaTarget(0.3).restart();
		d.fx = d.x;
		d.fy = d.y;
	}

	dragged(event, d) {
		d.fx = event.x;
		d.fy = event.y;
	}

	dragended(event, d) {
		if (!event.active) this.simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
	}

	destroy() {
		if (this.simulation) {
			this.simulation.stop();
		}
		if (this.svg) {
			this.svg.remove();
		}
	}
}
