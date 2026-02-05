<script lang="ts">
	import { X } from '$lib/components/icons';
	import type { Alert } from '$lib/stores/alerts';
	import { alerts, removeAlert } from '$lib/stores/alerts';
	import { fly } from 'svelte/transition';

	const alertClasses: Record<Alert['type'], string> = {
		info: 'bg-blue-100 border-blue-500 text-blue-700',
		success: 'bg-green-100 border-green-500 text-green-700',
		warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
		error: 'bg-red-100 border-red-500 text-red-700'
	};

	const alertTimers = new Map<string, ReturnType<typeof setTimeout>>();

	$effect(() => {
		if ($alerts) {
			const currentAlertIds = new Set($alerts.map((alert) => alert.id));

			for (const [id, timer] of alertTimers.entries()) {
				if (!currentAlertIds.has(id)) {
					clearTimeout(timer);
					alertTimers.delete(id);
				}
			}

			$alerts.forEach((alert) => {
				if (alert.timeout !== 0 && !alertTimers.has(alert.id)) {
					const timer = setTimeout(() => {
						removeAlert(alert.id);
						alertTimers.delete(alert.id);
					}, alert.timeout || 5000);
					alertTimers.set(alert.id, timer);
				}
			});
		}

		return () => {
			for (const timer of alertTimers.values()) {
				clearTimeout(timer);
			}
			alertTimers.clear();
		};
	});
</script>

<div class="fixed bottom-4 right-4 z-50 w-80 space-y-3">
	{#each $alerts as alert (alert.id)}
		<div
			class={`p-4 border-l-4 rounded shadow-lg flex items-center justify-between ${alertClasses[alert.type]}`}
			transition:fly={{ y: 20, duration: 300 }}
		>
			<p class="flex-grow">{alert.message}</p>
			<button
				onclick={() => removeAlert(alert.id)}
				class="ml-4 p-1 rounded-full hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-offset-2"
				class:text-blue-800={alert.type === 'info'}
				class:text-green-800={alert.type === 'success'}
				class:text-yellow-800={alert.type === 'warning'}
				class:text-red-800={alert.type === 'error'}
				aria-label="Dismiss alert"
			>
				<X class="h-5 w-5" />
			</button>
		</div>
	{/each}
</div>


