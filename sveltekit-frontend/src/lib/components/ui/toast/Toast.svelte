<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { ToastProps } from './types';

	interface Props extends ToastProps {}

	let {
		id,
		title = '',
		description = '',
		variant = 'default',
		action,
		class: className = '',
		onClose,
	}: Props = $props();

	function handleClose() {
		onClose?.();
	}

	const variantClass = $derived.by(() => {
		switch (variant) {
			case 'success':
				return 'border-accent bg-accent/5 text-accent dark:bg-accent/10 dark:text-accent/20';
			case 'error':
				return 'border-danger bg-danger/5 text-danger dark:bg-danger/10 dark:text-danger/20';
			case 'warning':
				return 'border-warning bg-warning/5 text-warning dark:bg-warning/20';
			case 'info':
				return 'border-info bg-info/5 text-info dark:bg-info/10 dark:text-info/20';
			default:
				return 'border-border bg-background text-foreground';
		}
	});

	const baseClass = `
		pointer-events-auto relative flex w-full items-center justify-between
		space-x-4 overflow-hidden rounded-md border p-4 pr-8 shadow-lg
	`.replace(/\s+/g, ' ').trim();

	const closeButtonClass = `
		absolute right-2 top-2 rounded-md p-1 opacity-70 ring-offset-background
		transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
	`.replace(/\s+/g, ' ').trim();
</script>

<div
	transition:fly={{ x: 100, duration: 200 }}
	class="{baseClass} {variantClass} {className}"
	role="alert"
>
	<div class="flex-1">
		{#if title}
			<div class="text-sm font-semibold">{title}</div>
		{/if}
		{#if description}
			<div class="text-sm opacity-90">{description}</div>
		{/if}
	</div>

	{#if action}
		<button
			type="button"
			onclick={action.onClick}
			class="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
		>
			{action.label}
		</button>
	{/if}

	<button
		type="button"
		onclick={handleClose}
		class={closeButtonClass}
		aria-label="Close"
	>
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
		>
			<line x1="18" y1="6" x2="6" y2="18"></line>
			<line x1="6" y1="6" x2="18" y2="18"></line>
		</svg>
	</button>
</div>
