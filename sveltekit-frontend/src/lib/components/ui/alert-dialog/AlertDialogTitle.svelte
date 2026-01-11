<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { AlertDialogTitleProps } from './types';

	interface Props extends AlertDialogTitleProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();

	const defaultClass = 'text-lg font-semibold';
</script>

<h2 class="{defaultClass} {className}">
	{#if children}
		{@render children()}
	{/if}
</h2>


