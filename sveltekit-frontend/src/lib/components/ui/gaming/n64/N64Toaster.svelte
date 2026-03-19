<!--
  N64 Toaster Component
-->
<script lang="ts">
  import { toastStore } from './N64ToastStore.svelte';
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    class?: string;
  }

  let {
    position = 'bottom-right',
    class: className = ''
  }: Props = $props();

</script>

<div class="n64-toaster {position} {className}">
  {#each toastStore.toasts as toast (toast.id)}
    <div
        class="n64-toast {toast.type}"
        animate:flip
        in:fly={{ y: 20, duration: 300 }}
        out:fade
    >
      {toast.message}
    </div>
  {/each}
</div>

<style>
  .n64-toaster {
    position: fixed;
    z-index: 10000;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  }

  .n64-toaster.top-right { top: 0; right: 0; }
  .n64-toaster.top-left { top: 0; left: 0; }
  .n64-toaster.bottom-right { bottom: 0; right: 0; }
  .n64-toaster.bottom-left { bottom: 0; left: 0; }

  .n64-toast {
    background: #000;
    color: #fff;
    padding: 12px 16px;
    border-radius: 4px;
    border: 2px solid #555;
    font-family: 'Rajdhani', sans-serif;
    pointer-events: auto;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    min-width: 200px;
  }

  .n64-toast.success { border-color: #28a745; color: #28a745; }
  .n64-toast.error { border-color: #dc3545; color: #dc3545; }
  .n64-toast.warning { border-color: #ffc107; color: #ffc107; }
  .n64-toast.info { border-color: #17a2b8; color: #17a2b8; }
</style>
