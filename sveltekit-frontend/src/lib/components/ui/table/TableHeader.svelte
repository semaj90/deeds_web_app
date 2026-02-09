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
		[&_tr]:border-b
	`.replace(/\s+/g, ' ').trim();
</script>

<thead class="{defaultClass} {className}" {...rest}>
	{#if children}
		{@render children()}
	{/if}
</thead>


