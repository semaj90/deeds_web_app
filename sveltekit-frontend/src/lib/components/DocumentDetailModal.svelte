<script lang="ts">
  /**
   * DocumentDetailModal — Svelte 5 native <dialog>
   * Replaces bits-ui Dialog to avoid $props() TDZ bug in Svelte 5.46.0.
   * Displays evidence/document details in a modal with metadata,
   * content preview, and action buttons.
   */
  import { fade } from 'svelte/transition';

  interface DocumentDetail {
    id: string;
    title?: string;
    fileName?: string;
    file_name?: string;
    fileType?: string;
    file_type?: string;
    fileSize?: number;
    file_size?: number;
    description?: string;
    content?: string;
    extractedText?: string;
    extracted_text?: string;
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
    status?: string;
    caseId?: string;
    case_id?: string;
    tags?: string[];
    aiAnalyzed?: boolean;
    confidence?: number;
    fileUrl?: string;
    file_url?: string;
  }

  interface Props {
    open?: boolean;
    document: DocumentDetail | null;
    onclose?: () => void;
    ondownload?: (doc: DocumentDetail) => void;
    onviewcustody?: (docId: string) => void;
    onanalyze?: (docId: string) => void;
  }

  let {
    open = $bindable(false),
    document: doc = null,
    onclose,
    ondownload,
    onviewcustody,
    onanalyze
  }: Props = $props();

  let dialogEl: HTMLDialogElement | undefined = $state(undefined);

  // Sync open prop with native dialog
  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  // Normalize field names (snake_case vs camelCase)
  let title = $derived(doc?.title || doc?.fileName || doc?.file_name || 'Untitled');
  let fileType = $derived(doc?.fileType || doc?.file_type || 'unknown');
  let fileSize = $derived(doc?.fileSize || doc?.file_size || 0);
  let createdAt = $derived(doc?.createdAt || doc?.created_at || '');
  let updatedAt = $derived(doc?.updatedAt || doc?.updated_at || '');
  let extractedText = $derived(doc?.extractedText || doc?.extracted_text || doc?.content || '');
  let caseId = $derived(doc?.caseId || doc?.case_id || '');

  function formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function formatDate(date: string): string {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getTypeIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('spreadsheet') || type.includes('excel')) return '📊';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('text')) return '📃';
    return '📎';
  }

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) {
      handleClose();
    }
  }
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  class="modal-dialog"
  onclick={handleBackdropClick}
  oncancel={(e) => { e.preventDefault(); handleClose(); }}
  transition:fade={{ duration: 150 }}
>
  {#if doc}
    <div class="modal-content">
      <!-- Header -->
      <div class="modal-header">
        <div class="header-info">
          <span class="type-icon">{getTypeIcon(fileType)}</span>
          <div>
            <h2 class="modal-title">{title}</h2>
            <p class="modal-subtitle">
              {doc.id} &middot; {formatFileSize(fileSize)}
            </p>
          </div>
        </div>
        <button class="close-btn" onclick={handleClose} aria-label="Close">
          <span class="i-lucide-x w-4.5 h-4.5 inline-block" />
        </button>
      </div>

      <!-- Metadata Grid -->
      <div class="meta-grid">
        <div class="meta-item">
          <span class="i-lucide-file-text w-3.5 h-3.5 inline-block" style="color: #8a7a5a; flex-shrink: 0;" />
          <span class="meta-label">Type</span>
          <span class="meta-value">{fileType}</span>
        </div>
        <div class="meta-item">
          <span class="i-lucide-clock w-3.5 h-3.5 inline-block" style="color: #8a7a5a; flex-shrink: 0;" />
          <span class="meta-label">Created</span>
          <span class="meta-value">{formatDate(createdAt)}</span>
        </div>
        {#if updatedAt}
          <div class="meta-item">
            <span class="i-lucide-clock w-3.5 h-3.5 inline-block" style="color: #8a7a5a; flex-shrink: 0;" />
            <span class="meta-label">Updated</span>
            <span class="meta-value">{formatDate(updatedAt)}</span>
          </div>
        {/if}
        {#if caseId}
          <div class="meta-item">
            <span class="i-lucide-link w-3.5 h-3.5 inline-block" style="color: #8a7a5a; flex-shrink: 0;" />
            <span class="meta-label">Case</span>
            <span class="meta-value">{caseId}</span>
          </div>
        {/if}
        {#if doc.status}
          <div class="meta-item">
            <span class="i-lucide-shield w-3.5 h-3.5 inline-block" style="color: #8a7a5a; flex-shrink: 0;" />
            <span class="meta-label">Status</span>
            <span class="meta-value status-badge {doc.status}">{doc.status}</span>
          </div>
        {/if}
        {#if doc.aiAnalyzed}
          <div class="meta-item">
            <span class="meta-label">AI Confidence</span>
            <span class="meta-value confidence" class:high={doc.confidence && doc.confidence >= 80} class:medium={doc.confidence && doc.confidence >= 50 && doc.confidence < 80} class:low={doc.confidence !== undefined && doc.confidence < 50}>
              {doc.confidence ?? 0}%
            </span>
          </div>
        {/if}
      </div>

      <!-- Tags -->
      {#if doc.tags && doc.tags.length > 0}
        <div class="tags-section">
          {#each doc.tags as tag}
            <span class="tag">{tag}</span>
          {/each}
        </div>
      {/if}

      <!-- Description -->
      {#if doc.description}
        <div class="description-section">
          <h4 class="section-label">Description</h4>
          <p class="description-text">{doc.description}</p>
        </div>
      {/if}

      <!-- Content Preview -->
      {#if extractedText}
        <div class="content-section">
          <h4 class="section-label">Content Preview</h4>
          <div class="content-preview">
            <pre>{extractedText.slice(0, 2000)}{extractedText.length > 2000 ? '...' : ''}</pre>
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="actions">
        {#if ondownload}
          <button class="action-btn primary" onclick={() => doc && ondownload?.(doc)}>
            <span class="i-lucide-download w-4 h-4 inline-block" />
            Download
          </button>
        {/if}
        {#if onviewcustody}
          <button class="action-btn" onclick={() => doc && onviewcustody?.(doc.id)}>
            <span class="i-lucide-shield w-4 h-4 inline-block" />
            Chain of Custody
          </button>
        {/if}
        {#if onanalyze}
          <button class="action-btn" onclick={() => doc && onanalyze?.(doc.id)}>
            AI Analyze
          </button>
        {/if}
        <button class="action-btn ghost" onclick={handleClose}>
          Close
        </button>
      </div>
    </div>
  {/if}
</dialog>
{/if}

<style>
  .modal-dialog {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .modal-dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }

  .modal-content {
    background: #2a2016;
    border: 2px solid #0f0f0f;
    border-radius: 0.5rem;
    width: 90vw;
    max-width: 700px;
    max-height: 85vh;
    overflow-y: auto;
    font-family: 'JetBrains Mono', monospace;
    color: #f8f0d9;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #3a3020;
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .type-icon {
    font-size: 2rem;
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #f8f0d9;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }

  .modal-subtitle {
    font-size: 0.75rem;
    color: #8a7a5a;
    margin-top: 0.25rem;
    margin-bottom: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #8a7a5a;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: color 0.15s;
    flex-shrink: 0;
  }

  .close-btn:hover {
    color: #f8f0d9;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #3a3020;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .meta-label {
    color: #8a7a5a;
  }

  .meta-value {
    color: #f8f0d9;
    font-weight: 500;
  }

  .status-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-badge.processed { background: #1a2e1a; color: #48bb78; }
  .status-badge.processing { background: #2e2a1a; color: #ecc94b; }
  .status-badge.pending { background: #1a2332; color: #63b3ed; }
  .status-badge.failed { background: #2e1a1a; color: #f56565; }

  .confidence.high { color: #48bb78; }
  .confidence.medium { color: #ecc94b; }
  .confidence.low { color: #f56565; }

  .tags-section {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #3a3020;
  }

  .tag {
    padding: 0.125rem 0.625rem;
    background: #3a3020;
    color: #c8b888;
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .description-section,
  .content-section {
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #3a3020;
  }

  .section-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #8a7a5a;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .description-text {
    font-size: 0.875rem;
    color: #c8b888;
    line-height: 1.5;
  }

  .content-preview {
    background: #1a160f;
    border: 1px solid #3a3020;
    border-radius: 0.375rem;
    padding: 0.75rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .content-preview pre {
    font-size: 0.75rem;
    color: #c8b888;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    justify-content: flex-end;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    border: 1px solid #3a3020;
    border-radius: 0.375rem;
    background: #3a3020;
    color: #f8f0d9;
    font-size: 0.8125rem;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: #4a4030;
    border-color: #5a5040;
  }

  .action-btn.primary {
    background: #2a4030;
    border-color: #48bb78;
    color: #48bb78;
  }

  .action-btn.primary:hover {
    background: #3a5040;
  }

  .action-btn.ghost {
    background: transparent;
    border-color: transparent;
    color: #8a7a5a;
  }

  .action-btn.ghost:hover {
    color: #f8f0d9;
    background: #3a3020;
  }
</style>
