<script lang="ts">
	import type { Snippet } from 'svelte';
	import ContextMenuTrigger from './ContextMenuTrigger.svelte';

	interface Props {
		children?: Snippet;
		[key: string]: any;
	}

	let { children, ...rest }: Props = $props();
</script>

<ContextMenuTrigger {...rest}>
	{#if children}
		{@render children()}
	{/if}
</ContextMenuTrigger>

