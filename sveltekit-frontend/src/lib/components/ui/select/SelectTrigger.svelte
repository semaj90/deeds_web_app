<script lang="ts">
	import { cn } from '$lib';
	import { Select } from 'bits-ui';

	let {
		disabled = false,
		class: className = '',
		children,
		...rest
	} = $props();
</script>

<Select.Trigger
	{disabled}
	class={cn(
		'flex h-10 w-full items-center justify-between rounded-md border border-sand/30 bg-panel px-3 py-2 text-sm text-white ring-offset-background placeholder:text-sand/50 focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
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
</Select.Trigger>
