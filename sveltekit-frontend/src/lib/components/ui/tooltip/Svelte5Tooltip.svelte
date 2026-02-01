<script lang="ts">
	let className = $state<any>(undefined);
	let content = $state<any>(undefined);

/**
 * Svelte 5 Tooltip Component
 * Native HTML with Svelte 5 runes and accessible tooltip
 */
import type { Snippet } from 'svelte';

interface Props {
	content?: string;
	position?: 'top' | 'bottom' | 'left' | 'right';
	delay?: number;
	class?: string;
	children?: Snippet;
	tooltip?: Snippet;
}

let {
	content = '',
	position = 'top',
	delay = 200,
	class: className = '',
	children: tooltip
}: Props = $props();

let isVisible = $state(false);
let timeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
let triggerRef = $state<HTMLDivElement | null>(null);

// Position classes
let positionClasses = $derived({
	top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
	bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
	left: 'right-full top-1/2 -translate-y-1/2 mr-2',
	right: 'left-full top-1/2 -translate-y-1/2 ml-2'
}[position]);

// Arrow classes
let arrowClasses = $derived({
	top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-700 border-x-transparent border-b-transparent',
	bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-700 border-x-transparent border-t-transparent',
	left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-700 border-y-transparent border-r-transparent',
	right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-700 border-y-transparent border-l-transparent'
}[position]);

function show() {
	if (timeoutId) clearTimeout(timeoutId);
	timeoutId = setTimeout(() => {
		isVisible = true;
	},
	delay);
}

function hide() {
	if (timeoutId) clearTimeout(timeoutId);
	isVisible = false;
}
</script>

<div
	class="relative inline-block {className}"
	bind:this={triggerRef}
	onmouseenter={ show }
	onmouseleave={ hide }
	onfocus={ show }
	onblur={ hide }
>
	<!-- Trigger content -->
	{#if children}
		{@render children()}
	{/if}

	<!-- Tooltip -->
	{#if isVisible && (content || tooltip)}
		<div
			class="absolute z-50 {positionClasses}
				   px-3 py-2 text-sm text-white
				   bg-slate-700 rounded-lg shadow-lg
				   pointer-events-none
				   whitespace-nowrap
				   animate-in fade-in-0 zoom-in-95 duration-150"
			role="tooltip"
		>
			{#if tooltip}
				{@render tooltip()}
			{:else}
				{content}
			{/if}

			<!-- Arrow -->
			<div
				class="absolute w-0 h-0 border-4 {arrowClasses}"
			></div>
		</div>
	{/if}
</div>

<style>
	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes zoom-in {
		from { transform: scale(0.95); }
		to { transform: scale(1); }
	}

	.animate-in {
		animation: fade-in 0.15s ease-out, zoom-in 0.15s ease-out;
	}
</style>


