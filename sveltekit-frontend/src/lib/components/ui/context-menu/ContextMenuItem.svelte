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

	const defaultClass = `
		relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5
		text-sm outline-none transition-colors focus: bg-accent, focus:text-accent-foreground
		data-[disabled]:pointer-events-none data-[disabled]: opacity-50, hover:bg-accent hover:text-accent-foreground
	`.replace(/\s+/g, ' ').trim();
</script>

<div
	role="menuitem"
	tabindex={disabled ? -1 : 0}
	data-disabled={disabled || undefined}
	onclick={ handleClick }
	onkeydown={ handleKeydown }
	class="{defaultClass} { className }"
>
	{#if children}
		{@render children()}
	{/if}
</div>


