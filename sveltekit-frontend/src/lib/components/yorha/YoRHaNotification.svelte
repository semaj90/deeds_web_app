<!-- YoRHa Notification/Alert System, Component -->
<script lang="ts">
  // Migrated to $effect
  import { fly } from 'svelte/transition';

  interface Props {
    id?: string;
    type?: 'info' | 'success' | 'warning' | 'error' | 'system';
    title?: string;
	message: string;
    duration?: number;
    closable?: boolean;
    onClose?: (id?: string) => void;
  }

  let {
    id,
    type = 'info',
    title = '',
    message,
    duration = 5000,
    closable = true,
    onClose
  }: Props = $props();

  let visible = $state(true);
  let progress = $state(100);
  let interval: any;

  const typeConfig = { info: { icon: '■', color: '#0ea5e9' },
	success: {
	icon: '✓', color: '#10b981' },
	warning: {
	icon: '!', color: '#f59e0b' },
	error: {
	icon: '✕', color: '#ef4444' },
	system: {
	icon: '◆', color: '#8b5cf6' }
  };

  const config = $derived(typeConfig[type]);

  function close() {
    visible = false;
    onClose?.(id);
  }

  $effect(() => {
    if (duration > 0) {
      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        progress = Math.max(0, 100 - (elapsed / duration) * 100);
        if (progress <= 0) {
          clearInterval(interval);
          close();
        }
      }, 100);
    }

    // Cleanup on effect destroy
    return () => {
      if (interval) clearInterval(interval);
    };
  });
</script>

{#if visible}
  <div
    class="relative overflow-hidden bg-slate-900 border border-slate-700 p-4 min-w-[300px] shadow-2xl"
    transition:fly={{
	x: 100, duration: 400 }}
  >
    <div class="flex items-start gap-4">
      <div class="text-xl" style="color: {config.color}">{config.icon}</div>
      <div class="flex-1">
        {#if title}
          <div class="font-bold text-xs uppercase tracking-widest mb-1" style="color: {config.color}">{title}</div>
        {/if}
        <div class="text-xs text-slate-300 font-mono leading-relaxed">{message}</div>
      </div>
      {#if closable}
        <button onclick={close} class="text-slate-500 hover:text-white transition-colors">✕</button>
      {/if}
    </div>

    <!-- Progress Bar -->
    {#if duration > 0}
      <div class="absolute bottom-0 left-0 h-0.5 bg-slate-800 w-full">
        <div
          class="h-full transition-all duration-100 ease-linear"
          style="width: {progress}%; background-color: {config.color}"
        ></div>
      </div>
    {/if}
  </div>
{/if}

<style>
  div {
    font-family: 'JetBrains Mono', monospace;
  }
</style>







