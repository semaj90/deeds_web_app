<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { DrawerContext, DrawerTriggerProps } from './types';

	interface Props extends DrawerTriggerProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const drawerContext = getContext<DrawerContext>('drawer');

	function handleClick() {
		drawerContext?.setOpen(true);
	}

	const defaultClass = `
		inline-flex items-center justify-center
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	onclick={handleClick}
	class="{defaultClass} {className}"
>
	{#if children}
		{@render children()}
	{:else}
		Open
	{/if}
</button>

