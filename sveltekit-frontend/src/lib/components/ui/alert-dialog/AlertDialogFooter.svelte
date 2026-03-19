<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<div class="alert-dlg-footer {className}">
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.alert-dlg-footer {
		display: flex;
		flex-direction: column-reverse;
		gap: 0.625rem;
	}
	@media (min-width: 640px) {
		.alert-dlg-footer {
			flex-direction: row;
			justify-content: flex-end;
		}
	}
</style>