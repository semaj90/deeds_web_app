<script lang="ts">
	/**
	 * Code Evidence Board — renders AST graph nodes as evidence-style cards
	 * on an interactive canvas with zoom, pan, and connection lines.
	 *
	 * Bridges the AST graph data model to the evidence board visual language.
	 */
	import Icon from '$lib/components/ui/Icon.svelte';

	interface GraphNode {
		id: string;
		label: string;
		type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
		errorCount: number;
		filePath: string;
		cluster?: string;
		lineCount?: number;
		fileSize?: number;
		complexity?: number;
		importCount?: number;
		exportCount?: number;
		// Runtime layout positions
		x?: number;
		y?: number;
	}

	interface GraphEdge {
		source: string;
		target: string;
		type: 'import' | 'export' | 'dependency';
	}

	interface Props {
		nodes?: GraphNode[];
		edges?: GraphEdge[];
		onNodeClick?: (node: GraphNode) => void;
	}

	let {
		nodes = [],
		edges = [],
		onNodeClick = () => {},
	}: Props = $props();

	// Canvas state
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let panStart = $state({ x: 0, y: 0 });
	let hoveredNodeId = $state<string | null>(null);
	let boardEl = $state<HTMLDivElement | null>(null);

	// Layout: assign positions using grid layout + cluster grouping
	let layoutNodes = $derived.by(() => {
		if (nodes.length === 0) return [];

		// Group by cluster
		const clusters = new Map<string, GraphNode[]>();
		for (const n of nodes) {
			const c = n.cluster || 'other';
			if (!clusters.has(c)) clusters.set(c, []);
			clusters.get(c)!.push(n);
		}

		const result: (GraphNode & { x: number; y: number })[] = [];
		let clusterY = 60;

		for (const [, clusterNodes] of clusters) {
			const cols = Math.ceil(Math.sqrt(clusterNodes.length));
			for (let i = 0; i < clusterNodes.length; i++) {
				const col = i % cols;
				const row = Math.floor(i / cols);
				result.push({
					...clusterNodes[i],
					x: 80 + col * 220,
					y: clusterY + row * 140,
				});
			}
			clusterY += Math.ceil(clusterNodes.length / Math.ceil(Math.sqrt(clusterNodes.length))) * 140 + 60;
		}

		return result;
	});

	// Node position lookup for edge drawing
	let nodePositions = $derived.by(() => {
		const map = new Map<string, { x: number; y: number }>();
		for (const n of layoutNodes) {
			map.set(n.id, { x: n.x + 90, y: n.y + 40 }); // center of card
		}
		return map;
	});

	// Edge paths
	let edgePaths = $derived.by(() => {
		return edges
			.map(e => {
				const from = nodePositions.get(e.source);
				const to = nodePositions.get(e.target);
				if (!from || !to) return null;
				return { ...e, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
			})
			.filter(Boolean) as { source: string; target: string; type: string; x1: number; y1: number; x2: number; y2: number }[];
	});

	// Canvas dimensions
	let canvasWidth = $derived(Math.max(1400, ...layoutNodes.map(n => n.x + 250)));
	let canvasHeight = $derived(Math.max(900, ...layoutNodes.map(n => n.y + 180)));

	// Type styling
	const typeConfig: Record<string, { icon: string; color: string; bg: string; border: string }> = {
		route:     { icon: 'git-branch', color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)' },
		component: { icon: 'code',       color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)' },
		store:     { icon: 'layers',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)' },
		service:   { icon: 'cog',        color: '#f97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.25)' },
		api:       { icon: 'globe',      color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.25)' },
		util:      { icon: 'wrench',     color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
	};

	function getConfig(type: string) {
		return typeConfig[type] ?? typeConfig.util;
	}

	function formatSize(bytes?: number): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes}B`;
		return `${(bytes / 1024).toFixed(1)}K`;
	}

	// Pan handlers
	function onBoardPointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('.evidence-card')) return;
		isPanning = true;
		panStart = { x: e.clientX - panX, y: e.clientY - panY };
	}

	function onBoardPointerMove(e: PointerEvent) {
		if (!isPanning) return;
		panX = e.clientX - panStart.x;
		panY = e.clientY - panStart.y;
	}

	function onBoardPointerUp() {
		isPanning = false;
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		const newZoom = Math.max(0.2, Math.min(3, zoom * delta));
		zoom = newZoom;
	}

	function resetView() {
		zoom = 1;
		panX = 0;
		panY = 0;
	}

	// Highlight connected edges on hover
	function isEdgeHighlighted(edge: { source: string; target: string }): boolean {
		if (!hoveredNodeId) return false;
		return edge.source === hoveredNodeId || edge.target === hoveredNodeId;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="code-evidence-board"
	bind:this={boardEl}
	onpointerdown={onBoardPointerDown}
	onpointermove={onBoardPointerMove}
	onpointerup={onBoardPointerUp}
	onpointerleave={onBoardPointerUp}
	onwheel={onWheel}
	role="application"
	tabindex="0"
	aria-label="Code evidence board"
>
	<!-- Zoom controls -->
	<div class="board-controls">
		<button onclick={() => zoom = Math.min(3, zoom * 1.2)} title="Zoom in">+</button>
		<button onclick={resetView} title="Reset view">&#x27F2;</button>
		<button onclick={() => zoom = Math.max(0.2, zoom * 0.8)} title="Zoom out">&minus;</button>
		<span class="zoom-label">{Math.round(zoom * 100)}%</span>
	</div>

	<!-- Legend -->
	<div class="board-legend">
		{#each Object.entries(typeConfig) as [type, cfg]}
			<div class="legend-item">
				<span class="legend-dot" style="background: {cfg.color}"></span>
				<span>{type}</span>
			</div>
		{/each}
	</div>

	<!-- Scrollable canvas -->
	<div
		class="board-canvas"
		style="transform: translate({panX}px, {panY}px) scale({zoom}); width: {canvasWidth}px; height: {canvasHeight}px;"
	>
		<!-- SVG layer for connections -->
		<svg class="connections-layer" width={canvasWidth} height={canvasHeight}>
			<defs>
				<marker id="evidence-arrow" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,-4 L10,0 L0,4" fill="rgba(255,255,255,0.2)" />
				</marker>
				<marker id="evidence-arrow-hl" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,-4 L10,0 L0,4" fill="rgba(0,212,255,0.7)" />
				</marker>
			</defs>
			{#each edgePaths as edge}
				<line
					x1={edge.x1}
					y1={edge.y1}
					x2={edge.x2}
					y2={edge.y2}
					stroke={isEdgeHighlighted(edge) ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.08)'}
					stroke-width={isEdgeHighlighted(edge) ? 2 : 1}
					marker-end={isEdgeHighlighted(edge) ? 'url(#evidence-arrow-hl)' : 'url(#evidence-arrow)'}
				/>
			{/each}
		</svg>

		<!-- Evidence cards -->
		{#each layoutNodes as node}
			{@const cfg = getConfig(node.type)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="evidence-card"
				class:hovered={hoveredNodeId === node.id}
				style="left: {node.x}px; top: {node.y}px; --card-color: {cfg.color}; --card-bg: {cfg.bg}; --card-border: {cfg.border};"
				onclick={() => onNodeClick(node)}
				onpointerenter={() => hoveredNodeId = node.id}
				onpointerleave={() => hoveredNodeId = null}
			>
				<!-- Type indicator stripe -->
				<div class="card-stripe" style="background: {cfg.color}"></div>

				<div class="card-body">
					<!-- Header -->
					<div class="card-header">
						<Icon name={cfg.icon} class="h-3.5 w-3.5" />
						<span class="card-type">{node.type}</span>
						{#if node.errorCount > 0}
							<span class="card-errors">{node.errorCount}</span>
						{/if}
					</div>

					<!-- Title -->
					<div class="card-title" title={node.filePath}>
						{node.label}
					</div>

					<!-- Stats row -->
					<div class="card-stats">
						{#if node.lineCount}
							<span class="card-stat">{node.lineCount}L</span>
						{/if}
						{#if node.fileSize}
							<span class="card-stat">{formatSize(node.fileSize)}</span>
						{/if}
						{#if node.importCount}
							<span class="card-stat" class:warn={node.importCount > 15}>{node.importCount}imp</span>
						{/if}
						{#if node.complexity && node.complexity > 5}
							<span class="card-stat warn">C:{node.complexity}</span>
						{/if}
					</div>

					<!-- Cluster tag -->
					{#if node.cluster}
						<div class="card-cluster">{node.cluster}</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- Node count -->
	<div class="board-count">
		{layoutNodes.length} files / {edgePaths.length} connections
	</div>
</div>

<style>
	.code-evidence-board {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background:
			radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--t-accent, #a855f7) 3%, transparent) 0%, transparent 50%),
			radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--t-accent, #06b6d4) 3%, transparent) 0%, transparent 50%),
			var(--t-bg, rgba(8, 10, 18, 0.95));
		border-radius: 12px;
		cursor: grab;
		user-select: none;
	}

	.code-evidence-board:active {
		cursor: grabbing;
	}

	/* Controls */
	.board-controls {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		z-index: 20;
	}

	.board-controls button {
		width: 32px;
		height: 32px;
		background: var(--t-panel, rgba(0, 0, 0, 0.7));
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.15));
		border-radius: 6px;
		color: var(--t-text, white);
		font-size: 1.1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.board-controls button:hover {
		background: color-mix(in srgb, var(--t-accent, #00d4ff) 15%, transparent);
		border-color: color-mix(in srgb, var(--t-accent, #00d4ff) 40%, transparent);
	}

	.zoom-label {
		font-size: 0.65rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.45));
		text-align: center;
		font-family: 'JetBrains Mono', monospace;
	}

	/* Legend */
	.board-legend {
		position: absolute;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--t-panel, rgba(0, 0, 0, 0.7));
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.08));
		border-radius: 6px;
		z-index: 20;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.65rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.5));
		text-transform: capitalize;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	/* Canvas */
	.board-canvas {
		position: relative;
		transform-origin: 0 0;
	}

	.connections-layer {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}

	/* Evidence Cards */
	.evidence-card {
		position: absolute;
		width: 180px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s;
	}

	.evidence-card:hover,
	.evidence-card.hovered {
		transform: translateY(-2px);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px color-mix(in srgb, var(--card-color) 15%, transparent);
		border-color: var(--card-color);
	}

	.card-stripe {
		height: 3px;
		width: 100%;
	}

	.card-body {
		padding: 0.5rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--card-color);
	}

	.card-type {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-family: 'JetBrains Mono', monospace;
	}

	.card-errors {
		margin-left: auto;
		font-size: 0.55rem;
		font-weight: 700;
		padding: 0.05rem 0.3rem;
		background: rgba(239, 68, 68, 0.2);
		color: #f87171;
		border-radius: 3px;
		font-family: 'JetBrains Mono', monospace;
	}

	.card-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--t-text, rgba(255, 255, 255, 0.9));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'JetBrains Mono', monospace;
	}

	.card-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.card-stat {
		font-size: 0.55rem;
		padding: 0.1rem 0.3rem;
		background: color-mix(in srgb, var(--t-text, white) 5%, transparent);
		border-radius: 3px;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.5));
		font-family: 'JetBrains Mono', monospace;
	}

	.card-stat.warn {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.1);
	}

	.card-cluster {
		font-size: 0.5rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.3));
		font-family: 'JetBrains Mono', monospace;
		letter-spacing: 0.04em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.7;
	}

	/* Count */
	.board-count {
		position: absolute;
		bottom: 1rem;
		right: 1rem;
		font-size: 0.65rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.35));
		font-family: 'JetBrains Mono', monospace;
		z-index: 20;
	}
</style>
