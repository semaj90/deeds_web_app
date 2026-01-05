<script lang="ts">
	let disabled = $state<any>(undefined);
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { DropdownMenuContext, DropdownMenuTriggerProps } from './types';

	interface Props extends DropdownMenuTriggerProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		disabled = false,
		asChild = false,
	}: Props = $props();

	const menuContext = getContext<DropdownMenuContext>('dropdown-menu');

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		if (!disabled) {
			menuContext?.toggle();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && !disabled) {
			e.preventDefault();
			menuContext?.setOpen(true);
		}
	}
</script>

<button
	type="button"
	aria-haspopup="menu"
	aria-expanded={menuContext?.open}
	{disabled}
	onclick={handleClick}
	onkeydown={handleKeydown}
	class="inline-flex items-center justify-center {className}"
	data-state={menuContext?.open ? 'open' : 'closed'}
>
	{#if children}
		{@render children()}
	{/if}
</button>
