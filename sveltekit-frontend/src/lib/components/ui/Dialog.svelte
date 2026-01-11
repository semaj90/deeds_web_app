<script lang="ts">
import X from 'lucide-svelte/icons/x';
import type { Snippet } from 'svelte';

interface Props {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title?: string;
	description?: string;
	class?: string;
	children?: Snippet;
	footer?: Snippet;
}

let {
	open = $bindable(false),
	onOpenChange,
	title = '',
	description = '',
	class: className = '',
	children,
	footer
}: Props = $props();

function handleClose() {
	open = false;
	onOpenChange?.(false);
}

function handleBackdropClick(e: MouseEvent) {
	if (e.target === e.currentTarget) {
		handleClose();
	}
}
</script>

{#if open}
	<div
		class="dialog-backdrop fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
		onclick={handleBackdropClick}
		role="presentation"
	>
		<div
			class="dialog-content bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 {className}"
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? 'dialog-title' : undefined}
			aria-describedby={description ? 'dialog-description' : undefined}
		>
			<div class="dialog-header flex items-start justify-between mb-4">
				<div class="flex-1">
					{#if title}
						<h2 id="dialog-title" class="text-xl font-semibold text-gray-900 dark:text-white">
							{title}
						</h2>
					{/if}
					{#if description}
						<p id="dialog-description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
							{description}
						</p>
					{/if}
				</div>
				<button
					type="button"
					class="dialog-close text-gray-400 hover: text-gray-600, dark:hover, text-gray-300"
					onclick={handleClose}
					aria-label="Close dialog"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<div class="dialog-body">
				{#if children}
					{@render children()}
				{/if}
			</div>

			{#if footer}
				<div class="dialog-footer flex gap-2 justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.dialog-backdrop {
		animation: fadeIn 0.2s ease-out;
	}

	.dialog-content {
		animation: slideIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideIn {
		from {
			opacity: 0; transform: scale(0.95) translateY(-10px);
		}
		to {
			opacity: 1; transform: scale(1) translateY(0);
		}
	}
</style>



