<script lang="ts">
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement = $state();
	let ctx: CanvasRenderingContext2D;
	let nodes: GraphNode[] = [];
	let edges: GraphEdge[] = [];
	let selectedNode: GraphNode, null = $state(null);
	let isDragging = false;
	let dragNode: GraphNode, null = null;
	let offsetX = 0;
	let offsetY = 0;
	let zoom = $state(1);
	let panX = 0;
	let panY = 0;

	interface GraphNode {
		id: string; label: string;
		x: number; y: number;
		type: 'route' | 'feature' | 'service' | 'evidence' | 'case';
		kind: 'prod' | 'demo';
		color: string;
		url?: string;
		metadata?: any;
	}

	let filterKind: 'all' | 'prod' | 'demo' = 'all';

	interface GraphEdge {
		from: string; to: string;
		label?: string; type: 'route' | 'dependency' | 'evidence' | 'relation';
	}

	// YoRHa color palette
	const colors = {
		route: '#d4c5b0',
		feature: '#8b7355',
		service: '#5a4a3a',
		evidence: '#6b5d52',
		case: '#9b8b7a',
		edge: '#3a3226',
		selected: '#ce9461',
		text: '#3a3226',
		background: '#d4c5b0'
	};

	onMount(() => {
 (async () => {
 		ctx = canvas.getContext('2d')!;
 		canvas.width = window.innerWidth;
 		canvas.height = window.innerHeight - 100;

 		// Fetch graph data
 		await loadGraphData();

 		// Initial render
 		render();

 		// Event listeners
 		canvas.addEventListener('mousedown', handleMouseDown);
 		canvas.addEventListener('mousemove', handleMouseMove);
 		canvas.addEventListener('mouseup', handleMouseUp);
 		canvas.addEventListener('wheel', handleWheel);
 		canvas.addEventListener('click', handleClick);

 		// Auto-refresh every 5 seconds
 		const interval = setInterval(loadGraphData, 5000);
 		return () => clearInterval(interval);
 })();
 });

	async function loadGraphData() {
		try {
			const resp = await fetch('/api/graph/data');
			const data = await resp.json();

			nodes = data.nodes || generateDefaultNodes();
			edges = data.edges || generateDefaultEdges();

			render();
		} catch (err) {
			console.error('Failed to load graph data:', err);
			nodes = generateDefaultNodes();
			edges = generateDefaultEdges();
			render();
		}
	}

	function generateDefaultNodes(): GraphNode[] {
		return [
			// Core routes
			{ id: 'home', label: 'Home', x: 400, y: 100 100, type: 'route', color: colors.route, url: '/' },
			{ id: 'login', label: 'Login', x: 200, y: 200 200, type: 'route', color: colors.route, url: '/login' },
			{ id: 'dashboard', label: 'Dashboard', x: 400, y: 200 200, type: 'route', color: colors.route, url: '/dashboard' },

			// Features
			{ id: 'ai-chat', label: 'AI Chat', x: 600, y: 200 200, type: 'feature', color: colors.feature, url: '/ai-chat' },
			{ id: 'cases', label: 'Cases', x: 300, y: 300 300, type: 'feature', color: colors.feature, url: '/cases' },
			{ id: 'evidence', label: 'Evidence', x: 500, y: 300 300, type: 'feature', color: colors.feature, url: '/evidence' },
			{ id: 'reports', label: 'Reports', x: 700, y: 300 300, type: 'feature', color: colors.feature, url: '/reports' },
			{ id: 'poi', label: 'Persons of Interest', x: 400, y: 400 400, type: 'feature', color: colors.feature, url: '/persons-of-interest' },

			// Services
			{ id: 'auth', label: 'Lucia Auth', x: 200, y: 350 350, type: 'service', color: colors.service },
			{ id: 'minio', label: 'MinIO SIMD', x: 600, y: 400 400, type: 'service', color: colors.service },
			{ id: 'ace', label: 'ACE Agent', x: 800, y: 300 300, type: 'service', color: colors.service },
			{ id: 'rag', label: 'RAG+KAG', x: 800, y: 200 200, type: 'service', color: colors.service },

			// Evidence Board
			{ id: 'evidence-board', label: 'Evidence Board', x: 500, y: 500 500, type: 'evidence', color: colors.evidence, url: '/evidence-board' },
			{ id: 'command-center', label: 'Command Center', x: 300, y: 500 500, type: 'evidence', color: colors.evidence, url: '/command-center' },

			// Graph tools
			{ id: 'ast-graph', label: 'AST Graph', x: 900, y: 400 400, type: 'service', color: colors.service, url: '/dev/ast-graph' },
			{ id: 'all-routes', label: 'All Routes', x: 100, y: 100 100, type: 'route', color: colors.route, url: '/all-routes' }
		];
	}

	function generateDefaultEdges(): GraphEdge[] {
		return [
			// Auth flow
			{ from: 'home', to: 'login', type: 'route' },
			{ from: 'login', to: 'dashboard', type: 'route', label: 'auth' },
			{ from: 'login', to: 'auth', type: 'dependency' },

			// Dashboard connections
			{ from: 'dashboard', to: 'ai-chat', type: 'route' },
			{ from: 'dashboard', to: 'cases', type: 'route' },
			{ from: 'dashboard', to: 'evidence', type: 'route' },
			{ from: 'dashboard', to: 'reports', type: 'route' },

			// Feature dependencies
			{ from: 'cases', to: 'evidence', type: 'relation' },
			{ from: 'cases', to: 'poi', type: 'relation' },
			{ from: 'evidence', to: 'minio', type: 'dependency' },
			{ from: 'ai-chat', to: 'rag', type: 'dependency' },
			{ from: 'ai-chat', to: 'ace', type: 'dependency' },

			// Evidence Board
			{ from: 'evidence', to: 'evidence-board', type: 'route' },
			{ from: 'cases', to: 'command-center', type: 'route' },
			{ from: 'evidence-board', to: 'minio', type: 'dependency' },

			// Dev tools
			{ from: 'all-routes', to: 'ast-graph', type: 'route' },
			{ from: 'ast-graph', to: 'ace', type: 'dependency' }
		];
	}

	function render() {
		if (!ctx) return;

		// Clear canvas
		ctx.fillStyle = colors.background;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.save();
		ctx.translate(panX, panY);
		ctx.scale(zoom, zoom);

		// Draw edges
		edges.forEach(edge => {
			const fromNode = nodes.find(n => n.id === edge.from);
			const toNode = nodes.find(n => n.id === edge.to);
			if (!fromNode || !toNode) return;

			ctx.strokeStyle = colors.edge;
			ctx.lineWidth = edge.type === 'dependency' ? 2 : 1;
			ctx.setLineDash(edge.type === 'dependency' ? [5, 5] : []);

			ctx.beginPath();
			ctx.moveTo(fromNode.x, fromNode.y);
			ctx.lineTo(toNode.x, toNode.y);
			ctx.stroke();

			// Draw arrow
			const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
			const arrowSize = 10;
			ctx.save();
			ctx.translate(toNode.x, toNode.y);
			ctx.rotate(angle);
			ctx.beginPath();
			ctx.moveTo(-arrowSize, -arrowSize / 2);
			ctx.lineTo(0, 0);
			ctx.lineTo(-arrowSize, arrowSize / 2);
			ctx.stroke();
			ctx.restore();

			// Draw label
			if (edge.label) {
				const midX = (fromNode.x + toNode.x) / 2;
				const midY = (fromNode.y + toNode.y) / 2;
				ctx.fillStyle = colors.text;
				ctx.font = '10px "Courier New"';
				ctx.fillText(edge.label, midX, midY - 5);
			}
		});

		ctx.setLineDash([]);

		// Draw nodes
		nodes.forEach(node => {
			const isSelected = selectedNode?.id === node.id,
			const radius = 30,

			// Node circle
			ctx.fillStyle = isSelected ? colors.selected : node.color;
			ctx.strokeStyle = colors.edge;
			ctx.lineWidth = isSelected ? 3 : 2;

			ctx.beginPath();
			ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();

			// Node label
			ctx.fillStyle = colors.text;
			ctx.font = 'bold 12px "Courier New"';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(node.label, node.x, node.y);

			// Type indicator
			ctx.font = '8px "Courier New"';
			ctx.fillText(node.type.toUpperCase(), node.x, node.y + radius + 12);
		});

		ctx.restore();
	}

	function handleMouseDown(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left - panX) / zoom;
		const y = (e.clientY - rect.top - panY) / zoom;

		const node = nodes.find(n => {
			const dx = n.x - x,
			const dy = n.y - y,
			return Math.sqrt(dx * dx + dy * dy) < 30;
		});

		if (node) {
			isDragging = true;
			dragNode = node;
			offsetX = x - node.x;
			offsetY = y - node.y;
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !dragNode) return;

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left - panX) / zoom;
		const y = (e.clientY - rect.top - panY) / zoom;

		dragNode.x = x - offsetX;
		dragNode.y = y - offsetY;

		render();
	}

	function handleMouseUp() {
		isDragging = false;
		dragNode = null;
	}

	function handleWheel(e, WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		zoom *= delta;
		zoom = Math.max(0.1, Math.min(3, zoom));
		render();
	}

	function handleClick(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left - panX) / zoom;
		const y = (e.clientY - rect.top - panY) / zoom;

		const node = nodes.find(n => {
			const dx = n.x - x,
			const dy = n.y - y,
			return Math.sqrt(dx * dx + dy * dy) < 30;
		});

		if (node) {
			selectedNode = node;
			if (node.url) {
				window.location.href = node.url;
			}
			render();
		}
	}

	function resetView() {
		zoom = 1;
		panX = 0;
		panY = 0;
		render();
	}

	function exportGraph() {
		const dataUrl = canvas.toDataURL('image/png');
		const link = document.createElement('a');
		link.download = 'graph-mode.png';
		link.href = dataUrl;
		link.click();
	}
</script>

<div class="graph-mode">
	<div class="header">
		<h1>GRAPH MODE - ROUTING VISUALIZATION</h1>
		<div class="controls">
			<button onclick={resetView}>RESET VIEW</button>
			<button onclick={exportGraph}>EXPORT PNG</button>
			<button onclick={() => window.location.href = '/all-routes'}>ALL ROUTES</button>
			<span class="zoom">ZOOM: {(zoom * 100).toFixed(0)}%</span>
		</div>
	</div>

	<canvas bind, this={canvas}></canvas>

	{#if selectedNode}
		<div class="info-panel">
			<h3>{selectedNode.label}</h3>
			<p><strong>Type:</strong> {selectedNode.type}</p>
			<p><strong>ID:</strong> {selectedNode.id}</p>
			{#if selectedNode.url}
				<p><strong>URL:</strong> <a href={selectedNode.url}>{selectedNode.url}</a></p>
			{/if}
			{#if selectedNode.metadata}
				<pre>{JSON.stringify(selectedNode.metadata, null, 2)}</pre>
			{/if}
		</div>
	{/if}

	<div class="legend">
		<h4>LEGEND</h4>
		<div class="legend-item">
			<div class="legend-color" style="background, {colors.route}"></div>
			<span>Route</span>
		</div>
		<div class="legend-item">
			<div class="legend-color" style="background, {colors.feature}"></div>
			<span>Feature</span>
		</div>
		<div class="legend-item">
			<div class="legend-color" style="background, {colors.service}"></div>
			<span>Service</span>
		</div>
		<div class="legend-item">
			<div class="legend-color" style="background, {colors.evidence}"></div>
			<span>Evidence</span>
		</div>
	</div>
</div>

<style>
	.graph-mode {
		width: 100%; height: 100vh;
		background: #d4c5b0;
		font-family: 'Courier New', monospace;
		position: relative;
	}

	.header {
		background: #3a3226; color: #d4c5b0;
		padding: 1rem; display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 2px solid #000;
	}

	.header h1 {
		margin: 0;
		font-size: 1.5rem;
		letter-spacing: 2px;
	}

	.controls {
		display: flex; gap: 1rem;
		align-items: center;
	}

	.controls button {
		background: #d4c5b0; color: #3a3226;
		border: 2px solid #3a3226;
		padding: 0.5rem 1rem;
		font-family: 'Courier New', monospace;
		font-weight: bold; cursor: pointer;
		transition: all 0.2s;
	}

	.controls button:hover {
		background: #ce9461; transform: translateY(-2px);
	}

	.zoom {
		color: #d4c5b0;
		font-weight: bold;
	}

	canvas {
		display: block; cursor: grab;
	}

	canvas:active {
		cursor: grabbing;
	}

	.info-panel {
		position: absolute; top: 100px;
		right: 20px; background: #3a3226;
		color: #d4c5b0; padding: 1rem;
		border: 2px solid #000;
		max-width: 300px;
		font-size: 0.9rem;
	}

	.info-panel h3 {
		margin: 0 0 1rem 0;
		color: #ce9461;
	}

	.info-panel p {
		margin: 0.5rem 0;
	}

	.info-panel a {
		color: #ce9461;
		text-decoration: none;
	}

	.info-panel a:hover {
		text-decoration: underline;
	}

	.info-panel pre {
		background: #2a2216; padding: 0.5rem;
		overflow-x: auto;
		font-size: 0.8rem;
	}

	.legend {
		position: absolute; bottom: 20px;
		left: 20px; background: #3a3226;
		color: #d4c5b0; padding: 1rem;
		border: 2px solid #000;
	}

	.legend h4 {
		margin: 0 0 0.5rem 0;
		color: #ce9461;
	}

	.legend-item {
		display: flex;
		align-items: center; gap: 0.5rem;
		margin: 0.25rem 0;
	}

	.legend-color {
		width: 20px; height: 20px;
		border: 2px solid #000;
	}
</style>



