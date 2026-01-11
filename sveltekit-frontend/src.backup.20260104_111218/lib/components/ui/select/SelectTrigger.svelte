<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { SelectContext, SelectTriggerProps } from './types';

	interface Props extends SelectTriggerProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		disabled = false,
	}: Props = $props();

	const selectContext = getContext<SelectContext>('select');

	const isDisabled = $derived(disabled || selectContext?.disabled);

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		if (!isDisabled) {
			selectContext?.toggle();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (!isDisabled) {
				selectContext?.toggle();
			}
		}
	}

	const defaultClass = `
		flex h-10 w-full items-center justify-between rounded-md
		border border-input bg-background px-3 py-2 text-sm
		ring-offset-background placeholder:text-muted-foreground
		focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
		disabled:cursor-not-allowed disabled:opacity-50
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	role="combobox"
	aria-expanded={selectContext?.open}
	aria-controls="select-listbox"
	aria-haspopup="listbox"
	disabled={isDisabled}
	onclick={handleClick}
	onkeydown={handleKeydown}
	class="{defaultClass} {className}"
	data-state={selectContext?.open ? 'open' : 'closed'}
>
	{#if children}
		{@render children()}
	{:else}
		<span class="text-muted-foreground">Select...</span>
	{/if}

	<!-- Chevron icon -->
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="ml-2 h-4 w-4 shrink-0 opacity-50"
	>
		<path d="m6 9 6 6 6-6" />
	</svg>
</button>
