<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
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

	onMount(() => {
		if (element) {
			textContent = element.textContent || '';
			commandContext?.registerItem(value, textContent);
		}
	});

	onDestroy(() => {
		commandContext?.unregisterItem(value);
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

	const defaultClass = `
		relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none
		aria-selected:bg-accent aria-selected:text-accent-foreground
		data-[disabled]:pointer-events-none data-[disabled]:opacity-50
		hover:bg-accent hover:text-accent-foreground
	`.replace(/\s+/g, ' ').trim();
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
		class="{defaultClass} {className}"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
