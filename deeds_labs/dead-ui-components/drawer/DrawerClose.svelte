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
</script>

<button
	type="button"
	onclick={handleClick}
	class="drawer-close {className}"
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
			<path d="M18 6L6 18"></path>
			<path d="M6 6L18 18"></path>
		</svg>
		<span class="sr-only">Close</span>
	{/if}
</button>

<style>
	.drawer-close {
		position: absolute;
		right: 1.25rem;
		top: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.625rem;
		color: rgba(212, 199, 163, 0.4);
		background: rgba(212, 199, 163, 0.04);
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.drawer-close:hover {
		color: rgba(212, 199, 163, 0.85);
		background: rgba(212, 199, 163, 0.08);
		border-color: rgba(212, 199, 163, 0.1);
	}
	.drawer-close:focus-visible {
		outline: 2px solid rgba(96, 165, 250, 0.5);
		outline-offset: 2px;
	}
</style>