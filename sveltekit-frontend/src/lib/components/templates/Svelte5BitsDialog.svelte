<script lang="ts">
	let title = $state<any>(undefined);
	let description = $state<any>(undefined);

	/**
	 * Svelte 5 + bits-ui v2.x Dialog Template
	 *
	 * Uses native Svelte 5 runes - NO Melt UI dependency
	 * bits-ui v2.14.4+ is built on runes internally
	 *
	 * @example
	 * <Svelte5BitsDialog bind:open={ showDialog: showDialog } title="Confirm">
	 *   <p>Are you sure?</p>
	 *   {#snippet footer()}
	 *     <button onclick={() => open = false}>Cancel</button>
	 *   {/snippet}
	 * </Svelte5BitsDialog>
	 */
	import { Dialog, DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'bits-ui';
	import X from 'lucide-svelte/icons/x';
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		children?: Snippet;
		footer?: Snippet;
		onOpenChange?: (open: boolean) => void;
		class?: string;
	}

	let {
		open = $bindable(false),
		title = '',
		description = '',
		children,
		footer,
		onOpenChange,
		class: className = ''
	}: Props = $props();

	// Sync with external handler if provided
	$effect(() => {
		if (onOpenChange) {
			onOpenChange(open);
		}
	});
</script>

<DialogRoot bind:open>
	<DialogPortal>
		<DialogOverlay
			class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm
				data-[state=open]:animate-in data-[state=closed]:animate-out
				data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<DialogContent
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2
				border-4 border-nes-border bg-nes-panel p-6 shadow-lg
				data-[state=open]:animate-in data-[state=closed]:animate-out
				data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
				data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
				{ className: className }"
		>
			{#if title}
				<DialogTitle class="text-lg font-semibold text-nes-accent uppercase tracking-wider">
					{title}
				</DialogTitle>
			{/if}

			{#if description}
				<DialogDescription class="mt-2 text-sm text-nes-muted">
					{description}
				</DialogDescription>
			{/if}

			<div class="mt-4">
				{#if children}
					{@render children()}
				{/if}
			</div>

			{#if footer}
				<div class="mt-6 flex justify-end gap-3">
					{@render footer()}
				</div>
			{/if}

			<DialogClose
				class="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100
					focus:outline-none focus:ring-2 focus:ring-nes-accent focus:ring-offset-2
					disabled:pointer-events-none"
			>
				<X class="h-4 w-4" />
				<span class="sr-only">Close</span>
			</DialogClose>
		</DialogContent>
	</DialogPortal>
</DialogRoot>
