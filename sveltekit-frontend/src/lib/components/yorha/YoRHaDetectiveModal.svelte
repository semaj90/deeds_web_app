<!-- YoRHa Detective Modal Component -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    showModal = false,
    title = '',
    onClose = () => {},
    children
  }: {
    showModal: boolean;
    title: string;
    onClose: () => void;
    children?: Snippet;
  } = $props();

  // Handle escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && showModal) {
      onClose();
    }
  }

  // Handle backdrop click
  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  $effect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeydown);
    } else {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeydown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

{#if showModal}
  <!-- Modal Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    onclick={handleBackdrop}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <!-- Modal Panel -->
    <div class="modal-panel bg-yorha-dark border border-yorha-accent-warm/30 rounded-lg shadow-xl w-full max-w-2xl mx-4 transform transition-all p-6 relative">
      <!-- Header -->
      <div class="modal-header flex items-center justify-between mb-4 pb-2 border-b border-yorha-accent-warm/20">
        <h2 id="modal-title" class="modal-title text-xl font-bold text-yorha-light">{title}</h2>
        <button class="modal-close text-yorha-muted hover:text-yorha-accent-warm transition-colors text-2xl leading-none"
                onclick={onClose}
                aria-label="Close modal">
          &times;
        </button>
      </div>

      <!-- Content -->
      <div class="modal-content text-yorha-light">
        {#if children}
          {@render children()}
        {:else}
           <p class="text-yorha-muted text-center py-4">No content</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Minimal custom styles, using Tailwind mostly */
  .modal-panel {
      box-shadow: 0 0 20px rgba(212, 175, 55, 0.1);
  }
  .modal-header {
    justify-content: space-between;
    align-items: center; padding: 1.5rem;
    border-bottom: 1px solid #D1CFC7}
  .modal-title {
    font-size: 1.5rem;
    font-weight: bold; color: #3D3D3D;
    margin: 0}
  .modal-close {
    background: none; border: none;
    font-size: 1.5rem; color: #666;
    cursor: pointer; padding: 0.25rem;
    line-height: 1; transition: color 0.2s ease}
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
    from { transform: scale(0.9); opacity: 0}
    to { transform: scale(1); opacity: 1}
  }
/* Responsive */ @media (max-width: 640px) {
    .modal-panel {
      max-width: 95vw
     ;margin: 1rem}
.modal-header, .modal-content {
      padding: 1rem}
  }
</style>





