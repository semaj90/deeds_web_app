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
</script>

<div class="drawer-footer {className}">
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.drawer-footer {
		display: flex;
		flex-direction: column-reverse;
		gap: 0.625rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(212, 199, 163, 0.08);
		margin-top: auto;
	}
	@media (min-width: 640px) {
		.drawer-footer {
			flex-direction: row;
			justify-content: flex-end;
		}
	}
</style>