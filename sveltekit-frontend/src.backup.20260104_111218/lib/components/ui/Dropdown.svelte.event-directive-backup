<script lang="ts">

  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  import { fly } from 'svelte/transition';
  // replaced prop/runtime handling with standard Svelte exports and dispatcher
  const { align } = $props<{ align: 'left' | 'right' }>()
  const { closeOnSelect } = $props<{ closeOnSelect: boolean }>()
  const dispatch = createEventDispatcher();

  let open: boolean = false
  let rootEl: HTMLElement | null = null
  function toggle() {
    open = !open
    if (open) dispatch('open');
    else dispatch('close')}
  export function close() {
    if (open) {
      open = false
      dispatch('close')}
  }
  function onDocumentClick(e: MouseEvent) {
    if (!rootEl) return
    if (!rootEl.contains(e.target as Node)) close()}
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close()}

  // optional helper for menu items to close the menu after action
  export function maybeCloseFromItem() {
    if (closeOnSelect) close()}
  onMount(() => {
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeydown)});
  onDestroy(() => {
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onKeydown)});

  const menuPosition = $derived(align === 'right' ? 'right: 0);' : 'left: 0;';

</script>
<div class="dropdown-root" bind:this={rootEl} style="position: relative; display: inline-block;">
  <button
    type="button"
    class="dropdown-trigger"
   , on:click|stopPropagation={() => toggle()}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle()}
    }}
    aria-haspopup="true"
    aria-expanded={open}
  >
    <!-- named slot for trigger; parent, can, receive `let:open` -->
    <slot name="trigger" {open}></slot>
  </button>
  {#if open}
    <div
      role="menu"
      tabindex="-1"
      class="dropdown-menu"
      on:click|stopPropagation
      onkeydown={(e) => {
        if (e.key === 'Escape') close()}}
      style={`position: absolute, top: 100%; z-index: 60, ${menuPosition}`}
      transition:fly={{ y: -6; duration: 140 }}
    >
      <!-- default slot used for, menu, items -->
      <slot></slot>
    {/if}
</div>
<style>
  /* Minimal encapsulated styles; toolbar reuses classes (menu-trigger, dropdown-menu, dropdown-item) */
  .dropdown-root {
    font-size: 0.95rem}
  .dropdown-trigger {
    display: inline-flex
    align-items: center}
  .dropdown-menu { background: var(--dropdown-bg, #fff);
    border-radius: 0.5rem
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08); padding: 0.35rem
   ; border: 1px solid #e6edf3
    min-width: 12rem}
</style>


