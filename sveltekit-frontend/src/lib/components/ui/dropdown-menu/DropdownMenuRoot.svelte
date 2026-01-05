<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, setContext } from 'svelte';
	import type { DropdownMenuContext, DropdownMenuRootProps } from './types';

	interface Props extends DropdownMenuRootProps {
		children?: Snippet;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		children,
		class: className = '',
	}: Props = $props();

	// Close on outside click
	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-dropdown-menu-root]')) {
			open = false;
			onOpenChange?.(false);
		}
	}

	// Close on escape
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = false;
			onOpenChange?.(false);
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
  
	setContext<DropdownMenuContext>('dropdown-menu', {
		get open() { return open; },
		setOpen: (isOpen: boolean) => {
			open = isOpen;
			onOpenChange?.(isOpen);
		},
		toggle: () => {
			open = !open;
			onOpenChange?.(open);
		},
		close: () => {
			open = false;
			onOpenChange?.(false);
		},
	});
</script>

<div
	class="relative inline-block {className}"
	data-dropdown-menu-root
	data-state={open ? 'open' : 'closed'}
>
	{#if children}
		{@render children()}
	{/if}
</div>
