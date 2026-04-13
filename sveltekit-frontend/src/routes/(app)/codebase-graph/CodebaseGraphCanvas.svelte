<script lang="ts">
import { onMount } from 'svelte';

interface GraphNode {
	id: string;
	label: string;
	type: 'file' | 'directory';
	path: string;
	extension?: string;
	size: number;
	group: number;
	x?: number;
	y?: number;
	vx?: number;
	vy?: number;
}

interface GraphEdge {
	source: string;
	target: string;
	type: string;
	weight: number;
}

let { nodes, edges, onNodeClick }: {
	nodes: GraphNode[];
	edges: GraphEdge[];
	onNodeClick?: (node: GraphNode) => void;
} = $props();

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D | null = null;
let width = $state(800);
let height = $state(600);
let hoveredNode = $state<GraphNode | null>(null);
let simulationNodes: GraphNode[] = [];
let animationId: number;

function initSimulation() {
	if (!canvas || !ctx) return;

	// Initialize node positions
	simulationNodes = nodes.map(n => ({
		...n,
		x: width / 2 + (Math.random() - 0.5) * width * 0.5,
		y: height / 2 + (Math.random() - 0.5) * height * 0.5,
		vx: 0,
		vy: 0
	}));

	animate();
}

function animate() {
	if (!ctx) return;

	// Physics simulation
	const alpha = 0.1;
	
	for (const node of simulationNodes) {
		// Repulsion from other nodes
		for (const other of simulationNodes) {
			if (node === other) continue;
			const dx = node.x! - other.x!;
			const dy = node.y! - other.y!;
			const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
			const force = 800 / (dist * dist);
			node.vx! += (dx / dist) * force * alpha;
			node.vy! += (dy / dist) * force * alpha;
		}

		// Center gravity
		node.vx! += (width / 2 - node.x!) * 0.002;
		node.vy! += (height / 2 - node.y!) * 0.002;
	}

	// Edge springs
	for (const edge of edges) {
		const source = simulationNodes.find(n => n.id === edge.source);
		const target = simulationNodes.find(n => n.id === edge.target);
		if (!source || !target) continue;

		const dx = target.x! - source.x!;
		const dy = target.y! - source.y!;
		const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
		const ideal = 80;
		const force = (dist - ideal) * 0.02;

		source.vx! += (dx / dist) * force * alpha;
		source.vy! += (dy / dist) * force * alpha;
		target.vx! -= (dx / dist) * force * alpha;
		target.vy! -= (dy / dist) * force * alpha;
	}

	// Update positions
	for (const node of simulationNodes) {
		node.vx! *= 0.85;
		node.vy! *= 0.85;
		node.x! += node.vx!;
		node.y! += node.vy!;

		// Bounds
		node.x! = Math.max(20, Math.min(width - 20, node.x!));
		node.y! = Math.max(20, Math.min(height - 20, node.y!));
	}

	render();
	animationId = requestAnimationFrame(animate);
}

function render() {
	if (!ctx) return;

	// Clear
	ctx.fillStyle = '#0a0a0a';
	ctx.fillRect(0, 0, width, height);

	// Draw edges
	ctx.lineWidth = 1;
	for (const edge of edges) {
		const source = simulationNodes.find(n => n.id === edge.source);
		const target = simulationNodes.find(n => n.id === edge.target);
		if (!source || !target) continue;

		ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
		ctx.beginPath();
		ctx.moveTo(source.x!, source.y!);
		ctx.lineTo(target.x!, target.y!);
		ctx.stroke();
	}

	// Draw nodes
	const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'];
	
	for (const node of simulationNodes) {
		const isDir = node.type === 'directory';
		const radius = isDir ? Math.min(6 + node.size * 0.3, 12) : 3;
		const isHovered = hoveredNode?.id === node.id;

		ctx.fillStyle = isHovered ? '#ffffff' : colors[node.group % colors.length];
		ctx.beginPath();
		ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
		ctx.fill();

		if (isHovered) {
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2;
			ctx.stroke();
		}

		// Labels
		if (isDir && node.size > 3) {
			ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
			ctx.font = '10px monospace';
			ctx.fillText(node.label, node.x! + radius + 3, node.y! + 3);
		}
	}

	// Hovered node info
	if (hoveredNode) {
		ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
		ctx.fillRect(10, 10, 300, 80);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
		ctx.strokeRect(10, 10, 300, 80);
		
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 12px monospace';
		ctx.fillText(hoveredNode.label, 20, 30);
		
		ctx.font = '10px monospace';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
		ctx.fillText(`Type: ${hoveredNode.type}`, 20, 50);
		ctx.fillText(`Path: ${hoveredNode.path.substring(0, 35)}...`, 20, 65);
		if (hoveredNode.extension) {
			ctx.fillText(`Extension: ${hoveredNode.extension}`, 20, 80);
		}
	}
}

function handleCanvasClick(event: MouseEvent) {
	const rect = canvas.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	for (const node of simulationNodes) {
		const dx = x - node.x!;
		const dy = y - node.y!;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const radius = node.type === 'directory' ? Math.min(6 + node.size * 0.3, 12) : 3;

		if (dist < radius + 5) {
			onNodeClick?.(node);
			return;
		}
	}
}

function handleCanvasMove(event: MouseEvent) {
	const rect = canvas.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	let found = false;
	for (const node of simulationNodes) {
		const dx = x - node.x!;
		const dy = y - node.y!;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const radius = node.type === 'directory' ? Math.min(6 + node.size * 0.3, 12) : 3;

		if (dist < radius + 5) {
			hoveredNode = node;
			found = true;
			canvas.style.cursor = 'pointer';
			break;
		}
	}

	if (!found) {
		hoveredNode = null;
		canvas.style.cursor = 'default';
	}
}

onMount(() => {
	if (canvas) {
		const updateSize = () => {
			width = window.innerWidth - 320;
			height = window.innerHeight - 60;
			canvas.width = width;
			canvas.height = height;
			ctx = canvas.getContext('2d');
		};

		updateSize();
		window.addEventListener('resize', updateSize);

		return () => {
			window.removeEventListener('resize', updateSize);
			if (animationId) cancelAnimationFrame(animationId);
		};
	}
});

$effect(() => {
	if (nodes.length > 0 && canvas && ctx) {
		if (animationId) cancelAnimationFrame(animationId);
		initSimulation();
	}
});
</script>

<canvas
	bind:this={canvas}
	onclick={handleCanvasClick}
	onmousemove={handleCanvasMove}
	class="absolute inset-0 bg-black"
></canvas>

<!-- Legend -->
<div class="absolute top-4 right-4 bg-black/90 text-white px-4 py-3 rounded-lg shadow-xl border border-white/20">
	<div class="text-xs font-bold mb-2 opacity-70">LEGEND</div>
	<div class="flex flex-col gap-2 text-xs">
		<div class="flex items-center gap-2">
			<div class="w-3 h-3 rounded-full bg-blue-500"></div>
			<span>Directories</span>
		</div>
		<div class="flex items-center gap-2">
			<div class="w-2 h-2 rounded-full bg-green-500"></div>
			<span>Files</span>
		</div>
	</div>
	<div class="mt-3 pt-2 border-t border-white/20 text-xs opacity-70">
		<div>{nodes.length} nodes</div>
		<div>{edges.length} edges</div>
	</div>
</div>
