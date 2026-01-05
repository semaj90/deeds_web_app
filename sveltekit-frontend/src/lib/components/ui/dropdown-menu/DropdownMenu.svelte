<script lang="ts" module>
	let triggerClass = $state<any>(undefined);
	let contentClass = $state<any>(undefined);

	// Re-export sub-components for compound component pattern
	export { default as Content } from './DropdownMenuContent.svelte';
	export { default as Item } from './DropdownMenuItem.svelte';
	export { default as Root } from './DropdownMenuRoot.svelte';
	export { default as Separator } from './DropdownMenuSeparator.svelte';
	export { default as Trigger } from './DropdownMenuTrigger.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import DropdownMenuContent from './DropdownMenuContent.svelte';
	import DropdownMenuItem from './DropdownMenuItem.svelte';
	import DropdownMenuRoot from './DropdownMenuRoot.svelte';
	import DropdownMenuTrigger from './DropdownMenuTrigger.svelte';
	import type { DropdownMenuRootProps } from './types';

	/**
	 * Convenient all-in-one DropdownMenu component
	 * For more control, use the individual sub-components (DropdownMenu.Root, DropdownMenu.Content, etc.)
	 */
	interface MenuItem {
		label: string;
		onclick?: () => void;
		disabled?: boolean;
		variant?: 'default' | 'destructive';
		separator?: boolean;
	}

	interface Props extends DropdownMenuRootProps {
		children?: Snippet;
		triggerContent?: Snippet;
		items?: MenuItem[];
		triggerClass?: string;
		contentClass?: string;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		children,
		triggerContent,
		items = [],
		class: className = '',
		triggerClass = '',
		contentClass = '',
	}: Props = $props();
</script>

<DropdownMenuRoot bind:open { onOpenChange } class={ className }>
	<DropdownMenuTrigger class={triggerClass}>
		{#if triggerContent}
			{@render triggerContent()}
		{:else}
			<span>Menu</span>
		{/if}
	</DropdownMenuTrigger>
	<DropdownMenuContent class={contentClass}>
		{#if items.length > 0}
			{#each items as item, i}
				{#if item.separator}
					<div role="separator" class="-mx-1 my-1 h-px bg-muted"></div>
				{:else}
					<DropdownMenuItem
						onclick={item.onclick}
						disabled={item.disabled}
						variant={item.variant}
					>
						{item.label}
					</DropdownMenuItem>
				{/if}
			{/each}
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</DropdownMenuContent>
</DropdownMenuRoot>
