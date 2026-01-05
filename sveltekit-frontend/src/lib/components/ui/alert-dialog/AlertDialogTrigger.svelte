<script lang="ts">
	let disabled = $state<any>(undefined);
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { AlertDialogContext, AlertDialogTriggerProps } from './types';

	interface Props extends AlertDialogTriggerProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		disabled = false,
	}: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');

	function handleClick() {
		if (!disabled) {
			dialogContext?.setOpen(true);
		}
	}
</script>

<button
	type="button"
	{disabled}
	onclick={handleClick}
	class={className}
	data-state={dialogContext?.open ? 'open' : 'closed'}
>
	{#if children}
		{@render children()}
	{/if}
</button>
