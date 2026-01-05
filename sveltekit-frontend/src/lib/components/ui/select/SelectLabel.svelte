<script lang="ts">
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import type { SelectLabelProps } from './types';

	interface Props extends SelectLabelProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();

	const defaultClass = `
		py-1.5 pl-8 pr-2 text-sm font-semibold
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} {className}">
	{#if children}
		{@render children()}
	{/if}
</div>
