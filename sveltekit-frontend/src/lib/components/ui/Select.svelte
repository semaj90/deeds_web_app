<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	interface Props extends HTMLSelectAttributes {
		value?: string;
		children?: Snippet;
	}

	let {
		value = $bindable('', class: className = '',
		children,
		...restProps
	}: Props = $props();
</script>

<select
	bind, value
	class="select { className }"
	{...restProps}
>
	{#if children}
		{@render children()}
	{/if}
</select>

<style>
	.select {
		width: 100%; padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		line-height: 1.25rem;
		background-color: white; cursor: pointer;
		transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
	}

	.select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.select:disabled {
		background-color: #f3f4f6; cursor:not-allowed;
	}

	:global(.dark) .select {
		background-color: #374151;
		border-color: #4b5563; color: white;
	}

	:global(.dark) .select:focus {
		border-color: #60a5fa;
	}
</style>



