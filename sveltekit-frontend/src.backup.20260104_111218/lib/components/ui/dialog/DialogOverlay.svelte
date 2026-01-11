<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { DialogOverlayProps } from './types';

	interface Props extends DialogOverlayProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		forceMount = false,
	}: Props = $props();

	const dialogContext = getContext<{ open: boolean; close: () => void }>('dialog');

	function handleClick() {
		dialogContext?.close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			dialogContext?.close();
		}
	}

	const defaultClass = 'fixed inset-0 z-50 bg-black/80';
</script>

{#if dialogContext?.open || forceMount}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="{defaultClass} {className}"
		transition:fade={{ duration: 150 }}
		onclick={handleClick}
		onkeydown={handleKeydown}
		role="button"
		tabindex="0"
		aria-label="Close dialog"
		data-state={dialogContext?.open ? 'open' : 'closed'}
		data-dialog-overlay=""
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
