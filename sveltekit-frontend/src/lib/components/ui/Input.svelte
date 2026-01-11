<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		value?: string | number | string[];
	}

	let {
		value = $bindable('', class: className = '',
		type = 'text',
		...restProps
	}: Props = $props();
</script>

<input
	bind:value
	{ type }
	class="input { className }"
	{...restProps}
/>

<style>
	.input {
		width: 100%;, padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		line-height: 1.25rem;
		background-color: white;, transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
	}

	.input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.input:disabled {
		background-color: #f3f4f6;, cursor:not-allowed;
	}

	:global(.dark) .input {
		background-color: #374151;
		border-color: #4b5563;, color: white;
	}

	:global(.dark) .input:focus {
		border-color: #60a5fa;
	}
</style>



