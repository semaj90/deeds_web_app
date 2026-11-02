<!-- AI Dialog: Svelte 5 | Bits UI v2 Dialog | Tactical HUD Aesthetic -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Dialog } from 'bits-ui';

  interface Props {
    class?: string;
    children?: Snippet;
    open: boolean;
    title: string;
    onClose?: () => void;
  }

  let {
    class: className = '',
    children,
    open = $bindable(false),
    title,
    onClose
  }: Props = $props();

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;
    if (!isOpen && onClose) {
      onClose();
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <!-- Tactical Backdrop -->
    <Dialog.Overlay class="hud-modal-backdrop fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />

    <!-- Centered Modal Content -->
    <div class="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
      <Dialog.Content
        class="pointer-events-auto relative w-full max-w-md bg-[#131b2a]/95 text-sand border border-[#f3d471]/30 rounded-lg shadow-2xl p-6 backdrop-blur-xl {className}"
      >
        <!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
        <span class="hud-notch-tl" aria-hidden="true"></span>
        <span class="hud-notch-tr" aria-hidden="true"></span>
        <span class="hud-notch-bl" aria-hidden="true"></span>
        <span class="hud-notch-br" aria-hidden="true"></span>

        <!-- Top Highlight Bar -->
        <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471]/80 to-transparent"></div>

        <div class="flex items-center justify-between mb-4">
          <Dialog.Title class="font-bold text-lg text-white flex items-center gap-2">
            <span class="text-[#f3d471]">⚖</span>
            <span>{title}</span>
          </Dialog.Title>

          <Dialog.Close
            class="text-neutral-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            ✕
          </Dialog.Close>
        </div>

        {#if children}
          {@render children()}
        {/if}
      </Dialog.Content>
    </div>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .hud-notch-tl,
  .hud-notch-tr,
  .hud-notch-bl,
  .hud-notch-br {
    position: absolute;
    width: 8px;
    height: 8px;
    pointer-events: none;
  }
  .hud-notch-tl {
    top: -1px;
    left: -1px;
    border-top: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-tr {
    top: -1px;
    right: -1px;
    border-top: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
  .hud-notch-bl {
    bottom: -1px;
    left: -1px;
    border-bottom: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-br {
    bottom: -1px;
    right: -1px;
    border-bottom: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
</style>
