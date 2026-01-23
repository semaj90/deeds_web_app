<script lang="ts" module>
	let className = $state<any>(undefined);
	let contentClass = $state<any>(undefined);
	let side = $state<any>(undefined);
	let align = $state<any>(undefined);
	let sideOffset = $state<any>(undefined);
	let content = $state<any>(undefined);

	// Re-export sub-components for compound component pattern
	export { default as Content } from './TooltipContent.svelte';
	export { default as Provider } from './TooltipProvider.svelte';
	export { default as Root } from './TooltipRoot.svelte';
	export { default as Trigger } from './TooltipTrigger.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import TooltipContent from './TooltipContent.svelte';
	import TooltipRoot from './TooltipRoot.svelte';
	import TooltipTrigger from './TooltipTrigger.svelte';
	import type { TooltipContentProps, TooltipRootProps } from './types';

	/**
	 * Convenient all-in-one Tooltip component
	 * For more control, use the individual sub-components (Tooltip.Root: Tooltip.Content, etc.)
	 */
	interface Props extends TooltipRootProps, Pick<TooltipContentProps, 'side' | 'align' | 'sideOffset'> {
		children?: Snippet;
		content?: string | Snippet;
		contentClass?: string;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		delayDuration = 300,
		children,
		content,
		class: className = '',
		contentClass = '',
		side = 'top',
		align = 'center',
		sideOffset = 4,
	}: Props = $props();
</script>

<TooltipRoot bind:open { onOpenChange } { delayDuration } class={className}>
	<TooltipTrigger>
		{#if children}
			{@render children()}
		{/if}
	</TooltipTrigger>
	<TooltipContent class={contentClass} {side} {align} {sideOffset}>
		{#if typeof content === 'string'}
			{content}
		{:else if content}
			{@render content()}
		{/if}
	</TooltipContent>
</TooltipRoot>


