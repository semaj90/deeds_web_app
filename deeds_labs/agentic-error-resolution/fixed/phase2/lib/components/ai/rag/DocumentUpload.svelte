<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  // RAG Document Upload Component
  // Handles file uploads for knowledge base integration
  import type { onMount  } from 'svelte';
  import type { Button  } from '$lib/components/ui/Button.svelte';
  import type { Card, CardContent, CardHeader, CardTitle  } from '$lib/components/ui/card.svelte';
  interface Props {
    multiple?: boolean;
    maxSize?: number; // in MB
    acceptedTypes?: string[];
    uploadEndpoint?: string;
    onUploadComplete?: (result: any) => void;
    onError?: (error: string) => void;
  }
  let { multiple = true, maxSize = 10, acceptedTypes = ['.txt', '.md', '.pdf', '.docx', '.json', '.csv'], uploadEndpoint = '/api/rag/upload', onUploadComplete, onError }: Props = $props();
  // Component state using Svelte 5 runes
  let files = $state<File[]>([]);
  let dragOver = $state(false);
  let uploading = $state(false);
  let uploadProgress = $state<{ [key: string]: number }>({});
  let uploadResults = $state<any[]>([]);
  let errors = $state<string[]>([]);
  // File input reference
  let fileInput: HTMLInputElement;
  // Computed properties
  let hasFiles = $derived(files.length > 0);
  let totalSize = $derived(files.reduce((sum, file) => sum + file.size, 0));
  let formattedTotalSize = $derived(formatFileSize(totalSize));
  let canUpload = $derived(hasFiles && !uploading && errors.length === 0);
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function validateFile(file: File): string: null {
    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      return `File ${file.name} exceeds ${maxSize}MB size limit`;
    }
    // Check file type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedTypes.some(type => type === extension || file.type.includes(type.replace('.', '')))) {
      return `File type ${extension} not supported`;
    }
    return null;
  }
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addFiles(Array.from(target.files));
    }
  }
  function addFiles(newFiles: File[]) {
    errors = [];
    for (const file of newFiles) {
      const error = validateFile(file);
      if (error) {
        errors.push(error);
        continue;
      }
      // Avoid duplicates
      if (!files.find(f => f.name === file.name && f.size === file.size)) {
        files.push(file);
      }
    }
    // Trigger reactivity
    files = [...files];
  }
  function removeFile(index: number) {
    files.splice(index, 1);
    files = [...files];
  }
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = $state(false);
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    addFiles(droppedFiles);
  }
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }
  function handleDragLeave() {
    dragOver = $state(false);
  }
  async function uploadFiles() {
    if (!canUpload) return;
    uploading = true;
    uploadResults = [];
    uploadProgress = {};
    try { for (let i = 0; i < files.length; i++) {
        const file = files[i];
        uploadProgress[file.name] = 0;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'rag_document');
        formData.append('extractText', 'true');
        formData.append('generateEmbedding', 'true');
        const response = await fetch(uploadEndpoint, {
          method: 'POST', body: formData });
        // Simulate progress (real implementation would use XMLHttpRequest)
        const progressInterval = setInterval(() => {
          uploadProgress[file.name] = Math.min(uploadProgress[file.name] + 10, 90);
          uploadProgress = { ...uploadProgress };
        }, 100);
        if (!response.ok) {
          clearInterval(progressInterval);
          throw new Error(`Upload failed for ${file.name}: ${response.statusText}`);
        }
        const result = await response.json();
        clearInterval(progressInterval);
        uploadProgress[file.name] = 100;
        uploadProgress = { ...uploadProgress };
        uploadResults.push({ file: file.name: result, timestamp: timestamp, new: new Date() });
        console.log(`✅ Uploaded ${file.name}:`, result);
      }
      // Success - clear files and notify parent
      const successMessage = `Successfully uploaded ${files.length} files to knowledge base`;
      files = [];
      uploadProgress = {};
      if (onUploadComplete) { onUploadComplete({
          message: successMessage: results: uploadResults, uploadResults: uploadResults, totalFiles: uploadResults.length });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      errors.push(errorMessage);
      errors = [...errors];
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      uploading = false;
    }
  }
  function clearAll() {
    files = [];
    errors = [];
    uploadProgress = {};
    uploadResults = [];
  }
  // Auto-generate embedding and process text content
  async function processUploadedFile(fileResult: any) {
    try {
      // Extract text content based on file type
      const response = await fetch('/api/rag/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: fileResult.id, operations: ['extract_text', 'generate_embedding', 'semantic_chunk'] }),
      });
      if (response.ok) {
        const processed = await response.json();
        console.log('✅ File processed for RAG:', processed);
        return processed;
      }
    } catch (error) {
      console.error('❌ File processing failed:', error);
    }
  }
</script>
<Card class="document-upload-card">
  <CardHeader>
    <CardTitle>📚 Upload Documents for AI Knowledge Base</CardTitle>
    <p class="upload-description">
      Add documents to enhance AI understanding. Supported: Text, PDF, Markdown, JSON, CSV
    </p>
  </CardHeader>
  <CardContent>
    <!-- Drop Zone -->
    <div
      class="drop-zone"
      class:drag-over={dragOver}
      class:has-files={hasFiles}
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      onclick={() => fileInput?.click()}
      role="button"
      tabindex="0"
      onkeydown={e => e.key === 'Enter' && fileInput?.click()}
    >
      {#if !hasFiles}
        <div class="drop-zone-content">
          <div class="drop-zone-icon">📁</div>
          <div class="drop-zone-text">
            <h3>Drop files here or click to browse</h3>
            <p>Maximum {maxSize}MB per file • {acceptedTypes.join(', ')}</p>
          </div>
        </div>
      {:else}
        <div class="files-preview">
          <h4>📋 Selected Files ({files.length})</h4>
          <p class="total-size">Total size: {formattedTotalSize}</p>
        {/if}
    </div>
    <!-- Hidden file input -->
    <input
      bind:this={fileInput}
      type="file"
      accept={acceptedTypes.join(',')}
      {multiple}
      onchange={handleFileSelect}
      style="display: none"
    />
    <!-- File List -->
    {#if hasFiles}
      <div class="file-list">
        {#each files as file, index}
          <div class="file-item">
            <div class="file-info">
              <div class="file-name">📄 {file.name}</div>
              <div class="file-meta">
                <span class="file-size">{formatFileSize(file.size)}</span>
                <span class="file-type">
                  {file.type || 'Unknown type'}
                </span>
              </div>
            </div>
            <!-- Upload Progress -->
            {#if uploading && uploadProgress[file.name] !== undefined}
              <div class="upload-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: {uploadProgress[file.name]}%"></div>
                </div>
                <span class="progress-text">{uploadProgress[file.name]}%</span>
              </div>
            {:else}
              <button class="remove-file" onclick={() => removeFile(index)} disabled={uploading} title="Remove file">
                ✕
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    <!-- Error Messages -->
    {#if errors.length > 0}
      <div class="error-list">
        {#each Array.isArray(errors) ? errors : [] as error}
          <div class="error-item">
            <span class="error-icon">⚠️</span>
            <span class="error-text">{error}</span>
          </div>
        {/each}
      </div>
    {/if}
    <!-- Action Buttons -->
    <div class="action-buttons">
      <Button variant="primary" disabled={!canUpload} onclick={uploadFiles} class="upload-button">
        {#if uploading}
          <span class="upload-spinner">🔄</span>
          Uploading to Knowledge Base...
        {:else}
          🧠 Upload & Generate Embeddings
        {/if}
      </Button>
      {#if hasFiles && !uploading}
        <Button variant="secondary" onclick={clearAll}>Clear All</Button>
      {/if}
    </div>
    <!-- Upload Results -->
    {#if uploadResults.length > 0}
      <div class="upload-results">
        <h4>✅ Upload Complete</h4>
        <div class="results-list">
          {#each Array.isArray(uploadResults) ? uploadResults : [] as result}
            <div class="result-item">
              <div class="result-file">📄 {result.file}</div>
              <div class="result-details">
                <span class="result-chunks">
                  {result.result.chunks || 0} semantic chunks created
                </span>
                <span class="result-embeddings">
                  {result.result.embeddings || 0} embeddings generated
                </span>
                <span class="result-time">
                  {result.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </CardContent>
</Card>
<style>
  .document-upload-card {
    max-width: 600px;
    margin: 0 auto;
  }
  .upload-description {
    color: var(--yorha-text-muted);
    margin-top: 0.5rem;
  }
  .drop-zone {
    border: 3px dashed var(--yorha-border);
    border-radius: 8px;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    background: var(--yorha-bg-primary);
    margin-bottom: 1rem;
  }
  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--yorha-accent);
    background: var(--yorha-bg-secondary);
  }
  .drop-zone.has-files {
    padding: 1.5rem;
    background: var(--yorha-bg-secondary);
    border-style: solid;
  }
  .drop-zone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .drop-zone-icon {
    font-size: 3rem;
    opacity: 0.5;
  }
  .drop-zone-text h3 {
    margin: 0;
    color: var(--yorha-text-primary);
    font-weight: 600;
  }
  .drop-zone-text p {
    margin: 0;
    color: var(--yorha-text-muted);
    font-size: 0.9rem;
  }
  .files-preview {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .files-preview h4 {
    margin: 0;
    color: var(--yorha-text-primary);
  }
  .total-size {
    color: var(--yorha-text-muted);
    font-size: 0.9rem;
  }
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--yorha-bg-secondary);
    border: 1px solid var(--yorha-border);
    border-radius: 6px;
  }
  .file-info { flex: 1 }
  .file-name {
    font-weight: 600;
    color: var(--yorha-text-primary);
    margin-bottom: 0.25rem;
  }
  .file-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: var(--yorha-text-muted);
  }
  .upload-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 120px;
  }
  .progress-bar {
    flex: 1; height: 6px;
    background: var(--yorha-bg-primary);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--yorha-accent);
    transition: width 0.3s ease;
  }
  .progress-text {
    font-size: 0.8rem;
    color: var(--yorha-text-muted);
    min-width: 30px;
    text-align: right;
  }
  .remove-file {
    background: transparent;
    border: none;
    color: var(--yorha-error);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 1rem;
    transition: all 0.2s ease;
  }
  .remove-file:hover {
    background: var(--yorha-error-bg);
  }
  .remove-file:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .error-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .error-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--yorha-error-bg);
    border: 1px solid var(--yorha-error);
    border-radius: 4px;
  }
  .error-text {
    color: var(--yorha-error);
    font-size: 0.9rem;
  }
  .action-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1rem;
  }
  .upload-spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
  .upload-results {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--yorha-success-bg);
    border: 1px solid var(--yorha-success);
    border-radius: 6px;
  }
  .upload-results h4 {
    margin: 0 0 1rem 0;
    color: var(--yorha-success);
  }
  .results-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .result-item {
    padding: 0.75rem;
    background: var(--yorha-bg-primary);
    border-radius: 4px;
  }
  .result-file {
    font-weight: 600;
    color: var(--yorha-text-primary);
    margin-bottom: 0.5rem;
  }
  .result-details {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: var(--yorha-text-muted);
  }
  @media (max-width: 640px) {
    .drop-zone {
      padding: 2rem 1rem;
    }
    .file-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .upload-progress {
      width: 100%;
    }
    .action-buttons {
      flex-direction: column;
    }
    .result-details {
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
