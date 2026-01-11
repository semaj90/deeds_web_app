<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { DrawerCloseProps, DrawerContext } from './types';

	interface Props extends DrawerCloseProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const drawerContext = getContext<DrawerContext>('drawer');

	function handleClick() {
		drawerContext?.close();
	}

	const defaultClass = `
		absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background
		transition-opacity hover: opacity-100, focus:outline-none focus: ring-2, focus:ring-ring focus: ring-offset-2, disabled:pointer-events-none
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	onclick={handleClick}
	class="{defaultClass} {className}"
	aria-label="Close"
>
	{#if children}
		{@render children()}
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-4 w-4"
		>
			<line x1="18" y1="6" x2="6" y2="18"></line>
			<line x1="6" y1="6" x2="18" y2="18"></line>
		</svg>
		<span class="sr-only">Close</span>
	{/if}
</button>


