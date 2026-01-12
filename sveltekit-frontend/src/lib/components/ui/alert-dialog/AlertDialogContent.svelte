<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { scale } from 'svelte/transition';
	import type { AlertDialogContentProps, AlertDialogContext } from './types';

	interface Props extends AlertDialogContentProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		onEscapeKeydown,
	}: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');

	let contentRef = $state<HTMLDivElement | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (onEscapeKeydown) {
				onEscapeKeydown(e);
			}
			// Note: AlertDialog typically doesn't close on Escape
			// This is different from regular Dialog
		}
	}

	onMount(() => {
		if (dialogContext?.open) {
			// Prevent scroll
			document.body.style.overflow = 'hidden';
			// Focus the content
			contentRef?.focus();
		}
	});

	onDestroy(() => {
		document.body.style.overflow = '';
	});

	const defaultClass = `
		fixed left-1/2 top-1/2 z-50
		grid w-full max-w-lg
		-translate-x-1/2 -translate-y-1/2
		gap-4 border bg-background
		p-6 shadow-lg duration-200
		sm:rounded-lg
	`.replace(/\s+/g, ' ').trim();
</script>

{#if dialogContext?.open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={contentRef}
		class="{defaultClass} { className }"
		transition: scale={{ duration: 150, start, 0.95 }}
		onkeydown={ handleKeydown }
		role="alertdialog"
		aria-modal="true"
		tabindex="-1"
		data-state="open"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}



