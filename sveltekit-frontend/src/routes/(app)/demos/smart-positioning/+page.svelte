<script lang="ts">
	import { browser } from '$app/environment';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface TargetElement {
		id: string;
		label: string;
		selector: string;
	}

	const TARGETS: TargetElement[] = [
		{ id: 'top-left', label: 'Top-Left Box', selector: '.target-tl' },
		{ id: 'top-right', label: 'Top-Right Box', selector: '.target-tr' },
		{ id: 'bottom-left', label: 'Bottom-Left Box', selector: '.target-bl' },
		{ id: 'bottom-right', label: 'Bottom-Right Box', selector: '.target-br' },
		{ id: 'center', label: 'Center Box', selector: '.target-center' },
	];

	type CardPos = 'center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

	let activeTarget = $state<TargetElement | null>(null);
	let cardPosition = $state<CardPos>('center');
	let cardStyle = $state('');
	let targetRect = $state<DOMRect | null>(null);
	let autoMode = $state(false);
	let autoIndex = $state(0);
	let autoInterval: ReturnType<typeof setInterval> | undefined;

	const CARD_WIDTH = 280;
	const CARD_HEIGHT = 180;
	const GAP = 16;

	function computeCardPosition(rect: DOMRect): { pos: CardPos; style: string } {
		if (!browser) return { pos: 'center', style: '' };

		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;

		// Try placing below the target
		if (rect.bottom + GAP + CARD_HEIGHT < vh && cx + CARD_WIDTH / 2 < vw) {
			return {
				pos: 'bottom-right',
				style: `position:fixed; top:${rect.bottom + GAP}px; left:${Math.max(GAP, rect.left)}px;`,
			};
		}
		// Try placing above
		if (rect.top - GAP - CARD_HEIGHT > 0) {
			return {
				pos: 'top-right',
				style: `position:fixed; top:${rect.top - GAP - CARD_HEIGHT}px; left:${Math.max(GAP, rect.left)}px;`,
			};
		}
		// Try placing to the right
		if (rect.right + GAP + CARD_WIDTH < vw) {
			return {
				pos: 'bottom-right',
				style: `position:fixed; top:${Math.max(GAP, rect.top)}px; left:${rect.right + GAP}px;`,
			};
		}
		// Try placing to the left
		if (rect.left - GAP - CARD_WIDTH > 0) {
			return {
				pos: 'bottom-left',
				style: `position:fixed; top:${Math.max(GAP, rect.top)}px; left:${rect.left - GAP - CARD_WIDTH}px;`,
			};
		}
		// Fallback: center
		return {
			pos: 'center',
			style: `position:fixed; top:${vh / 2 - CARD_HEIGHT / 2}px; left:${vw / 2 - CARD_WIDTH / 2}px;`,
		};
	}

	function selectTarget(target: TargetElement) {
		const el = document.querySelector(target.selector);
		if (!el) return;
		const rect = el.getBoundingClientRect();
		targetRect = rect;
		activeTarget = target;
		const result = computeCardPosition(rect);
		cardPosition = result.pos;
		cardStyle = result.style;
	}

	function clearTarget() {
		activeTarget = null;
		targetRect = null;
		cardStyle = '';
	}

	function handleResize() {
		if (activeTarget) selectTarget(activeTarget);
	}

	function toggleAuto() {
		if (autoMode) {
			autoMode = false;
			if (autoInterval) clearInterval(autoInterval);
			clearTarget();
			return;
		}
		autoMode = true;
		autoIndex = 0;
		selectTarget(TARGETS[0]);
		autoInterval = setInterval(() => {
			autoIndex = (autoIndex + 1) % TARGETS.length;
			selectTarget(TARGETS[autoIndex]);
		}, 2000);
	}
</script>

<svelte:window onresize={handleResize} />

<div class="max-w-3xl mx-auto py-8 px-6">
	<!-- Header -->
	<div class="flex items-center gap-3 mb-6">
		<div class="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
			<Icon name="move" size={22} />
		</div>
		<div>
			<h1 class="text-xl font-bold m-0">Smart Card Positioning</h1>
			<p class="text-xs opacity-50 m-0">Adaptive tooltip/card placement avoiding viewport edges</p>
		</div>
	</div>

	<!-- How it works -->
	<section class="mb-6 p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-2 flex items-center gap-2">
			<Icon name="info" size={14} />
			How It Works
		</h2>
		<p class="text-xs opacity-70 m-0 leading-relaxed">
			The wizard card needs to appear near the spotlighted element without covering it or going off-screen.
			The algorithm tries placement in priority order: <strong>below → above → right → left → center</strong>,
			checking if the card fits in the viewport at each position. On window resize, it recomputes automatically.
		</p>
	</section>

	<!-- Controls -->
	<div class="flex flex-wrap gap-2 mb-4">
		{#each TARGETS as target}
			<button
				class="px-3 py-1.5 text-xs rounded-md border transition-colors"
				class:border-accent={activeTarget?.id === target.id}
				class:bg-accent={activeTarget?.id === target.id}
				class:text-white={activeTarget?.id === target.id}
				class:border-sand-dark={activeTarget?.id !== target.id}
				onclick={() => selectTarget(target)}
			>{target.label}</button>
		{/each}
		<button
			class="px-3 py-1.5 text-xs rounded-md border transition-colors"
			class:border-orange-500={autoMode}
			class:text-orange-400={autoMode}
			class:border-sand-dark={!autoMode}
			onclick={toggleAuto}
		>
			<Icon name={autoMode ? 'pause' : 'play'} size={12} />
			{autoMode ? 'Stop Auto' : 'Auto Cycle'}
		</button>
		{#if activeTarget}
			<button
				class="px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
				onclick={clearTarget}
			>
				<Icon name="x" size={12} />
				Clear
			</button>
		{/if}
	</div>

	<!-- Arena with target boxes -->
	<div class="arena mb-6">
		<div class="target-tl target-box">
			<Icon name="arrow-up-left" size={14} />
			<span>Top Left</span>
		</div>
		<div class="target-tr target-box">
			<Icon name="arrow-up-right" size={14} />
			<span>Top Right</span>
		</div>
		<div class="target-center target-box target-box-center">
			<Icon name="crosshair" size={14} />
			<span>Center</span>
		</div>
		<div class="target-bl target-box">
			<Icon name="arrow-down-left" size={14} />
			<span>Bottom Left</span>
		</div>
		<div class="target-br target-box">
			<Icon name="arrow-down-right" size={14} />
			<span>Bottom Right</span>
		</div>

		<!-- Position indicator -->
		{#if activeTarget && cardPosition}
			<div class="absolute top-2 right-2 text-[10px] opacity-40 font-mono">
				card → {cardPosition}
			</div>
		{/if}
	</div>

	<!-- Algorithm table -->
	<section class="mb-6 p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-3 flex items-center gap-2">
			<Icon name="list-ordered" size={14} />
			Placement Priority
		</h2>
		<div class="grid gap-1">
			{#each [
				{ pos: 'Below', cond: 'rect.bottom + gap + cardH < viewportH', icon: 'arrow-down' },
				{ pos: 'Above', cond: 'rect.top - gap - cardH > 0', icon: 'arrow-up' },
				{ pos: 'Right', cond: 'rect.right + gap + cardW < viewportW', icon: 'arrow-right' },
				{ pos: 'Left', cond: 'rect.left - gap - cardW > 0', icon: 'arrow-left' },
				{ pos: 'Center', cond: 'fallback (always fits)', icon: 'crosshair' },
			] as rule}
				<div class="flex items-center gap-3 py-1 px-2 rounded text-xs">
					<Icon name={rule.icon} size={12} />
					<span class="font-semibold w-16">{rule.pos}</span>
					<code class="text-[10px] opacity-50 font-mono">{rule.cond}</code>
				</div>
			{/each}
		</div>
	</section>

	<!-- Code snippet -->
	<section class="p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-2 flex items-center gap-2">
			<Icon name="code" size={14} />
			Implementation
		</h2>
		<pre class="text-[11px] leading-relaxed bg-black/30 p-3 rounded-md overflow-x-auto m-0"><code>{`function computeCardPosition(rect: DOMRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Try: below → above → right → left → center
  if (rect.bottom + GAP + CARD_H < vh)
    return { top: rect.bottom + GAP, left: rect.left };
  if (rect.top - GAP - CARD_H > 0)
    return { top: rect.top - GAP - CARD_H, left: rect.left };
  if (rect.right + GAP + CARD_W < vw)
    return { top: rect.top, left: rect.right + GAP };
  if (rect.left - GAP - CARD_W > 0)
    return { top: rect.top, left: rect.left - GAP - CARD_W };
  // Fallback: center
  return { top: vh/2 - CARD_H/2, left: vw/2 - CARD_W/2 };
}`}</code></pre>
	</section>
</div>

<!-- Floating smart card -->
{#if activeTarget && cardStyle}
	<div
		class="smart-card"
		style="{cardStyle} width:{CARD_WIDTH}px;"
		transition:scale={{ duration: 250, start: 0.9, easing: cubicOut }}
	>
		<div class="flex items-center gap-2 mb-2">
			<Icon name="move" size={14} />
			<span class="text-xs font-semibold">Smart Card</span>
			<span class="text-[10px] opacity-40 ml-auto font-mono">{cardPosition}</span>
		</div>
		<p class="text-xs opacity-70 m-0 mb-2">
			Targeting: <strong>{activeTarget.label}</strong>
		</p>
		<p class="text-[11px] opacity-50 m-0">
			This card positioned itself to avoid overlapping the target element and
			staying within the viewport. Resize the window to see it recompute.
		</p>
	</div>
{/if}

<!-- Highlight ring on active target -->
{#if targetRect}
	<div
		class="target-ring"
		style="
			top: {targetRect.top - 4}px;
			left: {targetRect.left - 4}px;
			width: {targetRect.width + 8}px;
			height: {targetRect.height + 8}px;
		"
		transition:fade={{ duration: 200 }}
	></div>
{/if}

<style>
	.arena {
		position: relative;
		height: 300px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.2);
	}

	.target-box {
		position: absolute;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		border: 1px dashed rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		font-size: 11px;
		opacity: 0.6;
		transition: all 0.2s;
	}

	.target-box:hover {
		opacity: 1;
		border-color: rgba(99, 179, 237, 0.4);
	}

	.target-tl { top: 16px; left: 16px; }
	.target-tr { top: 16px; right: 16px; }
	.target-bl { bottom: 16px; left: 16px; }
	.target-br { bottom: 16px; right: 16px; }
	.target-box-center {
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	.smart-card {
		z-index: 9999;
		background: #0d1117;
		border: 1px solid rgba(72, 187, 120, 0.4);
		border-radius: 10px;
		padding: 14px 16px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		pointer-events: none;
	}

	.target-ring {
		position: fixed;
		z-index: 9998;
		border: 2px solid rgba(72, 187, 120, 0.5);
		border-radius: 10px;
		pointer-events: none;
		animation: ring-pulse 1.5s ease-in-out infinite;
	}

	@keyframes ring-pulse {
		0%, 100% { box-shadow: 0 0 8px rgba(72, 187, 120, 0.3); }
		50% { box-shadow: 0 0 16px rgba(72, 187, 120, 0.5); }
	}
</style>
