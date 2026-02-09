<script lang="ts">
	// Migrated to $effect
	import { writable } from 'svelte/store';

	interface TopologyNode { id: string, name: string;
		type: 'file' | 'component' | 'route' | 'lib';
		errors: number;
		complexity: number;
		tags: string[];
		recommended_action: string;
		dependencies: string[];
		x: number;
		y: number;
	}

	interface Edge { from: string, to: string;
		type: 'import' | 'error' | 'dependency';
	}

	const topology = writable<{ nodes: TopologyNode[], edges: Edge[] }>({ nodes: [], edges: [] });
	const selectedNode = writable<TopologyNode | null>(null);
	const filterTag = writable<string>('all');
	const filterAction = writable<string>('all');
	const loading = writable(true);
	const searchQuery = writable('');

	let canvas = $state<HTMLCanvasElement | undefined>(undefined);
	let ctx: CanvasRenderingContext2D;
	let isDragging = false;
	let dragNode: TopologyNode | null = null;
	let offsetX = 0;
	let offsetY = 0;
	let scale = 1;
	let panX = 0;
	let panY = 0;

	// Color scheme
	const colors = {
		urgent_refactor: '#ef4444',
		review_errors: '#f97316',
		low_priority_fix: '#eab308',
		monitor: '#22c55e',
		route: '#3b82f6',
		library: '#8b5cf6',
		component: '#06b6d4',
		'server-side': '#ec4899'
	};

	$effect(() => {

		const init = async () => {
			// Initialize canvas
			const canvasContext = canvas.getContext('2d');
            if (canvasContext) {
                ctx = canvasContext;
                resizeCanvas();
                window.addEventListener('resize', resizeCanvas);
                // Load topology data
                await loadTopology();
                // Start animation loop
                animate();
            }
		};

		void init();

		return () => {
            if (typeof window !== 'undefined') {
			    window.removeEventListener('resize', resizeCanvas);
            }
		};

});

	async function loadTopology() {
		try {
			const response = await fetch('/api/topology');
			const data = await response.json();

			// Position nodes using force-directed layout
			const nodes = data.components.map((comp: any, i: number) => ({
				id: comp.name,
				name: comp.name,
				type: comp.tags.includes('route') ? 'route' :
				      comp.tags.includes('library') ? 'lib' : 'component',
				errors: comp.errors,
				complexity: comp.complexity,
				tags: comp.tags,
				recommended_action: comp.recommended_action,
				dependencies: comp.dependencies || [],
				x: Math.random() * 800,
				y: Math.random() * 600
			}));

			// Create edges from dependencies
			const edges: Edge[] = [];
			nodes.forEach((node: TopologyNode) => {
				node.dependencies.forEach((dep: string) => {
					edges.push({
						from: node.id,
						to: dep,
						type: 'dependency'
					});
				});
			});

			topology.set({ nodes, edges });
			loading.set(false);

			// Apply force-directed layout
			applyForceLayout(nodes, edges);
		} catch (error) {
			console.error('Failed to load topology:', error);
			loading.set(false);
		}
	}

	function applyForceLayout(nodes: TopologyNode[], edges: Edge[]) {
		const iterations = 50;
		const repulsion = 5000;
		const attraction = 0.01;
		const damping = 0.85;

		for (let iter = 0; iter < iterations; iter++) {
			// Repulsion between all nodes
			nodes.forEach((n1, i) => {
				let fx = 0, fy = 0;

				nodes.forEach((n2, j) => {
					if (i === j) return;

					const dx = n1.x - n2.x;
					const dy = n1.y - n2.y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;

					const force = repulsion / (dist * dist);
					fx += (dx / dist) * force;
					fy += (dy / dist) * force;
				});

				edges.forEach(edge => {
					if (edge.from === n1.id) {
						const n2 = nodes.find(n => n.id === edge.to);
						if (n2) {
							const dx = n2.x - n1.x;
							const dy = n2.y - n1.y;
							fx += dx * attraction;
							fy += dy * attraction;
						}
					}
				});

				n1.x += fx * damping;
				n1.y += fy * damping;
			});
		}

		// Center the graph
		const avgX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
		const avgY = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
		nodes.forEach(n => {
			n.x = n.x - avgX + 400;
			n.y = n.y - avgY + 300;
		});
	}

	function animate() {
		if (!ctx) return;

		ctx.save();
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Apply transformations
		ctx.translate(panX, panY);
		ctx.scale(scale, scale);

		const { nodes, edges } = $topology;
		const filter = $filterTag;
		const action = $filterAction;
		const query = $searchQuery.toLowerCase();

		// Filter nodes
		const filteredNodes = nodes.filter(node => {
			if (query && !node.name.toLowerCase().includes(query)) return false;
			if (filter !== 'all' && !node.tags.includes(filter)) return false;
			if (action !== 'all' && node.recommended_action !== action) return false;
			return true;
		});

		const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

		// Draw edges
		ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
		ctx.lineWidth = 1;
		edges.forEach(edge => {
			if (!filteredNodeIds.has(edge.from) || !filteredNodeIds.has(edge.to)) return;

			const from = nodes.find(n => n.id === edge.from);
			const to = nodes.find(n => n.id === edge.to);
			if (!from || !to) return;

			ctx.beginPath();
			ctx.moveTo(from.x, from.y);
			ctx.lineTo(to.x, to.y);
			ctx.stroke();
		});

		filteredNodes.forEach(node => {
			const radius = 5 + (node.errors / 5);
			const color = colors[node.recommended_action as keyof typeof colors] || colors.monitor;

			// Node circle
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
			ctx.fill();

			// Highlight selected
			if ($selectedNode?.id === node.id) {
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 3;
				ctx.stroke();
			}

			// Label
			if (scale > 0.5) {
				ctx.fillStyle = '#fff';
				ctx.font = '10px Inter';
				ctx.textAlign = 'center';
				ctx.fillText(node.name.split('/').pop() ?? node.name, node.x, node.y - radius - 5);
			}
		});

		ctx.restore();
		requestAnimationFrame(animate);
	}

	function resizeCanvas() {
		if (!canvas) return;
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
	}

	function handleMouseDown(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left - panX) / scale;
		const y = (e.clientY - rect.top - panY) / scale;

		const node = $topology.nodes.find(n => {
			const dx = n.x - x;
			const dy = n.y - y;
			const radius = 5 + (n.errors / 5);
			return Math.sqrt(dx * dx + dy * dy) <= radius;
		});

		if (node) {
			isDragging = true;
			dragNode = node;
			offsetX = x - node.x;
			offsetY = y - node.y;
			selectedNode.set(node);
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !dragNode) return;

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left - panX) / scale;
		const y = (e.clientY - rect.top - panY) / scale;

		dragNode.x = x - offsetX;
		dragNode.y = y - offsetY;
	}

	function handleMouseUp() {
		isDragging = false;
		dragNode = null;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		scale *= delta;
		scale = Math.max(0.1, Math.min(5, scale));
	}

	// SSE for real-time updates
	$effect(() => {

		const eventSource = new EventSource('/api/topology/stream');

		eventSource.addEventListener('node_updated', (event) => {
			const update = JSON.parse(event.data);
			topology.update(t => {
				const node = t.nodes.find(n => n.id === update.id);
				if (node) {
					Object.assign(node, update);
				}
				return t;

});
		});

		eventSource.addEventListener('error_fixed', (event) => {
			const data = JSON.parse(event.data);
			topology.update(t => {
				const node = t.nodes.find(n => n.id === data.component);
				if (node) {
					node.errors = Math.max(0, node.errors - 1);
					node.recommended_action = recommendAction(node);
				}
				return t;
			});
		});

		eventSource.onerror = (error) => {
			console.error('SSE connection error:', error);
		};

		return () => eventSource.close();
	});

	function recommendAction(node: TopologyNode): string {
		if (node.errors > 20) return 'urgent_refactor';
		if (node.complexity > 0.8) return 'simplify_logic';
		if (node.errors > 10) return 'review_errors';
		if (node.errors > 5) return 'low_priority_fix';
		return 'monitor';
	}
</script>

<div class="topology-viewer">
	<!-- Header -->
	<div class="header">
		<h1>🗺️ Codebase Topology</h1>
		<div class="stats">
			<span>{$topology.nodes.length} components</span>
			<span>{$topology.nodes.filter(n => n.recommended_action === 'urgent_refactor').length} urgent</span>
			<span>{$topology.edges.length} dependencies</span>
		</div>
	</div>

	<!-- Controls -->
	<div class="controls">
		<input
			type="text"
			placeholder="Search components..."
			bind:value={$searchQuery}
			class="search-input"
		/>

		<select bind:value={$filterTag} class="filter-select">
			<option value="all">All Tags</option>
			<option value="route">Routes</option>
			<option value="library">Libraries</option>
			<option value="server-side">Server-side</option>
			<option value="high-error">High Errors</option>
			<option value="complex">Complex</option>
		</select>

		<select bind:value={$filterAction} class="filter-select">
			<option value="all">All Actions</option>
			<option value="urgent_refactor">Urgent Refactor</option>
			<option value="review_errors">Review Errors</option>
			<option value="low_priority_fix">Low Priority</option>
			<option value="monitor">Monitor</option>
		</select>

		<div class="legend">
			<span class="legend-item" style="--color: {colors.urgent_refactor}">Urgent</span>
			<span class="legend-item" style="--color: {colors.review_errors}">Review</span>
			<span class="legend-item" style="--color: {colors.low_priority_fix}">Low Priority</span>
			<span class="legend-item" style="--color: {colors.monitor}">Monitor</span>
		</div>
	</div>

	<!-- Canvas -->
	<div class="canvas-container">
		{#if $loading}
			<div class="loading">Loading topology...</div>
		{:else}
			<canvas
				bind:this={canvas}
				onmousedown={handleMouseDown}
				onmousemove={handleMouseMove}
				onmouseup={handleMouseUp}
				onwheel={handleWheel}
			></canvas>
		{/if}
	</div>

	<!-- Details Panel -->
	{#if $selectedNode}
		<div class="details-panel">
			<h2>{$selectedNode.name}</h2>

			<div class="detail-row">
				<span class="label">Type:</span>
				<span class="value">{$selectedNode.type}</span>
			</div>

			<div class="detail-row">
				<span class="label">Errors:</span>
				<span class="value error-count" class:high={$selectedNode.errors > 20}>
					{$selectedNode.errors}
				</span>
			</div>

			<div class="detail-row">
				<span class="label">Complexity:</span>
				<span class="value">{($selectedNode.complexity * 100).toFixed(1)}%</span>
			</div>

			<div class="detail-row">
				<span class="label">Action:</span>
				<span class="value action-badge" style="--color: {colors[$selectedNode.recommended_action as keyof typeof colors]}">
					{$selectedNode.recommended_action.replace(/_/g, ' ')}
				</span>
			</div>

			<div class="tags">
				{#each $selectedNode.tags as tag}
					<span class="tag">{tag}</span>
				{/each}
			</div>

			{#if $selectedNode.dependencies.length > 0}
				<div class="dependencies">
					<h3>Dependencies</h3>
					{#each $selectedNode.dependencies as dep}
						<div class="dependency">{dep}</div>
					{/each}
				</div>
			{/if}

			<button class="fix-button" onclick={() => alert('Fix with AI: ' + $selectedNode?.name)}>
				🤖 Fix with AI
			</button>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
		background: #0f172a;
		color: #e2e8f0;
	}

	.topology-viewer { width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
	}

	.header {
		padding: 1rem 2rem;
		background: rgba(15, 23, 42, 0.8);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.stats { display: flex;
		gap: 2rem;
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.controls {
		padding: 1rem 2rem;
		background: rgba(15, 23, 42, 0.6);
		display: flex;
		gap: 1rem;
		align-items: center;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.search-input { flex: 1;
		padding: 0.5rem 1rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.5rem;
		color: #e2e8f0;
		font-size: 0.875rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.filter-select {
		padding: 0.5rem 1rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.5rem;
		color: #e2e8f0;
		font-size: 0.875rem;
	}

	.legend { display: flex;
		gap: 1rem;
		margin-left: auto;
	}

	.legend-item {
		display: flex;
		align-items: center;
		font-size: 0.75rem;
		color: #94a3b8;
	}

	.legend-item::before { content: '';
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color);
		margin-right: 0.5rem;
	}

	.canvas-container { flex: 1;
		position: relative;
		overflow: hidden;
	}

	canvas { width: 100%;
		height: 100%;
		cursor: grab;
	}

	canvas:active {
		cursor: grabbing;
	}

	.loading { position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 1.25rem;
		color: #64748b;
	}

	.details-panel { position: absolute;
		top: 5rem;
		right: 2rem;
		width: 300px;
		background: rgba(30, 41, 59, 0.95);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.75rem;
		padding: 1.5rem;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
	}

	.details-panel h2 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: 600;
		word-break: break-word;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.label {
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.value {
		font-weight: 500;
	}

	.error-count {
		color: #f97316;
	}

	.error-count.high {
		color: #ef4444;
		font-weight: 700;
	}

	.action-badge {
		padding: 0.25rem 0.75rem;
		background: var(--color);
		border-radius: 9999px;
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.tag {
		padding: 0.25rem 0.5rem;
		background: rgba(59, 130, 246, 0.2);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: #93c5fd;
	}

	.dependencies {
		margin-top: 1rem;
	}

	.dependencies h3 {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.dependency { padding: 0.5rem;
		background: rgba(15, 23, 42, 0.5);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		margin-bottom: 0.25rem;
		word-break: break-all;
	}

	.fix-button {
		width: 100%;
		margin-top: 1rem;
		padding: 0.75rem;
		background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
		border: none;
		border-radius: 0.5rem;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.2s;
	}

	.fix-button:hover {
		transform: scale(1.02);
	}

	.fix-button:active {
		transform: scale(0.98);
	}
</style>