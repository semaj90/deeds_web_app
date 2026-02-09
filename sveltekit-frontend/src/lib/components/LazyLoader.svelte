<script lang="ts">
	import type { LazyComponentState } from '$lib/utils/intersection-observer.js';
	import type { Snippet } from 'svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

	interface Props {
		preset?: string;
		placeholderHeight?: string;
		placeholderClass?: string;
		loadingText?: string;
		errorText?: string;
		class?: string;
		onLoad?: () => void | Promise<void>;
		lazyState?: LazyComponentState;
		children?: Snippet;
		placeholder?: Snippet;
	}

	let {
		preset = 'DEFAULT',
		placeholderHeight = '200px',
		placeholderClass = '',
		loadingText = 'Loading...',
		errorText = 'Failed to load',
		class: className = '',
		onLoad,
		lazyState = $bindable(),
		children,
		placeholder
	}: Props = $props();

	let containerRef: HTMLDivElement | null = $state(null);
	let isVisible = $state(false);
	let isLoaded = $state(false);
	let hasError = $state(false);

	$effect(() => {
		if (!containerRef) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && !isVisible) {
						isVisible = true;
						loadContent();
					}
				}
			},
	{ rootMargin: '100px', threshold: 0.1 }
		);

		observer.observe(containerRef);

		return () => observer.disconnect();
	});

	async function loadContent() {
		if (isLoaded) return;

		try {
			if (onLoad) {
				await onLoad();
			}
			isLoaded = true;
			if (lazyState) {
				lazyState = { ...lazyState, isLoaded: true, isVisible: true };
			}
		} catch (e) {
			hasError = true;
			console.error('LazyLoader error:', e);
		}
	}
</script>

<div bind:this={containerRef} class="lazy-loader {className}">
	{#if hasError}
		<div class="lazy-error" style="min-height: {placeholderHeight}">
			<p>{errorText}</p>
		</div>
	{:else if isLoaded && isVisible}
		{#if children}
			{@render children()}
		{/if}
	{:else}
		<div class="lazy-placeholder {placeholderClass}" style="min-height: {placeholderHeight}">
			{#if placeholder}
				{@render placeholder()}
			{:else}
				<div class="lazy-loading">
					<span class="spinner"></span>
					<span>{loadingText}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.lazy-loader {
		position: relative;
	}

	.lazy-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
	background: rgba(0, 0, 0, 0.02);
		border-radius: 8px;
	}

	.lazy-loading {
		display: flex;
		align-items: center;
	gap: 8px;
		color: #666;
	}

	.spinner { width: 20px;
		height: 20px;
		border: 2px solid #ddd;
		border-top-color: #666;
		border-radius: 50%;
	animation: spin 1s linear infinite;
	}

	.lazy-error {
		display: flex;
		align-items: center;
		justify-content: center;
	background: #fee;
		border-radius: 8px;
	color: #c00;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
