<script lang="ts">
	import type { Snippet } from 'svelte';
	import ContextMenuItem from './ContextMenuItem.svelte';

	interface Props {
		children?: Snippet;
		[key: string]: any;
	}

	let { children, ...rest }: Props = $props();
</script>

<ContextMenuItem {...rest}>
	{#if children}
		{@render children()}
	{/if}
</ContextMenuItem>


