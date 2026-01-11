<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { scale } from 'svelte/transition';
	import type { SelectContentProps, SelectContext } from './types';

	interface Props extends SelectContentProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		position = 'popper',
		side = 'bottom',
		align = 'start',
	}: Props = $props();

	const selectContext = getContext<SelectContext>('select');

	const defaultClass = `
		absolute z-50 min-w-[8rem] overflow-hidden rounded-md
		border bg-popover text-popover-foreground shadow-md
	`.replace(/\\s+/g, ' ').trim();

	const positionClass = $derived(side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1');

	const alignClass = $derived(
		align === 'end' ? 'right-0'
		: align === 'center' ? 'left-1/2 -translate-x-1/2'
		: 'left-0'
	);
</script>

{#if selectContext?.open}
	<div
		role="listbox"
		class="{defaultClass} {positionClass} {alignClass} {className}"
		transition:scale={{ duration: 150, start: 0.95 }}
		data-state="open"
	>
		<div class="max-h-[300px] overflow-y-auto p-1">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
{/if}
