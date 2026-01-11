<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DrawerTitleProps } from './types';

	interface Props extends DrawerTitleProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const defaultClass = `
		text-lg font-semibold leading-none tracking-tight
	`.replace(/\s+/g, ' ').trim();
</script>

<h2 class="{defaultClass} {className}">
	{#if children}
		{@render children()}
	{/if}
</h2>


