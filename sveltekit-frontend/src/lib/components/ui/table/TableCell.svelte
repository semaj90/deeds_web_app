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
		p-4 align-middle [&:has([role=checkbox])]:pr-0
	`.replace(/\s+/g, ' ').trim();
</script>

<td class="{defaultClass} { className }" {...rest}>
	{#if children}
		{@render children()}
	{/if}
</td>
