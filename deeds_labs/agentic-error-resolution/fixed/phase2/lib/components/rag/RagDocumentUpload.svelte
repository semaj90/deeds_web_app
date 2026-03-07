<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  import type { Upload, X, CheckCircle, AlertCircle  } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/button/Button.svelte";
  interface UploadResult {
    success: boolean;
    message: string;
    document?: {
      id: string;
      filename: string;
      title: string;
      chunks: number;
      hasOCR: boolean;
      embeddingModel: string;
    };
    error?: string;
  }
  let files = $state<FileList | null>(null);
  let tags = $state('');
  let uploading = $state(false);
  let uploadProgress = $state(0);
  let message = $state('');
  let messageType = $state<'success' | 'error' | 'info'>('info');
  let uploadResult = $state<UploadResult | null>(null);
  let dragActive = $state(false);
  function handleDrag(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragActive = e.type === 'dragenter' || e.type === 'dragover';
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragActive = $state(false);
    if (e.dataTransfer?.files) {
      files = e.dataTransfer.files;
    }
  }
  async function handleUpload() {
    if (!files || files.length === 0) {
      message = 'Please select a file first';
      messageType = 'error';
      return;
    }
    uploading = true;
    uploadProgress = 0;
    uploadResult = null;
    message = '';
    try {
      const file = files[0]; // Upload first file only
      const formData = new FormData();
      formData.append('file', file);
      if (tags.trim()) {
        formData.append('tags', tags);
      }
      const response = await fetch('/api/rag/documents/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      uploadProgress = 100;
      const data = await response.json();
      uploadResult = data;
      message = data.message || 'Document uploaded successfully';
      messageType = 'success';
      files = null;
      tags = '';
    } catch (error) {
      message = error instanceof Error ? error.message : 'Upload failed';
      messageType = 'error';
    } finally {
      uploading = false;
    }
  }
  function clearFiles() {
    files = null;
    uploadResult = null;
    message = '';
  }
</script>
<div class="w-full space-y-4 p-6 bg-white rounded-lg border border-gray-200">
  <!-- Header -->
  <div class="flex items-center gap-2 mb-6">
    <Upload class="w-5 h-5 text-blue-600" />
    <h2 class="text-lg font-semibold text-gray-900">Upload Evidence Document</h2>
  </div>
  <!-- Messages -->
  {#if message}
    <div
      class={`p-4 rounded-lg text-sm flex items-start gap-2 ${
        messageType === 'success'
          ? 'bg-green-50 border border-green-200 text-green-700'
          : messageType === 'error'
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-blue-50 border border-blue-200 text-blue-700'
      }`}
    >
      {#if messageType === 'success'}
        <CheckCircle class="w-5 h-5 flex-shrink-0 mt-0.5" />
      {:else if messageType === 'error'}
        <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5" />
      {/if}
      <span>{message}</span>
    {/if}
  <!-- Drop Zone -->
  <div
    ondragenter={handleDrag}
    ondragleave={handleDrag}
    ondragover={handleDrag}
    ondrop={handleDrop}
    class={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
      dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
    }`}
  >
    <Upload class="w-10 h-10 text-gray-400 mx-auto mb-2" />
    <p class="text-sm font-medium text-gray-900 mb-1">Drag files here or click to select</p>
    <p class="text-xs text-gray-600 mb-4">
      PDF, Word, TXT, JPEG, PNG, TIFF up to 50MB
    </p>
    <input
      type="file"
      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.tiff"
      bind:files
      onchange={() => (uploadResult = null)}
      class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    />
    <Button
      class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
    >
      Select File
    </Button>
  </div>
  <!-- File Preview -->
  {#if files && files.length > 0}
    <div class="space-y-3">
      <div class="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p class="text-sm font-medium text-gray-900">{files[0].name}</p>
        <p class="text-xs text-gray-600 mt-1">
          {(files[0].size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
      <!-- Tags Input -->
      <div>
        <label for="tags" class="block text-sm font-medium text-gray-700 mb-1">
          Tags (comma-separated, optional)
        </label>
        <input
          id="tags"
          type="text"
          bind:value={tags}
          placeholder="e.g., contract, evidence, legal"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      </div>
    {/if}
  <!-- Upload Result -->
  {#if uploadResult && uploadResult.success && uploadResult.document}
    <div class="p-4 bg-green-50 rounded-lg border border-green-200">
      <h3 class="font-medium text-green-900 mb-2">Upload Complete</h3>
      <div class="space-y-1 text-sm text-green-800">
        <p><strong>Filename:</strong> {uploadResult.document.filename}</p>
        <p><strong>Chunks:</strong> {uploadResult.document.chunks}</p>
        <p><strong>Embedding Model:</strong> {uploadResult.document.embeddingModel}</p>
        {#if uploadResult.document.hasOCR}
          <p><strong>OCR:</strong> Processed ✓</p>
        {/if}
      </div>
    {/if}
  <!-- Progress Bar -->
  {#if uploading}
    <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div
        class="bg-blue-600 h-full transition-all duration-300"
        style="width: {uploadProgress}%"
      />
    {/if}
  <!-- Action Buttons -->
  <div class="flex gap-2 pt-2">
    <Button
      onclick={handleUpload}
      disabled={!files || files.length === 0 || uploading}
      class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {uploading ? 'Uploading...' : 'Upload Document'}
    </Button>
    <Button
      onclick={clearFiles}
      disabled={uploading || !files}
      class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
    >
      <X class="w-4 h-4" />
    </Button>
  </div>
</div>
<style>
  input[type='file'] {
    cursor: pointer;
  }
</style>
