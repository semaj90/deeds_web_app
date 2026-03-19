<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DialogDescriptionProps } from './types';

	interface Props extends DialogDescriptionProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();

	const defaultClass = 'text-sm text-[rgba(212,199,163,0.5)] leading-relaxed';
</script>

<p class="{defaultClass} {className}" data-dialog-description="">
	{#if children}
		{@render children()}
	{/if}
</p>


