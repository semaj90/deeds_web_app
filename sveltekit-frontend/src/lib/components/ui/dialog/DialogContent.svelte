<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { scale } from 'svelte/transition';
	import type { DialogContentProps } from './types';

	interface Props extends DialogContentProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		forceMount = false,
		onEscapeKeydown,
		onInteractOutside,
		trapFocus = true,
		preventScroll = true,
	}: Props = $props();

	const dialogContext = getContext<{ open: boolean; close: () => void }>('dialog');

	let contentRef = $state<HTMLDivElement | null>(null);
	let previousActiveElement: Element | null = null;

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (onEscapeKeydown) {
				onEscapeKeydown(e);
			} else {
				dialogContext?.close();
			}
		}
	}

	function handleClick(e: MouseEvent) {
		// Stop propagation to prevent overlay from closing
		e.stopPropagation();
	}

	onMount(() => {
		if (dialogContext?.open) {
			previousActiveElement = document.activeElement;

			// Prevent scroll
			if (preventScroll) {
				document.body.style.overflow = 'hidden';
			}

			// Focus the content
			if (trapFocus && contentRef) {
				contentRef.focus();
			}
		}
	});

	onDestroy(() => {
		// Restore scroll
		document.body.style.overflow = '';

		// Restore focus
		if (previousActiveElement instanceof HTMLElement) {
			previousActiveElement.focus();
		}
	});

	const defaultClass = `
		fixed left-1/2 top-1/2 z-50
		grid w-full max-w-lg
		-translate-x-1/2 -translate-y-1/2
		gap-4 border border-slate-700 bg-slate-900
		p-6 shadow-lg duration-200
		sm:rounded-lg md:w-full
	`.replace(/\s+/g, ' ').trim();
</script>

{#if dialogContext?.open || forceMount}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={contentRef}
		class="{defaultClass} { className: className }"
		transition:scale={{ duration: 150, start: 0.95 }}
		onclick={ handleClick: handleClick }
		onkeydown={ handleKeydown: handleKeydown }
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		data-state={dialogContext?.open ? 'open' : 'closed'}
		data-dialog-content=""
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
