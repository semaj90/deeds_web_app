<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { onMount } from 'svelte';

	interface Props {
		entityId?: string;
		caseId?: string;
		depth?: number;
		width?: number;
		height?: number;
		class?: string;
	}

	let {
		entityId = '',
		caseId = '',
		depth = 2,
		width = 800,
		height = 500,
		class: className = ''
	}: Props = $props();

	interface GraphNode {
		id: string;
		label: string;
		title: string;
		x: number;
		y: number;
		vx: number;
		vy: number;
		color: string;
		radius: number;
	}

	interface GraphEdge {
		source: string;
		target: string;
		relationship: string;
	}

	let canvas: HTMLCanvasElement | undefined = $state(undefined);
	let nodes = $state<GraphNode[]>([]);
	let edges = $state<GraphEdge[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hoveredNode = $state<GraphNode | null>(null);
	let dragNode = $state<GraphNode | null>(null);
	let animFrameId = 0;

	const LABEL_COLORS: Record<string, string> = {
		Case: '#3b82f6',
		Person: '#f59e0b',
		Evidence: '#10b981',
		Document: '#8b5cf6',
		Statute: '#ef4444',
		Citation: '#ec4899',
		Tag: '#6b7280',
	};

	function getColor(label: string): string {
		return LABEL_COLORS[label] ?? '#6b7280';
	}

	async function loadGraph() {
		loading = true;
		error = null;
		nodes = [];
		edges = [];

		try {
			let data: any;
			if (entityId) {
				const res = await fetch(`/api/graph/relationships?entityId=${entityId}&depth=${depth}`);
				if (!res.ok) throw new Error(`API error ${res.status}`);
				data = await res.json();
				if (data.error) throw new Error(data.error);
				buildFromRelationships(data.relationships ?? []);
			} else if (caseId) {
				const res = await fetch(`/api/graph/connections?caseId=${caseId}`);
				if (!res.ok) throw new Error(`API error ${res.status}`);
				data = await res.json();
				if (data.error) throw new Error(data.error);
				buildFromConnections(caseId, data.connections ?? []);
			} else {
				error = 'Provide entityId or caseId';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load graph';
		} finally {
			loading = false;
		}
	}

	function buildFromRelationships(rels: any[]) {
		const nodeMap = new Map<string, GraphNode>();
		const cx = width / 2;
		const cy = height / 2;

		for (const rel of rels) {
			for (const side of ['source', 'target'] as const) {
				const n = rel[side];
				if (!nodeMap.has(n.id)) {
					const angle = Math.random() * Math.PI * 2;
					const r = 80 + Math.random() * 120;
					nodeMap.set(n.id, {
						id: n.id,
						label: n.label,
						title: n.title || n.id.slice(0, 8),
						x: cx + Math.cos(angle) * r,
						y: cy + Math.sin(angle) * r,
						vx: 0, vy: 0,
						color: getColor(n.label),
						radius: n.id === entityId ? 14 : 10,
					});
				}
			}
			edges.push({ source: rel.source.id, target: rel.target.id, relationship: rel.relationship });
		}

		nodes = Array.from(nodeMap.values());
	}

	function buildFromConnections(sourceCaseId: string, conns: any[]) {
		const cx = width / 2;
		const cy = height / 2;
		const nodeMap = new Map<string, GraphNode>();

		nodeMap.set(sourceCaseId, {
			id: sourceCaseId,
			label: 'Case',
			title: 'This Case',
			x: cx, y: cy,
			vx: 0, vy: 0,
			color: getColor('Case'),
			radius: 16,
		});

		for (let i = 0; i < conns.length; i++) {
			const c = conns[i];
			const angle = (i / conns.length) * Math.PI * 2;
			const r = 120 + Math.random() * 60;
			nodeMap.set(c.caseId, {
				id: c.caseId,
				label: 'Case',
				title: c.title || c.caseId.slice(0, 8),
				x: cx + Math.cos(angle) * r,
				y: cy + Math.sin(angle) * r,
				vx: 0, vy: 0,
				color: getColor('Case'),
				radius: 8 + Math.min(c.strength, 6),
			});
			edges.push({ source: sourceCaseId, target: c.caseId, relationship: `${c.strength} shared` });

			for (const se of (c.sharedEntities || []).slice(0, 3)) {
				const seId = `${c.caseId}-${se.type}-${se.title}`;
				if (!nodeMap.has(seId)) {
					nodeMap.set(seId, {
						id: seId,
						label: se.type,
						title: se.title || se.type,
						x: cx + Math.cos(angle + 0.3) * (r * 0.6),
						y: cy + Math.sin(angle + 0.3) * (r * 0.6),
						vx: 0, vy: 0,
						color: getColor(se.type),
						radius: 6,
					});
				}
				edges.push({ source: sourceCaseId, target: seId, relationship: 'SHARED' });
				edges.push({ source: c.caseId, target: seId, relationship: 'SHARED' });
			}
		}

		nodes = Array.from(nodeMap.values());
	}

	function simulate() {
		const k = 0.01;
		const repulse = 3000;
		const damping = 0.85;
		const cx = width / 2;
		const cy = height / 2;

		for (const n of nodes) {
			n.vx += (cx - n.x) * k * 0.05;
			n.vy += (cy - n.y) * k * 0.05;
		}

		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const dx = nodes[j].x - nodes[i].x;
				const dy = nodes[j].y - nodes[i].y;
				const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
				const force = repulse / (dist * dist);
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				nodes[i].vx -= fx;
				nodes[i].vy -= fy;
				nodes[j].vx += fx;
				nodes[j].vy += fy;
			}
		}

		const nodeIdx = new Map(nodes.map((n, i) => [n.id, i]));
		for (const e of edges) {
			const si = nodeIdx.get(e.source);
			const ti = nodeIdx.get(e.target);
			if (si === undefined || ti === undefined) continue;
			const s = nodes[si];
			const t = nodes[ti];
			const dx = t.x - s.x;
			const dy = t.y - s.y;
			const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
			const target = 100;
			const force = (dist - target) * k;
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			s.vx += fx;
			s.vy += fy;
			t.vx -= fx;
			t.vy -= fy;
		}

		for (const n of nodes) {
			if (n === dragNode) continue;
			n.vx *= damping;
			n.vy *= damping;
			n.x += n.vx;
			n.y += n.vy;
			n.x = Math.max(n.radius, Math.min(width - n.radius, n.x));
			n.y = Math.max(n.radius, Math.min(height - n.radius, n.y));
		}
	}

	function draw() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, width, height);
		const nodeIdx = new Map(nodes.map((n) => [n.id, n]));

		for (const e of edges) {
			const s = nodeIdx.get(e.source);
			const t = nodeIdx.get(e.target);
			if (!s || !t) continue;
			ctx.beginPath();
			ctx.moveTo(s.x, s.y);
			ctx.lineTo(t.x, t.y);
			ctx.strokeStyle = 'rgba(107, 114, 128, 0.3)';
			ctx.lineWidth = 1;
			ctx.stroke();
		}

		for (const n of nodes) {
			ctx.beginPath();
			ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
			ctx.fillStyle = n === hoveredNode ? '#ffffff' : n.color;
			ctx.fill();
			ctx.strokeStyle = n === hoveredNode ? n.color : 'rgba(255,255,255,0.15)';
			ctx.lineWidth = n === hoveredNode ? 2 : 1;
			ctx.stroke();

			if (n.radius >= 10 || n === hoveredNode) {
				ctx.fillStyle = '#e5e7eb';
				ctx.font = '10px monospace';
				ctx.textAlign = 'center';
				ctx.fillText(n.title.slice(0, 16), n.x, n.y + n.radius + 14);
			}
		}

		if (hoveredNode) {
			ctx.fillStyle = '#1c1917';
			ctx.strokeStyle = hoveredNode.color;
			const tw = ctx.measureText(hoveredNode.title).width + 16;
			const tx = hoveredNode.x - tw / 2;
			const ty = hoveredNode.y - hoveredNode.radius - 30;
			ctx.fillRect(tx, ty, tw, 20);
			ctx.strokeRect(tx, ty, tw, 20);
			ctx.fillStyle = '#e5e7eb';
			ctx.font = '11px monospace';
			ctx.textAlign = 'center';
			ctx.fillText(`${hoveredNode.label}: ${hoveredNode.title}`, hoveredNode.x, ty + 14);
		}
	}

	function loop() {
		simulate();
		draw();
		animFrameId = requestAnimationFrame(loop);
	}

	function handleMouseMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		if (dragNode) {
			dragNode.x = mx;
			dragNode.y = my;
			dragNode.vx = 0;
			dragNode.vy = 0;
			return;
		}

		hoveredNode = null;
		for (const n of nodes) {
			const dx = mx - n.x;
			const dy = my - n.y;
			if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) {
				hoveredNode = n;
				break;
			}
		}
	}

	function handleMouseDown(e: MouseEvent) {
		if (hoveredNode) {
			dragNode = hoveredNode;
			e.preventDefault();
		}
	}

	function handleMouseUp() {
		dragNode = null;
	}

	onMount(() => {
		if (entityId || caseId) loadGraph();
	});

	$effect(() => {
		if (nodes.length > 0) {
			animFrameId = requestAnimationFrame(loop);
			return () => cancelAnimationFrame(animFrameId);
		}
	});
</script>

<div class="flex flex-col gap-3 {className}">
	<!-- Controls -->
	<div class="flex items-center gap-3 text-sm">
		<div class="flex items-center gap-2">
			<Icon name="git-branch" size={16} class="text-emerald-400" />
			<span class="font-mono text-xs text-stone-400 tracking-wider">GRAPH VIEWER</span>
		</div>
		<span class="text-[10px] text-stone-600">{nodes.length} nodes / {edges.length} edges</span>
		<button
			class="ml-auto px-2.5 py-1 text-xs font-mono rounded border border-stone-700 bg-transparent text-stone-400 hover:text-white hover:border-emerald-600 cursor-pointer transition-colors"
			onclick={loadGraph}
			disabled={loading}
		>
			{loading ? 'Loading...' : 'Refresh'}
		</button>
	</div>

	<!-- Legend -->
	<div class="flex flex-wrap gap-3 text-[10px]">
		{#each Object.entries(LABEL_COLORS) as [label, color]}
			<div class="flex items-center gap-1.5">
				<span class="w-2.5 h-2.5 rounded-full inline-block" style:background={color}></span>
				<span class="text-stone-500">{label}</span>
			</div>
		{/each}
	</div>

	<!-- Canvas -->
	<div class="border border-stone-800 rounded-lg overflow-hidden bg-[#0c0a09] relative">
		{#if loading}
			<div class="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
				<div class="flex items-center gap-2 text-emerald-400 text-sm">
					<Icon name="loader-2" size={16} class="animate-spin" />
					<span>Loading graph data...</span>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="absolute inset-0 flex items-center justify-center z-10">
				<div class="text-center">
					<Icon name="alert-triangle" size={24} class="text-red-400 mx-auto mb-2" />
					<p class="text-red-300 text-sm">{error}</p>
					<button
						class="mt-2 px-3 py-1 text-xs rounded border border-stone-700 text-stone-400 hover:text-white cursor-pointer bg-transparent"
						onclick={loadGraph}
					>Retry</button>
				</div>
			</div>
		{/if}

		{#if nodes.length === 0 && !loading && !error}
			<div class="flex items-center justify-center text-stone-600 text-sm" style:height="{height}px">
				<div class="text-center">
					<Icon name="git-branch" size={32} class="mx-auto mb-2 opacity-30" />
					<p>No graph data loaded</p>
					<p class="text-[11px] mt-1">Provide an entityId or caseId to visualize relationships</p>
				</div>
			</div>
		{/if}

		<canvas
			bind:this={canvas}
			{width}
			{height}
			onmousemove={handleMouseMove}
			onmousedown={handleMouseDown}
			onmouseup={handleMouseUp}
			onmouseleave={handleMouseUp}
			class="block"
			style:cursor={hoveredNode ? 'grab' : 'default'}
		></canvas>
	</div>
</div>
