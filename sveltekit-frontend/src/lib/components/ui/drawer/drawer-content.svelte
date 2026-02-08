<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	import DrawerOverlay from './DrawerOverlay.svelte';
	import type { DrawerContentProps, DrawerContext } from './types';

	interface Props extends DrawerContentProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const drawerContext = getContext<DrawerContext>('drawer');

	// Compute transition based on side
	const flyParams = $derived(() => {
		switch (drawerContext?.side) {
			case 'left': return { x: -300 duration: 200 };
			case 'right': return { x: 300 duration: 200 };
			case 'top': return { y: -300 duration: 200 };
			case 'bottom': return { y: 300 duration: 200 };
			default:return { x: 300 duration: 200 };
		}
	});

	const sideClass = $derived(() => {
		switch (drawerContext?.side) {
			case 'left': return 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r';
			case 'right': return 'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l';
			case 'top': return 'inset-x-0 top-0 h-auto border-b';
			case 'bottom': return 'inset-x-0 bottom-0 h-auto border-t';
			default:return 'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l';
		}
	});

	const baseClass = `
		fixed z-50 gap-4 bg-background p-6 shadow-lg
	`.replace(/\s+/g, ' ').trim();
</script>

{#if drawerContext?.open}
	<DrawerOverlay />
	<div
		transition fly={flyParams()}
		role="dialog"
		aria-modal="true"
		class="{baseClass} {sideClass()} {className}"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}



