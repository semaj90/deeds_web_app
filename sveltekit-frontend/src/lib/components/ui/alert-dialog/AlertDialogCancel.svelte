<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { AlertDialogCancelProps, AlertDialogContext } from './types';

	interface Props extends AlertDialogCancelProps {
		children?: Snippet;
		onclick?: () => void;
	}

	let {
		children,
		class: className = '',
		onclick,
	}: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');

	function handleClick() {
		onclick?.();
		dialogContext?.close();
	}
</script>

<button
	type="button"
	onclick={handleClick}
	class="alert-cancel {className}"
	aria-label="Cancel"
>
	{#if children}
		{@render children()}
	{:else}
		Cancel
	{/if}
</button>

<style>
	.alert-cancel {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 2.5rem;
		padding: 0 1rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		border: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(212, 199, 163, 0.04);
		color: rgba(212, 199, 163, 0.6);
	}
	.alert-cancel:hover {
		background: rgba(212, 199, 163, 0.08);
		border-color: rgba(212, 199, 163, 0.15);
		color: rgba(212, 199, 163, 0.85);
	}
	.alert-cancel:focus-visible {
		outline: 2px solid rgba(96, 165, 250, 0.5);
		outline-offset: 2px;
	}
	.alert-cancel:disabled {
		pointer-events: none;
		opacity: 0.5;
	}
</style>
