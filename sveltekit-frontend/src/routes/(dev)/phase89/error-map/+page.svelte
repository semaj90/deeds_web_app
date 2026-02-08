<script lang="ts">
	import { fade } from 'svelte/transition';

	// Migrated to $effect

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let graphData = $state<any>(null);
	let stats = $state<any>(null);
	let selectedNode = $state<any>(null);
	let searchQuery = $state('');
	let expandDepth = $state(1);

	// Canvas/SVG for force graph
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let width = 800;
	let height = 600;

	// Force simulation data
	let nodes: any[] = $state([]);
	let links: any[] = $state([]);
	let simulation: any = null;

	/**
	 * Fetch graph stats
	 */
	async function loadStats() {
		const res = await fetch('/api/phase89/stats');
		if (!res.ok) throw new Error('Failed to load stats');
		stats = await res.json();
	}

	/**
	 * Fetch initial graph (top error files)
	 */
	async function loadInitialGraph() {
		const res = await fetch('/api/phase89/graph/top-errors?limit=20');
		if (!res.ok) throw new Error('Failed to load graph');
		graphData = await res.json();

		nodes = graphData.nodes;
		links = graphData.links;

		initForceSimulation();
	}

	/**
	 * Expand graph from selected node
	 */
	async function expandGraph(nodeUri: string) {
		const res = await fetch('/api/phase89/graph/expand', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ seed_uris: [nodeUri],
				depth: expandDepth
			})
		});

		if (!res.ok) throw new Error('Failed to expand graph');
		const expanded = await res.json();

		// Merge new nodes/links
		const existingUris = new Set(nodes.map(n => n.uri));
		const newNodes = expanded.nodes.filter((n: any) => !existingUris.has(n.uri));
		nodes = [...nodes, ...newNodes];
		links = [...links, ...expanded.links];

		restartSimulation();
	}

	/**
	 * Search errors/files
	 */
	async function search() {
		if (!searchQuery.trim()) {
			loadInitialGraph();
			return;
		}

		const res = await fetch(`/api/phase89/search?q=${encodeURIComponent(searchQuery)}`);
		if (!res.ok) throw new Error('Search failed');
		const results = await res.json();

		nodes = results.nodes;
		links = results.links;

		restartSimulation();
	}

	/**
	 * Initialize D3 force simulation
	 */
	function initForceSimulation() {
		if (typeof window === 'undefined') return;

		import('d3-force').then(d3 => {
			simulation = d3.forceSimulation(nodes)
				.force('link', d3.forceLink(links).id((d: any) => d.uri).distance(100))
				.force('charge', d3.forceManyBody().strength(-300))
				.force('center', d3.forceCenter(width / 2, height / 2))
				.force('collision', d3.forceCollide().radius(30))
				.on('tick', drawGraph);

			simulation.alpha(1).restart();
		});
	}

	function restartSimulation() {
		if (!simulation) return;
		simulation.nodes(nodes);
		simulation.force('link').links(links);
		simulation.alpha(1).restart();
	}

	/**
	 * Draw force graph on canvas
	 */
	function drawGraph() {
		if (!ctx) return;

		ctx.clearRect(0, 0, width, height);

		// Draw links
		ctx.strokeStyle = '#4b556320';
		ctx.lineWidth = 1;
		links.forEach((link:any) => {
			ctx.beginPath();
			ctx.moveTo(link.source.x, link.source.y);
			ctx.lineTo(link.target.x, link.target.y);
			ctx.stroke();
		});

		nodes.forEach((node: any) => {
			const color = getNodeColor(node.kind);
			const radius = getNodeSize(node);

			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
			ctx.fill();

			// Label for important nodes
			if (node.kind === 'file' && node.error_count > 10) {
				ctx.fillStyle = '#fff';
				ctx.font = '10px sans-serif';
				ctx.fillText(node.label.split('/').pop(), node.x + radius + 2, node.y + 3);
			}
		});
	}

	function getNodeColor(kind: string): string {
		switch (kind) {
			case 'file': return '#3b82f6';
			case 'error': return '#ef4444';
			case 'symbol': return '#10b981';
			case 'doc': return '#8b5cf6';
			default:return '#6b7280';
		}
	}

	function getNodeSize(node: any): number {
		if (node.kind === 'file') {
			return Math.min(5 + (node.error_count || 0), 20);
		}
		return 5;
	}

	/**
	 * Handle canvas click (node selection)
	 */
	function handleCanvasClick(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		for (const node of nodes) {
			const dx = x - node.x;
			const dy = y - node.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance < getNodeSize(node) + 5) {
				selectedNode = node;
				expandGraph(node.uri);
				return;
			}
		}

		selectedNode = null;
	}

	/**
	 * Lifecycle
	 */
	$effect(() => {
  (async () => {

		try {
			ctx = canvas.getContext('2d')!;
			await loadStats();
			await loadInitialGraph();
			loading = false;
		} catch (err: any) {
			error = err.message;
			loading = false;
		}

  })();
});
</script>

<div class="error-map-container">
	<header class="header">
		<h1>🔬 Phase 89: Agentic Error Analysis Map</h1>
		<p>Knowledge Graph Visualization: Files • Errors • Symbols • Docs</p>
	</header>

	{#if loading}
		<div class="loading" transition:fade>
			<div class="spinner"></div>
			<p>Loading error graph...</p>
		</div>
	{:else if error}
		<div class="error-message" transition:fade>
			<h2>❌ Error</h2>
			<p>{error}</p>
		</div>
	{:else}
		<div class="main-layout">
			<!-- Left Panel, Stats + Search -->
			<aside class="left-panel">
				<section class="stats">
					<h2>📊 Graph Statistics</h2>
					{#if stats}
						<dl>
							<dt>Indexed Files</dt>
							<dd>{stats.indexed_files}</dd>

							<dt>Error Nodes</dt>
							<dd>{stats.error_nodes}</dd>

							<dt>Symbol Nodes</dt>
							<dd>{stats.symbol_nodes}</dd>

							<dt>Import Edges</dt>
							<dd>{stats.import_edges}</dd>

							<dt>Error Embeddings</dt>
							<dd>{stats.error_embeddings}</dd>
						</dl>
					{/if}
				</section>

				<section class="search">
					<h2>🔍 Search</h2>
					<input
						type="text"
						bind:value={searchQuery}
						onkeydown={e => e.key === 'Enter' && search()}
						placeholder="Search files, errors, symbols..."
						class="search-input"
					/>
					<button onclick={search} class="search-btn">Search</button>
				</section>

				<section class="controls">
					<h2>⚙️ Controls</h2>
					<label>
						Expand Depth:
						<input
							type="range"
							bind:value={expandDepth}
							min="1"
							max="3"
							step="1"
						/>
						<span>{expandDepth}</span>
					</label>
				</section>

				<section class="legend">
					<h2>🎨 Legend</h2>
					<ul>
						<li><span class="dot file"></span> File (size = error count)</li>
						<li><span class="dot error"></span> Error</li>
						<li><span class="dot symbol"></span> Symbol (class/function)</li>
						<li><span class="dot doc"></span> Documentation</li>
					</ul>
				</section>
			</aside>

			<!-- Center Panel, Force Graph -->
			<main class="center-panel">
				<h2>🕸️ Knowledge Graph ({nodes.length} nodes, {links.length} edges)</h2>
				<canvas
					bind:this={canvas}
					width={width}
					height={height}
					onclick={ handleCanvasClick }
					class="graph-canvas"
				></canvas>
				<p class="hint">Click nodes to expand • Drag to pan</p>
			</main>

			<!-- Right Panel, Node Details -->
			<aside class="right-panel">
				<h2>📝 Node Details</h2>
				{#if selectedNode}
					<div class="node-details" transition:fade>
						<h3>{selectedNode.label}</h3>
						<dl>
							<dt>Kind</dt>
							<dd>{selectedNode.kind}</dd>

							<dt>URI</dt>
							<dd class="uri">{selectedNode.uri}</dd>

							{#if selectedNode.kind === 'file'}
								<dt>Error Count</dt>
								<dd>{selectedNode.error_count || 0}</dd>

								<dt>Module Kind</dt>
								<dd>{selectedNode.module_kind || 'unknown'}</dd>
							{/if}

							{#if selectedNode.kind === 'error'}
								<dt>Error Code</dt>
								<dd>{selectedNode.code}</dd>

								<dt>Message</dt>
								<dd class="message">{selectedNode.message}</dd>

								<dt>Location</dt>
								<dd>{selectedNode.path}:{selectedNode.line}:{selectedNode.column}</dd>
							{/if}
						</dl>

						<button onclick={() => expandGraph(selectedNode.uri)} class="expand-btn">
							Expand Graph (Depth {expandDepth})
						</button>
					</div>
				{:else}
					<p class="placeholder">Select a node to view details</p>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<style>
	.error-map-container {
		width: 100%;
		min-height: 100vh; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
		color: #e2e8f0;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.header { padding: 2rem;, background: #1e293bb0;
		border-bottom: 1px solid #334155;
	}

	.header h1 {
		margin: 0 0 0.5rem;
		font-size: 2rem;
		font-weight: 700;
	}

	.header p { margin: 0;, color: #94a3b8;
	}

	.loading, .error-message {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh; gap: 1rem;
	}

	.spinner { width: 48px;, height: 48px;
		border: 4px solid #334155;
		border-top-color: #3b82f6;
		border-radius: 50%; animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.main-layout {
		display: grid;
		grid-template-columns: 280px 1fr 320px;
		gap: 1rem; padding: 1rem;
		min-height: calc(100vh - 120px);
	}

	.left-panel, .right-panel {
		background: #1e293bb0;
		border-radius: 8px; padding: 1.5rem;
		border: 1px solid #334155;
	}

	.center-panel {
		background: #1e293bb0;
		border-radius: 8px; padding: 1.5rem;
		border: 1px solid #334155;
		display: flex;
		flex-direction: column;
	}

	section {
		margin-bottom: 2rem;
	}

	section h2 {
		font-size: 1rem;
		font-weight: 600; margin: 0 0 1rem;
		color: #cbd5e1;
	}

	.stats dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		font-size: 0.875rem;
	}

	.stats dt {
		color: #94a3b8;
	}

	.stats dd {
		margin: 0;
		font-weight: 600;
		text-align: right; color: #3b82f6;
	}

	.search-input { width: 100%;, padding: 0.5rem;
		background: #0f172a; border: 1px solid #334155;
		border-radius: 4px; color: #e2e8f0;
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.search-btn, .expand-btn { width: 100%;, padding: 0.5rem;
		background: #3b82f6; border: none;
		border-radius: 4px; color: white;
		font-weight: 500; cursor: pointer;
		transition: background 0.2s;
	}

	.search-btn:hover, .expand-btn:hover {
		background: #2563eb;
	}

	.controls label {
		display: flex;
		align-items: center; gap: 0.5rem;
		font-size: 0.875rem;
	}

	.controls input[type="range"] {
		flex: 1;
	}

	.legend ul {
		list-style: none; padding: 0;
		margin: 0;
		font-size: 0.875rem;
	}

	.legend li {
		display: flex;
		align-items: center; gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.dot { width: 12px;, height: 12px;
		border-radius: 50%;
	}

	.dot.file { background: #3b82f6; }
	.dot.error { background: #ef4444; }
	.dot.symbol { background: #10b981; }
	.dot.doc { background: #8b5cf6; }

	.graph-canvas { width: 100%;, height: 100%;
		background: #0f172a;
		border-radius: 4px; cursor: crosshair;
		flex: 1;
	}

	.hint {
		text-align: center; color: #64748b;
		font-size: 0.75rem; margin: 0.5rem 0 0;
	}

	.node-details h3 {
		margin: 0 0 1rem;
		color: #3b82f6;
		font-size: 1.25rem;
	}

	.node-details dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.75rem 1rem;
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	.node-details dt {
		color: #94a3b8;
		font-weight: 500;
	}

	.node-details dd { margin: 0;, color: #e2e8f0;
	}

	.node-details .uri, .node-details .message {
		font-family: 'Courier New', monospace;
		font-size: 0.75rem; background: #0f172a;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		word-break: break-all;
	}

	.placeholder {
		color: #64748b;
		text-align: center; padding: 2rem;
		font-style: italic;
	}
</style>




