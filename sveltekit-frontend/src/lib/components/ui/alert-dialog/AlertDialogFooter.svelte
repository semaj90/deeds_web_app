<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();

	const defaultClass = 'flex flex-col-reverse sm: flex-row sm: justify-end sm:space-x-2';
</script>

<div class="{defaultClass} { className }">
	{#if children}
		{@render children()}
	{/if}
</div>


