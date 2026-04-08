<script lang="ts">
	import ElizaNode from './ElizaNode.svelte';

	// The Infinite Canvas Viewport State
	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);

	let canvasRef = $state<HTMLDivElement | null>(null);
	let selectedNodeId = $state<string | null>(null);

	// Mock Data for the Graph
	let nodes = $state<{id: string; type: 'terminal' | 'memory' | 'process'; title: string; content: string; x: number; y: number}[]>([
		{ id: 'usr_01', type: 'terminal', title: 'ELIZA_CORE.exe', content: 'INITIALIZING INTERFACE... \nWAITING FOR INPUT.', x: 100, y: 150 },
		{ id: 'mem_01', type: 'memory', title: 'CASE_EVIDENCE_A', content: 'The suspect was seen near the courtroom at 14:00.', x: 500, y: 100 },
		{ id: 'net_01', type: 'process', title: 'API_ROUTER_NODE', content: 'Connection established on /api/phase78/analyze.', x: 300, y: 400 }
	]);

	// Panning logic variables
	let startPanX = 0;
	let startPanY = 0;

	function handlePointerDown(e: PointerEvent) {
		// Start panning if clicking the raw canvas (not a node, though nodes stopPropagation)
		// Or if middle mouse button (button 1), or Holding Spacebar.
		if (e.target !== canvasRef) {
			// Deselect nodes if clicking background
			selectedNodeId = null; 
			isPanning = true;
			startPanX = e.clientX;
			startPanY = e.clientY;
			canvasRef?.setPointerCapture(e.pointerId);
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isPanning) return;
		e.preventDefault();
		
		const dx = e.clientX - startPanX;
		const dy = e.clientY - startPanY;
		
		panX += dx;
		panY += dy;
		
		startPanX = e.clientX;
		startPanY = e.clientY;
	}

	function handlePointerUp(e: PointerEvent) {
		if (isPanning) {
			isPanning = false;
			canvasRef?.releasePointerCapture(e.pointerId);
		}
	}

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			
			// Zoom around cursor target
			const zoomSensitivity = 0.002;
			const delta = -e.deltaY * zoomSensitivity;
			
			const newScale = Math.min(Math.max(0.1, scale + delta), 4);
			const ratio = newScale / scale;
			
			if (!canvasRef) return;
			const rect = canvasRef.getBoundingClientRect();
			
			// Mouse position relative to viewport
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			
			// Adjust pan to keep cursor pinned to the exact graph coordinate
			panX = mouseX - (mouseX - panX) * ratio;
			panY = mouseY - (mouseY - panY) * ratio;
			scale = newScale;
		} else {
			// Standard trackpad panning
			panX -= e.deltaX;
			panY -= e.deltaY;
		}
	}

	function onNodeMove(id: string, dx: number, dy: number) {
		const idx = nodes.findIndex(n => n.id === id);
		if (idx > -1) {
			// Convert Screen Delta to Canvas Delta based on scale
			nodes[idx].x += dx / scale;
			nodes[idx].y += dy / scale;
		}
	}

	// Calculate connecting lines
	let lines = $derived.by(() => {
		const l = [];
		// Draw line from ELIZA to CASE EVIDENCE
		const n1 = nodes.find(n => n.id === 'usr_01');
		const n2 = nodes.find(n => n.id === 'mem_01');
		if (n1 && n2) {
			l.push({ x1: n1.x + 128, y1: n1.y + 70, x2: n2.x + 128, y2: n2.y + 70 });
		}
		
		// Draw line from ELIZA to ROUTER
		const n3 = nodes.find(n => n.id === 'net_01');
		if (n1 && n3) {
			l.push({ x1: n1.x + 128, y1: n1.y + 140, x2: n3.x + 128, y2: n3.y });
		}
		return l;
	});
</script>

<svelte:head>
	<title>NES Graph Architecture | Deeds</title>
</svelte:head>

<!-- UI HUD (Fixed over canvas) -->
<div class="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-green-500/30 bg-black/80 px-6 py-3 backdrop-blur-xl">
	<div class="flex items-center gap-4">
		<h1 class="font-mono text-lg font-bold text-green-400">CHRM_ROM97 // INFINITE_WORKSPACE</h1>
		<div class="hidden items-center gap-2 rounded-md bg-green-500/10 px-3 py-1 font-mono text-xs text-green-500/80 md:flex">
			<span>WHEEL/TRACKPAD</span> <span class="text-green-300">to PAN</span>
			<span class="opacity-50">|</span>
			<span>CTRL+WHEEL</span> <span class="text-green-300">to ZOOM</span>
		</div>
	</div>
	
	<div class="flex items-center gap-3 font-mono text-xs text-green-400/80">
		<div class="rounded bg-black/50 px-2 py-1 ring-1 ring-inset ring-green-500/30">
			ZOOM: {Math.round(scale * 100)}%
		</div>
		<button class="rounded border border-green-500/50 bg-green-500/10 px-4 py-1 tracking-widest hover:bg-green-500/20 hover:text-green-300 transition-colors" onclick={() => { scale = 1; panX = 0; panY = 0; }}>
			RESET_VIEW
		</button>
	</div>
</div>

<!-- Infinite Bounds Viewport -->
<div 
	bind:this={canvasRef}
	class="absolute inset-0 z-0 h-screen w-screen overflow-hidden bg-[#050905] {isPanning ? 'cursor-grabbing' : 'cursor-default'}"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onwheel={handleWheel}
>
	<!-- CSS Grid Dot Background -> moves inversely and scales -->
	<div class="pointer-events-none absolute inset-0 z-0 opacity-20"
		style="
			background-image: radial-gradient(#22c55e 1px, transparent 1px);
			background-size: {40 * scale}px {40 * scale}px;
			background-position: {panX}px {panY}px;
		"
	></div>

	<!-- Transform Container -->
	<div 
		class="absolute left-0 top-0 origin-top-left touch-none"
		style="transform: translate({panX}px, {panY}px) scale({scale});"
	>
		<!-- SVG Lines -->
		<svg class="pointer-events-none absolute left-0 top-0 overflow-visible z-0" style="width: 1px; height: 1px;">
			<!-- SVG styling with glowing filters for retro feel -->
			<defs>
				<filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur1" />
					<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur2" />
					<feMerge>
						<feMergeNode in="blur2" />
						<feMergeNode in="blur1" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			
			{#each lines as line}
				<line 
					x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} 
					stroke="rgba(74, 222, 128, 0.4)" 
					stroke-width="3" 
					stroke-dasharray="8 6"
					class="animate-[dash_1s_linear_infinite]"
					filter="url(#neonGlow)"
				/>
				<circle cx={line.x1} cy={line.y1} r="4" fill="#4ade80" filter="url(#neonGlow)"/>
				<circle cx={line.x2} cy={line.y2} r="4" fill="#4ade80" filter="url(#neonGlow)"/>
			{/each}
		</svg>

		<!-- Nodes -->
		{#each nodes as node (node.id)}
			<ElizaNode 
				{...node}
				selected={selectedNodeId === node.id}
				onSelect={(id) => selectedNodeId = id}
				onMove={onNodeMove}
			/>
		{/each}
	</div>
</div>

<style>
	/* Background animations for retro effect */
	@keyframes dash {
		to {
			stroke-dashoffset: -14;
		}
	}
	
	/* Hide body scrollbar since this route is an absolute takeover */
	:global(body) {
		overflow: hidden;
		background: #000;
	}
</style>
