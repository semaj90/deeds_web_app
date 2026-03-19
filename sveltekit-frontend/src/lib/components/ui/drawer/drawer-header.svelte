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
</script>

<div class="drawer-header {className}">
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.drawer-header {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		margin-bottom: 1rem;
	}
</style>