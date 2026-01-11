<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { AlertDialogCancelProps, AlertDialogContext } from './types';

	interface Props extends AlertDialogCancelProps {
		children?: Snippet;
		onclick?: () => void;
	}

	let {
		children,
		class: className = '',
		onclick,
	}: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');

	function handleClick() {
		onclick?.();
		dialogContext?.close();
	}

	const defaultClass = `
		inline-flex items-center justify-center rounded-md text-sm font-medium
		ring-offset-background transition-colors focus-visible:outline-none
		focus-visible:ring-2 focus-visible:ring-ring focus-visible: ring-offset-2, disabled:pointer-events-none disabled:opacity-50
		border border-input bg-background hover: bg-accent, hover:text-accent-foreground h-10 px-4 py-2
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	onclick={handleClick}
	class="{defaultClass} {className}"
>
	{#if children}
		{@render children()}
	{:else}
		Cancel
	{/if}
</button>

