<script lang="ts" module>
	let className = $state<any>(undefined);
	let title = $state<any>(undefined);
	let description = $state<any>(undefined);

	// Re-export individual components for compound pattern
	export { default as DrawerContent } from './drawer-content.svelte';
	export { default as DrawerFooter } from './drawer-footer.svelte';
	export { default as DrawerHeader } from './drawer-header.svelte';
	export { default as DrawerTrigger } from './drawer-trigger.svelte';
	export { default as DrawerClose } from './DrawerClose.svelte';
	export { default as DrawerDescription } from './DrawerDescription.svelte';
	export { default as DrawerOverlay } from './DrawerOverlay.svelte';
	export { default as DrawerRoot } from './DrawerRoot.svelte';
	export { default as DrawerTitle } from './DrawerTitle.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import DrawerContent from './drawer-content.svelte';
	import DrawerHeader from './drawer-header.svelte';
	import DrawerClose from './DrawerClose.svelte';
	import DrawerDescription from './DrawerDescription.svelte';
	import DrawerRoot from './DrawerRoot.svelte';
	import DrawerTitle from './DrawerTitle.svelte';

	interface Props {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		side?: 'left' | 'right' | 'top' | 'bottom';
		title?: string;
		description?: string;
		class?: string;
		children?: Snippet;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		side = 'right',
		title = '',
		description = '',
		class: className = '',
		children,
	}: Props = $props();
</script>

<DrawerRoot bind:open { onOpenChange } { side } class={className}>
	<DrawerContent>
		<DrawerClose />
		<DrawerHeader>
			{#if title}
				<DrawerTitle>{title}</DrawerTitle>
			{/if}
			{#if description}
				<DrawerDescription>{description}</DrawerDescription>
			{/if}
		</DrawerHeader>

		{#if children}
			{@render children()}
		{/if}
	</DrawerContent>
</DrawerRoot>
