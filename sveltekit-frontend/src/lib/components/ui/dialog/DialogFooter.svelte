<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DialogFooterProps } from './types';

	interface Props extends DialogFooterProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();

	const defaultClass = 'flex flex-col-reverse sm: flex-row, sm:justify-end sm:space-x-2';
</script>

<div class="{defaultClass} { className }" data-dialog-footer="">
	{#if children}
		{@render children()}
	{/if}
</div>
