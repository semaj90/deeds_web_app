<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import type { DrawerContext, DrawerRootProps } from './types';

	interface Props extends DrawerRootProps {
		children?: Snippet;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		side = 'right',
		class: className = '',
		children,
	}: Props = $props();

	function setOpen(value: boolean) {
		open = value;
		onOpenChange?.(value);
	}

	function close() {
		setOpen(false);
	}

	// Handle escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			close();
		}
	}

	const context: DrawerContext = {
		get open() { return open; },
		get side() { return side; },
		setOpen,
		close,
	};

	setContext<DrawerContext>('drawer', context);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="drawer-root { className }">
	{#if children}
		{@render children()}
	{/if}
</div>


