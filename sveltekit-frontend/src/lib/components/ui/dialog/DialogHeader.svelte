<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DialogHeaderProps } from './types';

	interface Props extends DialogHeaderProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();

	const defaultClass = 'flex flex-col space-y-1.5 text-center sm:text-left';
</script>

<div class="{defaultClass} {className}" data-dialog-header="">
	{#if children}
		{@render children()}
	{/if}
</div>


