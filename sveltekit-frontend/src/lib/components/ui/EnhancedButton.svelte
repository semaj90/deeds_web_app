<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Component, Snippet } from 'svelte';
	// Migrated to $effect
	import { buttonVariants, type ButtonVariantProps } from './button-variants';

	interface Props {
		variant?: ButtonVariantProps['variant'];
		size?: ButtonVariantProps['size'];
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		href?: string;
		target?: string;
		loading?: boolean;
		loadingText?: string;
		class?: string;
		useBits?: boolean;
		ariaLabel?: string;
		onclick?: (evt: MouseEvent) => void;
		children?: Snippet;
	}

	let {
		variant = 'default',
		size = 'default',
		disabled = false,
		type = 'button',
		href = undefined,
		target = undefined,
		loading = false,
		loadingText = 'Loading...',
		class: className = '',
		useBits = false,
		ariaLabel = undefined,
		onclick,
		children
	}: Props = $props();

	let isDisabled = $derived(disabled || loading);
	let buttonClass = $derived(cn(buttonVariants({ variant, size }), className));

	let BitsComponent = $state<Component | null>(null);

	$effect(() => {
  (async () => {

		if (useBits) {
			try {
				const { getBitsNamespace } = await import('$lib/utils/bits-ui-adapter');
				const ns = await getBitsNamespace();
				BitsComponent = ns.Button?.Root ?? ns.Button ?? null;
			} catch {
				BitsComponent = null;
			}
		}
	
  })();
});

	function handleClick(evt: MouseEvent) {
		if (isDisabled) {
			evt.preventDefault();
			evt.stopImmediatePropagation();
			return;
		}
		onclick?.(evt);
	}
</script>

{#if useBits && BitsComponent && !href}
	<svelte:component
		this={BitsComponent}
		class={buttonClass}
		disabled={isDisabled}
		{type}
		aria-label={ariaLabel}
		onclick={handleClick}
	>
		{#if loading}
			<span class="loader" aria-hidden="true"></span>
			<span>{loadingText}</span>
		{:else if children}
			{@render children()}
		{/if}
	</svelte:component>
{:else if href}
	<a
		{href}
		{target}
		class={buttonClass}
		role="button"
		aria-disabled={isDisabled}
		onclick={handleClick}
	>
		{#if loading}
			<span class="loader" aria-hidden="true"></span>
			<span>{loadingText}</span>
		{:else if children}
			{@render children()}
		{/if}
	</a>
{:else}
	<button
		{type}
		class={buttonClass}
		disabled={isDisabled}
		aria-label={ariaLabel}
		onclick={handleClick}
	>
		{#if loading}
			<span class="loader" aria-hidden="true"></span>
			<span>{loadingText}</span>
		{:else if children}
			{@render children()}
		{/if}
	</button>
{/if}

<style>
	.loader {
		display: inline-block;
		margin-right: 0.5rem;
	width: 1rem;
		height: 1rem;
	border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
	animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	:global([data-variant='yorha']) {
		position: relative;
	overflow: hidden;
	}
</style>
