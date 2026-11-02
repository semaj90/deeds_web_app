<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface Props {
    open?: boolean;
    title?: string;
    subtitle?: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'fullscreen';
    variant?: 'glass' | 'legal' | 'yorha' | 'courtroom' | 'light' | 'parchment';
    theme?: 'dark' | 'light';
    closeOnOutsideClick?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    showCloseButton?: boolean;
    class?: string;
    onclose?: () => void;
    onClose?: () => void;
  }

  let {
    open = $bindable(false),
    title = '',
    subtitle = '',
    description = '',
    size = 'md',
    variant = 'glass',
    theme = 'dark',
    closeOnOutsideClick = true,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    showCloseButton = true,
    class: className = '',
    onclose,
    onClose,
    children,
    footer,
    header
  }: Props & {
    children?: Snippet;
    footer?: Snippet;
    header?: Snippet;
  } = $props();

  function handleClose() {
    open = false;
    onclose?.();
    onClose?.();
  }

  const isLight = $derived(theme === 'light' || variant === 'light' || variant === 'parchment');
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
    <Dialog.Overlay class="hud-modal-backdrop" />
    <Dialog.Content
      class="hud-modal-content {sizeClasses} {variant} {isLight ? 'theme-light' : ''} {className}"
      interactOutsideBehavior={outsideClickAllowed ? 'close' : 'ignore'}
      escapeKeydownBehavior={closeOnEscape ? 'close' : 'ignore'}
    >
      <!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
      <div class="hud-notch-tl" aria-hidden="true"></div>
      <div class="hud-notch-tr" aria-hidden="true"></div>
      <div class="hud-notch-bl" aria-hidden="true"></div>
      <div class="hud-notch-br" aria-hidden="true"></div>

      <!-- Header Section -->
      {#if header}
        <div class="hud-modal-header">
          {@render header()}
          {#if showCloseButton}
            <Dialog.Close class="hud-modal-close" onclick={handleClose} aria-label="Close modal">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          {/if}
        </div>
      {:else if title}
        <div class="hud-modal-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="hud-modal-icon">
              <svg class="w-4 h-4 text-[#f3d471]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="M7 21h10"/>
                <path d="M12 3v18"/>
                <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
              </svg>
            </div>
            <div class="min-w-0">
              <Dialog.Title class="hud-modal-title">
                {title}
              </Dialog.Title>
              {#if subText}
                <Dialog.Description class="hud-modal-subtitle">
                  {subText}
                </Dialog.Description>
              {/if}
            </div>
          </div>
          {#if showCloseButton}
            <Dialog.Close class="hud-modal-close" onclick={handleClose} aria-label="Close modal">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          {/if}
        </div>
      {/if}

      <!-- Body Section -->
      <div class="hud-modal-body">
        {#if children}
          {@render children()}
        {/if}
      </div>

      <!-- Footer Section -->
      {#if footer}
        <div class="hud-modal-footer">
          {@render footer()}
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.hud-modal-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 9990;
    background: rgba(4, 6, 12, 0.78);
    backdrop-filter: blur(14px) saturate(1.1);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: hudFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(.hud-modal-content) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9991;
    background: linear-gradient(180deg, rgba(19, 27, 42, 0.98) 0%, rgba(8, 12, 20, 0.99) 100%);
    border-radius: var(--shell-radius-curve, 18px);
    border: 1px solid rgba(212, 199, 163, 0.28);
    box-shadow:
      0 0 0 1px rgba(126, 231, 255, 0.05),
      0 28px 60px -18px rgba(0, 0, 0, 0.85),
      0 0 45px rgba(243, 212, 113, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(20px) saturate(1.2);
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: rgba(233, 240, 255, 0.92);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    animation: hudScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(.hud-modal-content::before) {
    content: '';
    position: absolute;
    inset: 0 1.5rem auto;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(243, 212, 113, 0.9), rgba(126, 231, 255, 0.7), transparent);
    pointer-events: none;
    z-index: 2;
  }

  /* Tactical corner notches */
  .hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
    position: absolute;
    width: 8px;
    height: 8px;
    pointer-events: none;
    z-index: 3;
  }
  .hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
  .hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

  /* Header */
  .hud-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.125rem 1.5rem;
    border-bottom: 1px solid rgba(126, 231, 255, 0.12);
    background: rgba(0, 0, 0, 0.35);
    position: relative;
    z-index: 1;
  }

  .hud-modal-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border: 1px solid rgba(243, 212, 113, 0.35);
    background: rgba(243, 212, 113, 0.08);
    box-shadow: 0 0 10px rgba(243, 212, 113, 0.15);
    border-radius: 4px;
    flex-shrink: 0;
  }

  :global(.hud-modal-title) {
    font-size: 0.95rem;
    font-weight: 700;
    color: #f3d471;
    margin: 0;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-shadow: 0 0 8px rgba(243, 212, 113, 0.35);
  }

  :global(.hud-modal-subtitle) {
    font-size: 0.6875rem;
    color: rgba(212, 199, 163, 0.65);
    margin: 0.15rem 0 0 0;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  :global(.hud-modal-close) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 4px;
    background: rgba(126, 231, 255, 0.06);
    border: 1px solid rgba(126, 231, 255, 0.2);
    cursor: pointer;
    padding: 0;
    color: rgba(214, 226, 248, 0.7);
    transition: all 0.15s ease;
  }

  :global(.hud-modal-close:hover) {
    color: #f3d471;
    background: rgba(243, 212, 113, 0.15);
    border-color: rgba(243, 212, 113, 0.5);
    box-shadow: 0 0 12px rgba(243, 212, 113, 0.25);
  }

  /* Body */
  .hud-modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
    color: rgba(233, 240, 255, 0.88);
  }

  .hud-modal-body::-webkit-scrollbar {
    width: 6px;
  }
  .hud-modal-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .hud-modal-body::-webkit-scrollbar-thumb {
    background: rgba(212, 199, 163, 0.18);
    border-radius: 3px;
  }

  /* Footer */
  .hud-modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(126, 231, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    align-items: center;
  }

  /* ══ Light / Parchment Theme Overrides ══ */
  :global(.hud-modal-content.theme-light) {
    background: #fcfbf9 !important;
    border-color: #d8cdb8 !important;
    box-shadow:
      0 0 0 1px rgba(197, 158, 43, 0.15),
      0 28px 65px -15px rgba(25, 20, 15, 0.35),
      0 0 35px rgba(197, 158, 43, 0.08) !important;
    color: #1e293b !important;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  }

  :global(.hud-modal-content.theme-light::before) {
    background: linear-gradient(90deg, transparent, rgba(197, 158, 43, 0.9), transparent) !important;
  }

  :global(.hud-modal-content.theme-light .hud-notch-tl),
  :global(.hud-modal-content.theme-light .hud-notch-tr),
  :global(.hud-modal-content.theme-light .hud-notch-bl),
  :global(.hud-modal-content.theme-light .hud-notch-br) {
    border-color: #c59e2b !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-header) {
    background: #f7f2ea !important;
    border-bottom-color: #e5dccf !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-icon) {
    background: #eedfca !important;
    border-color: #dcc8ae !important;
    box-shadow: none !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-icon svg) {
    color: #a17a26 !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-title) {
    color: #0f172a !important;
    text-shadow: none !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-subtitle) {
    color: #8c6a23 !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-close) {
    background: #ede4d6 !important;
    border-color: #dbccb8 !important;
    color: #64748b !important;
    border-radius: 6px !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-close:hover) {
    color: #0f172a !important;
    background: #e2d4c0 !important;
    border-color: #c59e2b !important;
    box-shadow: none !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-body) {
    color: #334155 !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-body::-webkit-scrollbar-thumb) {
    background: #d8cdb8 !important;
  }

  :global(.hud-modal-content.theme-light .hud-modal-footer) {
    background: #f7f2ea !important;
    border-top-color: #e5dccf !important;
  }

  @keyframes hudFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes hudScaleIn {
    from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
</style>
