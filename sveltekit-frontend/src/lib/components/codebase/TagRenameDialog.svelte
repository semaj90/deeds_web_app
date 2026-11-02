<script lang="ts">
  import { Dialog } from 'bits-ui';
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * Tag Rename Dialog Component
   * ═══════════════════════════════════════════════════════════════════════
   * Task: 15.2 - Create tag rename dialog
   * Purpose: Input validation, confirmation, progress indicator
   */
  import Icon from '$lib/components/ui/Icon.svelte';

  interface TagInfo {
    id: string;
	name: string;
    filePath: string;
	type: string;
  }

  interface Props {
    tag: TagInfo | null;
    isOpen?: boolean;
    onClose?: () => void;
    onRename?: (oldName: string, newName: string) => Promise<boolean>;
  }

  let {
    tag = null,
    isOpen = false,
    onClose = () => {},
	onRename = async () => true
  }: Props = $props();

  // State
  let newName = $state('');
  let isRenaming = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  // Validation
  let isValid = $derived(
    newName.trim().length > 0 &&
    newName !== tag?.name &&
    /^[a-zA-Z0-9_\-\.]+$/.test(newName)
  );

  let validationMessage = $derived.by(() => {
    if (!newName.trim()) return 'Name cannot be empty';
    if (newName === tag?.name) return 'Name must be different';
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(newName)) return 'Only letters, numbers, _, -, . allowed';
    return null;
  });

  $effect(() => {
    if (tag) {
      newName = tag.name;
      error = null;
      success = false;
    }
  });

  async function handleRename() {
    if (!tag || !isValid || isRenaming) return;

    isRenaming = true;
    error = null;

    try {
      const result = await onRename(tag.name, newName);
      if (result) {
        success = true;
        setTimeout(() => {
          onClose();
        },
	1500);
      } else {
        error = 'Rename failed. Please try again.';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      isRenaming = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && isValid && !isRenaming) {
      handleRename();
    } else if (event.key === 'Escape') {
      onClose();
    }
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

        <!-- Gold Top Highlight -->
        <div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471] to-transparent opacity-80" aria-hidden="true"></div>

        <!-- Header -->
        <header class="dialog-header">
          <div class="header-icon">
            <Icon name="tag" class="h-5 w-5" />
          </div>
          <div class="header-text">
            <Dialog.Title class="dialog-title">Rename Tag</Dialog.Title>
            <Dialog.Description class="dialog-subtitle">Update the tag name across all databases</Dialog.Description>
          </div>
          <Dialog.Close class="close-btn" disabled={isRenaming} aria-label="Close dialog">
            <Icon name="x" class="h-5 w-5" />
          </Dialog.Close>
        </header>

        <!-- Content -->
        <div class="dialog-content">
        <!-- Current Name -->
        <div class="field">
          <span class="field-label">Current Name</span>
          <div class="current-name">
            <code>{tag.name}</code>
          </div>
        </div>

        <!-- New Name Input -->
        <div class="field">
          <label class="field-label" for="new-name">New Name</label>
          <input
            id="new-name"
            type="text"
            bind:value={newName}
            onkeydown={handleKeydown}
            class="name-input"
            class:invalid={newName && !isValid}
            class:valid={isValid}
            placeholder="Enter new name..."
            disabled={isRenaming || success}
          />
          {#if newName && validationMessage}
            <span class="validation-message">{validationMessage}</span>
          {/if}
        </div>

        <!-- File Path Info -->
        <div class="info-box">
          <span class="info-label">File:</span>
          <code class="info-value">{tag.filePath}</code>
        </div>

        <!-- Warning -->
        <div class="warning-box">
          <Icon name="circle-alert" class="h-4 w-4" />
          <span>This will update the tag in Qdrant, PostgreSQL, Neo4j, and CouchDB atomically.</span>
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="error-box">
            <Icon name="circle-alert" class="h-4 w-4" />
            <span>{error}</span>
          </div>
        {/if}

        <!-- Success Message -->
        {#if success}
          <div class="success-box">
            <Icon name="check" class="h-4 w-4" />
            <span>Tag renamed successfully!</span>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <footer class="dialog-footer">
        <button
          class="btn secondary"
          onclick={onClose}
          disabled={isRenaming}
        >
          Cancel
        </button>
        <button
          class="btn primary"
          onclick={handleRename}
          disabled={!isValid || isRenaming || success}
        >
          {#if isRenaming}
            <Icon name="loader-circle" class="h-4 w-4 animate-spin" />
            Renaming...
          {:else if success}
            <Icon name="check" class="h-4 w-4" />
            Done
          {:else}
            Rename Tag
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
    border-top: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-tr {
    top: 3px;
    right: 3px;
    border-top: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
  .hud-notch-bl {
    bottom: 3px;
    left: 3px;
    border-bottom: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-br {
    bottom: 3px;
    right: 3px;
    border-bottom: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }

</style>
