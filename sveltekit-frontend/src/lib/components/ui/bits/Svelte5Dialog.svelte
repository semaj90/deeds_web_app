<script lang="ts">
	let title = $state<any>(undefined);
	let description = $state<any>(undefined);

/**
 * Svelte 5 Bits-UI Dialog Component
 *
 * Features:
 * - Svelte 5 runes ($props, $state, $bindable)
 * - bits-ui v2 headless dialog
 * - UnoCSS-style utility classes
 * - HTML <dialog> fallback for SSR
 * - Accessible by default (ESC to close, focus trap)
 */
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'bits-ui';

interface DialogProps {
	open?: boolean;
	title?: string;
	description?: string;
	size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
	variant?: 'default' | 'nes' | 'glass';
	closeOnOutsideClick?: boolean;
	closeOnEscape?: boolean;
	class?: string;
	onOpenChange?: (open: boolean) => void;
	children?: import('svelte').Snippet;
	trigger?: import('svelte').Snippet;
	footer?: import('svelte').Snippet;
}

let {
	open = $bindable(false),
	title = '',
	description = '',
	size = 'md',
	variant = 'nes',
	closeOnOutsideClick = true,
	closeOnEscape = true,
	class: className = '',
	onOpenChange,
	children,
	trigger,
	footer
}: DialogProps = $props();

// Reactive animation state
let isAnimating = $state(false);
let contentRef = $state<HTMLElement | null>(null);

// Size classes
let sizeClasses = $derived({
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
	xl: 'max-w-xl',
	full: 'max-w-full mx-4'
}[size]);

// Variant classes (UnoCSS-style)
let variantClasses = $derived({
	default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl',
	nes: 'bg-gray-900 border-4 border-white shadow-[4px_4px_0_0_#000] font-["Press_Start_2P",monospace]',
	glass: 'bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl'
}[variant]);

// Combined overlay classes
let overlayClasses = $derived([
	'fixed inset-0 z-50',
	'bg-black/50 backdrop-blur-sm',
	'flex items-center justify-center',
	'p-4'
].join(' '));

// Combined content classes
let contentClasses = $derived([
	'relative w-full',
	'rounded-lg',
	'p-6',
	'transform transition-all duration-200',
	isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100',
	sizeClasses,
	variantClasses,
	className
].filter(Boolean).join(' '));

function handleOpenChange(newOpen: boolean) {
	if (newOpen !== open) {
		isAnimating = true;
		setTimeout(() => {
			open = newOpen;
			isAnimating = false;
			onOpenChange?.(newOpen);
		}, 150);
	}
}

function handleClose() {
	handleOpenChange(false);
}
</script>

<!-- Trigger slot -->
{#if trigger}
	<Dialog.Trigger asChild>
		{@render trigger()}
	</Dialog.Trigger>
{/if}

<!-- Dialog Portal -->
<DialogRoot bind:open onOpenChange={ handleOpenChange }>
	<DialogPortal>
		<!-- Overlay with blur -->
		<DialogOverlay class={overlayClasses} />

		<!-- Content -->
		<DialogContent
			bind:ref={contentRef}
			class={contentClasses}
			onInteractOutside={(e) => !closeOnOutsideClick && e.preventDefault()}
			onEscapeKeyDown={(e) => !closeOnEscape && e.preventDefault()}
		>
			<!-- Close button -->
			<DialogClose
				class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
					   text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white
					   rounded-md hover:bg-gray-100 dark:hover:bg-gray-700
					   transition-colors duration-150"
				aria-label="Close dialog"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</DialogClose>

			<!-- Header -->
			{#if title || description}
				<div class="mb-4">
					{#if title}
						<DialogTitle class="text-lg font-bold text-white mb-1">
							{title}
						</DialogTitle>
					{/if}
					{#if description}
						<DialogDescription class="text-sm text-gray-400">
							{description}
						</DialogDescription>
					{/if}
				</div>
			{/if}

			<!-- Content -->
			<div class="dialog-content">
				{#if children}
					{@render children()}
				{:else}
					<slot />
				{/if}
			</div>

			<!-- Footer -->
			{#if footer}
				<div class="mt-6 flex justify-end gap-3">
					{@render footer()}
				</div>
			{/if}
		</DialogContent>
	</DialogPortal>
</DialogRoot>

<style>
	/* NES.css dialog fallback styles */
	:global(.nes-dialog) {
		position: fixed;
		padding: 1.5rem;
		border: 4px solid #fff;
		background: #212529;
		color: #fff;
		image-rendering: pixelated;
	}

	:global(.nes-dialog::backdrop) {
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
	}

	/* Glass morphism variant */
	:global(.glass-dialog) {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 1rem;
	}
</style>
