<script lang="ts">
  /**
   * Tag Delete Dialog
   * Confirms and executes DELETE /api/codebase-index/tags
   * to strip a tag from every matching codebase chunk.
   */
  import Icon from '$lib/components/ui/Icon.svelte';

  interface TagInfo {
    id: string;
    name: string;
    filePath?: string;
    count?: number; // how many chunks carry this tag (from the facet browser)
  }

  interface Props {
    tag: TagInfo | null;
    isOpen?: boolean;
    onClose?: () => void;
    onDelete?: (tagName: string) => Promise<boolean>;
  }

  let {
    tag = null,
    isOpen = false,
    onClose = () => {},
    onDelete = async () => true,
  }: Props = $props();

  let isDeleting = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let confirmed = $state(false);

  $effect(() => {
    if (tag) {
      error = null;
      success = false;
      confirmed = false;
    }
  });

  async function handleDelete() {
    if (!tag || !confirmed || isDeleting) return;

    isDeleting = true;
    error = null;

    try {
      const ok = await onDelete(tag.name);
      if (ok) {
        success = true;
        setTimeout(() => onClose(), 1500);
      } else {
        error = 'Deletion failed. Please try again.';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      isDeleting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && confirmed && !isDeleting) handleDelete();
    else if (event.key === 'Escape') onClose();
  }
</script>

{#if isOpen && tag}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog-overlay" onclick={onClose} role="presentation">
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" onkeydown={handleKeydown}>
      <!-- Header -->
      <header class="dialog-header">
        <div class="header-icon danger">
          <Icon name="trash-2" class="h-5 w-5" />
        </div>
        <div class="header-text">
          <h2 class="dialog-title">Delete Tag</h2>
          <p class="dialog-subtitle">Remove tag from all codebase chunks</p>
        </div>
        <button class="close-btn" onclick={onClose} disabled={isDeleting}>
          <Icon name="x" class="h-5 w-5" />
        </button>
      </header>

      <!-- Content -->
      <div class="dialog-content">
        <div class="field">
          <span class="field-label">Tag to Delete</span>
          <div class="current-name">
            <code>{tag.name}</code>
            {#if tag.count !== undefined}
              <span class="count-badge">{tag.count} chunk{tag.count !== 1 ? 's' : ''}</span>
            {/if}
          </div>
        </div>

        <div class="danger-box">
          <Icon name="circle-alert" class="h-4 w-4" />
          <span>
            This will permanently remove the tag <strong>"{tag.name}"</strong> from every
            matching chunk in Qdrant. The chunks themselves are not deleted — only the tag label.
            This action cannot be undone.
          </span>
        </div>

        <label class="confirm-row">
          <input
            type="checkbox"
            bind:checked={confirmed}
            disabled={isDeleting || success}
          />
          <span>I understand this is irreversible</span>
        </label>

        {#if error}
          <div class="error-box">
            <Icon name="circle-alert" class="h-4 w-4" />
            <span>{error}</span>
          </div>
        {/if}

        {#if success}
          <div class="success-box">
            <Icon name="check" class="h-4 w-4" />
            <span>Tag deleted successfully!</span>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <footer class="dialog-footer">
        <button class="btn secondary" onclick={onClose} disabled={isDeleting}>
          Cancel
        </button>
        <button
          class="btn danger"
          onclick={handleDelete}
          disabled={!confirmed || isDeleting || success}
        >
          {#if isDeleting}
            <Icon name="loader-circle" class="h-4 w-4 animate-spin" />
            Deleting...
          {:else if success}
            <Icon name="check" class="h-4 w-4" />
            Done
          {:else}
            Delete Tag
          {/if}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: #0a0a0a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-icon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    flex-shrink: 0;
  }

  .header-icon.danger {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .header-text { flex: 1; }

  .dialog-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin: 0 0 0.25rem 0;
  }

  .dialog-subtitle {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .close-btn:hover:not(:disabled) { color: white; background: rgba(255, 255, 255, 0.1); }
  .close-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .dialog-content {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .current-name {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
  }

  .current-name code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .count-badge {
    font-size: 0.75rem;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #f87171;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
  }

  .danger-box {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    color: #f87171;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .confirm-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
  }

  .confirm-row input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: #f87171;
    cursor: pointer;
  }

  .error-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    color: #f87171;
    font-size: 0.875rem;
  }

  .success-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid rgba(74, 222, 128, 0.2);
    border-radius: 8px;
    color: #4ade80;
    font-size: 0.875rem;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn.secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .btn.danger {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  .btn.danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.3); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  :global(.animate-spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
