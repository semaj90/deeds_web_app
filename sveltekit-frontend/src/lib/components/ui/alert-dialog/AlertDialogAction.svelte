<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { AlertDialogActionProps, AlertDialogContext } from './types';

	interface Props extends AlertDialogActionProps {
		children?: Snippet;
		onclick?: () => void;
	}

	let {
		children,
		class: className = '',
		variant = 'default',
		onclick,
	}: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');

	function handleClick() {
		onclick?.();
		dialogContext?.close();
	}

	let variantClass = $derived(
		variant === 'destructive' ? 'alert-btn-destructive' : ''
	);
</script>

<button
	type="button"
	onclick={handleClick}
	class="alert-btn {variantClass} {className}"
>
	{#if children}
		{@render children()}
	{/if}
</button>

<style>
	.alert-btn {
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
		border: 1px solid rgba(212, 199, 163, 0.15);
		background: rgba(212, 199, 163, 0.1);
		color: rgba(212, 199, 163, 0.85);
	}
	.alert-btn:hover {
		background: rgba(212, 199, 163, 0.15);
		border-color: rgba(212, 199, 163, 0.2);
	}
	.alert-btn:focus-visible {
		outline: 2px solid rgba(96, 165, 250, 0.5);
		outline-offset: 2px;
	}
	.alert-btn:disabled {
		pointer-events: none;
		opacity: 0.5;
	}
	:global(.alert-btn-destructive) {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.25);
		color: rgba(252, 165, 165, 0.9);
	}
	:global(.alert-btn-destructive:hover) {
		background: rgba(239, 68, 68, 0.25);
		border-color: rgba(239, 68, 68, 0.35);
	}
</style>