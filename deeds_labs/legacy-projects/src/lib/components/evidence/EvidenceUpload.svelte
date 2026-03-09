<script lang="ts">
  /**
   * Evidence Upload Component with HTML5 Drag & Drop
   * Svelte 5 implementation with $state, $derived, $effect
   */
  import { createWorkflowStore, getWorkflowProgress } from '$lib/client/workflow-event-stream';
  import type { WorkflowEvent } from '$lib/client/workflow-event-stream';

  interface Props {
    caseId: string;
    sessionId: string;
    onUploadComplete?: (evidenceId: string) => void;
  }

  let { caseId, sessionId, onUploadComplete }: Props = $props();

  // State
  let selectedFile = $state<File | null>(null);
  let uploading = $state(false);
  let dragOver = $state(false);
  let evidenceId = $state<string | null>(null);
  let uploadError = $state<string | null>(null);
  let evidenceType = $state('document');
  let title = $state('');
  let description = $state('');

  // Workflow store for real-time updates
  const workflowStore = createWorkflowStore(sessionId);

  // Derived state
  const progress = $derived(getWorkflowProgress($workflowStore.events));
  const isComplete = $derived(
    $workflowStore.events.some(e => e.type === 'WORKFLOW_COMPLETE')
  );

  // Connect to SSE when evidence is uploaded
  $effect(() => {
    if (evidenceId && !$workflowStore.connected) {
      workflowStore.connect();
    }

    return () => {
      if ($workflowStore.connected) {
        workflowStore.disconnect();
      }
    };
  });

  // Call onUploadComplete when workflow finishes
  $effect(() => {
    if (isComplete && evidenceId && onUploadComplete) {
      onUploadComplete(evidenceId);
    }
  });

  // File input handler
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      selectedFile = target.files[0];
      if (!title) {
        title = target.files[0].name;
      }
    }
  }

  // Drag and drop handlers
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files[0]) {
      selectedFile = files[0];
      if (!title) {
        title = files[0].name;
      }
    }
  }

  // Upload handler
  async function handleUpload() {
    if (!selectedFile || !caseId) return;

    uploading = true;
    uploadError = null;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('caseId', caseId);
      formData.append('evidenceType', evidenceType);
      formData.append('title', title || selectedFile.name);
      formData.append('description', description);

      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const data = await response.json();
      evidenceId = data.evidenceId;

      console.log('✅ Evidence uploaded successfully:', data);
    } catch (error) {
      console.error('❌ Evidence upload error:', error);
      uploadError = error instanceof Error ? error.message : 'Upload failed';
    } finally {
      uploading = false;
    }
  }

  // Reset handler
  function handleReset() {
    selectedFile = null;
    evidenceId = null;
    uploadError = null;
    title = '';
    description = '';
    evidenceType = 'document';
    workflowStore.clearEvents();
    workflowStore.disconnect();
  }

  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
</script>

<div class="evidence-upload-container">
  <h2>Upload Evidence</h2>

  {#if !evidenceId}
    <!-- Upload Form -->
    <div
      class="dropzone"
      class:drag-over={dragOver}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      role="button"
      tabindex="0"
    >
      {#if selectedFile}
        <div class="selected-file">
          <div class="file-icon">📄</div>
          <div class="file-info">
            <p class="file-name">{selectedFile.name}</p>
            <p class="file-size">{formatFileSize(selectedFile.size)}</p>
          </div>
          <button
            type="button"
            class="remove-file"
            onclick={() => selectedFile = null}
            aria-label="Remove file"
          >
            ✕
          </button>
        </div>
      {:else}
        <div class="dropzone-content">
          <div class="upload-icon">⬆️</div>
          <p class="dropzone-text">Drag & drop evidence file here</p>
          <p class="dropzone-or">or</p>
          <label class="file-input-label">
            <input
              type="file"
              class="file-input"
              onchange={handleFileSelect}
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.tiff"
            />
            <span class="file-input-button">Browse Files</span>
          </label>
        </div>
      {/if}
    </div>

    {#if selectedFile}
      <!-- Evidence Details Form -->
      <div class="evidence-form">
        <div class="form-group">
          <label for="title">Title</label>
          <input
            id="title"
            type="text"
            bind:value={title}
            placeholder="Evidence title"
            required
          />
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea
            id="description"
            bind:value={description}
            placeholder="Evidence description"
            rows="3"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="type">Evidence Type</label>
          <select id="type" bind:value={evidenceType}>
            <option value="document">Document</option>
            <option value="photo">Photo</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="correspondence">Correspondence</option>
            <option value="contract">Contract</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={handleReset}
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onclick={handleUpload}
            disabled={uploading || !title}
          >
            {uploading ? 'Uploading...' : 'Upload Evidence'}
          </button>
        </div>
      </div>
    {/if}

    {#if uploadError}
      <div class="error-message">
        <strong>Error:</strong> {uploadError}
      </div>
    {/if}
  {:else}
    <!-- Upload Complete - Show Workflow Progress -->
    <div class="workflow-status">
      <div class="status-header">
        <h3>Processing Evidence</h3>
        {#if $workflowStore.connected}
          <span class="live-indicator">
            <span class="pulse-dot"></span>
            <span>Live</span>
          </span>
        {/if}
      </div>

      <div class="progress-bar-container">
        <div class="progress-bar" style="width: {progress}%"></div>
      </div>
      <p class="progress-text">{progress}% Complete</p>

      {#if isComplete}
        <div class="success-message">
          ✅ Evidence processed successfully!
        </div>
      {/if}

      <!-- Event Log -->
      <div class="event-log">
        <h4>Processing Events</h4>
        {#each $workflowStore.events as event (event.timestamp)}
          <div class="event-item" class:error={event.type.includes('ERROR')}>
            <div class="event-type">
              {#if event.type.includes('ERROR')}
                ❌
              {:else if event.type.includes('COMPLETE')}
                ✅
              {:else}
                ⏳
              {/if}
              <strong>{event.type.replace(/_/g, ' ')}</strong>
            </div>
            <span class="event-time">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
        {/each}
      </div>

      {#if isComplete}
        <button type="button" class="btn btn-primary" onclick={handleReset}>
          Upload Another File
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .evidence-upload-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
  }

  h2 {
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .dropzone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
    cursor: pointer;
  }

  .dropzone.drag-over {
    border-color: #4f46e5;
    background-color: #eef2ff;
  }

  .dropzone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .upload-icon {
    font-size: 3rem;
  }

  .dropzone-text {
    font-size: 1.1rem;
    color: #374151;
  }

  .dropzone-or {
    color: #9ca3af;
  }

  .file-input {
    display: none;
  }

  .file-input-label {
    cursor: pointer;
  }

  .file-input-button {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background-color: #4f46e5;
    color: white;
    border-radius: 6px;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .file-input-button:hover {
    background-color: #4338ca;
  }

  .selected-file {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background-color: #f3f4f6;
    border-radius: 6px;
  }

  .file-icon {
    font-size: 2rem;
  }

  .file-info {
    flex: 1;
    text-align: left;
  }

  .file-name {
    font-weight: 500;
    color: #111827;
  }

  .file-size {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .remove-file {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6b7280;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
  }

  .remove-file:hover {
    color: #ef4444;
  }

  .evidence-form {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 500;
    color: #374151;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #4f46e5;
    ring: 2px;
    ring-color: #eef2ff;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  .btn {
    flex: 1;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: #4f46e5;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #4338ca;
  }

  .btn-secondary {
    background-color: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: #e5e7eb;
  }

  .error-message {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #991b1b;
  }

  .workflow-status {
    margin-top: 1.5rem;
  }

  .status-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #10b981;
    font-size: 0.875rem;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background-color: #10b981;
    border-radius: 50%;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .progress-bar-container {
    width: 100%;
    height: 8px;
    background-color: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background-color: #4f46e5;
    transition: width 0.3s ease;
  }

  .progress-text {
    margin-top: 0.5rem;
    text-align: center;
    color: #6b7280;
  }

  .success-message {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    color: #166534;
    font-weight: 500;
  }

  .event-log {
    margin-top: 1.5rem;
    padding: 1rem;
    background-color: #f9fafb;
    border-radius: 6px;
    max-height: 300px;
    overflow-y: auto;
  }

  .event-log h4 {
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
  }

  .event-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background-color: white;
    border-radius: 4px;
  }

  .event-item.error {
    background-color: #fef2f2;
  }

  .event-type {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .event-time {
    font-size: 0.875rem;
    color: #9ca3af;
  }
</style>


