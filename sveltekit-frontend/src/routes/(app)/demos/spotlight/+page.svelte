<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface SpotlightTarget {
		id: string;
		label: string;
		selector: string;
		description: string;
	}

	const TARGETS: SpotlightTarget[] = [
		{ id: 'header', label: 'Page Header', selector: '.demo-header', description: 'The spotlight highlights a DOM element with a glowing cutout overlay.' },
		{ id: 'card-a', label: 'Feature Card A', selector: '.card-a', description: 'Cards can be individually targeted — the overlay follows the bounding rect.' },
		{ id: 'card-b', label: 'Feature Card B', selector: '.card-b', description: 'Resize the window and the spotlight recomputes position automatically.' },
		{ id: 'controls', label: 'Control Panel', selector: '.controls-panel', description: 'Even the control panel itself can be spotlighted for meta-demos.' },
	];

	let activeTarget = $state<SpotlightTarget | null>(null);
	let spotlightRect = $state<DOMRect | null>(null);
	let overlayVisible = $state(false);
	let padding = $state(10);
	let borderRadius = $state(8);
	let pulseEnabled = $state(true);

	function spotlightOn(target: SpotlightTarget) {
		const el = document.querySelector(target.selector);
		if (!el) return;
		activeTarget = target;
		spotlightRect = el.getBoundingClientRect();
		overlayVisible = true;
	}

	function spotlightOff() {
		overlayVisible = false;
		activeTarget = null;
		spotlightRect = null;
	}

	function handleResize() {
		if (!activeTarget) return;
		const el = document.querySelector(activeTarget.selector);
		if (el) spotlightRect = el.getBoundingClientRect();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && overlayVisible) {
			e.preventDefault();
			spotlightOff();
		}
	}
</script>

<svelte:window onresize={handleResize} onkeydown={handleKeydown} />

<div class="max-w-3xl mx-auto py-8 px-6">
	<!-- Header -->
	<div class="demo-header mb-8">
		<div class="flex items-center gap-3 mb-2">
			<div class="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
				<Icon name="scan" size={22} />
			</div>
			<div>
				<h1 class="text-xl font-bold m-0">Spotlight Overlay</h1>
				<p class="text-xs opacity-50 m-0">Interactive CSS spotlight with box-shadow cutout technique</p>
			</div>
		</div>
	</div>

	<!-- How it works -->
	<section class="mb-6 p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-2 flex items-center gap-2">
			<Icon name="info" size={14} />
			How It Works
		</h2>
		<p class="text-xs opacity-70 m-0 leading-relaxed">
			The spotlight uses a <code class="text-[11px] bg-black/20 px-1 rounded">box-shadow: 0 0 0 9999px rgba(0,0,0,0.7)</code>
			on a positioned element that matches the target's bounding rect. This creates a "cutout" effect where the target
			element is visible through the dark overlay. A pulsing glow border draws attention to the highlighted area.
			Used in the onboarding wizard to guide users through each UI section.
		</p>
	</section>

	<!-- Controls -->
	<div class="controls-panel mb-6 p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-3">Controls</h2>
		<div class="flex flex-wrap gap-2 mb-4">
			{#each TARGETS as target}
				<button
					class="px-3 py-1.5 text-xs rounded-md border border-sand-dark hover:border-accent transition-colors"
					class:bg-accent={activeTarget?.id === target.id}
					class:text-white={activeTarget?.id === target.id}
					onclick={() => spotlightOn(target)}
				>
					<Icon name="focus" size={12} />
					{target.label}
				</button>
			{/each}
			{#if overlayVisible}
				<button
					class="px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
					onclick={spotlightOff}
				>
					<Icon name="x" size={12} />
					Dismiss
				</button>
			{/if}
		</div>

		<div class="grid grid-cols-3 gap-4">
			<label class="text-xs">
				<span class="opacity-60">Padding: {padding}px</span>
				<input type="range" min="0" max="30" bind:value={padding} class="w-full mt-1" />
			</label>
			<label class="text-xs">
				<span class="opacity-60">Border radius: {borderRadius}px</span>
				<input type="range" min="0" max="24" bind:value={borderRadius} class="w-full mt-1" />
			</label>
			<label class="text-xs flex items-center gap-2">
				<input type="checkbox" bind:checked={pulseEnabled} />
				<span class="opacity-60">Pulse glow</span>
			</label>
		</div>
	</div>

	<!-- Target cards -->
	<div class="grid grid-cols-2 gap-4 mb-6">
		<div class="card-a p-5 border border-sand-dark rounded-lg bg-panel-soft">
			<div class="flex items-center gap-2 mb-2">
				<Icon name="file-text" size={18} />
				<h3 class="text-sm font-semibold m-0">Feature Card A</h3>
			</div>
			<p class="text-xs opacity-60 m-0">Evidence analysis module with AI-powered entity extraction and semantic chunking for legal documents.</p>
		</div>
		<div class="card-b p-5 border border-sand-dark rounded-lg bg-panel-soft">
			<div class="flex items-center gap-2 mb-2">
				<Icon name="brain" size={18} />
				<h3 class="text-sm font-semibold m-0">Feature Card B</h3>
			</div>
			<p class="text-xs opacity-60 m-0">GPU-accelerated vector search with pgvector embeddings, semantic reranking, and confidence scoring.</p>
		</div>
	</div>

	<!-- Code snippet -->
	<section class="p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-2 flex items-center gap-2">
			<Icon name="code" size={14} />
			Implementation
		</h2>
		<pre class="text-[11px] leading-relaxed bg-black/30 p-3 rounded-md overflow-x-auto m-0"><code>{`.spotlight {
  position: fixed;
  border-radius: 8px;
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0.7),
    0 0 30px 4px rgba(99, 179, 237, 0.4);
  border: 2px solid rgba(99, 179, 237, 0.6);
  pointer-events: none;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  animation: spotlight-pulse 2s ease-in-out infinite;
}`}</code></pre>
	</section>
</div>

<!-- Spotlight overlay -->
{#if overlayVisible && spotlightRect}
	<div
		class="spotlight-overlay"
		transition:fade={{ duration: 200 }}
		onclick={spotlightOff}
		role="button"
		tabindex="-1"
		aria-label="Click to dismiss spotlight"
	>
		<div
			class="spotlight-cutout"
			class:spotlight-pulse={pulseEnabled}
			style="
				top: {spotlightRect.top - padding}px;
				left: {spotlightRect.left - padding}px;
				width: {spotlightRect.width + padding * 2}px;
				height: {spotlightRect.height + padding * 2}px;
				border-radius: {borderRadius}px;
			"
		></div>

		<!-- Info card -->
		{#if activeTarget}
			<div
				class="spotlight-info"
				style="top: {spotlightRect.bottom + padding + 16}px; left: {Math.max(16, spotlightRect.left)}px;"
				transition:scale={{ duration: 250, start: 0.9, easing: cubicOut }}
			>
				<h3 class="text-sm font-semibold m-0 mb-1">{activeTarget.label}</h3>
				<p class="text-xs opacity-70 m-0">{activeTarget.description}</p>
				<p class="text-[10px] opacity-40 m-0 mt-2">Press Esc or click overlay to dismiss</p>
			</div>
		{/if}
	</div>
{/if}

<style>
	.spotlight-overlay {
		position: fixed;
		inset: 0;
		z-index: 10000;
		cursor: pointer;
	}

	.spotlight-cutout {
		position: fixed;
		box-shadow:
			0 0 0 9999px rgba(0, 0, 0, 0.7),
			0 0 30px 4px rgba(99, 179, 237, 0.4);
		border: 2px solid rgba(99, 179, 237, 0.6);
		pointer-events: none;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.spotlight-cutout.spotlight-pulse {
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 30px 4px rgba(99, 179, 237, 0.4); }
		50% { box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 40px 8px rgba(99, 179, 237, 0.6); }
	}

	.spotlight-info {
		position: fixed;
		z-index: 10001;
		background: #0d1117;
		border: 1px solid rgba(99, 179, 237, 0.3);
		border-radius: 8px;
		padding: 12px 16px;
		max-width: 320px;
		pointer-events: none;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}
</style>
