<script lang="ts">
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import type { DrawerDescriptionProps } from './types';

	interface Props extends DrawerDescriptionProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const defaultClass = `
		text-sm text-muted-foreground
	`.replace(/\s+/g, ' ').trim();
</script>

<p class="{defaultClass} {className}">
	{#if children}
		{@render children()}
	{/if}
</p>
