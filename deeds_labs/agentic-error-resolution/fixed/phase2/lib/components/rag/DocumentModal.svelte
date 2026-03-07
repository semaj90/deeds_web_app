<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  import type { X, Download, Trash2, Clock, FileText, Zap  } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/button/Button.svelte";
  interface Document {
    id: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    summary: string;
    embeddingModel: string;
    uploadedAt: string;
    metadata?: {
      pageCount?: number;
      language?: string;
      confidence?: number;
    };
  }
  interface Props {
    document?: Document;
    open?: boolean;
  }
  let { document, open = false }: Props = $props();
  let deleting = $state(false);
  let downloading = $state(false);
  let message = $state('');
  let messageType = $state<'success' | 'error'>('success');
  function closeModal() {
    open = $state(false);
  }
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
  async function downloadDocument() {
    if (!document) return;
    try {
      downloading = true;
      message = '';
      // Download logic would go here
      message = `Downloading ${document.filename}...`;
      messageType = 'success';
    } catch (error) {
      message = 'Failed to download document';
      messageType = 'error';
    } finally {
      downloading = false;
    }
  }
  async function deleteDocument() {
    if (!document || !confirm('Are you sure you want to delete this document?')) return;
    try {
      deleting = true;
      message = '';
      const response = await fetch(`/api/rag/documents/${document.id}`, { method: 'DELETE' });
      if (response.ok) {
        message = 'Document deleted successfully';
        messageType = 'success';
        setTimeout(closeModal, 1500);
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      message = 'Failed to delete document';
      messageType = 'error';
    } finally {
      deleting = false;
    }
  }
</script>
{#if open && document}
  <!-- Modal Overlay (accessible) -->
  <!-- Replace non-interactive clickable div with role & keyboard handlers -->
  <div
    class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
    role="button"
    tabindex="0"
    aria-label="Close modal"
    onclick={closeModal}
    onkeydown={(e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeModal();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    }}
  ></div>
  <!-- Modal Content -->
  <div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
      <div class="flex items-center gap-3">
        <FileText class="w-6 h-6 text-white" />
        <h2 class="text-xl font-bold text-white truncate">{document.filename}</h2>
      </div>
      <button
        onclick={closeModal}
        class="p-2 hover:bg-white/20 rounded-lg transition-colors"
      >
        <X class="w-5 h-5 text-white" />
      </button>
    </div>
    <!-- Content -->
    <div class="max-h-[60vh] overflow-y-auto p-6 space-y-6">
      {#if message}
        <div
          class="p-4 rounded-lg text-sm {messageType === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}"
        >
          {message}
        {/if}
      <!-- Document Info -->
      <div class="grid grid-cols-2 gap-6">
        <!-- Left Column -->
        <div class="space-y-4">
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase mb-1">File Size</p>
            <p class="text-lg font-semibold text-gray-900">{formatFileSize(document.fileSize)}</p>
          </div>
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase mb-1">File Type</p>
            <p class="text-lg font-semibold text-gray-900">{document.mimeType}</p>
          </div>
          {#if document.metadata?.pageCount}
            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase mb-1">Pages</p>
              <p class="text-lg font-semibold text-gray-900">{document.metadata.pageCount}</p>
            {/if}
        </div>
        <!-- Right Column -->
        <div class="space-y-4">
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase mb-1">Uploaded</p>
            <p class="text-sm text-gray-900">{formatDate(document.uploadedAt)}</p>
          </div>
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase mb-1">Embedding Model</p>
            <div class="flex items-center gap-2">
              <Zap class="w-4 h-4 text-yellow-500" />
              <span class="text-sm font-medium text-gray-900">{document.embeddingModel}</span>
            </div>
          </div>
          {#if document.metadata?.confidence}
            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase mb-1">Confidence</p>
              <div class="flex items-center gap-2">
                <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <!-- Explicitly close the inner div (no self-closing tag) -->
                  <div
                    class="h-full bg-green-500 rounded-full"
                    style="width: {document.metadata.confidence * 100}%"
                  ></div>
                </div>
                <span class="text-sm font-medium text-gray-900">{Math.round(document.metadata.confidence * 100)}%</span>
              </div>
            {/if}
        </div>
      </div>
      <!-- Summary -->
      <div>
        <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Summary</p>
        <p class="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg">
          {document.summary || 'No summary available'}
        </p>
      </div>
      <!-- Metadata -->
      {#if document.metadata?.language}
        <div class="border-t pt-4">
          <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Language</p>
          <p class="text-sm text-gray-900">{document.metadata.language}</p>
        {/if}
    </div>
    <!-- Footer / Actions -->
    <div class="flex gap-3 bg-gray-50 px-6 py-4 border-t">
      <Button
        onclick={downloadDocument}
        disabled={downloading || deleting}
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        <Download class="w-4 h-4" />
        {downloading ? 'Downloading...' : 'Download'}
      </Button>
      <Button
        onclick={deleteDocument}
        disabled={deleting || downloading}
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
      >
        <Trash2 class="w-4 h-4" />
        {deleting ? 'Deleting...' : 'Delete'}
      </Button>
      <Button
        onclick={closeModal}
        disabled={deleting || downloading}
        class="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 disabled:opacity-50"
      >
        Close
      </Button>
    </div>
  {/if}
<style>
  :global(body) {
    overflow: hidden;
  }
</style>
