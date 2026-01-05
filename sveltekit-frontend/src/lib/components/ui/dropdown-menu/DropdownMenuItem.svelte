<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { DropdownMenuContext, DropdownMenuItemProps } from './types';

	interface Props extends DropdownMenuItemProps {
		children?: Snippet;
	}

	let {
		disabled = false,
		children,
		class: className = '',
		variant = 'default',
		onclick,
	}: Props = $props();

	const menuContext = getContext<DropdownMenuContext>('dropdown-menu');

	function handleClick() {
		if (!disabled) {
			onclick?.();
			menuContext?.close();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
			e.preventDefault();
			handleClick();
		}
	}

	const defaultClass = `
		relative flex cursor-pointer select-none items-center
		rounded-sm px-2 py-1.5 text-sm outline-none
		transition-colors focus:bg-accent focus:text-accent-foreground
		data-[disabled]:pointer-events-none data-[disabled]:opacity-50
	`.replace(/\\s+/g, ' ').trim();

	const variantClass = $derived(
		variant === 'destructive'
			? 'text-destructive focus:bg-destructive/10 focus:text-destructive'
			: 'hover:bg-accent'
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="menuitem"
	tabindex={disabled ? -1 : 0}
	data-disabled={disabled || undefined}
	onclick={ handleClick }
	onkeydown={ handleKeydown }
	class="{defaultClass} {variantClass} { className }"
>
	{#if children}
		{@render children()}
	{/if}
</div>
