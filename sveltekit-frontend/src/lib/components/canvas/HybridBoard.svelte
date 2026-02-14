<script lang="ts">
	// Migrated to $effect

	// Type definitions
	interface Vec2 { x: number, y: number;
	}

	interface BoardViewport { pan: Vec2, zoom: number;
	}

	interface BoardNode { id: string, kind: 'note' | 'evidence' | 'document';
		x: number;
	y: number;
		w: number;
	h: number;
		title?: string;
		body?: string;
		evidenceId?: string;
		locked?: boolean;
	}

	interface BoardEdge { id: string, fromId: string;
		toId: string;
	style: 'solid' | 'dashed';
		label?: string;
	}

	interface BoardSnapshot { version: number, viewport: BoardViewport;
		nodes: BoardNode[];
	edges: BoardEdge[];
		updatedAt?: string;
	}

	// Props interface
	interface Props {
		caseId: string;
		initialSnapshot?: BoardSnapshot | null;
		readonly?: boolean;
		onDirtyChange?: ((dirty: boolean) => void) | null;
	}

	let {
		caseId,
		initialSnapshot = null,
		readonly = false,
		onDirtyChange = null
	}: Props = $props();

	let rootEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);

	// ===== State (Svelte 5 runes) =====
	const getInitialViewport = (): BoardViewport =>
		initialSnapshot?.viewport ? { ...initialSnapshot.viewport } : { pan: { x: 0, y: 0 },
	zoom: 1 };

	const getInitialNodes = (): BoardNode[] =>
		initialSnapshot?.nodes
			? [...initialSnapshot.nodes]
			: [
					{
						id: 'n1',
						kind: 'note',
						x: 80,
						y: 80,
						w: 260,
						h: 140,
						title: 'Witness Statement',
						body: 'Witness claims they saw the suspect...'
					},
	{
						id: 'n2',
						kind: 'evidence',
						x: 420,
						y: 220,
						w: 300,
						h: 180,
						title: 'Photo Evidence',
						evidenceId: 'ev_123',
						body: 'Surveillance footage frame 404'
					}
				];

	const getInitialEdges = (): BoardEdge[] =>
		initialSnapshot?.edges
			? [...initialSnapshot.edges]
			: [{
	id: 'e1', fromId: 'n1', toId: 'n2', style: 'solid', label: 'corroborates' }];

	let viewport = $state<BoardViewport>(getInitialViewport());
	let nodes = $state<BoardNode[]>(getInitialNodes());
	let edges = $state<BoardEdge[]>(getInitialEdges());

	let selected = $state<Set<string>>(new Set());
	let hoveredId = $state<string | null>(null);

	let dirty = $state(false);

	// Interaction modes
	let spaceDown = $state(false);
	let isPanning = $state(false);
	let isDraggingNode = $state(false);

	let dragStartScreen = $state<Vec2>({ x: 0, y: 0 });
	let dragStartWorld = $state<Vec2>({ x: 0, y: 0 });
	let panStart = $state<Vec2>({ x: 0, y: 0 });

	let dragNodeIds = $state<string[]>([]);
	let dragNodesStart = $state<Map<string, Vec2>>(new Map());

	// Text editing overlay
	let editing = $state<{ id: string; value: string; mode: 'title' | 'body' } | null>(null);

	// Canvas internals
	let ctx = $state<CanvasRenderingContext2D | null>(null);
	let raf = 0;
	let ro: ResizeObserver | null = null;
	let dpr = 1;

	// ===== Coordinate transforms =====
	function screenToWorld(p: Vec2): Vec2 {
		return { x: p.x / viewport.zoom - viewport.pan.x, y: p.y / viewport.zoom - viewport.pan.y };
	}

	function worldToScreen(p: Vec2): Vec2 {
		return { x: (p.x + viewport.pan.x) * viewport.zoom, y: (p.y + viewport.pan.y) * viewport.zoom };
	}

	function getNodeById(id: string) {
		return nodes.find((n) => n.id === id) ?? null;
	}

	function hitTestNode(world: Vec2): string | null {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const n = nodes[i];
			if (world.x >= n.x && world.x <= n.x + n.w && world.y >= n.y && world.y <= n.y + n.h) {
				return n.id;
			}
		}
		return null;
	}

	function setDirty(v: boolean) {
		dirty = v;
		if (onDirtyChange) onDirtyChange(v);
	}

	// ===== Drawing =====
	function scheduleDraw() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(draw);
	}

	function resizeCanvasToDisplaySize() {
		if (!canvasEl) return;
		dpr = window.devicePixelRatio || 1;
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		const nextW = Math.max(1, Math.floor(w * dpr));
		const nextH = Math.max(1, Math.floor(h * dpr));
		if (canvasEl.width !== nextW || canvasEl.height !== nextH) {
			canvasEl.width = nextW;
			canvasEl.height = nextH;
		}
	}

	function drawGrid(c: CanvasRenderingContext2D, width: number, height: number) {
		const step = 80;
		c.save();
		c.lineWidth = 1 / viewport.zoom;
		c.strokeStyle = 'rgba(255,255,255, 0.04)';

		const topLeft = screenToWorld({ x: 0, y: 0 });
		const bottomRight = screenToWorld({ x: width, y: height });

		const startX = Math.floor(topLeft.x / step) * step;
		const endX = Math.ceil(bottomRight.x / step) * step;
		const startY = Math.floor(topLeft.y / step) * step;
		const endY = Math.ceil(bottomRight.y / step) * step;

		c.beginPath();
		for (let x = startX; x <= endX; x += step) {
			c.moveTo(x, startY);
			c.lineTo(x, endY);
		}
		for (let y = startY; y <= endY; y += step) {
			c.moveTo(startX, y);
			c.lineTo(endX, y);
		}
		c.stroke();
		c.restore();
	}

	function draw() {
		if (!ctx || !canvasEl) return;

		resizeCanvasToDisplaySize();

		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		ctx.fillStyle = 'rgba(0,0,0,0)';
		ctx.fillRect(0, 0, w, h);

		ctx.save();
		ctx.scale(viewport.zoom, viewport.zoom);
		ctx.translate(viewport.pan.x, viewport.pan.y);

		drawGrid(ctx, w, h);

		// Edges
		for (const e of edges) {
			const a = getNodeById(e.fromId);
			const b = getNodeById(e.toId);
			if (!a || !b) continue;

			const ax = a.x + a.w / 2;
			const ay = a.y + a.h / 2;
			const bx = b.x + b.w / 2;
			const by = b.y + b.h / 2;

			ctx.beginPath();
			ctx.moveTo(ax, ay);
			ctx.lineTo(bx, by);
			ctx.strokeStyle = 'rgba(255,255,255, 0.22)';
			ctx.lineWidth = 2 / viewport.zoom;
			if (e.style === 'dashed') ctx.setLineDash([8 / viewport.zoom, 6 / viewport.zoom]);
			else ctx.setLineDash([]);
			ctx.stroke();

			if (e.label) {
				ctx.setLineDash([]);
				ctx.fillStyle = 'rgba(255,255,255, 0.7)';
				ctx.font = `${14 / viewport.zoom}px system-ui`;
				const mx = (ax + bx) / 2;
				const my = (ay + by) / 2;
				ctx.fillText(e.label, mx + 6 / viewport.zoom, my - 6 / viewport.zoom);
			}
		}

		// Nodes
		for (const n of nodes) {
			const isSelected = selected.has(n.id);
			const isHovered = hoveredId === n.id;

			ctx.beginPath();
			if (typeof ctx.roundRect === 'function') {
				ctx.roundRect(n.x, n.y, n.w, n.h, 12 / viewport.zoom);
			} else {
				ctx.rect(n.x, n.y, n.w, n.h);
			}
			ctx.strokeStyle = isSelected
				? 'rgba(255,255,255, 0.45)'
				: isHovered
					? 'rgba(255,255,255, 0.25)'
					: 'rgba(255,255,255, 0.14)';
			ctx.lineWidth = 2 / viewport.zoom;
			ctx.stroke();

			if (n.title) {
				ctx.fillStyle = 'rgba(255,255,255, 0.85)';
				ctx.font = `${16 / viewport.zoom}px system-ui`;
				ctx.fillText(n.title, n.x + 14 / viewport.zoom, n.y + 28 / viewport.zoom);
			}

			if (n.body) {
				ctx.fillStyle = 'rgba(255,255,255, 0.60)';
				ctx.font = `${13 / viewport.zoom}px system-ui`;
				const preview = n.body.length > 90 ? n.body.slice(0, 90) + '…' : n.body;
				ctx.fillText(preview, n.x + 14 / viewport.zoom, n.y + 52 / viewport.zoom);
			}
		}

		ctx.restore();
	}

	$effect(() => {
		viewport;
		nodes;
		edges;
		selected;
		hoveredId;
		scheduleDraw();
	});

	$effect(() => {
		nodes;
		edges;
		viewport;
		if (!readonly) setDirty(true);
	});

	function selectedBounds(): { x: number, y: number;
	w: number; h: number } | null {
		const ids = [...selected];
		if (ids.length === 0) return null;

		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const id of ids) {
			const n = getNodeById(id);
			if (!n) continue;
			minX = Math.min(minX, n.x);
			minY = Math.min(minY, n.y);
			maxX = Math.max(maxX, n.x + n.w);
			maxY = Math.max(maxY, n.y + n.h);
		}
		if (!isFinite(minX)) return null;

		const tl = worldToScreen({ x: minX, y: minY });
		const br = worldToScreen({ x: maxX, y: maxY });
		return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
	}

	function nodeScreenRect(id: string) {
		const n = getNodeById(id);
		if (!n) return null;
		const tl = worldToScreen({ x: n.x, y: n.y });
		const br = worldToScreen({ x: n.x + n.w, y: n.y + n.h });
		return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
	}

	// ===== Input handlers =====
	function getLocalScreen(e: PointerEvent | WheelEvent): Vec2 {
		const rect = canvasEl!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function onPointerDown(e: PointerEvent) {
		if (readonly || !canvasEl) return;

		canvasEl.setPointerCapture(e.pointerId);

		const screen = getLocalScreen(e);
		const world = screenToWorld(screen);

		if (spaceDown || e.button === 1 || e.button === 2) {
			isPanning = true;
			dragStartScreen = screen;
			panStart = { ...viewport.pan };
			return;
		}

		const hitId = hitTestNode(world);

		if (hitId) {
			if (e.shiftKey) {
				const next = new Set(selected);
				if (next.has(hitId)) next.delete(hitId);
				else next.add(hitId);
				selected = next;
			} else {
				if (!selected.has(hitId)) selected = new Set([hitId]);
			}

			isDraggingNode = true;
			dragStartWorld = world;

			dragNodeIds = [...selected];
			dragNodesStart = new Map(
				dragNodeIds.map((id) => {
					const n = getNodeById(id)!;
					return [id, { x: n.x, y: n.y }];
				})
			);
		} else {
			if (!e.shiftKey) selected = new Set();
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!canvasEl) return;

		const screen = getLocalScreen(e);
		const world = screenToWorld(screen);

		if (!isPanning && !isDraggingNode) {
			const hit = hitTestNode(world);
			hoveredId = hit;
		}

		if (isPanning) {
			const dx = (screen.x - dragStartScreen.x) / viewport.zoom;
			const dy = (screen.y - dragStartScreen.y) / viewport.zoom;
			viewport = { ...viewport, pan: {
	x: panStart.x + dx, y: panStart.y + dy } };
			return;
		}

		if (isDraggingNode && dragNodeIds.length > 0) {
			const dx = world.x - dragStartWorld.x;
			const dy = world.y - dragStartWorld.y;

			nodes = nodes.map((n) => {
				if (!dragNodesStart.has(n.id)) return n;
				if (n.locked) return n;
				const start = dragNodesStart.get(n.id)!;
				return { ...n, x: start.x + dx, y: start.y + dy };
			});
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (canvasEl) canvasEl.releasePointerCapture(e.pointerId);
		isPanning = false;
		isDraggingNode = false;
		dragNodeIds = [];
		dragNodesStart = new Map();
	}

	function onWheel(e: WheelEvent) {
		if (readonly || !canvasEl) return;
		e.preventDefault();

		const screen = getLocalScreen(e);
		const before = screenToWorld(screen);

		const factor = e.deltaY < 0 ? 1.1 : 0.9;
		const nextZoom = Math.min(4, Math.max(0.1, viewport.zoom * factor));
		viewport.zoom = nextZoom;

		const newPanX = screen.x / nextZoom - before.x;
		const newPanY = screen.y / nextZoom - before.y;

		viewport.pan = { x: newPanX, y: newPanY };
	}

	function onDblClick(e: MouseEvent) {
		if (readonly || !canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		const world = screenToWorld(screen);
		const hitId = hitTestNode(world);
		if (!hitId) return;

		const n = getNodeById(hitId);
		if (!n) return;

		selected = new Set([hitId]);
		editing = { id: hitId, value: n.body ?? '', mode: 'body' };
	}

	function commitEditing() {
		if (!editing) return;
		const { id, value, mode } = editing;
		nodes = nodes.map((n) => (n.id === id ? { ...n, [mode]: value } : n));
		editing = null;
	}

	function cancelEditing() {
		editing = null;
	}

	// ===== External API =====
	export function serialize(): BoardSnapshot {
		return {
			version: initialSnapshot?.version ?? 1,
			viewport,
			nodes,
			edges,
			updatedAt: new Date().toISOString()
		};
	}

	$effect(() => {

		if (!canvasEl) return;
		ctx = canvasEl.getContext('2d');

		const wheelOpts: AddEventListenerOptions = { passive: false };
		canvasEl.addEventListener('wheel', onWheel, wheelOpts);

		ro = new ResizeObserver(() => scheduleDraw());
		if (rootEl) ro.observe(rootEl);

		const onKeyDown = (e: KeyboardEvent) => {
			if (editing) return;

			if (e.code === 'Space') {
				spaceDown = true;
			}
			if (e.code === 'Escape') {
				cancelEditing();
				selected = new Set();
			}
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
			}
		};

		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === 'Space') spaceDown = false;
		};

		window.addEventListener('keydown', onKeyDown, { passive: false 
});
		window.addEventListener('keyup', onKeyUp);

		return () => {
			cancelAnimationFrame(raf);
			canvasEl?.removeEventListener('wheel', onWheel);
			ro?.disconnect();
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		}
	});
</script>

<div
	bind:this={rootEl}
	class="relative w-full h-full overflow-hidden select-none rounded-2xl border border-white/10 bg-black/20"
>
	<!-- Layer 1: Canvas rendering -->
	<canvas
		bind:this={canvasEl}
		class="absolute inset-0 w-full h-full cursor-crosshair"
		style:cursor={isPanning || spaceDown ? 'grab' : 'default'}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		oncontextmenu={(e) => e.preventDefault()}
		ondblclick={onDblClick}
	></canvas>

	<!-- Layer 2: DOM overlay -->
	<div class="absolute inset-0 pointer-events-none">
		{#if selected.size > 0}
			{@const b = selectedBounds()}
			{#if b}
				<div
					class="absolute rounded-xl border border-info/80/50 shadow-[0_0_0_1px_rgba(59 130 246 0.2)]"
					style="left:{b.x}px; top:{b.y}px; width:{b.w}px; height:{b.h}px;"
				>
					<div
						class="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-info border border-black/50"
					></div>
					<div
						class="absolute -right-1.5 -top-1.5 w-3 h-3 rounded-full bg-info border border-black/50"
					></div>
					<div
						class="absolute -left-1.5 -bottom-1.5 w-3 h-3 rounded-full bg-info border border-black/50"
					></div>
					<div
						class="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-full bg-info border border-black/50"
					></div>
				</div>
			{/if}
		{/if}

		{#if editing}
			{@const r = nodeScreenRect(editing.id)}
			{#if r}
				<div
					class="absolute pointer-events-auto"
					style="left:{r.x}px; top:{r.y}px; width:{r.w}px; height:{r.h}px;"
				>
					<textarea
						class="w-full h-full resize-none rounded-xl border border-info/50 bg-black/80 p-3 text-white/90 outline-none text-sm font-sans"
						value={editing.value}
						oninput={(e) =>
							(editing = { ...editing!, value: (e.currentTarget as HTMLTextAreaElement).value })}
						onkeydown={(e) => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								commitEditing();
							}
							if (e.key === 'Escape') {
								e.preventDefault();
								cancelEditing();
							}
						}}
						onblur={commitEditing}
					></textarea>
					<div class="mt-2 text-[10px] text-white/40 font-mono tracking-tight">
						CMD+ENTER to save • ESC to cancel
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- HUD -->
	<div class="absolute left-3 bottom-3 pointer-events-none text-[10px] text-white/30 font-mono">
		<div class="flex gap-4">
			<span>ZOOM: {Math.round(viewport.zoom * 100)}%</span>
			<span>PAN: {Math.round(viewport.pan.x)},
	{Math.round(viewport.pan.y)}</span>
			<span>NODES: {nodes.length}</span>
		</div>
	</div>
</div>
