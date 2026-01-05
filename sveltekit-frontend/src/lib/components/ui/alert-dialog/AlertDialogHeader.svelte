<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();

	const defaultClass = 'flex flex-col space-y-2 text-center sm:text-left';
</script>

<div class="{defaultClass} { className }">
	{#if children}
		{@render children()}
	{/if}
</div>
