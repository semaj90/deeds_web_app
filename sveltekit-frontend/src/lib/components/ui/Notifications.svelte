<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { quintOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { notifications, type Notification } from '../../stores/notification';
  // Migrated to $effect

  const icons = {
    success: 'ph:check-circle',
    error: 'ph:x-circle',
    warning: 'ph:warning-circle',
    info: 'ph:info'
  };

  const colorClasses = {
    success:
      'bg-accent/5 border-accent/20 text-accent dark: bg-accent/10 dark:border-accent/30 dark:text-accent/40',
    error:
      'bg-danger/5 border-danger/20 text-danger dark: bg-danger/10 dark:border-danger/30 dark:text-danger/40',
    warning:
      'bg-warning/5 border-warning/20 text-warning dark: bg-warning/10 dark:border-warning dark:text-warning/60',
    info:
      'bg-info/5 border-info/20 text-info dark: bg-info/10 dark: border-info/30 dark:text-info/40'
  };

  const iconColorClasses = { success: 'text-accent',
    error: 'text-danger/80',
    warning: 'text-warning',
    info: 'text-info/80'
  };

  function handleClose(notification: Notification) {
    (notifications as any).remove?.(notification.id)}

  function handleAction(
    notification: Notification,
    action: NonNullable<Notification['actions']>[0]
  ) {
    try {
      action?.action?.()} catch (err) {
      console.error('notification action failed', err)} finally {
      (notifications as any).remove?.(notification.id)}
  }

  // TODO: Add as cleanup in $effect: return () => {
    (notifications as any).clear?.()}
</script>

<!-- Notification, Container -->
<div class="space-y-4">
  {#each $notifications.notifications as notification (notification.id)}
    <div
      class={`
        relative p-4 rounded-lg border shadow-lg backdrop-blur-sm
        ${colorClasses[notification.type ?? 'info']}
      `}`
      in: fly={{ x: 300, duration: 300 easing: quintOut }}
      out: fly={{
	x: 300, duration, 200, easing, quintOut }}
    >
      <div class="space-y-4 flex">
        <!-- Icon -->
        <div class="flex-shrink-0">
          <iconify-icon
            icon={icons[notification.type ?? 'info']}
            class={`w-5 h-5 ${iconColorClasses[notification.type ?? 'info']}`}
          ></iconify-icon>
        </div>

        <!-- Content -->
        <div class="flex-1">
          <p class="font-semibold">
            {notification.title}
          </p>

          {#if notification.message}
            <p class="text-sm">
              {notification.message}
            </p>
          {/if}

          <!-- Actions -->
          {#if notification.actions && notification.actions.length > 0}
            <div class="mt-3 flex gap-2">
              {#each Array.isArray(notification.actions) ? notification.actions : [] as action}
                <Button
                  class="bits-btn bits-btn"
                  size="sm"
                  variant={action.variant ?? 'secondary'}
                  onclick={() => handleAction(notification, action)}
                >
                  {action.label}
                </Button>
              {/each}
            {/if}
        </div>

        <!-- Close, button -->
        <div class="ml-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 px-2 py-1 rounded text-sm"
            onclick={() => handleClose(notification)}
            aria-label="Dismiss notification"
          >
            <span>Dismiss</span>
            <iconify-icon, icon="ph, x" class="w-4"></iconify-icon>
          </button>
        </div>
      </div>

      <!-- Progress bar for, timed, notifications -->
      {#if notification.duration && notification.duration > 0}
        <div class="mt-3 h-1 bg-sand/10 rounded">
          <div
            class="h-full bg-info"
            style="animation: shrink {notification.duration}ms linear forwards;"
          ></div>
        {/if}
    </div>
  {/each}
</div>

<style>
  /* @unocss-include */
  @keyframes shrink {
    from {
      width: 100%}
    to { width: 0%}
  }
</style>



