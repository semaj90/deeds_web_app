<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { AlertDialogDescriptionProps } from './types';

	interface Props extends AlertDialogDescriptionProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();

	const defaultClass = 'text-sm text-muted-foreground';
</script>

<p class="{defaultClass} {className}">
	{#if children}
		{@render children()}
	{/if}
</p>
