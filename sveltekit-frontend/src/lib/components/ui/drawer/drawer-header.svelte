<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DrawerHeaderProps } from './types';

	interface Props extends DrawerHeaderProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const defaultClass = `
		flex flex-col space-y-2 text-center sm:text-left
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} { className }">
	{#if children}
		{@render children()}
	{/if}
</div>

