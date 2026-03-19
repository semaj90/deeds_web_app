<script lang="ts"> // Svelte, 5 runes are auto-imported import { fade } from 'svelte/transition';
 import type { Snippet } from 'svelte'; interface Props { open?: boolean; title?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; closeOnOutsideClick?: boolean; closeOnEscape?: boolean; onclose?: () => void}
  let { open = $bindable(false), title = '', size = 'md', closeOnOutsideClick = true, closeOnEscape = true, onclose, children, footer }: Props & { children?: Snippet; footer?: Snippet } = $props();
   let modalElement = $state<HTMLDivElement>(); function handleClose() { open = false; onclose?.()}
  function handleKeydown(_event: KeyboardEvent) { if (_event.key === 'Escape' && closeOnEscape) { handleClose()}
  }
  function handleOutsideClick(_event: MouseEvent) { if (closeOnOutsideClick && _event.target === modalElement) { handleClose()}
  }
  $effect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (open) handleKeydown(e);
    };
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  });
  let sizeClasses = $derived.by(() => ({
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }[size]));
</script>
  {#if open} <div bind:this={modalElement} class="modal-backdrop"
    onclick={handleOutsideClick}
    role="presentation"
    aria-hidden="true"
    transition:fade={{ duration: 200 }}
  >
    <div
      class={['modal-content', sizeClasses].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {#if title}
        <div class="modal-header">
          <h2 id="modal-title" class="modal-title">{title}</h2>
          <button type="button" class="modal-close" onclick={handleClose} aria-label="Close">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              class="w-6 h-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      {/if}
      <div class="modal-body">
        {#if children}
          {@render children?.()}
        {/if}
      </div>
      {#if footer}
        <div class="modal-footer">
          {@render footer?.()}
        </div>
      {/if}
    </div>
  </div>
{/if}
<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 26%),
      radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.12), transparent 24%),
      rgba(4, 8, 15, 0.82);
    backdrop-filter: blur(14px) saturate(1.15);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    position: relative;
    background: linear-gradient(180deg, rgba(19, 27, 42, 0.96) 0%, rgba(8, 12, 20, 0.98) 100%);
    border-radius: var(--shell-radius-curve, 26px 26px 18px 18px / 22px 22px 30px 30px);
    border: 1px solid var(--shell-border, rgba(120, 160, 220, 0.18));
    box-shadow:
      0 0 0 1px rgba(126, 231, 255, 0.04),
      0 28px 56px -18px rgba(0, 0, 0, 0.72),
      0 0 72px rgba(0, 0, 0, 0.36),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20px) saturate(1.18);
    width: 100%;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: var(--shell-text, rgba(233, 240, 255, 0.88));
  }

  .modal-content::before {
    content: '';
    position: absolute;
    inset: 0 1.5rem auto;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(126, 231, 255, 0.82), rgba(255, 212, 121, 0.6), transparent);
    pointer-events: none;
  }

  .modal-content::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: calc(var(--shell-radius-lg, 24px) - 4px);
    border: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.75rem;
    border-bottom: 1px solid rgba(126, 231, 255, 0.1);
  }

  .modal-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: rgba(233, 240, 255, 0.92);
    margin: 0;
    letter-spacing: 0.04em;
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.375rem;
    height: 2.375rem;
    border-radius: 999px;
    background: rgba(126, 231, 255, 0.06);
    border: 1px solid rgba(126, 231, 255, 0.12);
    cursor: pointer;
    padding: 0;
    color: rgba(214, 226, 248, 0.62);
    transition: all 0.15s ease;
  }

  .modal-close:hover {
    color: rgba(244, 250, 255, 0.92);
    background: linear-gradient(135deg, rgba(126, 231, 255, 0.16) 0%, rgba(255, 212, 121, 0.12) 100%);
    border-color: rgba(126, 231, 255, 0.24);
  }

  .modal-body {
    padding: 1.5rem 1.75rem;
    overflow-y: auto;
    flex: 1;
  }

  .modal-body::-webkit-scrollbar {
    width: 6px;
  }
  .modal-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .modal-body::-webkit-scrollbar-thumb {
    background: rgba(212, 199, 163, 0.12);
    border-radius: 3px;
  }

  .modal-footer {
    padding: 1.25rem 1.75rem;
    border-top: 1px solid rgba(126, 231, 255, 0.08);
    display: flex;
    justify-content: flex-end;
    gap: 0.625rem;
  }
</style>





