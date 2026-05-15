<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Toast {
		id: string;
		message: string;
		type: 'success' | 'info' | 'warning' | 'error';
		duration?: number;
	}

	interface Props {
		toasts?: Toast[];
	}

	let { toasts = $bindable([]) }: Props = $props();

	function removeToast(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function addToast(message: string, type: Toast['type'] = 'info', duration = 3000) {
		const id = crypto.randomUUID();
		const toast: Toast = { id, message, type, duration };
		toasts = [...toasts, toast];

		if (duration > 0) {
			setTimeout(() => removeToast(id), duration);
		}

		return id;
	}

	// Expose addToast for parent components
	const api = {
		success: (message: string, duration?: number) => addToast(message, 'success', duration),
		info: (message: string, duration?: number) => addToast(message, 'info', duration),
		warning: (message: string, duration?: number) => addToast(message, 'warning', duration),
		error: (message: string, duration?: number) => addToast(message, 'error', duration)
	};

	// Make api accessible to parent
	export { api as toast };
</script>

<div class="toast-container">
	{#each toasts as toast (toast.id)}
		<div class="toast toast-{toast.type}" role="alert">
			<div class="toast-icon">
				{#if toast.type === 'success'}
					<Icon name="check-circle" />
				{:else if toast.type === 'info'}
					<Icon name="info" />
				{:else if toast.type === 'warning'}
					<Icon name="alert-triangle" />
				{:else if toast.type === 'error'}
					<Icon name="alert-circle" />
				{/if}
			</div>
			<div class="toast-message">{toast.message}</div>
			<button
				type="button"
				class="toast-close"
				onclick={() => removeToast(toast.id)}
				aria-label="Dismiss"
			>
				<Icon name="x" />
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 10000;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 400px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		animation: slideInRight 0.3s cubic-bezier(0.22, 1, 0.36, 1);
		pointer-events: auto;
		backdrop-filter: blur(12px);
	}

	@keyframes slideInRight {
		from {
			opacity: 0;
			transform: translateX(100%);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.toast-icon {
		display: flex;
		flex-shrink: 0;
	}

	.toast-success {
		background: rgba(22, 163, 74, 0.15);
		border-color: rgba(34, 197, 94, 0.5);
		color: #86efac;
	}

	.toast-info {
		background: rgba(59, 130, 246, 0.15);
		border-color: rgba(96, 165, 250, 0.5);
		color: #93c5fd;
	}

	.toast-warning {
		background: rgba(245, 158, 11, 0.15);
		border-color: rgba(251, 191, 36, 0.5);
		color: #fcd34d;
	}

	.toast-error {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(248, 113, 113, 0.5);
		color: #fca5a5;
	}

	.toast-message {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.5;
	}

	.toast-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 0.25rem;
		background: transparent;
		border: none;
		color: currentColor;
		opacity: 0.6;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.toast-close:hover {
		opacity: 1;
		background: rgba(0, 0, 0, 0.2);
	}
</style>
