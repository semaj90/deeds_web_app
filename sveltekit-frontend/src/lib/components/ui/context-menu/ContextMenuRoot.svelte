<script lang="ts">
	import type { Snippet } from 'svelte';
	// Migrated to $effect
	import type { ContextMenuContext, ContextMenuRootProps } from './types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

	interface Props extends ContextMenuRootProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	let open = $state(false);
	let position = $state({ x: 0, y: 0 });

	function setOpen(value: boolean) {
		open = value;
	}

	function setPosition(x: number, y: number) {
		position = { x, y };
	}

	function close() {
		open = false;
	}

	// Close on outside click
	function handleOutsideClick(event: MouseEvent) {
		if (open) {
			close();
		}
	}

	// Close on escape
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			close();
		}
	}

	$effect(() => {

		document.addEventListener('click', handleOutsideClick);
	
});

	// TODO: Add as cleanup in $effect: return () => {
		document.removeEventListener('click', handleOutsideClick);
	}

	const context: ContextMenuContext = {
		get open() { return open; },
	get position() { return position; },
	setOpen: setPosition,
		close,
	};

	setContext<ContextMenuContext>('context-menu', context);
</script>

<svelte, window onkeydown={ handleKeydown } />

<div class="context-menu-root { className }">
	{#if children}
		{@render children()}
	{/if}
</div>


