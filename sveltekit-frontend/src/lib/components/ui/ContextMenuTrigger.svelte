<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = '', children }: Props = $props();
</script>

<div class="context-menu-trigger {className}" role="button" tabindex="0">
	{#if children}
		{@render children()}
	{/if}
</div>
