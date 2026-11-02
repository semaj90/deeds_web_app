<!-- YoRHa Detective Modal Component with Bits UI v2 Dialog primitives -->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    showModal = $bindable(false),
    title = '',
    onClose = () => {},
    children
  }: {
    showModal: boolean;
    title: string;
    onClose?: () => void;
    children?: Snippet;
  } = $props();

  function close() {
    showModal = false;
    onClose?.();
  }
</script>

<Dialog.Root bind:open={showModal} onOpenChange={(v) => { if (!v) close(); }}>
  <Dialog.Portal>
    <Dialog.Overlay class="ydm-backdrop" />
    <Dialog.Content class="ydm-panel">
      <!-- Tactical Corner Notches -->
      <div class="hud-notch-tl" aria-hidden="true"></div>
      <div class="hud-notch-tr" aria-hidden="true"></div>
      <div class="hud-notch-bl" aria-hidden="true"></div>
      <div class="hud-notch-br" aria-hidden="true"></div>

      <!-- Top accent line -->
      <div class="ydm-top-line" aria-hidden="true"></div>

      <!-- Header -->
      <div class="ydm-header">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-2 h-2 rounded-full bg-[#f3d471] shadow-[0_0_6px_#f3d471]"></span>
          <Dialog.Title class="ydm-title">{title}</Dialog.Title>
        </div>
        <Dialog.Close class="ydm-close" onclick={close} aria-label="Close modal">
          &times;
        </Dialog.Close>
      </div>

      <!-- Content -->
      <div class="ydm-content">
        {#if children}
          {@render children()}
        {:else}
          <p class="text-sand/50 text-center py-4 font-mono text-xs">No content available</p>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.ydm-backdrop) {
    position: fixed; inset: 0; z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(4, 7, 14, 0.85); backdrop-filter: blur(12px) saturate(1.15); padding: 1rem;
    animation: ydmFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(.ydm-panel) {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 10001;
    width: min(44rem, calc(100vw - 2rem)); max-height: 88vh;
    display: flex; flex-direction: column;
    background: linear-gradient(180deg, rgba(18, 24, 36, 0.98) 0%, rgba(9, 13, 20, 0.99) 100%);
    border: 1px solid rgba(243, 212, 113, 0.32);
    border-radius: 8px;
    box-shadow: 0 0 0 1px rgba(243, 212, 113, 0.08), 0 28px 70px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(243, 212, 113, 0.1);
    backdrop-filter: blur(20px); overflow: hidden;
    animation: ydmScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ydm-top-line {
    position: absolute; top: 0; left: 1.5rem; right: 1.5rem; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(243, 212, 113, 0.9), rgba(126, 231, 255, 0.6), transparent);
    pointer-events: none; z-index: 2;
  }

  .hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
    position: absolute; width: 8px; height: 8px; pointer-events: none; z-index: 3;
  }
  .hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
  .hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

  .ydm-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.125rem 1.5rem;
    border-bottom: 1px solid rgba(243, 212, 113, 0.2);
    background: rgba(0, 0, 0, 0.35); flex-shrink: 0;
    position: relative; z-index: 1;
  }

  :global(.ydm-title) {
    font-size: 1rem; font-weight: 700; color: #f3d471;
    margin: 0; font-family: 'JetBrains Mono', 'Fira Code', monospace;
    letter-spacing: 0.1em; text-transform: uppercase;
  }

  :global(.ydm-close) {
    background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(243, 212, 113, 0.25);
    color: rgba(212, 199, 163, 0.7); cursor: pointer; font-size: 1.1rem;
    width: 1.875rem; height: 1.875rem; border-radius: 4px; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s ease; line-height: 1;
  }
  :global(.ydm-close:hover) {
    color: #f3d471; background: rgba(243, 212, 113, 0.15); border-color: rgba(243, 212, 113, 0.5);
  }

  .ydm-content {
    padding: 1.5rem; overflow-y: auto; flex: 1; color: rgba(233, 240, 255, 0.88);
  }
  .ydm-content::-webkit-scrollbar { width: 6px; }
  .ydm-content::-webkit-scrollbar-thumb { background: rgba(243, 212, 113, 0.18); border-radius: 3px; }

  @keyframes ydmFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ydmScale { from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
</style>
