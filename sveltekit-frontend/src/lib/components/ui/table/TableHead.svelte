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
		h-12 px-4 text-left align-middle font-medium text-muted-foreground
		[&:has([role=checkbox])]:pr-0
	`.replace(/\s+/g, ' ').trim();
</script>

<th class="{defaultClass} { className: className }" {...rest}>
	{#if children}
		{@render children()}
	{/if}
</th>
