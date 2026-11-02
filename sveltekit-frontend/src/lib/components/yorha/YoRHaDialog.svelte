<!-- YoRHa System Dialog with Bits UI v2 Dialog primitives -->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';

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
    open = $bindable(false),
    title = 'SYSTEM MESSAGE',
    message = '',
    type = 'info',
    closable = true,
    value = '',
    onConfirm,
    onCancel,
    children
  }: Props = $props();

  let promptValue = $state('');
  $effect.pre(() => {
    promptValue = value;
  });

  const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
    info: { icon: '■', color: '#0ea5e9', label: 'NOTIFICATION' },
    success: { icon: '✓', color: '#10b981', label: 'NORMAL' },
    warning: { icon: '!', color: '#f59e0b', label: 'CAUTION' },
    error: { icon: '✕', color: '#ef4444', label: 'CRITICAL' },
    confirm: { icon: '?', color: '#8b5cf6', label: 'DECISION' },
    prompt: { icon: '>', color: '#0ea5e9', label: 'INPUT' }
  };

  const config = $derived(typeConfig[type] ?? typeConfig.info);

  function handleConfirm() {
    onConfirm?.(type === 'prompt' ? promptValue : undefined);
    open = false;
  }

  function handleCancel() {
    onCancel?.();
    open = false;
  }
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) handleCancel(); }}>
  <Dialog.Portal>
    <Dialog.Overlay class="yhd-backdrop" />
    <Dialog.Content class="yhd-panel" style="border-color: {config.color}">
      <!-- Tactical Corner Notches -->
      <div class="hud-notch-tl" style="border-color: {config.color}" aria-hidden="true"></div>
      <div class="hud-notch-tr" style="border-color: {config.color}" aria-hidden="true"></div>
      <div class="hud-notch-bl" style="border-color: {config.color}" aria-hidden="true"></div>
      <div class="hud-notch-br" style="border-color: {config.color}" aria-hidden="true"></div>

      <!-- Top accent line -->
      <div class="yhd-top-line" style="background: linear-gradient(90deg, transparent, {config.color}, transparent)" aria-hidden="true"></div>

      <!-- Header -->
      <div class="yhd-header" style="border-bottom-color: {config.color}33">
        <div class="flex items-center gap-3">
          <div
            class="w-5 h-5 flex items-center justify-center border font-bold text-xs"
            style="border-color: {config.color}; color: {config.color}"
          >
            {config.icon}
          </div>
          <div>
            <span class="text-[10px] opacity-60 tracking-widest font-mono block">{config.label}</span>
            <Dialog.Title class="text-sm font-bold text-white tracking-widest leading-none uppercase font-mono">
              {title}
            </Dialog.Title>
          </div>
        </div>
        {#if closable}
          <Dialog.Close
            onclick={handleCancel}
            class="text-sand/60 hover:text-white transition-colors cursor-pointer bg-transparent border-none text-base leading-none p-1"
            aria-label="Close dialog"
          >
            ✕
          </Dialog.Close>
        {/if}
      </div>

      <!-- Content -->
      <div class="p-6 font-mono">
        {#if message}
          <p class="text-sand/70 text-xs leading-relaxed mb-4">{message}</p>
        {/if}

        {#if type === 'prompt'}
          <div class="mt-4">
            <input
              type="text"
              bind:value={promptValue}
              class="w-full bg-black/60 border border-sand/30 p-2 text-white text-xs focus:border-[#7ee7ff] outline-none transition-all font-mono"
              placeholder="ENTER SYSTEM SEED..."
              onkeydown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            />
          </div>
        {/if}

        {#if children}
          <div class="mt-4">
            {@render children()}
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="bg-black/40 p-4 flex justify-end gap-3 border-t border-sand/15">
        {#if type === 'confirm' || type === 'prompt'}
          <button
            type="button"
            onclick={handleCancel}
            class="px-4 py-1.5 text-[11px] font-mono text-sand/60 border border-sand/25 hover:border-sand/50 transition-all uppercase rounded"
          >
            CANCEL
          </button>
        {/if}
        <button
          type="button"
          onclick={handleConfirm}
          class="px-6 py-1.5 text-[11px] font-mono text-white border transition-all uppercase font-bold rounded"
          style="border-color: {config.color}; background-color: {config.color}25"
        >
          {type === 'confirm' || type === 'prompt' ? 'EXECUTE' : 'ACKNOWLEDGE'}
        </button>
      </div>

      <!-- Scanline effect -->
      <div class="absolute inset-0 pointer-events-none overflow-hidden opacity-5">
        <div class="w-full h-px animate-scan" style="background-color: {config.color}"></div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.yhd-backdrop) {
    position: fixed; inset: 0; z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(3, 6, 12, 0.88); backdrop-filter: blur(12px) saturate(1.15); padding: 1rem;
    animation: yhdFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(.yhd-panel) {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 10001;
    width: min(30rem, calc(100vw - 2rem));
    background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 14, 22, 0.99) 100%);
    border: 1px solid rgba(212, 199, 163, 0.3);
    border-radius: 6px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), 0 25px 60px -15px rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(20px);
    overflow: hidden;
    animation: yhdScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .yhd-top-line {
    position: absolute; top: 0; left: 1rem; right: 1rem; height: 1px;
    pointer-events: none; z-index: 2;
  }

  .hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
    position: absolute; width: 6px; height: 6px; pointer-events: none; z-index: 3;
  }
  .hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
  .hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
  .hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
  .hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

  .yhd-header {
    background: rgba(0, 0, 0, 0.35);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.875rem 1.25rem;
    display: flex; justify-content: space-between; align-items: center;
    position: relative; z-index: 1;
  }

  @keyframes scan {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(400px); }
  }
  .animate-scan { animation: scan 3s linear infinite; }

  @keyframes yhdFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes yhdScale { from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
</style>
