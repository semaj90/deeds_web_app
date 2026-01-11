<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		open?: boolean;
		onClose?: () => void;
		title?: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
		closeOnOverlayClick?: boolean;
		closeOnEscape?: boolean;
		showCloseButton?: boolean;
		class?: string;
		children?: Snippet;
		footer?: Snippet;
	}

	let {
		open = $bindable(false),
		onClose,
		title = '',
		description = '',
		size = 'md',
		closeOnOverlayClick = true,
		closeOnEscape = true,
		showCloseButton = true,
		class: className = '',
		children,
		footer,
	}: Props = $props();

	function close() {
		open = false;
		onClose?.();
	}

	function handleOverlayClick() {
		if (closeOnOverlayClick) {
			close();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && closeOnEscape && open) {
			event.preventDefault();
			close();
		}
	}

	function handleContentClick(event: Event) {
		event.stopPropagation();
	}

	const sizeClass = $derived(() => {
		switch (size) {
			case 'sm': return 'max-w-sm';
			case 'md': return 'max-w-md';
			case 'lg': return 'max-w-lg';
			case 'xl': return 'max-w-xl';
			case 'full': return 'max-w-full mx-4';
			default: return 'max-w-md';
		}
	});

	const overlayClass = `
		fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4
	`.replace(/\s+/g, ' ').trim();

	const contentClass = `
		relative w-full bg-background rounded-lg shadow-lg
		border border-border p-6 max-h-[90vh] overflow-auto
	`.replace(/\s+/g, ' ').trim();

	const headerClass = `
		flex flex-col space-y-1.5 text-center sm:text-left mb-4
	`.replace(/\s+/g, ' ').trim();

	const titleClass = `
		text-lg font-semibold leading-none tracking-tight
	`.replace(/\s+/g, ' ').trim();

	const descriptionClass = `
		text-sm text-muted-foreground
	`.replace(/\s+/g, ' ').trim();

	const closeButtonClass = `
		absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background
		transition-opacity hover: opacity-100, focus:outline-none focus: ring-2, focus:ring-ring focus:ring-offset-2
	`.replace(/\s+/g, ' ').trim();

	const footerClass = `
		flex flex-col-reverse sm: flex-row, sm:justify-end sm:space-x-2 mt-4
	`.replace(/\s+/g, ' ').trim();

	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleOverlayClick();
		}
	}
</script>

<svelte:window onkeydown={ handleKeydown } />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		transition: fade={{ duration: 150 }}
		class={overlayClass}
		onclick={ handleOverlayClick }
		onkeydown={ handleOverlayKeydown }
		tabindex="-1"
		role="presentation"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			transition: scale={{ duration: 150, start: 0.95 }}
			class="{contentClass} {sizeClass()} { className }"
			onclick={ handleContentClick }
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? 'modal-title' : undefined}
			tabindex="-1"
		>
			{#if showCloseButton}
				<button
					type="button"
					onclick={close}
					class={closeButtonClass}
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4"
					>
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			{/if}

			{#if title || description}
				<div class={headerClass}>
					{#if title}
						<h2 id="modal-title" class={titleClass}>{title}</h2>
					{/if}
					{#if description}
						<p class={descriptionClass}>{description}</p>
					{/if}
				</div>
			{/if}

			{#if children}
				{@render children()}
			{/if}

			{#if footer}
				<div class={footerClass}>
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}



