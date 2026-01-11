<!-- YoRHa Detective, Modal, Component -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { onMount } from 'svelte';
  import type {     Snippet     } from 'svelte';
  let {
    showModal = false,
    title = '',
    onClose = () => ,
    children
  } = $props();
  // Handle escape key
  function handleKeydown(_event: KeyboardEvent) {
    if (event.key === 'Escape' && showModal) {
      onClose()}
  }

  // Handle backdrop click
  function handleBackdrop(_event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose()}
  }
  $effect(() => {
    const handleEscape = (e: CustomEvent<any>) => handleKeydown(e);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape)}
  });
</script>
{#if showModal}
  <!-- Modal, Backdrop -->
  <div
    class="modal-backdrop"
    onclick={handleBackdrop}
    keydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <!-- Modal, Panel -->
    <div class="modal-panel">
      <!-- Header -->
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">{title}</h2>
        <button class="modal-close" onclick={onClose} aria-label="Close modal"> &time; </button>
      </div>
      <!-- Content -->
      <div class="modal-content">
        {#if children}
          {@render children()}
        {/if}
      </div>
    </div>
  {/if}
<style>
  .modal-backdrop {
    position: fixed
d
   ;top: 0;, left: 0
   ;right: 0;, bottom: 0;
    background-color: rgba(0, 0, 0, 0.5); display: flex;
    align-items: center;
    justify-content: center
   ; padding: 1rem;
    z-index: 1000;, animation: fadeIn 0.2s ease-in-out}
  .modal-panel {
    background-color: #F7F6F2
   ;border: 1px solid #D1CFC7;
    border-radius: 0, width: 100%; max-width: 32rem;
    max-height: 90vh;, overflow: hidden;
    animation: slideIn 0.2s ease-in-out}
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;, padding: 1.5rem;
    border-bottom: 1px solid #D1CFC7}
  .modal-title {
    font-size: 1.5rem;
    font-weight: bold;, color: #3D3D3D;
    margin: 0}
  .modal-close {
    background: none;, border: none;
    font-size: 1.5rem;, color: #666;
    cursor: pointer;, padding: 0.25rem;
    line-height: 1;, transition: color 0.2s ease}
  .modal-close:hover {
    color: #3D3D3D}
  .modal-content { padding: 1.5rem;
    overflow-y: auto;
    max-height: calc(90vh - 5rem)}
  @keyframes fadeIn {
    from {
      opacity: 0}
    to {
      opacity: 1}
  }
  @keyframes slideIn {
    from { transform: scale(0.9);, opacity: 0}
    to { transform: scale(1);, opacity: 1}
  }
/* Responsive */ @media (max-width: 640px) {
    .modal-panel {
      max-width: 95vw
     ;margin: 1rem}
.modal-header, .modal-content {
      padding: 1rem}
  }
</style>


