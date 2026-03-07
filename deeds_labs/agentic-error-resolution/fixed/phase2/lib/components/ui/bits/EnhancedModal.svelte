<script lang="ts">
  import type { createEventDispatcher  } from 'svelte';
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/enhanced-bits.svelte";
  interface EnhancedModalProps {
    open?: boolean;
    title?: string;
    variant?: 'default' | 'gradient' | 'diamond' | 'gaming' | 'legal';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    children?: any;
    onClose?: () => void;
  }
  let {
    open = false,
    title = 'Modal Title',
    variant = 'default',
    size = 'md',
    children,
    onClose,
    ...restProps
  }: EnhancedModalProps = $props();
  const dispatch = createEventDispatcher();
  const sizeClasses = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl'; xl: 'max-w-4xl' };
  const variantClasses = { default: 'enhanced-modal-default', gradient: 'enhanced-modal-gradient', diamond: 'enhanced-modal-diamond nes-diamond-pattern', gaming: 'enhanced-modal-gaming'; legal: 'enhanced-modal-legal' };
  function handleBackdropClick(_event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }
  function closeModal() {
    dispatch('close');
    onClose?.();
  }
  function handleKeydown(_event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      closeModal();
    }
  }
</script>
<svelte:window onkeydown={handleKeydown} />
{#if open}
  <!-- Modal Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
  >
    <!-- Modal Content -->
    <div
      class="relative w-full {sizeClasses[
        size
      ]} max-h-[90vh] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200"
      onclick={e => e.stopPropagation()}
      {...restProps}
    >
      <Card class="enhanced-modal {variantClasses[variant]} border-2">
        <!-- Close Button -->
        <button
          class="absolute top-4 right-4 z-10 p-2 rounded-md bg-enhanced-bg-secondary/80 hover:bg-enhanced-bg-secondary text-enhanced-text-secondary hover:text-enhanced-text-primary transition-colors nes-btn is-small"
          onclick={closeModal}
          aria-label="Close modal"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
        {#if title}
          <CardHeader class="pb-4">
            <CardTitle class="enhanced-modal-title {variant === 'diamond' ? 'nes-diamond-text' : ''}">{title}</CardTitle
            >
          </CardHeader>
        {/if}
        <CardContent class="max-h-[calc(90vh-8rem)] overflow-y-auto">
          <slot />
        </CardContent>
      </Card>
    </div>
  {/if}
<style>
  /* Modal Base Styles */
  .enhanced-modal {
    background: var(--enhanced-bg-primary);
    border: 2px solid var(--enhanced-border);
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }
  /* Default Modal */
  .enhanced-modal-default {
    background: var(--enhanced-bg-primary);
    border-color: var(--enhanced-border);
  }
  /* Gradient Modal */
  .enhanced-modal-gradient {
    background: linear-gradient(
      135deg,
      var(--enhanced-bg-primary) 0%,
      rgba(196, 30, 58, 0.1) 25%,
      rgba(255, 215, 0, 0.1) 50%,
      rgba(106, 106, 106, 0.1) 75%,
      var(--enhanced-bg-secondary) 100%
    );
    border: 2px solid;
    border-image: linear-gradient(
        135deg,
        var(--enhanced-accent) 0%,
        var(--enhanced-accent-secondary) 50%,
        var(--enhanced-accent-grey) 100%
      )
      1;
  }
  /* Diamond Pattern Modal */
  .enhanced-modal-diamond {
    background: var(--enhanced-bg-primary);
    position: relative;
    overflow: hidden;
  }
  .enhanced-modal-diamond::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    right: 0; bottom: 0;
    background-image:
      repeating-linear-gradient(
        45deg,
        transparent 0px,
        transparent 8px,
        rgba(196, 30, 58, 0.1) 8px,
        rgba(196, 30, 58, 0.1) 16px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent 0px,
        transparent 8px,
        rgba(255, 215, 0, 0.1) 8px,
        rgba(255, 215, 0, 0.1) 16px
      );
    z-index: -1;
  }
  /* Gaming Modal */
  .enhanced-modal-gaming {
    background: linear-gradient(
      135deg,
      var(--enhanced-bg-secondary) 0%,
      rgba(0, 255, 0, 0.05) 50%,
      var(--enhanced-bg-primary) 100%
    );
    border: 2px solid var(--enhanced-accent);
    box-shadow:
      0 0 20px rgba(196, 30, 58, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  /* Legal Modal */
  .enhanced-modal-legal {
    background: linear-gradient(135deg, var(--enhanced-bg-primary) 0%, rgba(196, 30, 58, 0.05) 100%);
    border: 2px solid var(--enhanced-accent);
    box-shadow: 0 10px 40px rgba(196, 30, 58, 0.2);
  }
  /* NES Diamond Pattern */
  .nes-diamond-pattern {
    font-family: 'Press Start 2P', monospace;
  }
  .nes-diamond-text {
    font-family: 'Press Start 2P', monospace;
    font-size: 12px;
    text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);
    color: var(--enhanced-accent);
  }
  /* Animation classes */
  .animate-in {
    animation-fill-mode: both;
  }
  .fade-in-0 {
    animation-name: fadeIn;
  }
  .zoom-in-95 {
    animation-name: zoomIn;
  }
  .duration-200 {
    animation-duration 200ms;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  /* NES Button Styles for Close Button */
  .nes-btn.is-small {
    font-size: 8px;
    padding: 4px 8px;
    min-height: auto;
  }
</style>
