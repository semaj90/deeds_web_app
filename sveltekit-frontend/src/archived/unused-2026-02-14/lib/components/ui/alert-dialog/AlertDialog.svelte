<script lang="ts" module>
	// Re-export sub-components for compound component pattern
	export { default as Action } from './AlertDialogAction.svelte';
	export { default as Cancel } from './AlertDialogCancel.svelte';
	export { default as Content } from './AlertDialogContent.svelte';
	export { default as Description } from './AlertDialogDescription.svelte';
	export { default as Footer } from './AlertDialogFooter.svelte';
	export { default as Header } from './AlertDialogHeader.svelte';
	export { default as Overlay } from './AlertDialogOverlay.svelte';
	export { default as Portal } from './AlertDialogPortal.svelte';
	export { default as Root } from './AlertDialogRoot.svelte';
	export { default as Title } from './AlertDialogTitle.svelte';
	export { default as Trigger } from './AlertDialogTrigger.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import AlertDialogAction from './AlertDialogAction.svelte';
	import AlertDialogCancel from './AlertDialogCancel.svelte';
	import AlertDialogContent from './AlertDialogContent.svelte';
	import AlertDialogDescription from './AlertDialogDescription.svelte';
	import AlertDialogFooter from './AlertDialogFooter.svelte';
	import AlertDialogHeader from './AlertDialogHeader.svelte';
	import AlertDialogOverlay from './AlertDialogOverlay.svelte';
	import AlertDialogPortal from './AlertDialogPortal.svelte';
	import AlertDialogRoot from './AlertDialogRoot.svelte';
	import AlertDialogTitle from './AlertDialogTitle.svelte';
	import type { AlertDialogRootProps } from './types';

	/**
	 * Convenient all-in-one AlertDialog component
	 * For more control, use the individual sub-components
	 */
	interface Props extends AlertDialogRootProps {
		children?: Snippet;
		title?: string;
		description?: string;
		actionLabel?: string;
		cancelLabel?: string;
		onAction?: () => void;
		onCancel?: () => void;
		variant?: 'default' | 'destructive';
	}

	let {
		open = $bindable(false),
		onOpenChange,
		children,
		title = 'Are you sure?',
		description = 'This action cannot be undone.',
		actionLabel = 'Continue',
		cancelLabel = 'Cancel',
		onAction,
		onCancel,
		class: className = '',
		variant = 'default',
	}: Props = $props();

	function handleCancel() {
		onCancel?.();
	}
</script>

<AlertDialogRoot bind:open { onOpenChange } class={ className }>
	<AlertDialogPortal>
		<AlertDialogOverlay />
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>{title}</AlertDialogTitle>
				<AlertDialogDescription>{description}</AlertDialogDescription>
			</AlertDialogHeader>

			{#if children}
				{@render children()}
			{/if}

			<AlertDialogFooter>
				<AlertDialogCancel onclick={handleCancel}>
					{cancelLabel}
				</AlertDialogCancel>
				<AlertDialogAction onclick={onAction} {variant}>
					{actionLabel}
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialogPortal>
</AlertDialogRoot>


