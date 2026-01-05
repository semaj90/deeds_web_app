<script lang="ts">
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { ContextMenuContext, ContextMenuTriggerProps } from './types';

	interface Props extends ContextMenuTriggerProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const menuContext = getContext<ContextMenuContext>('context-menu');

	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		menuContext?.setPosition(event.clientX, event.clientY);
		menuContext?.setOpen(true);
	}
</script>

<div
	oncontextmenu={handleContextMenu}
	class="context-menu-trigger {className}"
	role="button"
	tabindex="0"
>
	{#if children}
		{@render children()}
	{/if}
</div>
