<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
		[key: string]: any;
	}

	let {
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const defaultClass = `
		mt-4 text-sm text-muted-foreground
	`.replace(/\s+/g, ' ').trim();
</script>

<caption class="{defaultClass} {className}" {...rest}>
	{#if children}
		{@render children()}
	{/if}
</caption>
