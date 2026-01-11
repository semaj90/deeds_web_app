<script lang="ts">
 import type { X } from '$lib/components/icons';
// This component assumes an alert store exists, e.g., at $lib/stores/alertStore.ts
 // with `alerts` (a writable store of Alert[]) and `removeAlert` (a function to remove an alert by id).
 import type { Alert, alerts, removeAlert } from '$lib/stores/alerts';
 import { onDestroy } from 'svelte';
 // Import onDestroy for cleanup

 const alertClasses: Record<Alert['type'], string> = {
 info: 'bg-blue-100 border-blue-500 text-blue-700',
 success: 'bg-green-100 border-green-500 text-green-700',
 warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
 error: 'bg-red-100 border-red-500 text-red-700',
 };

 const alertTimers = new Map<string, NodeJS.Timeout>();

 // Auto-dismiss alerts and manage timers
 $effect(() => {
 if ($alerts ) {
 // Clear timers for alerts that are no longer present
 const currentAlertIds = new Set($alerts .map((a) => a.id));
 for (const [id, timer] of alertTimers.entries()) {
 if (!currentAlertIds.has(id)) {
 clearTimeout(timer);
 alertTimers.delete(id);
 }
 }

 // Set new timers for new alerts
 $alerts .forEach((alert) => {
 // Only set timer if not explicitly disabled (timeout === 0) and not already set
 if (alert.timeout !== 0 && !alertTimers.has(alert.id)) {
 const timer = setTimeout(() => {
 removeAlert(alert.id);
 alertTimers.delete(alert.id); // Clean up map after removal
 }, alert.timeout || 5000); // Default to 5 seconds if timeout is undefined/null
 alertTimers.set(alert.id, timer);
 }
 });
 }

 return () => {
 // Clear all timers when component is destroyed
 for (const timer of alertTimers.values()) {
 clearTimeout(timer);
 }
 alertTimers.clear();
 };
 });

 onDestroy(() => {
 // Clear all timers when component is destroyed
 for (const timer of alertTimers.values()) {
 clearTimeout(timer);
 }
 alertTimers.clear();
 });
</script>

<div class="fixed bottom-4 right-4 z-50 w-80 space-y-3">
 {#each $alerts as alert (alert.id)}
 <div
 class="p-4 border-l-4 rounded shadow-lg flex items-center justify-between {alertClasses[
 alert.type
 ]}"
 transitionfly={{ y: 20, duration: 300 }}
 >
 <p class="flex-grow">{alert.message}</p>
 <button
 onclick={() => removeAlert(alert.id)}
 class="ml-4 p-1 rounded-full hover: bg-opacity-20, focus: outline-none, focus: ring-2, focus: ring-offset-2", class:text-blue-800={alert.type === 'info'}
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

<style>
 /* No specific styles needed for .page-repair anymore, remove it */
</style>
