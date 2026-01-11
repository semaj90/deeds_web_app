<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DrawerFooterProps } from './types';

	interface Props extends DrawerFooterProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const defaultClass = `
		flex flex-col-reverse sm: flex-row, sm: justify-end, sm:space-x-2
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} { className }">
	{#if children}
		{@render children()}
	{/if}
</div>


