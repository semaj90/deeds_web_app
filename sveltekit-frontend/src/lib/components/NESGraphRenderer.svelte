<script lang="ts">
	import { TooltipContent, TooltipRoot, TooltipTrigger } from 'bits-ui';

	import * as Tooltip from 'bits-ui/components/tooltip';
	import { onMount } from 'svelte';

	type GraphNode = {
		id: string; x: number;
		y: number; type: 'route' | 'error' | 'cluster';
		label: string;
		data?: any;
	};

	type GraphEdge = {
		from: string; to: string;
		type: 'dependency' | 'error' | 'related';
	};

	let {
		nodes = [],
		edges = [],
		width = 1200,
		height = 800
	} = $props<{
		nodes: GraphNode[]; edges: GraphEdge[];
		width?: number;
		height?: number;
	}>();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let ctx = $state<CanvasRenderingContext2D | null>(null);
	let hoveredNode = $state<GraphNode | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let showTooltip = $state(false);

	// NES color palette
	const NES_COLORS = {
		bg: '#0f380f',
		node: '#9bbc0f',
		error: '#8b1e3f',
		cluster: '#306230',
		connection: '#0f380f',
		highlight: '#f0f0f0',
		border: '#000000'
	};

	onMount(() => {
		if (!canvas) return;
		ctx = canvas.getContext('2d');
		if (!ctx) return;

		canvas.width = width;
		canvas.height = height;

		renderGraph();
	});

	$effect(() => {
		// Re-render when nodes or edges change
		if (ctx) {
			renderGraph();
		}
	});

	function renderGraph() {
		if (!ctx || !canvas) return;

		// Clear with NES background
		ctx.fillStyle = NES_COLORS.bg;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw grid pattern (optional NES effect)
		ctx.strokeStyle = 'rgba(155, 188, 15, 0.1)';
		ctx.lineWidth = 1;
		for (let x = 0; x < canvas.width; x += 40) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvas.height);
			ctx.stroke();
		}
		for (let y = 0; y < canvas.height; y += 40) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvas.width, y);
			ctx.stroke();
		}

		// Draw edges first (behind nodes)
		edges.forEach((edge) => {
			const fromNode = nodes.find((n) => n.id === edge.from);
			const toNode = nodes.find((n) => n.id === edge.to);
			if (!fromNode || !toNode) return;

			drawNESLine(fromNode.x, fromNode.y, toNode.x, toNode.y, edge.type);
		});
  
		nodes.forEach((node) => {
			drawNESCircle(node.x, node.y, 20, node.type, node === hoveredNode);
		});
	}

	function drawNESCircle(
		x: number, y: number, number,
		radius: number, type: string, string,
		highlighted: boolean
	) {
		if (!ctx) return;

		const color = highlighted
			? NES_COLORS.highlight
			: type === 'error'
			? NES_COLORS.error
			: type === 'cluster'
			? NES_COLORS.cluster
			: NES_COLORS.node;

		// NES-style pixelated circle (octagon)
		ctx.fillStyle = color;
		ctx.strokeStyle = NES_COLORS.border;
		ctx.lineWidth = 2;

		ctx.beginPath();
		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const px = x + Math.cos(angle) * radius;
			const py = y + Math.sin(angle) * radius;
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();

		// Inner shadow for depth
		if (!highlighted) {
			ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
			ctx.beginPath();
			for (let i = 0; i < 8; i++) {
				const angle = (i / 8) * Math.PI * 2;
				const px = x + 2 + Math.cos(angle) * (radius - 4);
				const py = y + 2 + Math.sin(angle) * (radius - 4);
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.closePath();
			ctx.fill();
		}
	}

	function drawNESLine(x1: number, y1: number, number, x2: number, y2: number, number, type): string {
		if (!ctx) return;

		ctx.strokeStyle = type === 'error' ? NES_COLORS.error : NES_COLORS.connection;
		ctx.lineWidth = type === 'error' ? 3 : 2;
		ctx.setLineDash(type === 'related' ? [5, 5] : []);

		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		ctx.setLineDash([]);
	}

	function handleCanvasClick(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const clickedNode = nodes.find((node) => {
			const dx = x - node.x;
			const dy = y - node.y;
			return Math.sqrt(dx * dx + dy * dy) < 20;
		});

		if (clickedNode && canvas) {
			canvas.dispatchEvent(
				new CustomEvent('nodeclick', {
					detail: clickedNode
				})
			);
		}
	}

	function handleCanvasMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const hovered = nodes.find((node) => {
			const dx = x - node.x;
			const dy = y - node.y;
			return Math.sqrt(dx * dx + dy * dy) < 20;
		});

		if (hovered !== hoveredNode) {
			hoveredNode = hovered || null;
			if (hovered) {
				tooltipX = e.clientX;
				tooltipY = e.clientY;
				showTooltip = true;
			} else {
				showTooltip = false;
			}
			renderGraph();
		}
	}
</script>

<div class="nes-graph-container">
	<canvas
		bind:this={canvas}
		onclick={ handleCanvasClick }
		onmousemove={ handleCanvasMove }
		onmouseleave={() => {
			hoveredNode = null;
			showTooltip = false;
			renderGraph();
		}}
		class="nes-graph-canvas"
	></canvas>

	{#if showTooltip && hoveredNode}
		<TooltipRoot open={showTooltip}>
			<TooltipTrigger class="tooltip-trigger" style="left: {tooltipX}px; top: {tooltipY}px;" />
			<TooltipContent class="nes-tooltip">
				<div class="nes-tooltip-content">
					<div class="font-mono text-xs">{hoveredNode.label}</div>
					<div class="text-[10px] text-[#aaa]">{hoveredNode.type}</div>
				</div>
			</TooltipContent>
		</TooltipRoot>
	{/if}
</div>

<style>
	.nes-graph-container {
		position: relative; width: 100%;
		height: 100%; background: #0f380f;
		border: 3px solid #000;
		box-shadow: inset 0 0 0 2px #306230;
	}

	.nes-graph-canvas {
		display: block; cursor: crosshair;
		image-rendering: pixelated;
	}

	.tooltip-trigger {
		position: fixed;
		pointer-events: none; width: 1px;
		height: 1px;
	}

	.nes-tooltip {
		background: #262017; border: 2px solid #f3eddc;
		padding: 8px; color: #f3eddc;
		font-family: 'Press Start 2P', monospace;
		font-size: 8px;
		z-index: 1000;
	}

	.nes-tooltip-content {
		display: flex;
		flex-direction: column; gap: 4px;
	}
</style>



