<!--
  ChatPromptBar - ChatGPT-style prompt input with file upload
  Shows uploaded document chips above the input field
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DocumentChip from './DocumentChip.svelte';
  import FileUploadModal from './FileUploadModal.svelte';

  interface Props {
    placeholder?: string;
    disabled?: boolean;
    maxFiles?: number;
    uploadedFiles?: Array<{ name: string; size: number; type: string; previewUrl?: string }>;
    onsubmit?: (message: string) => void;
    onfilesadded?: (files: File[]) => void;
    onfileremoved?: (fileName: string) => void;
  }

  let {
    placeholder = 'Ask a question about your case...',
    disabled = false,
    maxFiles = 5,
    uploadedFiles = $bindable<Array<{ name: string; size: number; type: string; previewUrl?: string }>>([]),
    onsubmit = () => {},
    onfilesadded = () => {},
    onfileremoved = () => {}
  }: Props = $props();

  let message = $state('');
  let textarea: HTMLTextAreaElement;
  let showUploadModal = $state(false);

  const canSubmit = $derived(message.trim().length > 0 && !disabled);
  const canUpload = $derived(uploadedFiles.length < maxFiles && !disabled);

  function handleSubmit() {
    if (!canSubmit) return;
    onsubmit(message.trim());
    message = '';
    // Auto-resize textarea back to default
    if (textarea) {
      textarea.style.height = 'auto';
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Submit on Enter (without Shift)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    // Auto-resize textarea
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }

  function handleFilesSelected(files: File[]) {
    onfilesadded(files);
  }

  function handleFileRemove(fileName: string) {
    onfileremoved(fileName);
  }
</script>

<div class="w-full border border-sand/20 rounded-lg bg-panel shadow-sm">
  <!-- Uploaded Files Chips (above prompt) -->
  {#if uploadedFiles.length > 0}
    <div class="px-4 py-3 border-b border-sand/10 flex flex-wrap gap-2">
      {#each uploadedFiles as file (file.name)}
        <DocumentChip
          fileName={file.name}
          fileSize={file.size}
          fileType={file.type}
          previewUrl={file.previewUrl}
          onremove={() => handleFileRemove(file.name)}
          disabled={disabled}
        />
      {/each}
    </div>
  {/if}

  <!-- Prompt Input Area -->
  <div class="flex items-end gap-2 p-3">
    <!-- Upload Button -->
    <button
      type="button"
      onclick={() => showUploadModal = true}
      disabled={!canUpload}
      class="flex-shrink-0 p-2 hover:bg-sand/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title={canUpload ? 'Upload files' : `Maximum ${maxFiles} files`}
      aria-label="Upload files"
    >
      <Icon name="paperclip" class="w-5 h-5 text-sand/60" />
    </button>

    <!-- Textarea -->
    <textarea
      bind:this={textarea}
      bind:value={message}
      {placeholder}
      {disabled}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      class="flex-1 resize-none bg-transparent border-none outline-none text-sm min-h-[40px] max-h-[200px] py-2 disabled:opacity-50"
      rows="1"
      aria-label="Chat message"
    ></textarea>

    <!-- Submit Button -->
    <button
      type="button"
      onclick={handleSubmit}
      disabled={!canSubmit}
      class="flex-shrink-0 p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed {canSubmit ? 'bg-accent text-white hover:bg-accent/90' : 'bg-sand/10 text-sand/40'}"
      aria-label="Send message"
    >
      <Icon name="send" class="w-5 h-5" />
    </button>
  </div>

  <!-- File count hint -->
  {#if uploadedFiles.length > 0}
    <div class="px-4 pb-2 text-xs text-sand/60">
      {uploadedFiles.length} / {maxFiles} files attached
    </div>
  {/if}
</div>

<!-- Upload Modal -->
<FileUploadModal
  bind:open={showUploadModal}
  maxFiles={maxFiles - uploadedFiles.length}
  onfilesselected={handleFilesSelected}
/>

<style>
  textarea::placeholder {
    color: var(--sand-50);
    opacity: 0.6;
  }
</style>
