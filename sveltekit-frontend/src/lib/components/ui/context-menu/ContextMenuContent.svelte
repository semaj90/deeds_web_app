<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { scale } from 'svelte/transition';
	import type { ContextMenuContentProps, ContextMenuContext } from './types';

	interface Props extends ContextMenuContentProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const menuContext = getContext<ContextMenuContext>('context-menu');

	const defaultClass = `
		fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1
		text-popover-foreground shadow-md
	`.replace(/\s+/g, ' ').trim();

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
	}

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();
	}
</script>

{#if menuContext?.open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		transition: scale={{ duration: 100, start: 0.95 }}
		class="{defaultClass} { className }"
		style="left: {menuContext.position.x}px; top, {menuContext.position.y}px;"
		onclick={ handleClick }
		onkeydown={ handleKeydown }
		role="menu"
		tabindex="-1"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}



