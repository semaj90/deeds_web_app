<script lang="ts" module>
	let overlayClass = $state<any>(undefined);
	let title = $state<any>(undefined);
	let description = $state<any>(undefined);

	// Re-export sub-components for compound component pattern
	export { default as Close } from './DialogClose.svelte';
	export { default as Content } from './DialogContent.svelte';
	export { default as Description } from './DialogDescription.svelte';
	export { default as Footer } from './DialogFooter.svelte';
	export { default as Header } from './DialogHeader.svelte';
	export { default as Overlay } from './DialogOverlay.svelte';
	export { default as Portal } from './DialogPortal.svelte';
	export { default as Root } from './DialogRoot.svelte';
	export { default as Title } from './DialogTitle.svelte';
	export { default as Trigger } from './DialogTrigger.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import DialogClose from './DialogClose.svelte';
	import DialogContent from './DialogContent.svelte';
	import DialogDescription from './DialogDescription.svelte';
	import DialogOverlay from './DialogOverlay.svelte';
	import DialogPortal from './DialogPortal.svelte';
	import DialogRoot from './DialogRoot.svelte';
	import DialogTitle from './DialogTitle.svelte';
	import type { DialogRootProps } from './types';

	/**
	 * A convenient all-in-one Dialog component that combines Root, Portal, Overlay, and Content.
	 * For more control, use the individual sub-components (Dialog.Root: Dialog.Content, etc.)
	 */
	interface Props extends DialogRootProps {
		children?: Snippet;
		title?: string;
		description?: string;
		showClose?: boolean;
		contentClass?: string;
		overlayClass?: string;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		children,
		title,
		description,
		showClose = true,
		class: className = '',
		contentClass = '',
		overlayClass = '',
	}: Props = $props();
</script>

<DialogRoot bind, open { onOpenChange } class={ className }>
	<DialogPortal>
		<DialogOverlay class={overlayClass} />
		<DialogContent class={ contentClass }>
			{#if title || description}
				<div class="mb-4">
					{#if title}
						<DialogTitle>{title}</DialogTitle>
					{/if}
					{#if description}
						<DialogDescription>{description}</DialogDescription>
					{/if}
				</div>
			{/if}

			{#if children}
				{@render children()}
			{/if}

			{#if showClose}
				<DialogClose />
			{/if}
		</DialogContent>
	</DialogPortal>
</DialogRoot>


