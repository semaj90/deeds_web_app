<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
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

	const dialogContext = getContext<{ open: boolean, close: () => void }>('dialog');

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
		e.stopPropagation();
	}

	$effect(() => {
		if (dialogContext?.open) {
			previousActiveElement = document.activeElement;
			if (preventScroll) {
				document.body.style.overflow = 'hidden';
			}
			if (trapFocus && contentRef) {
				contentRef.focus();
			}
		}

		return () => {
			document.body.style.overflow = '';
			if (previousActiveElement instanceof HTMLElement) {
				previousActiveElement.focus();
			}
		};
	});
</script>

{#if dialogContext?.open ?? forceMount}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={contentRef}
		class="dlg-content {className}"
		transition:scale={{
			duration: 180,
			start: 0.96
		}}
		onclick={handleClick}
		onkeydown={handleKeydown}
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

<style>
	.dlg-content {
		position: fixed;
		left: 50%;
		top: 50%;
		z-index: 50;
		display: grid;
		width: calc(100% - 2rem);
		max-width: 32rem;
		transform: translate(-50%, -50%);
		gap: 1.25rem;
		padding: 1.75rem;
		overflow: hidden;
		border-radius: var(--shell-radius-curve, 26px 26px 18px 18px / 22px 22px 30px 30px);
		background: linear-gradient(180deg, rgba(19, 27, 42, 0.96) 0%, rgba(8, 12, 20, 0.98) 100%);
		border: 1px solid var(--shell-border, rgba(120, 160, 220, 0.18));
		box-shadow:
			0 0 0 1px rgba(126, 231, 255, 0.04),
			0 28px 56px -18px rgba(0, 0, 0, 0.72),
			0 0 72px rgba(0, 0, 0, 0.36),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(20px) saturate(1.18);
		color: var(--shell-text, rgba(233, 240, 255, 0.88));
	}

	.dlg-content::before {
		content: '';
		position: absolute;
		inset: 0 1.5rem auto;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(126, 231, 255, 0.82), rgba(255, 212, 121, 0.6), transparent);
		pointer-events: none;
	}

	.dlg-content::after {
		content: '';
		position: absolute;
		inset: 1px;
		border-radius: calc(var(--shell-radius-lg, 24px) - 4px);
		border: 1px solid rgba(255, 255, 255, 0.04);
		pointer-events: none;
	}

	@media (min-width: 640px) {
		.dlg-content {
			width: 100%;
			max-width: 32rem;
		}
	}
</style>
