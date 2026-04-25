<script lang="ts">
	import { notificationStore, type Toast } from '$lib/stores/unified/notification-store.svelte';
	import X from '@lucide/svelte/icons/x';
	import { fly } from 'svelte/transition';

	const alertClasses: Record<Toast['type'], string> = {
		info: 'bg-info/10 border-info text-info',
		success: 'bg-accent/10 border-accent text-accent',
		warning: 'bg-warning/10 border-warning text-warning',
		error: 'bg-danger/10 border-danger text-danger'
	};

	// Toasts auto-dismiss via the store's built-in duration handling
	// No need for manual timers here
</script>

<div class="fixed bottom-4 right-4 z-50 w-80 space-y-3">
	{#each notificationStore.toasts as toast (toast.id)}
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
				class:text-info={toast.type === 'info'}
				class:text-accent={toast.type === 'success'}
				class:text-warning={toast.type === 'warning'}
				class:text-danger={toast.type === 'error'}
				aria-label="Dismiss alert"
			>
				<X class="h-5 w-5" />
			</button>
		</div>
	{/each}
</div>


