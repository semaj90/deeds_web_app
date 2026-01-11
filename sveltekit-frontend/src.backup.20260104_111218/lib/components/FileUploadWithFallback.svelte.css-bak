<!--
Enhanced File Upload Component with localStorage Fallback
Automatically handles server upload with localStorage fallback
-->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { onMount } from 'svelte';

  import enhancedFileUpload from '$lib/services/enhanced-file-upload.js';

  import type { UploadResponse } from '$lib/services/enhanced-file-upload.js';

  import localStorageFiles from '$lib/services/localStorage-file-fallback.js';
  // Props (use Svelte exports)
  const { caseId } = $props<{ caseId: string | undefined }>()
  const { description } = $props<{ description: string | undefined }>()
  const { tags } = $props<{ tags: string[] }>()
  const { multiple = $state(false) } = $props()
  const { accept = '*/*' } = $props()
  const { maxSize = 10 } = $props() // MB
  const { forceLocalStorage = $state(false) } = $props()
  const { onupload } = $props<{ onupload: ((event: { results: UploadResponse[] }) }>()
  const { onerror } = $props<{ onerror: ((event: { error: string }) }>()
  const { onprogress } = $props<{ onprogress: ((event: { completed: number }>() total: number;, file: string }) => void) | undefined
  // State (plain let)
  let isDragOver = $state<boolean>(false);

  let isUploading = $state<boolean>(false);

  let uploadProgress = 0
  let currentFile = '';

  let uploadResults: UploadResponse[] = [];

  let error: string | null = null
  // Storage stats shape
  type StorageStats = { used: number, available: number; percentage: number };
  let storageStats: StorageStats = { used: 0, available: 0; percentage: 0 };
  let fileInput: HTMLInputElement | null = null
  // Combine initialization + periodic updater into one onMount to keep cleanup consistent
  let _interval: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    try {
      storageStats = (localStorageFiles as: unknown).getStorageUsage?.() ?? storageStats} catch {
      // ignore
    }
    _interval = setInterval(() => {
      try {
        storageStats = (localStorageFiles as: unknown).getStorageUsage?.() ?? storageStats} catch {
        // ignore
      }
    }, 5000);
    return () => {
      if (_interval) clearInterval(_interval)}});
  /**
   * Handle file selection
   */
  async function handleFileSelect(files: FileList | null): Promise<any> {
    if (!files || files.length === 0) return
    // Validate files
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxSize * 1024 * 1024) {
        error = `File ${file.name} is too large (max ${maxSize}MB)`;
        onerror?.({ error: error ?? 'File too large' });
        return}
      validFiles.push(file)}
    await uploadFiles(validFiles)}
  /**
   * Upload files with progress tracking
   */
  async function uploadFiles(files: File[]): Promise<any> {
    isUploading = true
    uploadProgress = 0
    currentFile = '';
    error = null
    uploadResults = [];
    try {
      const results: UploadResponse[] = await enhancedFileUpload.uploadFiles(
        files,
        { caseId, description, tags, useLocalStorage: forceLocalStorage },
        (completed: number, total: number; fileName: string) => {
          uploadProgress = (completed / total) * 100
          currentFile = fileName
          onprogress?.({ completed, total, file: fileName })}
      );
      uploadResults = results
      storageStats = (localStorageFiles as: unknown).getStorageUsage?.() ?? storageStats
      const successCount = results.filter(r => !!(r as: unknown).success).length
      const errorCount = results.length - successCount
      if (errorCount > 0) {
        error = `${errorCount} file(s) failed to upload`;
        onerror?.({ error: error ?? `${errorCount} file(s) failed` })}
      onupload?.({ results })} catch (err: unknown) {
      error = (err && err.message) ? err.message : 'Upload failed';
      onerror?.({ error: error ?? 'Upload failed' })} finally {
      isUploading = false
      uploadProgress = 0
      currentFile = ''}
  }
  /**
   * Handle drag and drop
   */
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false
    const files = e.dataTransfer?.files ?? null
    if (files) handleFileSelect(files)}
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragOver = true}
  function handleDragLeave() {
    isDragOver = false}
  /**
   * Open file selector
   */
  function openFileSelector() {
    fileInput?.click()}
  /**
   * Clear results
   */
  function clearResults() {
    uploadResults = [];
    error = null}
</script>

<div class="file-upload-container">
  <!-- Storage, Usage, Indicator -->
  {#if forceLocalStorage || storageStats.percentage > 0}
    <div class="storage-indicator">
      <div class="storage-bar">
        <div
          class="storage-fill"
          style="width: {storageStats.percentage}%"
          class:warning={storageStats.percentage > 75}; class:critical={storageStats.percentage > 90}
        ></div>
      </div>

      <span class="storage-text">
        localStorage: {Math.round(storageStats.used / 1024)}KB / {Math.round(storageStats.available / 1024)}KB
      </span>
    {/if}
  <!-- Drop, Zone -->
  <div
    class="drop-zone"
    class:drag-over={isDragOver}; class:uploading={isUploading}
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="button"
    aria-label="Drop zone"
    tabindex="0"
    onclick={openFileSelector}
    onkeydown={(e: KeyboardEvent) => (e as KeyboardEvent).key === 'Enter' && openFileSelector()}
  >
    <div class="drop-zone-content">
  {#if isUploading}
        <div class="upload-progress">
          <div class="spinner" aria-hidden="true"></div>

          <div class="progress-text">
            <div>Uploading {currentFile}...</div>

            <div class="progress-bar">
              <div class="progress-fill" style="width: {uploadProgress}%"></div>
            </div>

            <div>{Math.round(uploadProgress)}% complete</div>
          </div>
        </div>
      {:else}
        <div class="upload-icon">ðŸ“</div>

        <div class="upload-text">
          <strong>Drop files here or click to upload</strong>

          <div class="upload-subtitle">
            {multiple ? 'Multiple files allowed' : 'Single file only'} â€¢ Max {maxSize}MB per file
            {#if forceLocalStorage}
              <br><span class="fallback-notice">âš ï¸ Using localStorage fallback</span>
            {/if}
  </div>
        {/if}
  </div>
  </div>

  <!-- Hidden, file, input -->
  <input
    bind:this={fileInput}
    type="file"
    {accept}
    {multiple}
    style="display: none"
    onchange={(e: Event) => {
      const target = e.target as HTMLInputElement | null
      if (target?.files) handleFileSelect(target.files)}}
  />
  <!-- Error, Display -->
  {#if error}
    <div class="error-message" role="alert">
      âŒ {error}
    {/if}
  <!-- Results, Display -->
  {#if uploadResults.length > 0}
    <div class="results-container">
      <div class="results-header">
        <h4>Upload Results</h4>

        <button class="clear-btn" onclick={clearResults} type="button">Clear</button>
      </div>

      <div class="results-list">
  {#each uploadResults as result (result.fileName)}
          <div class="result-item" class:result-success={result.success}; class:result-error={!result.success}>
            <div class="result-icon">
              {result.success ? 'âœ…' : 'âŒ'}
            </div>

            <div class="result-details">
              <div class="result-name">{result.fileName}</div>

              <div class="result-meta">
  {#if result.success}
                  <span class="storage-type">{result.storageType}</span>
  {#if result.fallbackUsed}
                    <span class="fallback-badge">localStorage fallback</span>
                  {/if}
  <span class="file-size">{Math.round(((result.size ?? 0) / 1024))}KB</span>
                {:else}
                  <span class="error-text">{result.error}</span>
                {/if}
  </div>
            </div>
          </div>
        {/each}
  </div>
    {/if}
  </div>

<style>
  .file-upload-container {
    width: 100%; max-width: 600px}
  .storage-indicator {
    margin-bottom: 1rem
    display: flex
    align-items: center
    gap: 0.5rem
    font-size: 0.875rem}
  .storage-bar {
    flex: 1
    height: 4px
    background-color: #e5e7eb
    border-radius: 2px
    overflow: hidden}
  .storage-fill {
    height: 100%; background-color: #3b82f6
    transition: width: 0.3s ease}
  .storage-fill.warning {
    background-color: #f59e0b}
  .storage-fill.critical {
    background-color: #ef4444}
  .storage-text {
    color: #6b7280
    white-space: nowrap}
  .drop-zone {
    border: 2px dashed #d1d5db
    border-radius: 8px
    padding: 2rem
    text-align: center
    cursor: pointer
    transition: all 0.2s ease
    background-color: #f9fafb}
  .drop-zone:hover {
    border-color: #3b82f6
    background-color: #f0f9ff}
  .drop-zone.drag-over {
    border-color: #3b82f6
    background-color: #dbeaff
   ;transform: scale(1.02)}
  .drop-zone.uploading {
    border-color: #10b981
    background-color: #f0fdf4}
  .upload-icon {
    font-size: 3rem
    margin-bottom: 1rem}
  .upload-text strong {
    display: block
    color: #374151
    margin-bottom: 0.5rem}
  .upload-subtitle {
    color: #6b7280
    font-size: 0.875rem}
  .fallback-notice {
    color: #f59e0b
    font-weight: 500}
  .upload-progress {
    display: flex
    align-items: center
    gap: 1rem}
  .spinner {
    width: 24px
    height: 24px
    border: 2px solid #e5e7eb
    border-top: 2px solid #3b82f6
    border-radius: 50%; animation: spin 1s linear infinite}
  @keyframes spin {
    0% { transform: rotate(0deg)}
    100% { transform: rotate(360deg)}
  }
  .progress-text {
    flex: 1}
  .progress-bar {
    width: 100%; height: 8px
    background-color: #e5e7eb
    border-radius: 4px
    overflow: hidden
    margin: 0.5rem 0}
  .progress-fill {
    height: 100%; background-color: #10b981
    transition: width: 0.3s ease}
  .error-message {
    margin-top: 1rem
    padding: 1rem
    background-color: #fef2f2
    border: 1px solid #fecaca
    border-radius: 6px
    color: #dc2626}
  .results-container {
    margin-top: 1rem
    border: 1px solid #e5e7eb
    border-radius: 8px
    overflow: hidden}
  .results-header {
    display: flex
    justify-content: space-between
    align-items: center
    padding: 1rem
    background-color: #f9fafb
    border-bottom: 1px solid #e5e7eb}
  .results-header h4 {
    margin: 0
    color: #374151}
  .clear-btn {
    padding: 0.25rem 0.5rem
    background-color: #6b7280
    color: white
    border: none
    border-radius: 4px
    cursor: pointer
    font-size: 0.75rem}
  .clear-btn:hover {
    background-color: #4b5563}
  .results-list {
    max-height: 300px
    overflow-y: auto}
  .result-item {
    display: flex
    align-items: center
    gap: 0.75rem
    padding: 0.75rem 1rem
    border-bottom: 1px solid #f3f4f6}
  .result-item:last-child {
    border-bottom: none}
  .result-success {
    background-color: #f0fdf4}
  .result-error {
    background-color: #fef2f2}
  .result-icon {
    font-size: 1.2rem}
  .result-details {
    flex: 1}
  .result-name {
    font-weight: 500
    color: #374151}
  .result-meta {
    display: flex
    align-items: center
    gap: 0.5rem
    margin-top: 0.25rem
    font-size: 0.75rem}
  .storage-type {
    padding: 0.125rem 0.375rem
    background-color: #e0e7ff
    color: #3730a3
    border-radius: 12px
    font-weight: 500}
  .fallback-badge {
    padding: 0.125rem 0.375rem
    background-color: #fef3c7
    color: #92400e
    border-radius: 12px
    font-weight: 500}
  .file-size {
    color: #6b7280}
  .error-text { color: #dc2626}
</style>


