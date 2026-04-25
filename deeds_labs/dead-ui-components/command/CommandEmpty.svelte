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
</script>

<div class="cmd-empty {className}">
	{#if children}
		{@render children()}
	{:else}
		No results found.
	{/if}
</div>

<style>
	.cmd-empty {
		padding: 1.5rem 1rem;
		text-align: center;
		font-size: 0.8125rem;
		color: rgba(212, 199, 163, 0.35);
	}
</style>