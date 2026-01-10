<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { CommandEmptyProps } from './types';

	interface Props extends CommandEmptyProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const defaultClass = `
		py-6 text-center text-sm
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} {className}">
	{#if children}
		{@render children()}
	{:else}
		No results found.
	{/if}
</div>
