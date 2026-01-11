<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { DialogTriggerProps } from './types';

	interface Props extends DialogTriggerProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		disabled = false,
	}: Props = $props();

	const dialogContext = getContext<{ open: boolean; setOpen: (value: boolean) => void }>('dialog');

	function handleClick() {
		if (!disabled) {
			dialogContext?.setOpen(true);
		}
	}

	const defaultClass = `
		inline-flex items-center justify-center
		rounded-md text-sm font-medium
		ring-offset-slate-900
		transition-colors
		focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible: ring-offset-2, disabled:pointer-events-none disabled:opacity-50
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	class="{defaultClass} {className}"
	onclick={handleClick}
	{disabled}
	aria-expanded={dialogContext?.open}
	data-dialog-trigger=""
>
	{#if children}
		{@render children()}
	{/if}
</button>



