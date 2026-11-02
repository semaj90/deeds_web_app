<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface Props {
    open?: boolean;
    title?: string;
    subtitle?: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'fullscreen';
    closeOnOutsideClick?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    showCloseButton?: boolean;
    class?: string;
    onclose?: () => void;
    onClose?: () => void;
    children?: Snippet;
    footer?: Snippet;
    header?: Snippet;
  }

  let {
    open = $bindable(false),
    title = '',
    subtitle = '',
    description = '',
    size = 'md',
    closeOnOutsideClick = true,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    showCloseButton = true,
    class: className = '',
    onclose,
    onClose,
    children,
    footer,
    header,
  }: Props = $props();

  function handleClose() {
    open = false;
    onclose?.();
    onClose?.();
  }

  const subText = $derived(subtitle || description);
  const outsideClickAllowed = $derived(closeOnOutsideClick && closeOnOverlayClick);

  const sizeClasses = $derived.by(() => {
    switch (size) {
      case 'sm':
        return 'w-[min(28rem,calc(100vw-2rem))]';
      case 'md':
        return 'w-[min(38rem,calc(100vw-2rem))]';
      case 'lg':
        return 'w-[min(54rem,calc(100vw-2rem))]';
      case 'xl':
        return 'w-[min(70rem,calc(100vw-2rem))]';
      case 'full':
        return 'w-[min(90rem,calc(100vw-2rem))]';
      case 'fullscreen':
        return 'w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)]';
      default:
        return 'w-[min(38rem,calc(100vw-2rem))]';
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
    <!-- Darkened blurred scrim backdrop to make ivory/light modal pop in 3D contrast -->
    <Dialog.Overlay class="modal-light-backdrop" />
    <Dialog.Content
      class="modal-light-content {sizeClasses} {className}"
      interactOutsideBehavior={outsideClickAllowed ? 'close' : 'ignore'}
      escapeKeydownBehavior={closeOnEscape ? 'close' : 'ignore'}
    >
      <!-- Tactical Corner Notches (Burnished Attorney Gold) -->
      <div class="hud-notch-tl" aria-hidden="true"></div>
      <div class="hud-notch-tr" aria-hidden="true"></div>
      <div class="hud-notch-bl" aria-hidden="true"></div>
      <div class="hud-notch-br" aria-hidden="true"></div>

      <!-- Top Burnished Gold Highlight Rule -->
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-transparent via-[#c59e2b] to-transparent opacity-90 z-10" aria-hidden="true"></div>

      <!-- Header Section -->
      {#if header}
        <div class="modal-light-header">
          {@render header()}
          {#if showCloseButton}
            <Dialog.Close class="modal-light-close" onclick={handleClose} aria-label="Close modal">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          {/if}
        </div>
      {:else if title}
        <div class="modal-light-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="modal-light-icon">
              <svg class="w-4 h-4 text-[#a17a26]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="M7 21h10"/>
                <path d="M12 3v18"/>
                <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
              </svg>
            </div>
            <div class="min-w-0">
              <Dialog.Title class="modal-light-title">
                {title}
              </Dialog.Title>
              {#if subText}
                <Dialog.Description class="modal-light-subtitle">
                  {subText}
                </Dialog.Description>
              {/if}
            </div>
          </div>
          {#if showCloseButton}
            <Dialog.Close class="modal-light-close" onclick={handleClose} aria-label="Close modal">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          {/if}
        </div>
      {/if}

      <!-- Body Section -->
      <div class="modal-light-body">
        {#if children}
          {@render children()}
        {/if}
      </div>

      <!-- Footer Section -->
      {#if footer}
        <div class="modal-light-footer">
          {@render footer()}
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.modal-light-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 9990;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(12px) saturate(1.1);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: lightFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(.modal-light-content) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9991;
    background: #fcfbf9;
    border-radius: 16px;
    border: 1px solid #d8cdb8;
    box-shadow:
      0 0 0 1px rgba(197, 158, 43, 0.15),
      0 28px 65px -15px rgba(25, 20, 15, 0.35),
      0 0 35px rgba(197, 158, 43, 0.08);
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: #1e293b;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: lightScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    outline: none;
  }

  /* Tactical corner notches in burnished attorney gold */
  .hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
    position: absolute;
    width: 9px;
    height: 9px;
    pointer-events: none;
    z-index: 10;
  }
  .hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #c59e2b; border-left: 2px solid #c59e2b; }
  .hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #c59e2b; border-right: 2px solid #c59e2b; }
  .hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #c59e2b; border-left: 2px solid #c59e2b; }
  .hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #c59e2b; border-right: 2px solid #c59e2b; }

  /* Header */
  .modal-light-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.125rem 1.5rem;
    border-bottom: 1px solid #e5dccf;
    background: #f7f2ea;
    position: relative;
    flex-shrink: 0;
  }

  .modal-light-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #eedfca;
    border: 1px solid #dcc8ae;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  :global(.modal-light-title) {
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #0f172a;
    line-height: 1.25;
    margin: 0;
  }

  :global(.modal-light-subtitle) {
    font-size: 0.68rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8c6a23;
    margin: 0.2rem 0 0 0;
  }

  :global(.modal-light-close) {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    background: #ede4d6;
    border: 1px solid #dbccb8;
    transition: all 0.15s ease;
    cursor: pointer;
    flex-shrink: 0;
    outline: none;
  }

  :global(.modal-light-close:hover) {
    color: #0f172a;
    background: #e2d4c0;
    border-color: #c59e2b;
  }

  /* Body */
  .modal-light-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
    color: #334155;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .modal-light-body::-webkit-scrollbar {
    width: 6px;
  }
  .modal-light-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .modal-light-body::-webkit-scrollbar-thumb {
    background: #d8cdb8;
    border-radius: 3px;
  }
  .modal-light-body::-webkit-scrollbar-thumb:hover {
    background: #c5b89e;
  }

  /* Footer */
  .modal-light-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #e5dccf;
    background: #f7f2ea;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  @keyframes lightFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes lightScaleIn {
    from {
      opacity: 0;
      transform: translate(-50%, -48%) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
