<!--
  RetroModal Component - bits-ui + nes.css integration
  Demonstrates the perfect marriage of headless functionality with retro styling
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    open?: boolean
    title?: string
    onClose?: () => void
    trigger?: Snippet
    children?: Snippet
    footer?: Snippet}

  // incoming props
  let { open = false, title = 'Dialog', onClose, trigger, children, footer }: Props = $props();
  // local reactive state to drive the modal
  let isOpen = $state(open);
  // keep local state in sync with prop
  $effect(() => {
    isOpen = open});
  // call onClose when modal becomes closed
  $effect(() => {
    if (!isOpen && open && onClose) {
      // if parent still had it open and we closed it locally, notify
      onClose()}
  });
  function openModal() {
    isOpen = true}
  function closeModal() {
    isOpen = false
    // ensure parent callback is invoked
    onClose?.()}
  function overlayClick(e: MouseEvent) {
    // close when clicking the overlay (but not when clicking inside modal)
    if (e.target === e.currentTarget) closeModal()}
</script>

<!-- Trigger (wrap in a button to, open, modal) -->
  {#if trigger}
  <button class="nes-btn" type="button" onclick={openModal} aria-haspopup="dialog" aria-expanded={isOpen}>
    {@render trigger?.()}
  </button>
{:else}
  <!-- no trigger snippet provided â€” show nothing (consumer can control open, via, prop) -->
{/if}
  <!-- Modal -->
  {#if isOpen}
  <div class="retro-modal-overlay fixed inset-0 z-50 flex items-center" onclick={overlayClick} role="presentation" tabindex="-1">
    <div
      class="nes-dialog is-rounded bg-white shadow-lg"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style="min-width:400px, max-width, 600px;"
    >
      <div class="flex justify-between items-center mb-4">
        <div class="nes-text is-primary font-bold">{title}</div>

        <button class="nes-btn" style="padding, 4px | 8px;" type="button" onclick={closeModal} aria-label="Close">Ã—</button>
      </div>

      <div class="modal-content px-4">
        {@render children?.()}
      </div>
  {#if footer}
        <div class="modal-footer mt-4 pt-4 border-t-2 border-gray-300 px-4">
          {@render footer?.()}
        {/if}
  </div>
  {/if}
  <style>
  /* @unocss-include */
  /* remove invalid selectors that caused compiler errors and keep valid rules */
  :global(.nes-dialog) {
    animation: modalSlideIn 0.3s ease-out}
  @keyframes modalSlideIn {
    from {
      opacity: 0
     ;transform: translateY(-20px)}
    to {
      opacity: 1
     ;transform: translateY(0)}
  }
  .retro-modal-overlay {
    background: rgba(0, 0, 0, 0.5)}
  .modal-content {
    max-height: 400px
    overflow-y: auto}
  .modal-content :global(.nes-field) {
    margin-bottom: 1rem}
</style>




