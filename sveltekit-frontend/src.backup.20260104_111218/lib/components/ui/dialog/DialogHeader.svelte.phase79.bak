<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<div class="dialog-header {className}">
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.dialog-header {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 1rem 1.5rem 0;
	}
</style>
