<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { ContextMenuContext, ContextMenuItemProps } from './types';

	interface Props extends ContextMenuItemProps {
		children?: Snippet;
	}

	let {
		value = '',
		disabled = false,
		onSelect,
		class: className = '',
		children,
	}: Props = $props();

	const menuContext = getContext<ContextMenuContext>('context-menu');

	function handleClick() {
		if (!disabled) {
			onSelect?.();
			menuContext?.close();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
			event.preventDefault();
			handleClick();
		}
	}
</script>

<div
	role="menuitem"
	tabindex={disabled ? -1 : 0}
	data-disabled={disabled || undefined}
	onclick={handleClick}
	onkeydown={handleKeydown}
	class="ctx-item {className}"
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.ctx-item {
		position: relative;
		display: flex;
		cursor: default;
		user-select: none;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		font-size: 0.8125rem;
		border-radius: 0.5rem;
		outline: none;
		transition: all 0.1s ease;
		color: rgba(212, 199, 163, 0.75);
	}
	.ctx-item:hover,
	.ctx-item:focus {
		background: rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.95);
	}
	.ctx-item[data-disabled] {
		pointer-events: none;
		opacity: 0.4;
	}
</style>