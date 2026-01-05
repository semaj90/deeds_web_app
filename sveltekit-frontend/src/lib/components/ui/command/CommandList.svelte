<script lang="ts">
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import type { CommandListProps } from './types';

	interface Props extends CommandListProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const defaultClass = `
		max-h-[300px] overflow-y-auto overflow-x-hidden
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} {className}" role="listbox">
	{#if children}
		{@render children()}
	{/if}
</div>
