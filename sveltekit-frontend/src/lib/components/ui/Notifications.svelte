<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { quintOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { notifications, type Notification } from '../../stores/notification';

	const colorClasses: Record<string, string> = {
		success: 'bg-accent/5 border-accent/20 text-accent',
		error: 'bg-danger/5 border-danger/20 text-danger',
		warning: 'bg-warning/5 border-warning/20 text-warning',
		info: 'bg-info/5 border-info/20 text-info',
	};

	const iconNames: Record<string, string> = {
		success: 'circle-check',
		error: 'circle-x',
		warning: 'triangle-alert',
		info: 'info',
	};

	function handleClose(notification: Notification) {
		(notifications as any).remove?.(notification.id);
	}

	function handleAction(
		notification: Notification,
		action: NonNullable<Notification['actions']>[0]
	) {
		try {
			action?.action?.();
		} catch (err) {
			console.error('notification action failed', err);
		} finally {
			(notifications as any).remove?.(notification.id);
		}
	}
</script>

<div class="space-y-4">
	{#each $notifications.notifications as notification (notification.id)}
		<div
			class="relative p-4 rounded-lg border shadow-lg backdrop-blur-sm {colorClasses[notification.type ?? 'info']}"
			in:fly={{ x: 300, duration: 300, easing: quintOut }}
			out:fly={{ x: 300, duration: 200, easing: quintOut }}
		>
			<div class="flex gap-3">
				<div class="flex-shrink-0">
					<Icon name={iconNames[notification.type ?? 'info']} size={20} />
				</div>

				<div class="flex-1">
					<p class="font-semibold">{notification.title}</p>

					{#if notification.message}
						<p class="text-sm">{notification.message}</p>
					{/if}

					{#if notification.actions && notification.actions.length > 0}
						<div class="mt-3 flex gap-2">
							{#each notification.actions as action}
								<Button
									size="sm"
									variant={action.variant ?? 'secondary'}
									onclick={() => handleAction(notification, action)}
								>
									{action.label}
								</Button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="ml-2">
					<button
						type="button"
						class="inline-flex items-center gap-2 px-2 py-1 rounded text-sm"
						onclick={() => handleClose(notification)}
						aria-label="Dismiss notification"
					>
						<span>Dismiss</span>
						<Icon name="x" size={14} />
					</button>
				</div>
			</div>

			{#if notification.duration && notification.duration > 0}
				<div class="mt-3 h-1 bg-sand/10 rounded">
					<div
						class="h-full bg-info"
						style="animation: shrink {notification.duration}ms linear forwards;"
					></div>
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	@keyframes shrink {
		from { width: 100%; }
		to { width: 0%; }
	}
</style>