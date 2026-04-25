<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { CommandContext, CommandItemProps } from './types';

	interface Props extends CommandItemProps {
		children?: Snippet;
	}

	let {
		value = '',
		disabled = false,
		onSelect,
		class: className = '',
		children,
	}: Props = $props();

	const commandContext = getContext<CommandContext>('command');

	let textContent = $state('');
	let element: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (element) {
			textContent = element.textContent || '';
			commandContext?.registerItem(value, textContent);
		}

		return () => {
			commandContext?.unregisterItem(value);
		};
	});

	function handleClick() {
		if (!disabled) {
			commandContext?.setSelectedValue(value);
			onSelect?.();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !disabled) {
			event.preventDefault();
			handleClick();
		}
	}

	const isSelected = $derived(commandContext?.selectedValue === value);
	const isVisible = $derived(commandContext?.isItemVisible(value, textContent) ?? true);
</script>

{#if isVisible}
	<div
		bind:this={element}
		role="option"
		aria-selected={isSelected}
		data-disabled={disabled || undefined}
		tabindex={disabled ? -1 : 0}
		onclick={handleClick}
		onkeydown={handleKeydown}
		class="cmd-item {className}"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}

<style>
	.cmd-item {
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
	.cmd-item:hover,
	.cmd-item[aria-selected="true"] {
		background: rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.95);
	}
	.cmd-item[data-disabled] {
		pointer-events: none;
		opacity: 0.4;
	}
</style>
