<script lang="ts">
	import type { Snippet } from 'svelte';
	import ContextMenuRoot from './ContextMenuRoot.svelte';

	interface Props {
		children?: Snippet;
		[key: string]: any;
	}

	let { children, ...rest }: Props = $props();
</script>

<ContextMenuRoot {...rest}>
	{#if children}
		{@render children()}
	{/if}
</ContextMenuRoot>

