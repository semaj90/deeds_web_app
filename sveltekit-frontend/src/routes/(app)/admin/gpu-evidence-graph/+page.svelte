<script lang="ts">
	import type { PageData } from './$types';
	import type { WebGPULegalDocumentGraph, PerformanceStats } from '$lib/webgpu/legal-document-graph.js';

	export const ssr = false;

	const { data }: { data: PageData & { connections?: Array<{ source: string; target: string; type: string; strength: number }> } } = $props();

	let canvas: HTMLCanvasElement;
	let hasWebGPU = $state(false);
	let selectedNode = $state<string | number | null>(null);
	let hoveredNode = $state<string | number | null>(null);
	let gpuGraph = $state<WebGPULegalDocumentGraph | null>(null);
	let gpuStats = $state<PerformanceStats | null>(null);
	let useGPURenderer = $state(false);

	// Build graph nodes from server evidence data
	interface GraphNode {
		id: number | string;
		title: string;
		type: string;
		size: number;
		x: number;
		y: number;
		z: number;
		vx: number;
		vy: number;
		vz: number;
		color: string;
	}

	interface GraphEdge {
		source: number | string;
		target: number | string;
		type: string;
		strength: number;
	}

	const typeColors: Record<string, string> = {
		document: '#22d3ee',
		image: '#a78bfa',
		audio: '#f472b6',
		video: '#fb923c',
		forensic: '#ef4444',
		physical: '#10b981',
		digital: '#3b82f6',
		testimony: '#eab308',
	};

	let graphNodes = $state<GraphNode[]>([]);
	let graphEdges = $state<GraphEdge[]>([]);
	let animFrame = $state(0);
	let depthMode = $state(true);

	function initNodes() {
		const items = data.evidenceItems ?? [];
		const w = canvas?.width ?? 1920;
		const h = canvas?.height ?? 1080;
		graphNodes = items.map((item: any, i: number) => {
			const angle = (i / Math.max(items.length, 1)) * Math.PI * 2;
			const radius = Math.min(w, h) * 0.3;
			return {
				id: item.id,
				title: item.title ?? `Evidence #${item.id}`,
				type: item.evidenceType ?? 'document',
				size: Math.max(8, Math.min(24, (item.fileSize ?? 1000) / 50000)),
				x: w / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 80,
				y: h / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 80,
				z: (Math.random() - 0.5) * 200,
				vx: 0,
				vy: 0,
				vz: 0,
				color: typeColors[(item.evidenceType ?? 'document').toLowerCase()] ?? '#22d3ee',
			};
		});
		// Load real graph connections from server
		graphEdges = (data.connections ?? []) as GraphEdge[];
	}

	function simulate() {
		const centerX = (canvas?.width ?? 1920) / 2;
		const centerY = (canvas?.height ?? 1080) / 2;
		const nodeMap = new Map(graphNodes.map(n => [String(n.id), n]));

		for (const node of graphNodes) {
			// Gentle pull toward center
			node.vx += (centerX - node.x) * 0.0003;
			node.vy += (centerY - node.y) * 0.0003;
			if (depthMode) node.vz += (0 - node.z) * 0.001;

			// Repulsion between nodes
			for (const other of graphNodes) {
				if (other.id === node.id) continue;
				const dx = node.x - other.x;
				const dy = node.y - other.y;
				const dz = depthMode ? (node.z - other.z) : 0;
				const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
				if (dist < 150) {
					const force = 0.5 / dist;
					node.vx += dx * force;
					node.vy += dy * force;
					if (depthMode) node.vz += dz * force;
				}
			}

			// Damping
			node.vx *= 0.92;
			node.vy *= 0.92;
			node.vz *= 0.92;
			node.x += node.vx;
			node.y += node.vy;
			if (depthMode) node.z += node.vz;
		}

		// Edge attraction: connected nodes pull toward each other
		for (const edge of graphEdges) {
			const a = nodeMap.get(String(edge.source));
			const b = nodeMap.get(String(edge.target));
			if (!a || !b) continue;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const dist = Math.sqrt(dx * dx + dy * dy) || 1;
			const strength = 0.0005 * (edge.strength / 100) / dist;
			a.vx += dx * strength;
			a.vy += dy * strength;
			b.vx -= dx * strength;
			b.vy -= dy * strength;
		}
	}

	function draw() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;

		// Background
		ctx.fillStyle = '#0c0c0c';
		ctx.fillRect(0, 0, w, h);

		// Grid lines
		ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
		ctx.lineWidth = 1;
		for (let x = 0; x < w; x += 60) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, h);
			ctx.stroke();
		}
		for (let y = 0; y < h; y += 60) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(w, y);
			ctx.stroke();
		}

		// Draw real graph edges from DB connections
		const nodeMap = new Map(graphNodes.map(n => [String(n.id), n]));
		for (const edge of graphEdges) {
			const a = nodeMap.get(String(edge.source));
			const b = nodeMap.get(String(edge.target));
			if (!a || !b) continue;
			const alpha = Math.min(0.6, (edge.strength / 100) * 0.5 + 0.1);
			ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
			ctx.lineWidth = Math.max(0.5, edge.strength / 50);
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();
		}

		// Fallback: proximity edges for same-type nodes when no DB edges
		if (graphEdges.length === 0) {
			ctx.lineWidth = 0.5;
			for (let i = 0; i < graphNodes.length; i++) {
				for (let j = i + 1; j < graphNodes.length; j++) {
					if (graphNodes[i].type === graphNodes[j].type) {
						const dx = graphNodes[i].x - graphNodes[j].x;
						const dy = graphNodes[i].y - graphNodes[j].y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < 250) {
							const c = graphNodes[i].color;
							const r = parseInt(c.slice(1, 3), 16);
							const g = parseInt(c.slice(3, 5), 16);
							const bv = parseInt(c.slice(5, 7), 16);
							ctx.strokeStyle = `rgba(${r},${g},${bv},${0.15 * (1 - dist / 250)})`;
							ctx.beginPath();
							ctx.moveTo(graphNodes[i].x, graphNodes[i].y);
							ctx.lineTo(graphNodes[j].x, graphNodes[j].y);
							ctx.stroke();
						}
					}
				}
			}
		}

		// Sort nodes by z-depth (draw far nodes first for depth ordering)
		const sorted = [...graphNodes].sort((a, b) => a.z - b.z);
		for (const node of sorted) {
			const isSelected = selectedNode === node.id;
			const isHovered = hoveredNode === node.id;
			// Z-depth scaling: nodes closer to viewer (z > 0) appear larger
			const depthScale = depthMode ? 0.7 + 0.3 * ((node.z + 100) / 200) : 1;
			const depthAlpha = depthMode ? 0.4 + 0.6 * ((node.z + 100) / 200) : 1;
			const r = (node.size + (isSelected ? 4 : 0) + (isHovered ? 2 : 0)) * depthScale;

			// Glow
			if (isSelected || isHovered) {
				ctx.shadowColor = node.color;
				ctx.shadowBlur = 20;
			}

			ctx.globalAlpha = depthAlpha;
			ctx.fillStyle = node.color;
			ctx.beginPath();
			ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
			ctx.fill();

			ctx.shadowBlur = 0;
			ctx.globalAlpha = 1;

			// Label
			if (isSelected || isHovered || node.size > 14) {
				ctx.fillStyle = '#e2e8f0';
				ctx.globalAlpha = depthAlpha;
				ctx.font = `${Math.round(11 * depthScale)}px monospace`;
				ctx.textAlign = 'center';
				const label = node.title.length > 24 ? node.title.slice(0, 22) + '..' : node.title;
				ctx.fillText(label, node.x, node.y - r - 6);
				ctx.globalAlpha = 1;
			}
		}
	}

	function tick() {
		simulate();
		draw();
		animFrame = requestAnimationFrame(tick);
	}

	function handleCanvasClick(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;

		for (const node of graphNodes) {
			const dx = mx - node.x;
			const dy = my - node.y;
			if (dx * dx + dy * dy < (node.size + 6) ** 2) {
				selectedNode = selectedNode === node.id ? null : node.id;
				return;
			}
		}
		selectedNode = null;
	}

	function handleCanvasMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;

		hoveredNode = null;
		for (const node of graphNodes) {
			const dx = mx - node.x;
			const dy = my - node.y;
			if (dx * dx + dy * dy < (node.size + 6) ** 2) {
				hoveredNode = node.id;
				return;
			}
		}
	}

	let selectedEvidence = $derived(graphNodes.find(n => n.id === selectedNode) ?? null);

	async function initGPUGraph() {
		try {
			const { WebGPULegalDocumentGraph } = await import('$lib/webgpu/legal-document-graph.js');
			const graph = new WebGPULegalDocumentGraph(canvas, {
				maxNodes: 10000,
				maxEdges: 50000,
				enablePhysics: true,
			});
			await graph.initialize();
			gpuGraph = graph;
			useGPURenderer = true;

			// Report stats periodically
			const statsInterval = setInterval(() => {
				if (gpuGraph) gpuStats = gpuGraph.getPerformanceStats();
			}, 1000);

			graph.startRenderLoop();
			return () => {
				clearInterval(statsInterval);
				graph.dispose();
			};
		} catch (err) {
			console.warn('[GPU Graph] WebGPU init failed, using Canvas 2D fallback:', (err as Error)?.message);
			useGPURenderer = false;
			return null;
		}
	}

	$effect(() => {
		// Check WebGPU availability
		const nav = navigator as any;
		if (nav.gpu) {
			nav.gpu.requestAdapter().then((a: any) => {
				if (a) hasWebGPU = true;
			}).catch(() => {});
		}

		initNodes();

		// Try Bifrost WebGPU accelerated renderer, fall back to Canvas 2D
		let gpuCleanup: (() => void) | null = null;
		if (hasWebGPU && canvas) {
			initGPUGraph().then((cleanup) => {
				gpuCleanup = cleanup;
			});
		}

		// Canvas 2D fallback render loop (runs when GPU renderer is not active)
		if (!useGPURenderer) {
			animFrame = requestAnimationFrame(tick);
		}

		return () => {
			cancelAnimationFrame(animFrame);
			if (gpuCleanup) gpuCleanup();
			if (gpuGraph) {
				gpuGraph.dispose();
				gpuGraph = null;
			}
		};
	});
</script>

<svelte:head>
	<title>GPU Evidence Graph | DEEDS</title>
</svelte:head>

<div class="graph-page">
	<!-- Overlay: Stats -->
	<div class="overlay top-left">
		<h1>Evidence Graph</h1>
		<div class="renderer">
			RENDERER: {useGPURenderer ? 'Bifrost WebGPU' : hasWebGPU ? 'Canvas 2D (GPU available)' : 'Canvas 2D'}
		</div>
		{#if gpuStats}
			<div class="renderer">FPS: {gpuStats.fps.toFixed(0)} | GPU MEM: {(gpuStats.gpuMemoryUsage / 1024).toFixed(0)}KB</div>
		{/if}
		{#if data.user}
			<div class="user-tag">Agent: {data.user.username ?? data.user.email ?? 'Unknown'}</div>
		{/if}
		<div class="stats-grid">
			<span>Nodes</span><span class="val">{graphNodes.length}</span>
			<span>Edges</span><span class="val">{graphEdges.length}</span>
			<span>DB Total</span><span class="val">{data.stats?.total ?? 0}</span>
			<span>Depth</span><span class="val">{depthMode ? '3D' : '2D'}</span>
		</div>
		<button class="depth-toggle" onclick={() => depthMode = !depthMode}>
			{depthMode ? 'Switch to 2D' : 'Switch to 3D'}
		</button>
	</div>

	<!-- Overlay: Legend -->
	<div class="overlay top-right">
		<div class="legend-title">Evidence Types</div>
		{#each Object.entries(typeColors) as [type, color]}
			<div class="legend-item">
				<span class="legend-dot" style="background:{color}"></span>
				<span>{type}</span>
			</div>
		{/each}
	</div>

	<!-- Selected node detail -->
	{#if selectedEvidence}
		<div class="overlay bottom-left">
			<div class="detail-title">{selectedEvidence.title}</div>
			<div class="detail-row">
				<span>Type:</span><span class="val">{selectedEvidence.type}</span>
			</div>
			<div class="detail-row">
				<span>ID:</span><span class="val">#{selectedEvidence.id}</span>
			</div>
			<a href="/evidence" class="detail-link">View in Evidence</a>
		</div>
	{/if}

	<!-- Canvas -->
	<canvas
		bind:this={canvas}
		width="1920"
		height="1080"
		onclick={handleCanvasClick}
		onmousemove={handleCanvasMove}
	></canvas>

	{#if graphNodes.length === 0}
		<div class="empty-state">
			<div class="empty-text">NO EVIDENCE DATA</div>
			<a href="/evidence" class="empty-link">Upload Evidence</a>
		</div>
	{/if}
</div>

<style>
	.graph-page {
		position: fixed;
		inset: 0;
		background: #0c0c0c;
		overflow: hidden;
		color: #e2e8f0;
	}

	canvas {
		width: 100%;
		height: 100%;
		display: block;
		cursor: crosshair;
	}

	.overlay {
		position: absolute;
		z-index: 10;
		padding: 1rem;
		background: rgba(12, 12, 12, 0.85);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(34, 211, 238, 0.2);
		font-family: monospace;
		font-size: 0.8rem;
	}

	.top-left { top: 1rem; left: 1rem; }
	.top-right { top: 1rem; right: 1rem; }
	.bottom-left { bottom: 1rem; left: 1rem; }

	h1 {
		font-size: 1.2rem;
		color: #22d3ee;
		margin: 0 0 0.25rem;
		text-shadow: 0 0 10px rgba(34, 211, 238, 0.4);
	}

	.renderer {
		font-size: 0.65rem;
		color: rgba(148, 163, 184, 0.6);
	}

	.user-tag {
		margin-top: 0.4rem;
		font-size: 0.65rem;
		color: #a78bfa;
		border: 1px solid rgba(167, 139, 250, 0.3);
		padding: 0.1rem 0.3rem;
		display: inline-block;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.25rem 1rem;
		margin-top: 0.75rem;
		font-size: 0.75rem;
	}

	.val {
		color: #22d3ee;
		text-align: right;
	}

	.legend-title {
		font-size: 0.7rem;
		color: #94a3b8;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: #cbd5e1;
		margin-bottom: 0.2rem;
		text-transform: capitalize;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.detail-title {
		color: #22d3ee;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.75rem;
		margin-bottom: 0.2rem;
	}

	.detail-link {
		display: inline-block;
		margin-top: 0.5rem;
		font-size: 0.7rem;
		color: #10b981;
		border: 1px solid rgba(16, 185, 129, 0.4);
		padding: 0.2rem 0.5rem;
		text-decoration: none;
	}

	.detail-link:hover {
		background: rgba(16, 185, 129, 0.15);
	}

	.empty-state {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		pointer-events: none;
	}

	.empty-text {
		font-size: 2rem;
		font-family: monospace;
		color: rgba(148, 163, 184, 0.2);
		font-weight: bold;
	}

	.empty-link {
		pointer-events: auto;
		font-family: monospace;
		font-size: 0.8rem;
		color: #22d3ee;
		text-decoration: none;
		border: 1px solid rgba(34, 211, 238, 0.3);
		padding: 0.3rem 0.8rem;
		display: inline-block;
		margin-top: 0.5rem;
	}

	.empty-link:hover {
		background: rgba(34, 211, 238, 0.1);
	}

	.depth-toggle {
		margin-top: 0.5rem;
		font-family: monospace;
		font-size: 0.65rem;
		color: #22d3ee;
		background: transparent;
		border: 1px solid rgba(34, 211, 238, 0.3);
		padding: 0.2rem 0.5rem;
		cursor: pointer;
	}

	.depth-toggle:hover {
		background: rgba(34, 211, 238, 0.1);
	}
</style>