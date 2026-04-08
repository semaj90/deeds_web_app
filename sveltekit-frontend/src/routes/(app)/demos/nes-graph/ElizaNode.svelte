<script lang="ts">
	interface Props {
		id: string;
		title: string;
		content: string;
		x: number;
		y: number;
		type: 'terminal' | 'memory' | 'process';
		selected?: boolean;
		onMove: (id: string, dx: number, dy: number) => void;
		onSelect: (id: string) => void;
	}

	let { id, title, content, x, y, type, selected = false, onMove, onSelect }: Props = $props();

	let isDragging = $state(false);
	let startX = 0;
	let startY = 0;

	function handlePointerDown(e: PointerEvent) {
		e.stopPropagation(); // Prevent canvas from panning
		if (e.button !== 0) return; // Only left click

		isDragging = true;
		startX = e.clientX;
		startY = e.clientY;
		
		// Capture pointer to track dragging outside the element boundary
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		onSelect(id);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		e.preventDefault();

		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		
		// Scale DX/DY by zoom factor happens in parent, so we just pass raw pixels here? 
		// Actually, since the pointer moves in screen space, we pass screen space deltas to parent
		// to let parent convert screen delta -> canvas delta.
		onMove(id, dx, dy);

		startX = e.clientX;
		startY = e.clientY;
	}

	function handlePointerUp(e: PointerEvent) {
		isDragging = false;
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
	}
</script>

<!-- The Svelte 5 style bindings map coordinate directly -->
<div 
	class="absolute z-10 w-64 select-none outline-none group
		{isDragging ? 'cursor-grabbing opacity-90' : 'cursor-grab'}
		{selected ? 'z-20 scale-[1.02]' : 'scale-100'} transition-transform duration-75"
	style="transform: translate({x}px, {y}px);"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
>
	<!-- Retro Modern ELIZA Window -->
	<div class="relative overflow-hidden rounded-md border-2 
		{selected ? 'border-green-400 shadow-[0_0_25px_rgba(74,222,128,0.4)]' : 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]'} 
		bg-black/95 backdrop-blur-md ring-1 ring-white/5 ring-inset">
		
		<!-- Subtle CRT scanline overlay -->
		<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50 mix-blend-overlay"></div>

		<!-- Window Header -->
		<div class="flex items-center justify-between border-b-2 {selected ? 'border-green-400' : 'border-green-500/50'} bg-green-500/10 px-3 py-1.5 backdrop-blur">
			<div class="flex items-center gap-2">
				<!-- Terminal dots -->
				<div class="flex gap-1.5">
					<div class="h-2.5 w-2.5 rounded-sm bg-red-500/80"></div>
					<div class="h-2.5 w-2.5 rounded-sm bg-amber-500/80"></div>
					<div class="h-2.5 w-2.5 rounded-sm bg-green-500/80"></div>
				</div>
				<span class="font-mono text-xs font-bold tracking-wider text-green-400 uppercase">
					{type}::{id.slice(0, 4)}
				</span>
			</div>
		</div>

		<!-- Window Body -->
		<div class="p-3">
			<h3 class="mb-2 font-mono text-sm font-semibold text-green-300">
				{title}
			</h3>
			<p class="font-mono text-xs leading-relaxed text-green-400/80">
				> {content}
				<span class="inline-block h-3 w-2 animate-pulse bg-green-400 align-middle"></span>
			</p>
		</div>

		<!-- Cyberpunk edge decoration -->
		<div class="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-green-500/50 group-hover:border-green-400 transition-colors"></div>
	</div>
</div>
