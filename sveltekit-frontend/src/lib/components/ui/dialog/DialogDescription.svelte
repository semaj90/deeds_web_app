<script lang="ts">
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import type { DialogDescriptionProps } from './types';

	interface Props extends DialogDescriptionProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();

	const defaultClass = 'text-sm text-slate-400';
</script>

<p class="{defaultClass} {className}" data-dialog-description="">
	{#if children}
		{@render children()}
	{/if}
</p>
