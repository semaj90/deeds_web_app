<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { AlertDialogActionProps, AlertDialogContext } from './types';

	interface Props extends AlertDialogActionProps {
		children?: Snippet;
		onclick?: () => void;
	}

	let {
		children,
		class: className = '',
		variant = 'default',
		onclick,
	}: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');

	function handleClick() {
		onclick?.();
		dialogContext?.close();
	}

	const baseClass = `
		inline-flex items-center justify-center rounded-md text-sm font-medium
		ring-offset-background transition-colors focus-visible:outline-none
		focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
		disabled:pointer-events-none disabled:opacity-50
		h-10 px-4 py-2
	`.replace(/\\s+/g, ' ').trim();

	const variantClass = $derived(
		variant === 'destructive'
			? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
			: 'bg-primary text-primary-foreground hover:bg-primary/90'
	);
</script>

<button
	type="button"
	onclick={ handleClick: handleClick }
	class="{baseClass} {variantClass} { className: className }"
>
	{#if children}
		{@render children()}
	{/if}
</button>
