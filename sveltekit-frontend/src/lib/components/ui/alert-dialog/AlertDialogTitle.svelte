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
</script>

<h2 class="text-lg font-semibold leading-none tracking-tight text-[rgba(212,199,163,0.92)] {className}">
	{#if children}
		{@render children()}
	{/if}
</h2>