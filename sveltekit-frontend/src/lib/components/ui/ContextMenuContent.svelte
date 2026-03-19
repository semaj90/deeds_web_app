<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = '', children }: Props = $props();
</script>

<div class="context-menu {className}">
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.context-menu {
		animation: contextMenuFadeIn 150ms ease-out;
	}

	@keyframes contextMenuFadeIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>