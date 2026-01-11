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
		border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted
	`.replace(/\s+/g, ' ').trim();
</script>

<tr class="{defaultClass} { className }" {...rest}>
	{#if children}
		{@render children()}
	{/if}
</tr>


