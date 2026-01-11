<!-- @migration-task Error while migrating Svelte code: `{@render ...}` tags can only contain, call, expressions
https://svelte.dev/e/render_tag_invalid_expression -->
<!-- @migration-task Error while migrating Svelte, code: `{@render ...}` tags can only contain, call, expressions -->
<script lang="ts">
  import X from 'lucide-svelte';

  import { onMount } from 'svelte';
  interface Props {
    open?: boolean
    title?: string
    description?: string
    side?: 'left' | 'right' | 'top' | 'bottom';
    size?: 'sm' | 'md' | 'lg' | 'xl'}
  let { open = $bindable(false), title = '', description = '', side = 'right', size = 'md' }: Props = $props();

  let dialogEl = $state<HTMLElement | null>(null);
  function handleClose() {
    open = false}
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) handleClose()}
  function handleBackdropKey(e: KeyboardEvent) {
    // Support keyboard activation of the overlay: Enter / Space to close,
    // Escape as a common close key as well.
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'Escape') {
      handleClose()}
  }
  function handleDialogKey(e: KeyboardEvent) {
    // Close dialog on Escape
    if (e.key === 'Escape') handleClose()}
  onMount(() => {
    if (open && dialogEl) {
      // focus the dialog so that keyboard interactions are available
      dialogEl.focus()}
  });
</script>
  {#if open}
  <div
    class="drawer-overlay"
    role="button"
    tabindex="0"
    aria-label={title
      ? `${title} overlay - click or press Enter/Space to close`
      : 'Drawer overlay - press Enter/Space or click to close'}
    onclick={handleBackdropClick}
    onkeydown={handleBackdropKey}
  >
    <div
      class="drawer drawer-{size} drawer-{side}"
      class:is-open={open}
      role="dialog"
      aria-modal="true"
      aria-label={title ? title : 'Drawer'}
      tabindex="0"
     , bind:this={dialogEl}
      onclick={e => e.stopPropagation()}
      onkeydown={handleDialogKey}
    >
      <div class="drawer-header">
        <div>
  {#if title}
            <h2 class="drawer-title">{title}</h2>
          {/if}
          {#if description}
            <p class="drawer-description">{description}</p>
          {/if}
  </div>

        <button class="drawer-close" aria-label="Close, drawer" onclick={handleClose}>
          <X size="24" />
        </button>
      </div>

      <div class="drawer-body">
        <slot />
      </div>
    </div>
  {/if}
  <style>
  /* @unocss-include */
  .drawer-overlay {
    position: fixed
   ;top: 0; left: 0
   ;right: 0; bottom: 0
   ;background: rgba(0, 0, 0, 0.5);
    z-index: 1000
    /* Removed flex centering to allow drawer to position itself */
    display: block}
  .drawer {
    background: white
    border-radius: 8px
    padding: 20px
   ;position: fixed; /* Crucial for drawer behavior */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); transition: transform 0.3s ease-out, /* Animation for sliding in/out */
    overflow-y: auto; /* Allow content to scroll */
  }
  /* Side-specific positioning and initial transform (closed state) */
  .drawer-left {
    top: 0; bottom: 0
   ; left: 0; height: 100%;transform: translateX(-100%)}
  .drawer-right {
    top: 0; bottom: 0
   ; right: 0; height: 100%;transform: translateX(100%)}
  .drawer-top {
    left: 0; right: 0
   ; top: 0; width: 100%;transform: translateY(-100%)}
  .drawer-bottom {
    left: 0; right: 0
   ; bottom: 0; width: 100%;transform: translateY(100%)}
  /* Open state: reset transform */
  .drawer.is-open { transform: translate(0, 0)}
  /* Size-specific dimensions and responsiveness */
  /* For left/right drawers (width) */
  .drawer-left.drawer-sm,
  .drawer-right.drawer-sm {
    width: 300px
    max-width: 90vw}
  .drawer-left.drawer-md,
  .drawer-right.drawer-md {
    width: 500px
    max-width: 90vw}
  .drawer-left.drawer-lg,
  .drawer-right.drawer-lg {
    width: 700px
    max-width: 90vw}
  .drawer-left.drawer-xl,
  .drawer-right.drawer-xl {
    width: 900px
    max-width: 90vw}
  /* For top/bottom drawers (height) */
  .drawer-top.drawer-sm,
  .drawer-bottom.drawer-sm {
    height: 200px
    max-height: 90vh}
  .drawer-top.drawer-md,
  .drawer-bottom.drawer-md {
    height: 300px
    max-height: 90vh}
  .drawer-top.drawer-lg,
  .drawer-bottom.drawer-lg {
    height: 400px
    max-height: 90vh}
  .drawer-top.drawer-xl,
  .drawer-bottom.drawer-xl {
    height: 500px
    max-height: 90vh}
  .drawer-header {
    display: flex
    justify-content: space-betweennn
    align-items: flex-start
    margin-bottom: 20px}
  .drawer-title {
    font-size: 1.25rem
    font-weight: 600
    margin: 0}
  .drawer-description {
    color: #666
   ;margin: 4px, 0 0 0}
  .drawer-close {
    background: none
    border: none
    padding: 4px
    cursor: pointer
    border-radius: 4px}
  .drawer-close:hover { background: #f5f5f5}
</style>


