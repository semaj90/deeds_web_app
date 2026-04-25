<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { CommandGroupProps } from './types';

	interface Props extends CommandGroupProps {
		children?: Snippet;
	}

	let {
		heading = '',
		class: className = '',
		children,
	}: Props = $props();
</script>

<div class="cmd-group {className}" role="group">
	{#if heading}
		<div class="cmd-group-heading">
			{heading}
		</div>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.cmd-group {
		overflow: hidden;
		padding: 0.25rem;
	}

	.cmd-group-heading {
		padding: 0.375rem 0.625rem 0.5rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.35);
	}
</style>