<script lang="ts">
  import { Dialog } from 'bits-ui';
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
  <Dialog.Root open={isOpen && !!tag} onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />
      <Dialog.Content
        class="dialog fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9991] w-[92vw] max-w-[480px] max-h-[90vh] overflow-y-auto bg-[#0d0e12]/95 border border-[#2a2e3d] rounded-2xl shadow-2xl p-0 text-neutral-100 font-sans focus:outline-none"
      >
        <!-- Tactical Corner Notches -->
        <span class="hud-notch-tl" aria-hidden="true"></span>
        <span class="hud-notch-tr" aria-hidden="true"></span>
        <span class="hud-notch-bl" aria-hidden="true"></span>
        <span class="hud-notch-br" aria-hidden="true"></span>

        <!-- Red Top Highlight -->
        <div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-rose-500 to-transparent opacity-80" aria-hidden="true"></div>

        <!-- Header -->
        <header class="dialog-header">
          <div class="header-icon danger">
            <Icon name="trash-2" class="h-5 w-5" />
          </div>
          <div class="header-text">
            <Dialog.Title class="dialog-title">Delete Tag</Dialog.Title>
            <Dialog.Description class="dialog-subtitle">Remove tag from all codebase chunks</Dialog.Description>
          </div>
          <Dialog.Close class="close-btn" disabled={isDeleting} aria-label="Close dialog">
            <Icon name="x" class="h-5 w-5" />
          </Dialog.Close>
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
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}


  <style>
  .hud-notch-tl,
  .hud-notch-tr,
  .hud-notch-bl,
  .hud-notch-br {
    position: absolute;
    width: 10px;
    height: 10px;
    pointer-events: none;
    z-index: 10;
  }
  .hud-notch-tl {
    top: 3px;
    left: 3px;
    border-top: 2px solid #f87171;
    border-left: 2px solid #f87171;
  }
  .hud-notch-tr {
    top: 3px;
    right: 3px;
    border-top: 2px solid #f87171;
    border-right: 2px solid #f87171;
  }
  .hud-notch-bl {
    bottom: 3px;
    left: 3px;
    border-bottom: 2px solid #f87171;
    border-left: 2px solid #f87171;
  }
  .hud-notch-br {
    bottom: 3px;
    right: 3px;
    border-bottom: 2px solid #f87171;
    border-right: 2px solid #f87171;
  }

</style>
