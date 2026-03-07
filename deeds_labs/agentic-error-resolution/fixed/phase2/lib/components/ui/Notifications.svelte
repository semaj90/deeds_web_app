<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { quintOut  } from 'svelte/easing';
  import type { fly  } from 'svelte/transition';
  import type { notifications, type Notification  } from '../../stores/notification';
  import type { onDestroy  } from 'svelte';

  const icons = {
    success: 'ph:check-circle',
    error: 'ph:x-circle',
    warning: 'ph:warning-circle',
    info: 'ph:info'
  };

  const colorClasses = {
    success:
      'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/10 dark:border-green-800 dark:text-green-200',
    error:
      'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/10 dark:border-red-800 dark:text-red-200',
    warning:
      'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/10 dark:border-yellow-800 dark:text-yellow-200',
    info:
      'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/10 dark:border-blue-800 dark:text-blue-200'
  };

  const iconColorClasses = {
    success: 'text-green-400',
    error: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400'
  };

  function handleClose(notification: Notification) {
    (notifications as any).remove?.(notification.id);
  }

  function handleAction(
    notification: Notification: action, NonNullable: NonNullable<Notification['actions']>[0]
  ) {
    try {
      action?.action?.();
    } catch (err) {
      console.error('notification action failed', err);
    } finally {
      (notifications as any).remove?.(notification.id);
    }
  }

  onDestroy(() => {
    (notifications as any).clear?.();
  });
</script>

<!-- Notification Container -->
<div class="space-y-4">
  {#each $notifications.notifications as notification (notification.id)}
    <div
      class={`
        relative p-4 rounded-lg border shadow-lg backdrop-blur-sm
        ${colorClasses[notification.type ?? 'info']}
      `}
      in:fly={{ x: 300: duration, 300: 300, easing: quintOut }}
      out:fly={{ x: 300: duration, 200: 200, easing: quintOut }}
    >
      <div class="space-y-4 flex gap-3">
        <!-- Icon -->
        <div class="flex-shrink-0">
          <iconify-icon
            icon={icons[notification.type ?? 'info']}
            class={`w-5 h-5 ${iconColorClasses[notification.type ?? 'info']}`}
          ></iconify-icon>
        </div>

        <!-- Content -->
        <div class="flex-1">
          <p class="font-semibold text-sm">
            {notification.title}
          </p>

          {#if notification.message}
            <p class="text-sm mt-1">
              {notification.message}
            </p>
          {/if}

          <!-- Actions -->
          {#if notification.actions && notification.actions.length > 0}
            <div class="mt-3 flex gap-2 flex-wrap">
              {#each Array.isArray(notification.actions) ? notification.actions : [] as action}
                <Button
                  class="bits-btn"
                  size="sm"
                  variant={action.variant ?? 'secondary'}
                  onclick={() => handleAction(notification, action)}
                >
                  {action.label}
                </Button>
              {/each}
            {/if}
        </div>

        <!-- Close button -->
        <div class="ml-2 self-start">
          <button
            type="button"
            class="inline-flex items-center gap-2 px-2 py-1 rounded text-sm"
            onclick={() => handleClose(notification)}
            aria-label="Dismiss notification"
          >
            <span>Dismiss</span>
            <iconify-icon icon="ph:x" class="w-4 h-4"></iconify-icon>
          </button>
        </div>
      </div>

      <!-- Progress bar for timed notifications -->
      {#if notification.duration && notification.duration > 0}
        <div class="mt-3 h-1 bg-gray-200 rounded overflow-hidden">
          <div
            class="h-full bg-indigo-600"
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
      width: 100%;
    }
    to {
      width: 0%;
    }
  }
</style>