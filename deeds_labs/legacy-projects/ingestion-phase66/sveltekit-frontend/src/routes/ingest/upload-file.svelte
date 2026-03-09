<script lang="ts">
  import { api } from '$lib/api';
  import { createEventDispatcher } from 'svelte';

  export let caseId: string;

  const dispatch = createEventDispatcher();

  let isDragging = false;
  let isUploading = false;
  let uploadProgress = 0;
  let selectedFiles: File[] = [];
  let uploadResults: any[] = [];

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    const files = event.dataTransfer?.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  }

  function handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  }

  function handleFiles(files: File[]) {
    // Filter for allowed file types
    const allowedExtensions = ['pdf', 'txt', 'md', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff', 'bmp', 'mp4', 'avi', 'mov'];
    const validFiles = files.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ext && allowedExtensions.includes(ext);
    });

    selectedFiles = [...selectedFiles, ...validFiles];
  }

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);
    formData.append('caseId', caseId);

    try {
      const response = await api.post('/upload', formData, {
        onUploadProgress: (progressEvent) => {
          uploadProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        }
      });

      return {
        file: file.name,
        success: true,
        jobId: response.data.jobId,
        ...response.data
      };
    } catch (error) {
      return {
        file: file.name,
        success: false,
        error: error.message
      };
    }
  }

  async function uploadAllFiles() {
    if (selectedFiles.length === 0) return;

    isUploading = true;
    uploadResults = [];

    for (const file of selectedFiles) {
      const result = await uploadFile(file);
      uploadResults = [...uploadResults, result];

      if (result.success) {
        dispatch('fileUploaded', {
          jobId: result.jobId,
          caseId: caseId
        });
      }
    }

    isUploading = false;
    selectedFiles = [];
    uploadProgress = 0;
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
</script>

<div class="bg-slate-800/50 rounded-lg p-6">
  <h2 class="text-xl font-semibold text-cyan-400 mb-4">Upload Documents</h2>

  <!-- Drop Zone -->
  <div
    class="border-2 border-dashed rounded-lg p-8 text-center transition-colors {isDragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-600'}"
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    <input
      type="file"
      multiple
      accept=".pdf,.txt,.md,.doc,.docx,.jpg,.jpeg,.png,.tiff,.bmp,.mp4,.avi,.mov"
      class="hidden"
      id="file-input"
      on:change={handleFileInput}
    />

    {#if isUploading}
      <div class="text-cyan-400 mb-4">
        <svg class="w-12 h-12 mx-auto mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
        <p>Uploading... {uploadProgress}%</p>
      </div>
    {:else}
      <div class="text-slate-400 mb-4">
        <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
      </div>
      <p class="text-slate-300 mb-4">Drag & drop files here, or <label for="file-input" class="text-cyan-400 cursor-pointer hover:underline">browse</label></p>
      <p class="text-slate-500 text-sm">Supports PDF, TXT, MD, DOC, DOCX, images, and videos up to 1GB</p>
    {/if}
  </div>

  <!-- Selected Files -->
  {#if selectedFiles.length > 0}
    <div class="mt-6">
      <h3 class="text-lg font-semibold text-white mb-4">Selected Files ({selectedFiles.length})</h3>
      <div class="space-y-2 max-h-64 overflow-y-auto">
        {#each selectedFiles as file, index}
          <div class="flex items-center justify-between bg-slate-700 rounded-lg p-3">
            <div class="flex items-center space-x-3">
              <div class="text-cyan-400">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                </svg>
              </div>
              <div>
                <p class="text-white font-medium">{file.name}</p>
                <p class="text-slate-400 text-sm">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              on:click={() => removeFile(index)}
              class="text-red-400 hover:text-red-300"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>

      <button
        on:click={uploadAllFiles}
        disabled={isUploading}
        class="w-full mt-4 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
      >
        {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`}
      </button>
    </div>
  {/if}

  <!-- Upload Results -->
  {#if uploadResults.length > 0}
    <div class="mt-6">
      <h3 class="text-lg font-semibold text-white mb-4">Upload Results</h3>
      <div class="space-y-2">
        {#each uploadResults as result}
          <div class="flex items-center space-x-3 p-3 rounded-lg {result.success ? 'bg-green-900/50' : 'bg-red-900/50'}">
            <div class="{result.success ? 'text-green-400' : 'text-red-400'}">
              {#if result.success}
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 01 1.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              {:else}
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 11-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </div>
            <div>
              <p class="text-white font-medium">{result.file}</p>
              {#if result.success}
                <p class="text-green-300 text-sm">Job ID: {result.jobId}</p>
              {:else}
                <p class="text-red-300 text-sm">{result.error}</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>