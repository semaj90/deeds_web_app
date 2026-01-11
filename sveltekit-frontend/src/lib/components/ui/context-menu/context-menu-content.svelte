<script lang="ts">
	import type { Snippet } from 'svelte';
	import ContextMenuContent from './ContextMenuContent.svelte';

	interface Props {
		children?: Snippet;
		[key: string]: any;
	}

	let { children, ...rest }: Props = $props();
</script>

<ContextMenuContent {...rest}>
	{#if children}
		{@render children()}
	{/if}
</ContextMenuContent>

