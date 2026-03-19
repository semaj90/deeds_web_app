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

	const dialogContext = getContext<{ open: boolean;
	close: () => void }>('dialog');

	function handleClick() {
		dialogContext?.close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			dialogContext?.close();
		}
	}

</script>

{#if dialogContext?.open ?? forceMount}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="dlg-overlay {className}"
		transition:fade={{ duration: 200 }}
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

<style>
	.dlg-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 26%),
			radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.12), transparent 24%),
			rgba(4, 8, 15, 0.82);
		backdrop-filter: blur(14px) saturate(1.15);
	}
</style>




