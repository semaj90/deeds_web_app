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
		class="tip-content {sideClass} {className}"
		transition:fade={{ duration: 120 }}
		data-state="open"
		data-side={side}
		data-align={align}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}

<style>
	.tip-content {
		position: absolute;
		z-index: 50;
		overflow: hidden;
		padding: 0.375rem 0.75rem;
		border-radius: 0.625rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		background: rgba(22, 21, 18, 0.97);
		border: 1px solid rgba(212, 199, 163, 0.1);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.2),
			0 8px 24px -4px rgba(0, 0, 0, 0.5),
			inset 0 1px 0 rgba(212, 199, 163, 0.04);
		backdrop-filter: blur(12px) saturate(1.15);
		color: rgba(212, 199, 163, 0.8);
	}
</style>
