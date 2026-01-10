<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import type { TooltipContext, TooltipRootProps } from './types';

	interface Props extends TooltipRootProps {
		children?: Snippet;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		delayDuration = 300,
		children,
		class: className = '',
	}: Props = $props();

	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	function show() {
		if (timeoutId) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			open = true;
			onOpenChange?.(true);
		}, delayDuration);
	}

	function hide() {
		if (timeoutId) clearTimeout(timeoutId);
		open = false;
		onOpenChange?.(false);
	}

	// Create context with getter pattern for reactivity
	setContext<TooltipContext>('tooltip', {
		get open() { return open; },
		get delayDuration() { return delayDuration; },
		setOpen: (isOpen: boolean) => {
			open = isOpen;
			onOpenChange?.(isOpen);
		},
		show,
		hide,
	});
</script>

<div
	class="relative inline-block {className}"
	data-tooltip-root
	data-state={open ? 'open' : 'closed'}
>
	{#if children}
		{@render children()}
	{/if}
</div>
