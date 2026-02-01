<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, scale } from 'svelte/transition';

  interface Props {
    open?: boolean;
    title?: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'prompt';
    closable?: boolean;
    value?: string;
    onConfirm?: (value?: string) => void;
    onCancel?: () => void;
    children?: Snippet;
  }

  let {
    open = false,
    title = 'SYSTEM MESSAGE',
    message = '',
    type = 'info',
    closable = true,
    value = '',
    onConfirm,
    onCancel,
    children
  }: Props = $props();

  let promptValue = $state("");
  $effect.pre(() => {
    promptValue = value;
  });

  const typeConfig = {
    info: {
	icon: '■', color: '#0ea5e9', label: 'NOTIFICATION' },
	success: {
	icon: '✓', color: '#10b981', label: 'NORMAL' },
	warning: {
	icon: '!', color: '#f59e0b', label: 'CAUTION' },
	error: {
	icon: '✕', color: '#ef4444', label: 'CRITICAL' },
	confirm: {
	icon: '?', color: '#8b5cf6', label: 'DECISION' },
	prompt: {
	icon: '>', color: '#0ea5e9', label: 'INPUT' }
  };

  const config = $derived(typeConfig[type]);

  function handleConfirm() {
    onConfirm?.(type === 'prompt' ? promptValue : undefined);
  }

  function handleCancel() {
    onCancel?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && closable) {
      handleCancel();
    }
  }
</script> {#if open} <!-- Backdrop --> <!-- svelte-ignore a11y_no_static_element_interactions --> <!-- svelte-ignore a11y_click_events_have_key_events --> <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono"
    transition:fade={{
	duration: 150 }}
    onclick={handleBackdropClick}
  > <!-- Modal --> <div class="w-full max-w-md bg-slate-900 border-2 border-slate-700 shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden"
      transition: scale={{
	duration: 200, start: 0.95 }}
      style:border-color={config.color}
    > <!-- Header --> <div class="bg-slate-950 px-4 py-2 border-b flex justify-between items-center" style:border-color={config.color}>
        <div class="flex items-center gap-3"> <div class="w-5 h-5 flex items-center justify-center border font-bold text-xs" style:border-color={config.color} style:color={config.color}>
            {config.icon}
          </div> <div> <span class="text-[10px] opacity-50 tracking-widest">{config.label}</span>
            <h3 class="text-sm font-bold text-white tracking-widest leading-none uppercase">{title}</h3>
          </div> </div> {#if closable} <button
            onclick={handleCancel}
            class="text-slate-500 hover:text-white transition-colors"
          >
            ✕
          </button> {/if} </div> <!-- Content --> <div class="p-6"> {#if message} <p class="text-slate-300 text-xs leading-relaxed mb-4">{message}</p> {/if}
          {#if type === 'prompt'} <div class="mt-4"> <input
              type="text"
              bind:value={promptValue}
              class="w-full bg-slate-950 border border-slate-700 p-2 text-cyan-400 text-xs focus:border-cyan-500 outline-none transition-all"
              placeholder="ENTER SYSTEM SEED..."
            /> </div> {/if}
          {#if children} <div class="mt-4"> {@render children()} </div> {/if} </div> <!-- Actions --> <div class="bg-slate-950/50 p-4 flex justify-end gap-3 border-t border-slate-800"> {#if type === 'confirm' || type === 'prompt'} <button
            onclick={handleCancel}
            class="px-4 py-1.5 text-[10px] text-slate-400 border border-slate-700 hover:bg-slate-800 transition-all uppercase"
          >
            CANCEL
          </button> {/if} <button
            onclick={handleConfirm}
            class="px-6 py-1.5 text-[10px] text-white border transition-all uppercase font-bold"
            style:border-color={config.color}
            style:background-color={`${config.color}20`}
          >
            {type === 'confirm' || type === 'prompt' ? 'EXECUTE' : 'ACKNOWLEDGE'}
          </button> </div> <!-- Scanline effect --> <div class="absolute inset-0 pointer-events-none overflow-hidden opacity-5"> <div
          class="w-full h-px bg-white animate-scan"
          style:background-color={config.color}
        ></div> </div> </div> </div> {/if} <style> @keyframes scan { 0% { transform: translateY(-100%); }
    100% { transform: translateY(800PX); }
  } .animate-scan { animation: scan 4s linear infinite; } </style>







