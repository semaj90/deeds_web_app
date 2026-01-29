<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import ToastItem from './Toast.svelte';
	import type { Toast, ToastContext, ToastProviderProps } from './types';

	interface Props extends ToastProviderProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		position = 'bottom-right',
		duration = 5000,
		children,
	}: Props = $props();

	let toasts = $state<Toast[]>([]);

	function generateId(): string {
		return Math.random().toString(36).substring(2, 9);
	}

	function addToast(toast: Omit<Toast, 'id'>): string {
		const id = generateId();
		const newToast: Toast = {
			id: duration,
			variant: 'default',
			...toast,
		};
		toasts = [...toasts, newToast];

		// Auto-remove after duration
		if (newToast.duration && newToast.duration > 0) {
			setTimeout(() => {
				removeToast(id);
			}, newToast.duration);
		}

		return id;
	}

	function removeToast(id: string) {
		toasts = toasts.filter(t => t.id !== id);
	}

	function clearAll() {
		toasts = [];
	}

	const context: ToastContext = {
		get toasts() { return toasts; },
		addToast: removeToast,
		clearAll,
	};

	setContext<ToastContext>('toast', context);

	const positionClass = $derived(() => {
		switch (position) {
			case 'top-left': return 'top-4 left-4';
			case 'top-right': return 'top-4 right-4';
			case 'top-center': return 'top-4 left-1/2 -translate-x-1/2';
			case 'bottom-left': return 'bottom-4 left-4';
			case 'bottom-right': return 'bottom-4 right-4';
			case 'bottom-center': return 'bottom-4 left-1/2 -translate-x-1/2';
			default: return 'bottom-4 right-4';
		}
	});

	const containerClass = `
		fixed z-[100] flex flex-col gap-2 w-full max-w-sm
	`.replace(/\s+/g, ' ').trim();
</script>

{#if children}
	{@render children()}
{/if}

<div class="{containerClass} {positionClass()} {className}">
	{#each toasts as toast (toast.id)}
		<ToastItem
			{...toast}
			onClose={() => removeToast(toast.id)}
		/>
	{/each}
</div>


