<!--
	Collaborative Evidence Canvas — Miro/FigJam-style infinite canvas
	SVG-based, no external canvas lib dependency.
	Uses BoardSnapshot schema for persistence.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { BoardSnapshotSchema } from '$lib/schemas/board';

	type BoardNode = BoardSnapshotSchema['nodes'][number];
	type BoardEdge = BoardSnapshotSchema['edges'][number];

	interface Props {
		caseId: string;
		snapshot?: BoardSnapshotSchema;
		readOnly?: boolean;
		onchange?: (snapshot: BoardSnapshotSchema) => void;
	}

	let {
		caseId,
		snapshot = $bindable({
			version: 1,
			viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
			nodes: [],
			edges: [],
		}),
		readOnly = false,
		onchange,
	}: Props = $props();

	// ── Viewport state ──
	let pan = $state({ x: snapshot.viewport.pan.x, y: snapshot.viewport.pan.y });
	let zoom = $state(snapshot.viewport.zoom);
	let isPanning = $state(false);
	let panStart = $state({ x: 0, y: 0 });
	let panOrigin = $state({ x: 0, y: 0 });

	// ── Nodes & edges ──
	let nodes = $state<BoardNode[]>([...snapshot.nodes]);
	let edges = $state<BoardEdge[]>([...snapshot.edges]);

	// ── Interaction state ──
	let tool = $state<'select' | 'note' | 'connect'>('select');
	let selectedId = $state<string | null>(null);
	let dragging = $state<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
	let connecting = $state<{ fromId: string; mx: number; my: number } | null>(null);
	let svgEl = $state<SVGSVGElement>();

	// ── Derived ──
	let selectedNode = $derived(nodes.find((n) => n.id === selectedId) ?? null);
	let viewTransform = $derived(`translate(${pan.x}, ${pan.y}) scale(${zoom})`);

	// ── Grid constants ──
	const GRID_SIZE = 40;
	const NODE_COLORS: Record<string, string> = {
		note: '#fef3c7',
		evidence: '#dbeafe',
		image: '#ede9fe',
		pdf: '#fce7f3',
		link: '#d1fae5',
	};

	// ── SVG coordinate conversion ──
	function svgPoint(clientX: number, clientY: number) {
		if (!svgEl) return { x: 0, y: 0 };
		const rect = svgEl.getBoundingClientRect();
		return {
			x: (clientX - rect.left - pan.x) / zoom,
			y: (clientY - rect.top - pan.y) / zoom,
		};
	}

	// ── Emit changes ──
	function emitChange() {
		snapshot = {
			version: snapshot.version,
			viewport: { pan: { ...pan }, zoom },
			nodes: [...nodes],
			edges: [...edges],
			updatedAt: new Date().toISOString(),
		};
		onchange?.(snapshot);
	}

	// ── Zoom ──
	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 0.92 : 1.08;
		const newZoom = Math.min(5, Math.max(0.1, zoom * factor));
		// Zoom toward cursor
		if (svgEl) {
			const rect = svgEl.getBoundingClientRect();
			const cx = e.clientX - rect.left;
			const cy = e.clientY - rect.top;
			pan.x = cx - ((cx - pan.x) / zoom) * newZoom;
			pan.y = cy - ((cy - pan.y) / zoom) * newZoom;
		}
		zoom = newZoom;
	}

	// ── Pan ──
	function handlePointerDown(e: PointerEvent) {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			// Middle click or Alt+click to pan
			isPanning = true;
			panStart = { x: e.clientX, y: e.clientY };
			panOrigin = { ...pan };
			(e.target as Element)?.setPointerCapture?.(e.pointerId);
			return;
		}

		if (tool === 'note' && e.button === 0 && !readOnly) {
			const pt = svgPoint(e.clientX, e.clientY);
			const snappedX = Math.round(pt.x / GRID_SIZE) * GRID_SIZE;
			const snappedY = Math.round(pt.y / GRID_SIZE) * GRID_SIZE;
			addNode('note', snappedX, snappedY);
			tool = 'select';
			return;
		}

		// Deselect if clicking empty space
		if (tool === 'select' && e.button === 0) {
			const target = e.target as SVGElement;
			if (target === svgEl || target.classList.contains('canvas-bg')) {
				selectedId = null;
				connecting = null;
			}
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (isPanning) {
			pan.x = panOrigin.x + (e.clientX - panStart.x);
			pan.y = panOrigin.y + (e.clientY - panStart.y);
			return;
		}

		if (dragging) {
			const pt = svgPoint(e.clientX, e.clientY);
			const idx = nodes.findIndex((n) => n.id === dragging!.nodeId);
			if (idx >= 0) {
				nodes[idx] = {
					...nodes[idx],
					x: Math.round((pt.x - dragging.offsetX) / GRID_SIZE) * GRID_SIZE,
					y: Math.round((pt.y - dragging.offsetY) / GRID_SIZE) * GRID_SIZE,
				};
			}
			return;
		}

		if (connecting) {
			const pt = svgPoint(e.clientX, e.clientY);
			connecting = { ...connecting, mx: pt.x, my: pt.y };
		}
	}

	function handlePointerUp(_e: PointerEvent) {
		if (isPanning) {
			isPanning = false;
			emitChange();
		}
		if (dragging) {
			dragging = null;
			emitChange();
		}
		if (connecting) {
			connecting = null;
		}
	}

	// ── Node interactions ──
	function handleNodePointerDown(e: PointerEvent, node: BoardNode) {
		e.stopPropagation();
		if (readOnly) return;

		if (tool === 'connect') {
			const cx = node.x + node.w / 2;
			const cy = node.y + node.h / 2;
			connecting = { fromId: node.id, mx: cx, my: cy };
			return;
		}

		selectedId = node.id;
		if (tool === 'select') {
			const pt = svgPoint(e.clientX, e.clientY);
			dragging = { nodeId: node.id, offsetX: pt.x - node.x, offsetY: pt.y - node.y };
			(e.target as Element)?.setPointerCapture?.(e.pointerId);
		}
	}

	function handleNodePointerUp(e: PointerEvent, node: BoardNode) {
		if (connecting && connecting.fromId !== node.id) {
			edges = [
				...edges,
				{
					id: `edge-${Date.now()}`,
					fromId: connecting.fromId,
					toId: node.id,
					style: 'solid',
				},
			];
			connecting = null;
			emitChange();
		}
	}

	// ── CRUD ──
	function addNode(kind: BoardNode['kind'], x: number, y: number) {
		const node: BoardNode = {
			id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			kind,
			x,
			y,
			w: kind === 'note' ? 200 : 240,
			h: kind === 'note' ? 120 : 160,
			title: kind === 'note' ? 'New note' : `New ${kind}`,
			body: '',
			color: NODE_COLORS[kind] ?? '#f1f5f9',
		};
		nodes = [...nodes, node];
		selectedId = node.id;
		emitChange();
	}

	function deleteSelected() {
		if (!selectedId || readOnly) return;
		nodes = nodes.filter((n) => n.id !== selectedId);
		edges = edges.filter((e) => e.fromId !== selectedId && e.toId !== selectedId);
		selectedId = null;
		emitChange();
	}

	function addEvidence(evidenceId: string, title: string) {
		const pt = svgPoint(
			(svgEl?.getBoundingClientRect().width ?? 600) / 2,
			(svgEl?.getBoundingClientRect().height ?? 400) / 2,
		);
		const node: BoardNode = {
			id: `node-${Date.now()}`,
			kind: 'evidence',
			x: Math.round(pt.x / GRID_SIZE) * GRID_SIZE,
			y: Math.round(pt.y / GRID_SIZE) * GRID_SIZE,
			w: 240,
			h: 160,
			title,
			evidenceId,
			color: NODE_COLORS.evidence,
		};
		nodes = [...nodes, node];
		selectedId = node.id;
		emitChange();
	}

	// ── Edge geometry ──
	function edgePath(edge: BoardEdge): string {
		const from = nodes.find((n) => n.id === edge.fromId);
		const to = nodes.find((n) => n.id === edge.toId);
		if (!from || !to) return '';
		const x1 = from.x + from.w / 2;
		const y1 = from.y + from.h / 2;
		const x2 = to.x + to.w / 2;
		const y2 = to.y + to.h / 2;
		const mx = (x1 + x2) / 2;
		const my = (y1 + y2) / 2;
		// Slight curve for visual clarity
		const dx = x2 - x1;
		const dy = y2 - y1;
		const cx = mx - dy * 0.1;
		const cy = my + dx * 0.1;
		return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
	}

	// ── Keyboard shortcuts ──
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedId && !(e.target as HTMLElement)?.closest?.('[contenteditable]')) {
				deleteSelected();
			}
		}
		if (e.key === '1') tool = 'select';
		if (e.key === '2') tool = 'note';
		if (e.key === '3') tool = 'connect';
		if (e.key === '0') {
			pan = { x: 0, y: 0 };
			zoom = 1;
		}
	}

	// ── Zoom controls ──
	function zoomIn() {
		zoom = Math.min(5, zoom * 1.2);
	}
	function zoomOut() {
		zoom = Math.max(0.1, zoom / 1.2);
	}
	function zoomReset() {
		pan = { x: 0, y: 0 };
		zoom = 1;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="canvas-root">
	<!-- Toolbar -->
	{#if !readOnly}
		<div class="toolbar">
			<div class="tool-group">
				<Button
					size="sm"
					variant={tool === 'select' ? 'default' : 'ghost'}
					onclick={() => (tool = 'select')}
					title="Select (1)"
				>
					<Icon name="mouse-pointer-2" size={16} />
				</Button>
				<Button
					size="sm"
					variant={tool === 'note' ? 'default' : 'ghost'}
					onclick={() => (tool = 'note')}
					title="Add note (2)"
				>
					<Icon name="sticky-note" size={16} />
				</Button>
				<Button
					size="sm"
					variant={tool === 'connect' ? 'default' : 'ghost'}
					onclick={() => (tool = 'connect')}
					title="Connect (3)"
				>
					<Icon name="git-branch" size={16} />
				</Button>
			</div>

			<div class="divider"></div>

			<div class="tool-group">
				<Button size="sm" variant="ghost" onclick={zoomOut} title="Zoom out">
					<Icon name="minus" size={16} />
				</Button>
				<span class="zoom-label">{Math.round(zoom * 100)}%</span>
				<Button size="sm" variant="ghost" onclick={zoomIn} title="Zoom in">
					<Icon name="plus" size={16} />
				</Button>
				<Button size="sm" variant="ghost" onclick={zoomReset} title="Reset view (0)">
					<Icon name="maximize-2" size={16} />
				</Button>
			</div>

			{#if selectedId}
				<div class="divider"></div>
				<Button size="sm" variant="ghost" onclick={deleteSelected} title="Delete">
					<Icon name="trash-2" size={16} />
				</Button>
			{/if}
		</div>
	{/if}

	<!-- SVG Canvas -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		bind:this={svgEl}
		class="canvas-svg"
		class:panning={isPanning}
		class:tool-note={tool === 'note'}
		class:tool-connect={tool === 'connect'}
		onwheel={handleWheel}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
	>
		<!-- Grid pattern -->
		<defs>
			<pattern
				id="grid-{caseId}"
				width={GRID_SIZE * zoom}
				height={GRID_SIZE * zoom}
				patternUnits="userSpaceOnUse"
				x={pan.x % (GRID_SIZE * zoom)}
				y={pan.y % (GRID_SIZE * zoom)}
			>
				<circle cx="1" cy="1" r="1" fill="var(--t-text-muted, #64748b)" opacity="0.2" />
			</pattern>
			<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
				<polygon points="0 0, 10 3.5, 0 7" fill="var(--t-text-muted, #64748b)" />
			</marker>
		</defs>

		<!-- Background -->
		<rect class="canvas-bg" width="100%" height="100%" fill="url(#grid-{caseId})" />

		<!-- World group -->
		<g transform={viewTransform}>
			<!-- Edges -->
			{#each edges as edge (edge.id)}
				<path
					d={edgePath(edge)}
					fill="none"
					stroke="var(--t-text-muted, #64748b)"
					stroke-width={1.5 / zoom}
					stroke-dasharray={edge.style === 'dashed' ? `${6 / zoom},${4 / zoom}` : 'none'}
					marker-end="url(#arrowhead)"
					opacity="0.6"
				/>
				{#if edge.label}
					{@const from = nodes.find((n) => n.id === edge.fromId)}
					{@const to = nodes.find((n) => n.id === edge.toId)}
					{#if from && to}
						<text
							x={(from.x + from.w / 2 + to.x + to.w / 2) / 2}
							y={(from.y + from.h / 2 + to.y + to.h / 2) / 2 - 8 / zoom}
							text-anchor="middle"
							font-size={11 / zoom}
							fill="var(--t-text-muted, #64748b)"
						>
							{edge.label}
						</text>
					{/if}
				{/if}
			{/each}

			<!-- Connection preview line -->
			{#if connecting}
				{@const fromNode = nodes.find((n) => n.id === connecting.fromId)}
				{#if fromNode}
					<line
						x1={fromNode.x + fromNode.w / 2}
						y1={fromNode.y + fromNode.h / 2}
						x2={connecting.mx}
						y2={connecting.my}
						stroke="var(--t-accent, #38bdf8)"
						stroke-width={2 / zoom}
						stroke-dasharray={`${6 / zoom},${4 / zoom}`}
						opacity="0.7"
					/>
				{/if}
			{/if}

			<!-- Nodes -->
			{#each nodes as node (node.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g
					class="node-group"
					class:selected={node.id === selectedId}
					onpointerdown={(e) => handleNodePointerDown(e, node)}
					onpointerup={(e) => handleNodePointerUp(e, node)}
				>
					<!-- Shadow -->
					<rect
						x={node.x + 2}
						y={node.y + 2}
						width={node.w}
						height={node.h}
						rx="8"
						fill="rgba(0,0,0,0.08)"
					/>
					<!-- Card -->
					<rect
						x={node.x}
						y={node.y}
						width={node.w}
						height={node.h}
						rx="8"
						fill={node.color ?? '#f1f5f9'}
						stroke={node.id === selectedId
							? 'var(--t-accent, #38bdf8)'
							: 'rgba(0,0,0,0.1)'}
						stroke-width={node.id === selectedId ? 2 / zoom : 1 / zoom}
					/>
					<!-- Kind badge -->
					<rect
						x={node.x + 8}
						y={node.y + 8}
						width={node.kind.length * 7 + 12}
						height={18}
						rx="9"
						fill="rgba(0,0,0,0.08)"
					/>
					<text
						x={node.x + 14}
						y={node.y + 21}
						font-size="10"
						fill="rgba(0,0,0,0.5)"
						font-family="monospace"
					>
						{node.kind}
					</text>
					<!-- Title -->
					<text
						x={node.x + 12}
						y={node.y + 44}
						font-size="13"
						font-weight="600"
						fill="rgba(0,0,0,0.85)"
					>
						{(node.title ?? '').slice(0, 28)}{(node.title ?? '').length > 28 ? '...' : ''}
					</text>
					<!-- Body preview -->
					{#if node.body}
						<text
							x={node.x + 12}
							y={node.y + 64}
							font-size="11"
							fill="rgba(0,0,0,0.5)"
						>
							{node.body.slice(0, 35)}{node.body.length > 35 ? '...' : ''}
						</text>
					{/if}
					<!-- Evidence indicator -->
					{#if node.evidenceId}
						<circle
							cx={node.x + node.w - 16}
							cy={node.y + 16}
							r="6"
							fill="var(--t-accent, #38bdf8)"
						/>
					{/if}
				</g>
			{/each}
		</g>
	</svg>

	<!-- Minimap -->
	{#if nodes.length > 0}
		<div class="minimap">
			<svg viewBox="-500 -500 2000 2000" width="120" height="90">
				{#each nodes as node}
					<rect
						x={node.x}
						y={node.y}
						width={node.w}
						height={node.h}
						fill={node.color ?? '#94a3b8'}
						opacity="0.6"
						rx="4"
					/>
				{/each}
				<!-- Viewport indicator -->
				{#if svgEl}
					<rect
						x={-pan.x / zoom}
						y={-pan.y / zoom}
						width={(svgEl.clientWidth ?? 800) / zoom}
						height={(svgEl.clientHeight ?? 600) / zoom}
						fill="none"
						stroke="var(--t-accent, #38bdf8)"
						stroke-width="8"
						rx="4"
					/>
				{/if}
			</svg>
		</div>
	{/if}
</div>

<style>
	.canvas-root {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 400px;
		overflow: hidden;
		background: var(--t-bg, #0f172a);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border, #334155);
	}

	.toolbar {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: var(--t-panel, #1e293b);
		border: 1px solid var(--t-border, #334155);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.tool-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.divider {
		width: 1px;
		height: 20px;
		background: var(--t-border, #334155);
		margin: 0 4px;
	}

	.zoom-label {
		font-size: 11px;
		color: var(--t-text-muted, #94a3b8);
		min-width: 36px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.canvas-svg {
		width: 100%;
		height: 100%;
		cursor: default;
		touch-action: none;
	}

	.canvas-svg.panning {
		cursor: grabbing;
	}

	.canvas-svg.tool-note {
		cursor: crosshair;
	}

	.canvas-svg.tool-connect {
		cursor: cell;
	}

	.node-group {
		cursor: grab;
	}

	.node-group:hover rect:nth-child(2) {
		filter: brightness(0.97);
	}

	.node-group.selected rect:nth-child(2) {
		filter: brightness(0.95);
	}

	.minimap {
		position: absolute;
		bottom: 12px;
		right: 12px;
		background: var(--t-panel, #1e293b);
		border: 1px solid var(--t-border, #334155);
		border-radius: 6px;
		padding: 4px;
		opacity: 0.8;
	}

	.minimap:hover {
		opacity: 1;
	}
</style>
