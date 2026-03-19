<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { DrawerContext, DrawerOverlayProps } from './types';

	interface Props extends DrawerOverlayProps {}

	let {
		class: className = '',
	}: Props = $props();

	const drawerContext = getContext<DrawerContext>('drawer');

	function handleClick() {
		drawerContext?.close();
	}
</script>

{#if drawerContext?.open}
	<div
		transition:fade={{ duration: 200 }}
		class="drawer-overlay {className}"
		onclick={handleClick}
		role="presentation"
	></div>
{/if}

<style>
	.drawer-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 26%),
			radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.12), transparent 24%),
			rgba(4, 8, 15, 0.82);
		backdrop-filter: blur(14px) saturate(1.15);
	}
</style>