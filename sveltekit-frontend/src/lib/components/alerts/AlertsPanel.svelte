<script lang="ts">
	import type { Toast } from '$lib/stores/unified/notification-store';
	import { toasts } from '$lib/stores/unified/notification-store';
	import X from 'lucide-svelte/icons/x';
	import { fly } from 'svelte/transition';

	const alertClasses: Record<Toast['type'], string> = {
		info: 'bg-blue-100 border-blue-500 text-blue-700',
		success: 'bg-green-100 border-green-500 text-green-700',
		warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
		error: 'bg-red-100 border-red-500 text-red-700'
	};

	// Toasts auto-dismiss via the store's built-in duration handling
	// No need for manual timers here
</script>

<div class="fixed bottom-4 right-4 z-50 w-80 space-y-3">
	{#each $toasts as toast (toast.id)}
		<div
			class={`p-4 border-l-4 rounded shadow-lg flex items-center justify-between ${alertClasses[toast.type]}`}
			transition:fly={{ y: 20, duration: 300 }}
		>
			<p class="flex-grow">{toast.message}</p>
			<button
				onclick={() => {
					// Toasts are managed by the store, just for manual dismiss if needed
				}}
				class="ml-4 p-1 rounded-full hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-offset-2"
				class:text-blue-800={toast.type === 'info'}
				class:text-green-800={toast.type === 'success'}
				class:text-yellow-800={toast.type === 'warning'}
				class:text-red-800={toast.type === 'error'}
				aria-label="Dismiss alert"
			>
				<X class="h-5 w-5" />
			</button>
		</div>
	{/each}
</div>


