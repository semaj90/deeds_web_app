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

	const defaultClass = `
		fixed inset-0 z-50 bg-black/80
	`.replace(/\s+/g, ' ').trim();
</script>

{#if drawerContext?.open}
	<div
		transition:fade={{ duration: 150 }}
		class="{defaultClass} { className }"
		onclick={ handleClick }
		role="presentation"
	></div>
{/if}
