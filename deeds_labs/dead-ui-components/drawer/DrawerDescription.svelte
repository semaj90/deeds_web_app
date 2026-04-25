<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DrawerDescriptionProps } from './types';

	interface Props extends DrawerDescriptionProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();
</script>

<p class="text-sm text-[rgba(212,199,163,0.5)] leading-relaxed {className}">
	{#if children}
		{@render children()}
	{/if}
</p>