<!-- YoRHa Notification: Manager, Component -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { notificationStore } from '$lib/stores/notifications.svelte';
  import { flip } from 'svelte/animate';
  import YoRHaNotification from "./YoRHaNotification.svelte";

  let notifications = $state<any[]>([]);

  // Subscribe to the store (simple subscribe for compatibility with the writable store)
  $effect(() => {
    const unsubscribe = notificationStore.subscribe(value => {
      notifications = value;
    });
    return unsubscribe;
  });

  function handleClose(id?: string) {
    if (id) notificationStore.remove(id);
  }
</script>

<div class="notification-group notification-group-top-right">
  {#each notifications as n (n.id)}
    <div animate: flip={{
	duration: 300 }} class="pointer-events-auto">
      <YoRHaNotification
        id={n.id}
        type={n.type}
        title={n.title}
        message={n.message}
        duration={n.duration}
        closable={n.closable}
        onClose={handleClose}
      />
    </div>
  {/each}
</div>

<style>
  .notification-group {
    position: fixed;
    z-index: 9999;
	display: flex;
    flex-direction: column;
	gap: 12px;
    pointer-events: none;
  }
  .notification-group > :global(.yorha-notification) {
    pointer-events: auto;
  }
  /* Position-specific stacking */
  .notification-group-top-right {
    top: 20px;
	right: 20px;
  }
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .notification-group-top-right {
      top: 10px;
	right: 10px;
      left: 10px;
    }
  }
</style>





