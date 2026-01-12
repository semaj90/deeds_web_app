<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { TooltipContentProps, TooltipContext } from './types';

	interface Props extends TooltipContentProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		side = 'top',
		align = 'center',
		sideOffset = 4,
	}: Props = $props();

	const tooltipContext = getContext<TooltipContext>('tooltip');

	const defaultClass = `
		absolute z-50 overflow-hidden rounded-md border
		bg-popover px-3 py-1.5 text-sm text-popover-foreground
		shadow-md animate-in fade-in-0 zoom-in-95
	`.replace(/\\s+/g, ' ').trim();

	// Position classes based on side - use $derived for reactivity
	const sideClass = $derived(
		side === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-1'
		: side === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-1'
		: side === 'left' ? 'right-full top-1/2 -translate-y-1/2 mr-1'
		: 'left-full top-1/2 -translate-y-1/2 ml-1'
	);
</script>

{#if tooltipContext?.open}
	<div
		id="tooltip-content"
		role="tooltip"
		class="{defaultClass} {sideClass} {className}"
		transition:fade={{ duration: 150 }}
		data-state="open"
		data-side={side}
		data-align={ align }
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}



