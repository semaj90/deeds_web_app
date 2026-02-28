<script lang="ts">
	type NodeType = { id: string; x: number; y: number; evidenceType: string; [key: string]: any };

	let {
		nodes,
		viewport,
		canvasWidth,
		canvasHeight,
		getCategoryColor,
		onNavigate
	}: {
		nodes: NodeType[];
		viewport: { zoom: number; panX: number; panY: number };
		canvasWidth: number;
		canvasHeight: number;
		getCategoryColor: (type: string) => string;
		onNavigate: (x: number, y: number) => void;
	} = $props();

	const MAP_W = 200;
	const MAP_H = 150;

	// Compute bounding box of all nodes
	let bounds = $derived.by(() => {
		if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const n of nodes) {
			if (n.x < minX) minX = n.x;
			if (n.y < minY) minY = n.y;
			if (n.x > maxX) maxX = n.x;
			if (n.y > maxY) maxY = n.y;
		}
		// Add padding
		const pad = 100;
		return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad + 250, maxY: maxY + pad + 100 };
	});

	let scale = $derived(Math.min(MAP_W / (bounds.maxX - bounds.minX), MAP_H / (bounds.maxY - bounds.minY)));

	// Viewport rectangle on minimap
	let viewRect = $derived.by(() => {
		const vx = (-viewport.panX / viewport.zoom - bounds.minX) * scale;
		const vy = (-viewport.panY / viewport.zoom - bounds.minY) * scale;
		const vw = (canvasWidth / viewport.zoom) * scale;
		const vh = (canvasHeight / viewport.zoom) * scale;
		return { x: vx, y: vy, width: vw, height: vh };
	});

	function handleClick(event: MouseEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const mx = event.clientX - rect.left;
		const my = event.clientY - rect.top;
		// Convert minimap coords to board coords
		const boardX = mx / scale + bounds.minX;
		const boardY = my / scale + bounds.minY;
		onNavigate(boardX, boardY);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="minimap" onclick={handleClick}>
	<svg width={MAP_W} height={MAP_H} viewBox="0 0 {MAP_W} {MAP_H}">
		<!-- Node dots -->
		{#each nodes as node}
			<circle
				cx={(node.x - bounds.minX) * scale}
				cy={(node.y - bounds.minY) * scale}
				r="4"
				fill={getCategoryColor(node.evidenceType)}
				opacity="0.8"
			/>
		{/each}

		<!-- Viewport rectangle -->
		<rect
			x={viewRect.x}
			y={viewRect.y}
			width={viewRect.width}
			height={viewRect.height}
			fill="none"
			stroke="#c0b870"
			stroke-width="1.5"
			opacity="0.8"
		/>
	</svg>
	<div class="minimap-label">MAP</div>
</div>

<style>
	.minimap {
		position: absolute;
		bottom: 16px;
		right: 16px;
		width: 200px;
		height: 150px;
		background: rgba(58, 56, 50, 0.85);
		border: 2px solid #5a5848;
		cursor: pointer;
		z-index: 20;
		overflow: hidden;
	}

	.minimap:hover {
		border-color: #c0b870;
	}

	.minimap-label {
		position: absolute;
		top: 4px;
		right: 6px;
		font-family: "Press Start 2P", "Courier New", monospace;
		font-size: 0.4rem;
		color: #8a8870;
		letter-spacing: 1px;
		pointer-events: none;
	}
</style>
