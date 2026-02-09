<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { TooltipContext, TooltipTriggerProps } from './types';

	interface Props extends TooltipTriggerProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		disabled = false,
	}: Props = $props();

	const tooltipContext = getContext<TooltipContext>('tooltip');

	function handleMouseEnter() {
		if (!disabled) {
			tooltipContext?.show();
		}
	}

	function handleMouseLeave() {
		tooltipContext?.hide();
	}

	function handleFocus() {
		if (!disabled) {
			tooltipContext?.setOpen(true);
		}
	}

	function handleBlur() {
		tooltipContext?.hide();
	}
</script>

<span
	class="inline-block {className}"
	role="button"
	tabindex="0"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onfocus={handleFocus}
	onblur={handleBlur}
	aria-describedby={tooltipContext?.open ? 'tooltip-content'  | undefined}
>
	{#if children}
		{@render children()}
	{/if}
</span>


