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
</script>

<p class="text-sm text-[rgba(212,199,163,0.5)] leading-relaxed {className}">
	{#if children}
		{@render children()}
	{/if}
</p>
