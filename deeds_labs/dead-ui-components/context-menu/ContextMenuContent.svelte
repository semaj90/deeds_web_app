<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { scale } from 'svelte/transition';
	import type { ContextMenuContentProps, ContextMenuContext } from './types';

	interface Props extends ContextMenuContentProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const menuContext = getContext<ContextMenuContext>('context-menu');

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
	}

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();
	}
</script>

{#if menuContext?.open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		transition:scale={{ duration: 120, start: 0.96 }}
		class="ctx-content {className}"
		style="left: {menuContext.position.x}px; top: {menuContext.position.y}px;"
		onclick={handleClick}
		onkeydown={handleKeydown}
		role="menu"
		tabindex="-1"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}

<style>
	.ctx-content {
		position: fixed;
		z-index: 50;
		min-width: 10rem;
		overflow: hidden;
		padding: 0.375rem;
		border-radius: 0.875rem;
		background: rgba(22, 21, 18, 0.97);
		border: 1px solid rgba(212, 199, 163, 0.1);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.25),
			0 12px 32px -4px rgba(0, 0, 0, 0.55),
			0 0 48px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(212, 199, 163, 0.04);
		backdrop-filter: blur(16px) saturate(1.2);
		color: rgba(212, 199, 163, 0.85);
	}
</style>