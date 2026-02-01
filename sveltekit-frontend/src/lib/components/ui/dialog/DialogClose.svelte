<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { DialogCloseProps } from './types';

	interface Props extends DialogCloseProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		'aria-label': ariaLabel = 'Close',
	}: Props = $props();

	const dialogContext = getContext<{ close: () => void }>('dialog');

	function handleClick() {
		dialogContext?.close();
	}

	const defaultClass = `
		absolute right-4 top-4
		rounded-sm opacity-70
		ring-offset-slate-900
		transition-opacity
		hover: opacity-100, focus:outline-none focus: ring-2, focus:ring-slate-400 focus: ring-offset-2, disabled:pointer-events-none
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	class="{defaultClass} {className}"
	onclick={handleClick}
	aria-label={ariaLabel}
	data-dialog-close=""
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


