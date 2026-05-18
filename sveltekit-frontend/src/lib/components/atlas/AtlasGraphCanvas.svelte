<script lang="ts">
	import type { AtlasNode, AtlasEdge } from '$lib/types/atlas.js';
	import { NODE_COLORS, NODE_RADIUS } from '$lib/types/atlas.js';

	let {
		nodes,
		edges,
		selectedId,
		onSelect,
	}: {
		nodes: AtlasNode[];
		edges: AtlasEdge[];
		selectedId: string | null;
		onSelect: (id: string | null) => void;
	} = $props();

	let tx = $state(0);
	let ty = $state(0);
	let k = $state(1);

	let dragging = false;
	let dragOriginX = 0;
	let dragOriginY = 0;
	let dragTx = 0;
	let dragTy = 0;

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.12 : 0.9;
		k = Math.min(Math.max(k * factor, 0.15), 5);
	}

	function onMouseDown(e: MouseEvent) {
		if ((e.target as Element).closest('.atlas-node')) return;
		dragging = true;
		dragOriginX = e.clientX;
		dragOriginY = e.clientY;
		dragTx = tx;
		dragTy = ty;
	}

	function onMouseMove(e: MouseEvent) {
		if (!dragging) return;
		tx = dragTx + (e.clientX - dragOriginX);
		ty = dragTy + (e.clientY - dragOriginY);
	}

	function onMouseUp() {
		dragging = false;
	}

	function resetView() {
		tx = 0;
		ty = 0;
		k = 1;
	}

	function nodeClick(e: MouseEvent, id: string) {
		e.stopPropagation();
		onSelect(selectedId === id ? null : id);
	}
</script>

<div class="relative w-full h-full bg-panelSoft rounded-lg overflow-hidden">
	<!-- Reset button -->
	<button
		class="absolute top-2 right-2 z-10 text-xs px-2 py-1 bg-panel rounded
		       text-sand-9 hover:text-sand-12 transition-colors border border-sand-5"
		onclick={resetView}
	>
		↺ reset
	</button>

	<!-- Legend -->
	<div class="absolute bottom-2 left-2 z-10 flex gap-3 text-[10px] text-sand-8">
		{#each Object.entries(NODE_COLORS) as [type, color]}
			<div class="flex items-center gap-1">
				<span class="w-2 h-2 rounded-full" style="background:{color}"></span>
				{type}
			</div>
		{/each}
	</div>

	{#if nodes.length === 0}
		<div class="absolute inset-0 flex items-center justify-center text-sand-7 text-sm">
			Run a query to see the retrieval graph
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg
			class="w-full h-full"
			style="cursor:{dragging ? 'grabbing' : 'grab'}"
			viewBox="0 0 920 640"
			preserveAspectRatio="xMidYMid meet"
			onwheel={onWheel}
			onmousedown={onMouseDown}
			onmousemove={onMouseMove}
			onmouseup={onMouseUp}
			onmouseleave={onMouseUp}
			onclick={() => onSelect(null)}
		>
			<g transform="translate({tx},{ty}) scale({k})">
				<!-- Edges -->
				{#each edges as edge}
					{@const src = nodes.find((n) => n.id === edge.source)}
					{@const tgt = nodes.find((n) => n.id === edge.target)}
					{#if src && tgt}
						<line
							x1={src.position.x}
							y1={src.position.y}
							x2={tgt.position.x}
							y2={tgt.position.y}
							stroke="#475569"
							stroke-width="1"
							stroke-opacity="0.5"
						/>
						{#if edge.label}
							{@const mx = (src.position.x + tgt.position.x) / 2}
							{@const my = (src.position.y + tgt.position.y) / 2}
							<text
								x={mx}
								y={my}
								text-anchor="middle"
								font-size="8"
								fill="#64748b"
								dy="-3"
								style="pointer-events:none"
							>{edge.label}</text>
						{/if}
					{/if}
				{/each}

				<!-- Nodes -->
				{#each nodes as node}
					{@const r = NODE_RADIUS[node.type]}
					{@const color = NODE_COLORS[node.type]}
					{@const selected = selectedId === node.id}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<g
						class="atlas-node"
						transform="translate({node.position.x},{node.position.y})"
						style="cursor:pointer"
						onclick={(e) => nodeClick(e, node.id)}
					>
						{#if selected}
							<circle r={r + 5} fill="none" stroke="#fff" stroke-width="1.5" stroke-opacity="0.4" />
						{/if}
						<circle
							r={r}
							fill={color}
							fill-opacity={selected ? 1 : 0.7}
							stroke={color}
							stroke-width={selected ? 2 : 0.5}
						/>
						<text
							text-anchor="middle"
							dy={r + 11}
							font-size="9"
							fill="#cbd5e1"
							style="pointer-events:none;user-select:none"
						>{node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}</text>
					</g>
				{/each}
			</g>
		</svg>
	{/if}
</div>