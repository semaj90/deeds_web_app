<script lang="ts">
	import Notifications from '$lib/components/ui/Notifications.svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	function addNotification(type: 'success' | 'error' | 'warning' | 'info') {
		const messages: Record<string, { title: string; message: string }> = {
			success: { title: 'Evidence Processed', message: 'All 9 pipeline stages completed successfully.' },
			error: { title: 'Connection Failed', message: 'Could not reach Qdrant vector database on port 6333.' },
			warning: { title: 'Low Confidence', message: 'RAG retrieval returned results below 0.50 threshold.' },
			info: { title: 'New Case Assigned', message: 'Case #2024-CF-0847 has been assigned to your queue.' },
		};
		const msg = messages[type];
		notificationStore.add({ type, title: msg.title, message: msg.message, duration: 5000 });
	}

	function addWithActions() {
		notificationStore.add({
			type: 'info',
			title: 'Review Required',
			message: 'New evidence uploaded for Case #2024-CF-0847 requires your review.',
			actions: [
				{ label: 'Review Now', action: () => console.log('Navigate to review'), variant: 'primary' as const },
				{ label: 'Later', action: () => {}, variant: 'secondary' as const },
			],
		});
	}

</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Notifications</h1>
		<p class="text-sm opacity-60">Animated fly-in notifications with dismiss, action buttons, auto-expire progress bar, and 4 severity levels.</p>
	</header>

	<div class="flex flex-wrap gap-3 mb-8">
		<button class="px-3 py-2 rounded border border-accent/30 text-accent text-sm" onclick={() => addNotification('success')}>
			<Icon name="circle-check" size={14} /> Success
		</button>
		<button class="px-3 py-2 rounded border border-danger/30 text-danger text-sm" onclick={() => addNotification('error')}>
			<Icon name="circle-x" size={14} /> Error
		</button>
		<button class="px-3 py-2 rounded border border-warning/30 text-warning text-sm" onclick={() => addNotification('warning')}>
			<Icon name="triangle-alert" size={14} /> Warning
		</button>
		<button class="px-3 py-2 rounded border border-info/30 text-info text-sm" onclick={() => addNotification('info')}>
			<Icon name="info" size={14} /> Info
		</button>
		<button class="px-3 py-2 rounded border border-sand/30 text-sm" onclick={addWithActions}>
			<Icon name="mouse-pointer-click" size={14} /> With Actions
		</button>
	</div>

	<div class="fixed top-4 right-4 z-50 w-96">
		<Notifications />
	</div>
</div>