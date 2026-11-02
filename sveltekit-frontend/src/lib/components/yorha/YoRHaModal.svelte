<!-- YoRHa Modal Component with Bits UI v2 Dialog Primitives and Tactical Terminal Styling -->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface ModalProps {
    open?: boolean;
    title?: string;
    subtitle?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
    closable?: boolean;
    persistent?: boolean;
    type?: 'default' | 'confirm' | 'alert' | 'system';
    onClose?: () => void;
    onConfirm?: () => void;
    children?: Snippet;
    footer?: Snippet;
  }

  let {
    open = $bindable(false),
    title = '',
    subtitle = '',
    size = 'md',
    closable = true,
    persistent = false,
    type = 'default',
    onClose = () => {},
    onConfirm = () => {},
    children,
    footer
  }: ModalProps = $props();

  function handleClose() {
    if (!persistent) {
      open = false;
      onClose();
    }
  }

  const sizeClasses: Record<string, string> = {
    sm: 'w-[min(26rem,calc(100vw-2rem))]',
    md: 'w-[min(38rem,calc(100vw-2rem))]',
    lg: 'w-[min(54rem,calc(100vw-2rem))]',
    xl: 'w-[min(70rem,calc(100vw-2rem))]',
    fullscreen: 'w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)]'
  };

  const typeBorderClass = $derived.by(() => {
    switch (type) {
      case 'system':
        return 'border-[#f3d471] shadow-[0_0_35px_rgba(243,212,113,0.25)]';
      case 'confirm':
        return 'border-l-4 border-l-[#ffaa00] border-sand/30';
      case 'alert':
        return 'border-l-4 border-l-[#ff0041] border-sand/30';
      default:
        return 'border-sand/30';
    }
  });
</script>

<Dialog.Root
  bind:open
  onOpenChange={(nextOpen) => {
    if (!nextOpen) {
      handleClose();
    }
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="yorha-modal-backdrop" />
    <Dialog.Content
      class="yorha-modal-panel {sizeClasses[size] ?? sizeClasses.md} {typeBorderClass}"
      interactOutsideBehavior={persistent || !closable ? 'ignore' : 'close'}
      escapeKeydownBehavior={persistent || !closable ? 'ignore' : 'close'}
    >
      <!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
      <div class="hud-notch-tl" aria-hidden="true"></div>
      <div class="hud-notch-tr" aria-hidden="true"></div>
      <div class="hud-notch-bl" aria-hidden="true"></div>
      <div class="hud-notch-br" aria-hidden="true"></div>

      <!-- Top highlight accent -->
      <div class="yorha-top-line" aria-hidden="true"></div>

      <!-- Header -->
      <div class="yorha-modal-header">
        <div class="flex items-center gap-3 min-w-0">
          <div class="yorha-status-indicator">
            <span class="yorha-status-pulse {type}"></span>
          </div>
          <div class="min-w-0">
            {#if title}
              <Dialog.Title class="yorha-modal-title">
                {title}
              </Dialog.Title>
            {/if}
            {#if subtitle}
              <Dialog.Description class="yorha-modal-subtitle">
                {subtitle}
              </Dialog.Description>
            {/if}
          </div>
        </div>

        {#if closable && !persistent}
          <Dialog.Close
            onclick={handleClose}
            class="yorha-modal-close"
            aria-label="Close modal"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Dialog.Close>
        {/if}
      </div>

      <!-- Content -->
      <div class="yorha-modal-body">
        {#if children}
          {@render children()}
        {/if}
      </div>

      <!-- Footer -->
      {#if footer || type !== 'default'}
        <div class="yorha-modal-footer">
          {#if footer}
            {@render footer()}
          {:else if type === 'confirm'}
            <button
              onclick={handleClose}
              type="button"
              class="px-4 py-2 text-xs font-mono uppercase text-sand/60 hover:text-white border border-sand/30 hover:border-sand/60 transition-colors"
            >
              Cancel
            </button>
            <button
              onclick={() => { onConfirm(); handleClose(); }}
              type="button"
              class="px-4 py-2 text-xs font-mono uppercase bg-[#f3d471] text-black font-bold hover:bg-[#ffe180] transition-colors shadow-[0_0_12px_rgba(243,212,113,0.3)]"
            >
              Confirm
            </button>
          {:else if type === 'alert'}
            <button
              onclick={handleClose}
              type="button"
              class="px-4 py-2 text-xs font-mono uppercase bg-[#ff0041] text-white font-bold hover:bg-[#ff3366] transition-colors shadow-[0_0_12px_rgba(255,0,65,0.4)]"
            >
              Acknowledge
            </button>
          {/if}
        </div>
      {/if}

      <!-- Decorative scanline/terminal effect -->
      <div class="yorha-scanlines" aria-hidden="true"></div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.yorha-modal-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(3, 6, 12, 0.88);
    backdrop-filter: blur(12px) saturate(1.15);
    animation: yorhaFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(.yorha-modal-panel) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10001;
    background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 14, 22, 0.99) 100%);
    border: 1px solid rgba(212, 199, 163, 0.35);
    box-shadow:
      0 0 0 1px rgba(243, 212, 113, 0.1),
      0 28px 70px -15px rgba(0, 0, 0, 0.9),
      0 0 50px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(18px) saturate(1.2);
    font-family: var(--yorha-font-primary, "JetBrains Mono", monospace);
    color: var(--yorha-text-primary, #e0e0e0);
    max-height: calc(100vh - 2.5rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: yorhaScaleIn 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .yorha-top-line {
    position: absolute;
    top: 0;
    left: 1.5rem;
    right: 1.5rem;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(243, 212, 113, 0.95), rgba(126, 231, 255, 0.7), transparent);
    pointer-events: none;
    z-index: 3;
  }

  /* Tactical corner notches */
  .hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
    position: absolute;
    width: 8px;
    height: 8px;
    pointer-events: none;
    z-index: 4;
  }
  .hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
  .hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

  /* Header */
  .yorha-modal-header {
    background: rgba(8, 12, 18, 0.65);
    border-bottom: 1px solid rgba(243, 212, 113, 0.25);
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 2;
  }

  .yorha-status-indicator {
    width: 8px;
    height: 8px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .yorha-status-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f3d471;
    box-shadow: 0 0 8px #f3d471;
    animation: pulseGlow 2s infinite ease-in-out;
  }

  .yorha-status-pulse.alert {
    background: #ff0041;
    box-shadow: 0 0 8px #ff0041;
  }

  .yorha-status-pulse.confirm {
    background: #ffaa00;
    box-shadow: 0 0 8px #ffaa00;
  }

  :global(.yorha-modal-title) {
    color: #f3d471;
    font-size: 0.9375rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin: 0;
    text-shadow: 0 0 8px rgba(243, 212, 113, 0.3);
  }

  :global(.yorha-modal-subtitle) {
    color: rgba(212, 199, 163, 0.65);
    font-size: 0.6875rem;
    margin: 0.15rem 0 0 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  :global(.yorha-modal-close) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(212, 199, 163, 0.25);
    cursor: pointer;
    padding: 0;
    color: rgba(212, 199, 163, 0.7);
    transition: all 0.15s ease;
  }

  :global(.yorha-modal-close:hover) {
    color: #f3d471;
    background: rgba(243, 212, 113, 0.15);
    border-color: rgba(243, 212, 113, 0.5);
    box-shadow: 0 0 10px rgba(243, 212, 113, 0.25);
  }

  /* Body */
  .yorha-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    color: rgba(233, 240, 255, 0.88);
    position: relative;
    z-index: 2;
  }

  .yorha-modal-body::-webkit-scrollbar {
    width: 6px;
  }
  .yorha-modal-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .yorha-modal-body::-webkit-scrollbar-thumb {
    background: rgba(212, 199, 163, 0.18);
    border-radius: 3px;
  }

  /* Footer */
  .yorha-modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(212, 199, 163, 0.2);
    background: rgba(8, 12, 18, 0.55);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    align-items: center;
    position: relative;
    z-index: 2;
  }

  /* Scanlines */
  .yorha-scanlines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.04;
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
    background-size: 100% 2px, 3px 100%;
    z-index: 1;
  }

  @keyframes pulseGlow {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.6; }
  }

  @keyframes yorhaFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes yorhaScaleIn {
    from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
</style>
