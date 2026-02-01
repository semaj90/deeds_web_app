<script lang="ts">
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * Tag Rename Dialog Component
   * ═══════════════════════════════════════════════════════════════════════
   * Task: 15.2 - Create tag rename dialog
   * Purpose: Input validation, confirmation, progress indicator
   */
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Check from 'lucide-svelte/icons/check';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import Tag from 'lucide-svelte/icons/tag';
  import X from 'lucide-svelte/icons/x';

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

  let validationMessage = $derived(() => {
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
  <div class="dialog-overlay" onclick={onClose} role="presentation">
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <!-- Header -->
      <header class="dialog-header">
        <div class="header-icon">
          <Tag class="h-5 w-5" />
        </div>
        <div class="header-text">
          <h2 class="dialog-title">Rename Tag</h2>
          <p class="dialog-subtitle">Update the tag name across all databases</p>
        </div>
        <button class="close-btn" onclick={onClose} disabled={isRenaming}>
          <X class="h-5 w-5" />
        </button>
      </header>

      <!-- Content -->
      <div class="dialog-content">
        <!-- Current Name -->
        <div class="field">
          <label class="field-label">Current Name</label>
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
          {#if newName && validationMessage()}
            <span class="validation-message">{validationMessage()}</span>
          {/if}
        </div>

        <!-- File Path Info -->
        <div class="info-box">
          <span class="info-label">File:</span>
          <code class="info-value">{tag.filePath}</code>
        </div>

        <!-- Warning -->
        <div class="warning-box">
          <AlertCircle class="h-4 w-4" />
          <span>This will update the tag in Qdrant, PostgreSQL, Neo4j, and CouchDB atomically.</span>
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="error-box">
            <AlertCircle class="h-4 w-4" />
            <span>{error}</span>
          </div>
        {/if}

        <!-- Success Message -->
        {#if success}
          <div class="success-box">
            <Check class="h-4 w-4" />
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
            <Loader2 class="h-4 w-4 animate-spin" />
            Renaming...
          {:else if success}
            <Check class="h-4 w-4" />
            Done
          {:else}
            Rename Tag
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
    from {
      opacity: 0;
	transform: translateY(20px);
    }
    to {
      opacity: 1;
	transform: translateY(0);
    }
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
	background: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 12px;
	color: #00d4ff;
    flex-shrink: 0;
  }

  .header-text {
    flex: 1;
  }

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

  .close-btn:hover:not(:disabled) {
    color: white;
	background: rgba(255, 255, 255, 0.1);
  }

  .close-btn:disabled {
    opacity: 0.5;
	cursor: not-allowed;
  }

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

  .name-input {
    padding: 0.75rem;
	background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
	color: white;
    font-size: 0.9rem;
	transition: all 0.2s ease;
  }

  .name-input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .name-input:focus {
    outline: none;
    border-color: rgba(0, 212, 255, 0.5);
    background: rgba(255, 255, 255, 0.08);
  }

  .name-input.invalid {
    border-color: rgba(239, 68, 68, 0.5);
  }

  .name-input.valid {
    border-color: rgba(74, 222, 128, 0.5);
  }

  .name-input:disabled {
    opacity: 0.5;
	cursor: not-allowed;
  }

  .validation-message {
    font-size: 0.75rem;
	color: #f87171;
  }

  .info-box {
    display: flex;
	gap: 0.5rem;
    padding: 0.75rem;
	background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .info-label {
    color: rgba(255, 255, 255, 0.5);
  }

  .info-value {
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255, 255, 255, 0.7);
    word-break: break-all;
  }

  .warning-box {
    display: flex;
    align-items: flex-start;
	gap: 0.75rem;
    padding: 0.75rem;
	background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.2);
    border-radius: 8px;
	color: #fbbf24;
    font-size: 0.8rem;
    line-height: 1.4;
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

  .btn.primary {
    background: rgba(0, 212, 255, 0.2);
    border: 1px solid rgba(0, 212, 255, 0.4);
    color: #00d4ff;
  }

  .btn.primary:hover:not(:disabled) {
    background: rgba(0, 212, 255, 0.3);
  }

  .btn:disabled {
    opacity: 0.5;
	cursor: not-allowed;
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
