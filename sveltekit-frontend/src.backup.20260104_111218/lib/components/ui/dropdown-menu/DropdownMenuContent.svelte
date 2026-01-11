<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { scale } from 'svelte/transition';
	import type { DropdownMenuContentProps, DropdownMenuContext } from './types';

	interface Props extends DropdownMenuContentProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		side = 'bottom',
		align = 'start',
		sideOffset = 4,
	}: Props = $props();

	const menuContext = getContext<DropdownMenuContext>('dropdown-menu');

	const defaultClass = `
		absolute z-50 min-w-[8rem] overflow-hidden rounded-md
		border bg-popover p-1 text-popover-foreground shadow-md
	`.replace(/\\s+/g, ' ').trim();

	// Position classes based on side - use $derived for reactivity
	const sideClass = $derived(
		side === 'top' ? `bottom-full mb-1`
		: side === 'left' ? `right-full mr-1`
		: side === 'right' ? `left-full ml-1`
		: `top-full mt-1`
	);

	const alignClass = $derived(
		align === 'end' ? 'right-0'
		: align === 'center' ? 'left-1/2 -translate-x-1/2'
		: 'left-0'
	);
</script>

{#if menuContext?.open}
	<div
		role="menu"
		aria-orientation="vertical"
		class="{defaultClass} {sideClass} {alignClass} {className}"
		transition:scale={{ duration: 150, start: 0.95 }}
		data-state="open"
		data-side={side}
		data-align={align}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
