<script lang="ts">
	let className = $state<any>(undefined);

/**
 * Svelte 5 Popover Component
 * Native HTML with Svelte 5 runes and accessible floating panel
 */
import type { Snippet } from 'svelte';

interface Props {
	open?: boolean;
	position?: 'top' | 'bottom' | 'left' | 'right';
	align?: 'start' | 'center' | 'end';
	closeOnOutsideClick?: boolean;
	closeOnEscape?: boolean;
	class?: string;
	onOpenChange?: (open: boolean) => void;
	children?: Snippet;
	trigger?: Snippet;
	content?: Snippet;
}

let {
	open = $bindable(false),
	position = 'bottom',
	align = 'center',
	closeOnOutsideClick = true,
	closeOnEscape = true,
	class: className = '',
	onOpenChange,
	children,
	trigger,
	content
}: Props = $props();

let popoverRef = $state<HTMLDivElement | null>(null);
let triggerRef = $state<HTMLButtonElement | null>(null);

// Position classes
let positionClasses = $derived(() => {
	const positions = {
		top: 'bottom-full mb-2',
		bottom: 'top-full mt-2',
		left: 'right-full mr-2',
		right: 'left-full ml-2'
	};

	const alignments = {
		start: position === 'top' || position === 'bottom' ? 'left-0' : 'top-0',
		center: position === 'top' || position === 'bottom' ? 'left-1/2 -translate-x-1/2' : 'top-1/2 -translate-y-1/2',
		end: position === 'top' || position === 'bottom' ? 'right-0' : 'bottom-0'
	};

	return `${positions[position]} ${alignments[align]}`;
});

function toggle() {
	open = !open;
	onOpenChange?.(open);
}

function close() {
	open = false;
	onOpenChange?.(false);
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape' && closeOnEscape) {
		close();
		triggerRef?.focus();
	}
}

function handleClickOutside(e: MouseEvent) {
	if (!closeOnOutsideClick) return;

	const target = e.target as Node;
	if (popoverRef && !popoverRef.contains(target) && triggerRef && !triggerRef.contains(target)) {
		close();
	}
}

$effect(() => {
	if (open) {
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
	}

	return () => {
		document.removeEventListener('click', handleClickOutside);
		document.removeEventListener('keydown', handleKeydown);
	};
});
</script>

<div class="relative inline-block {className}">
	<!-- Trigger -->
	<button
		bind:this={triggerRef}
		type="button"
		class="inline-flex items-center justify-center"
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={toggle}
	>
		{#if trigger}
			{@render trigger()}
		{:else if children}
			{@render children()}
		{/if}
	</button>

	<!-- Popover Content -->
	{#if open}
		<div
			bind:this={popoverRef}
			class="absolute z-50 {positionClasses()}
				   w-72 p-4
				   bg-slate-800 text-white
				   border border-slate-600 rounded-lg shadow-xl
				   animate-in fade-in-0 zoom-in-95 duration-150"
			role="dialog"
			aria-modal="false"
		>
			{#if content}
				{@render content()}
			{/if}
		</div>
	{/if}
</div>

<style>
	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes zoom-in {
		from { transform: scale(0.95) translateX(-50%); }
		to { transform: scale(1) translateX(-50%); }
	}

	.animate-in {
		animation: fade-in 0.15s ease-out;
	}
</style>
