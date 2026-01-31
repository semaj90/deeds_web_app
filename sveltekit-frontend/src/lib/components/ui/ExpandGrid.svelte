<script lang="ts">
	/**
	 * ExpandGrid - responsive grid that expands column count on hover or focus.
	 * Svelte 5 runes version.
	 */

	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	interface Props {
		columns?: number;
		expandedColumns?: number;
		gap?: string;
		expandDuration?: string;
		easing?: string;
		expandOnHover?: boolean;
		expandOnFocus?: boolean;
		onexpand?: () => void;
		class?: string;
		children?: Snippet;
	}

	let {
		columns = 1,
		expandedColumns = 3,
		gap = '1rem',
		expandDuration = '0.4s',
		easing = 'ease',
		expandOnHover = true,
		expandOnFocus = true,
		onexpand,
		class: className = '',
		children
	}: Props = $props();

	// Guard: ensure expandedColumns is never less than columns
	let effectiveExpandedColumns = $derived(expandedColumns < columns ? columns : expandedColumns);

	let expanded = $state(false);
	let containerElement: HTMLDivElement | null = null;

	const currentColumns = $derived(expanded ? effectiveExpandedColumns : columns);

	function expand() {
		if (!expanded) {
			expanded = true;
			onexpand?.();
		}
	}

	function collapse() {
		if (expanded) {
			expanded = false;
			onexpand?.();
		}
	}

	function handleMouseEnter() {
		if (expandOnHover) expand();
	}

	function handleMouseLeave() {
		if (expandOnHover) collapse();
	}

	function handleFocusIn() {
		if (expandOnFocus) expand();
	}

	function handleFocusOut(e: FocusEvent) {
		if (expandOnFocus && containerElement && !containerElement.contains(e.relatedTarget as Node)) {
			collapse();
		}
	}

	onMount(() => {
		if (!containerElement) return;
		const el = containerElement;

		if (expandOnHover) {
			el.addEventListener('mouseenter', handleMouseEnter);
			el.addEventListener('mouseleave', handleMouseLeave);
		}

		if (expandOnFocus) {
			el.addEventListener('focusin', handleFocusIn);
			el.addEventListener('focusout', handleFocusOut);
		}

		return () => {
			if (expandOnHover) {
				el.removeEventListener('mouseenter', handleMouseEnter);
				el.removeEventListener('mouseleave', handleMouseLeave);
			}
			if (expandOnFocus) {
				el.removeEventListener('focusin', handleFocusIn);
				el.removeEventListener('focusout', handleFocusOut);
			}
		};
	});
</script>

<div
	bind:this={containerElement}
	class="expand-grid {expanded ? 'expanded' : ''} {className}"
	style:--columns={currentColumns}
	style:--gap={gap}
	style:--expand-duration={expandDuration}
	style:--easing={easing}
	role="grid"
	tabindex="0"
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.expand-grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1fr);
		gap: var(--gap);
		transition:
			grid-template-columns var(--expand-duration) var(--easing),
			background-color var(--expand-duration) var(--easing),
			box-shadow var(--expand-duration) var(--easing);
		outline: none;
		border-radius: 0.5rem;
		padding: 0.5rem;
		background: var(--expand-bg, #fff);
		border: 1px solid transparent;
	}

	.expand-grid:focus-visible {
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
	}

	.expand-grid.expanded {
		background: #f8fafc;
		border-color: #e5e7eb;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
	}

	.expand-grid :global(.grid-item) {
		transition:
			transform var(--expand-duration) var(--easing),
			box-shadow var(--expand-duration) var(--easing);
		border-radius: 0.375rem;
		overflow: hidden;
		position: relative;
	}

	.expand-grid.expanded :global(.grid-item) {
		transform: scale(1.015);
	}

	.expand-grid.expanded :global(.grid-item:hover),
	.expand-grid.expanded :global(.grid-item:focus-within) {
		transform: scale(1.035);
		box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.15);
		z-index: 10;
	}

	@media (max-width: 768px) {
		.expand-grid {
			grid-template-columns: 1fr;
		}

		.expand-grid.expanded {
			grid-template-columns: repeat(min(var(--columns), 2), 1fr);
		}
	}

	@media (max-width: 480px) {
		.expand-grid,
		.expand-grid.expanded {
			grid-template-columns: 1fr;
		}
	}
</style>
