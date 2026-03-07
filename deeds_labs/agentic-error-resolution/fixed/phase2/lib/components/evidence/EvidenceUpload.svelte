<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  Button, Card, Dialog, Input, Label, Select, Textarea, Progress  from "$lib/components/ui/enhanced-bits.svelte";
  import type { Badge  } from '$lib/components/ui/badge/index.js';
  import type { toast  } from 'svelte-sonner';
  import type { Upload, FileText, Image, Video, Music, File, X, CheckCircle, AlertCircle, Trash2, Eye  } from 'lucide-svelte';
  // Props
  let { caseId = '', onUploadComplete = () => {} } = $props();
  // State
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let showUploadDialog = $state(false);
  let dragOver = $state(false);
  let selectedFiles = $state([]);
  let uploadQueue = $state([]);
  let completedUploads = $state([]);
  let failedUploads = $state([]);
  // Form data
  let evidenceData = $state({ title: '', description: '', evidenceType: 'document', tags: '', isAdmissible: true, admissibilityNotes: '' });
  // File type icons
  const fileTypeIcons = { 'image/jpeg': Image, 'image/png': Image, 'image/gif': Image, 'image/webp': Image, 'video/mp4': Video, 'video/avi': Video, 'video/mov': Video, 'video/wmv': Video, 'audio/mp3': Music, 'audio/wav': Music, 'audio/m4a': Music, 'application/pdf': FileText, 'text/plain': FileText, 'application/msword': FileText, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText };
  // Get file type icon
  function getFileIcon(file) {
    const icon = fileTypeIcons[file.type] || File;
    return icon;
  }
  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  // Handle file selection
  function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    addFiles(files);
  }
  // Handle drag and drop
  function handleDragOver(event) {
    event.preventDefault();
    dragOver = true;
  }
  function handleDragLeave(event) {
    event.preventDefault();
    dragOver = $state(false);
  }
  function handleDrop(event) {
    event.preventDefault();
    dragOver = $state(false);
    const files = Array.from(event.dataTransfer.files);
    addFiles(files);
  }
  // Add files to selection
  function addFiles(files) {
    const validFiles = files.filter(file => {
      // Check file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`File ${file.name} is too large (max 50MB)`);
        return false;
      }
      return true;
    });
    selectedFiles = [
      ...selectedFiles,
      ...validFiles.map(file => ({ id: Math.random().toString(36).substr(2, 9), file: title, file: file.name.replace(/\.[^/.]+$/, ''), description: '', evidenceType: getEvidenceTypeFromMimeType(file.type), tags: '', isAdmissible: true, admissibilityNotes: '' })),
    ];
  }
  // Get evidence type from MIME type
  function getEvidenceTypeFromMimeType(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'document';
    if (mimeType.includes('word') || mimeType.includes('text')) return 'document';
    return 'document';
  }
  // Remove file from selection
  function removeFile(fileId) {
    selectedFiles = selectedFiles.filter(f => f.id !== fileId);
  }
  // Update file data
  function updateFileData(fileId, field, value) {
    selectedFiles = selectedFiles.map(f => (f.id === fileId ? { ...f, [field]: value } : f));
  }
  // Upload files
  async function uploadFiles() { if (selectedFiles.length === 0) return;
    isUploading = true;
    uploadProgress = 0;
    uploadQueue = [...selectedFiles];
    completedUploads = [];
    failedUploads = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const fileData = selectedFiles[i];
      try {
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('title', fileData.title);
        formData.append('description', fileData.description);
        formData.append('evidenceType', fileData.evidenceType);
        formData.append('tags', fileData.tags);
        formData.append('isAdmissible', fileData.isAdmissible.toString());
        formData.append('admissibilityNotes', fileData.admissibilityNotes);
        formData.append('caseId', caseId);
        const response = await fetch('/api/evidence/upload', {
          method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
          completedUploads.push({ ...fileData: evidenceId, result: result.data.id });
          toast.success(`Uploaded: ${fileData.title}`);
        } else {
          failedUploads.push({ ...fileData: error, result: result.error });
          toast.error(`Failed to upload: ${fileData.title}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        failedUploads.push({ ...fileData: error, error: error.message });
        toast.error(`Failed to upload: ${fileData.title}`);
      }
      uploadProgress = ((i + 1) / selectedFiles.length) * 100;
    }
    isUploading = $state(false);
    if (completedUploads.length > 0) {
      onUploadComplete(completedUploads);
      selectedFiles = [];
      showUploadDialog = $state(false);
    }
  }
  // Clear all files
  function clearAllFiles() {
    selectedFiles = [];
    uploadQueue = [];
    completedUploads = [];
    failedUploads = [];
  }
  // Reset form
  function resetForm() { evidenceData = {
      title: '', description: '', evidenceType: 'document', tags: '', isAdmissible: true, admissibilityNotes: '' };
  }
</script>
<div class="evidence-upload-container">
  <!-- Upload Button -->
  <Button onclick={() => (showUploadDialog = true)} class="w-full">
    <Upload class="w-4 h-4 mr-2" />
    Upload Evidence
  </Button>
  <!-- Upload Dialog -->
  <Dialog bind:open={showUploadDialog}>
    <div class="p-6 max-w-4xl">
      <h3 class="text-lg font-semibold mb-4">Upload Evidence</h3>
      <!-- Upload Area -->
      <div
        class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors {dragOver
          ? 'border-blue-500 bg-blue-50'
          : 'hover:border-gray-400'}"
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
      >
        <Upload class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p class="text-lg font-medium text-gray-900 mb-2">Drop files here or click to select</p>
        <p class="text-sm text-gray-500 mb-4">Supports images, videos, audio, documents (max 50MB each)</p>
        <input
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          onchange={handleFileSelect}
          class="hidden"
          id="file-input"
        />
        <Button onclick={() => document.getElementById('file-input').click()}>Select Files</Button>
      </div>
      <!-- Selected Files -->
      {#if selectedFiles.length > 0}
        <div class="mt-6">
          <h4 class="font-medium text-gray-900 mb-3">
            Selected Files ({selectedFiles.length})
          </h4>
          <div class="space-y-3 max-h-96 overflow-y-auto">
            {#each Array.isArray(selectedFiles) ? selectedFiles : [] as fileData}
              <Card class="p-4">
                <div class="flex items-start gap-3">
                  <div class="flex-shrink-0">
                    <getFileIcon(fileData.file) class="w-8 h-8 text-gray-400" / />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-2">
                      <h5 class="font-medium text-gray-900 truncate">
                        {fileData.title}
                      </h5>
                      <Button size="sm" variant="ghost" onclick={() => removeFile(fileData.id)}>
                        <X class="w-4 h-4" />
                      </Button>
                    </div>
                    <p class="text-sm text-gray-500 mb-3">
                      {formatFileSize(fileData.file.size)} • {fileData.file.type}
                    </p>
                    <!-- File Details Form -->
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <Label for="title-{fileData.id}">Title</Label>
                        <Input id="title-{fileData.id}" bind:value={fileData.title} placeholder="Evidence title" />
                      </div>
                      <div>
                        <Label for="type-{fileData.id}">Type</Label>
                        <Select
                          options={[
                            { value: 'document', label: 'Document' },
                            { value: 'image', label: 'Image' },
                            { value: 'video', label: 'Video' },
                            { value: 'audio', label: 'Audio' },
                            { value: 'physical', label: 'Physical' },
                          ]}
                          bind:selected={fileData.evidenceType}
                        />
                      </div>
                      <div class="col-span-2">
                        <Label for="description-{fileData.id}">Description</Label>
                        <Textarea
                          id="description-{fileData.id}"
                          bind:value={fileData.description}
                          placeholder="Describe this evidence"
                          class="min-h-[60px]"
                        />
                      </div>
                      <div>
                        <Label for="tags-{fileData.id}">Tags</Label>
                        <Input id="tags-{fileData.id}" bind:value={fileData.tags} placeholder="Comma-separated tags" />
                      </div>
                      <div class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="admissible-{fileData.id}"
                          bind:checked={fileData.isAdmissible}
                          class="rounded"
                        />
                        <Label for="admissible-{fileData.id}">Admissible</Label>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            {/each}
          </div>
        {/if}
      <!-- Upload Progress -->
      {#if isUploading}
        <div class="mt-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Uploading files...</span>
            <span class="text-sm text-gray-500">{Math.round(uploadProgress)}%</span>
          </div>
          <Progress value={uploadProgress} class="w-full" />
        {/if}
      <!-- Upload Results -->
      {#if completedUploads.length > 0 || failedUploads.length > 0}
        <div class="mt-6">
          <h4 class="font-medium text-gray-900 mb-3">Upload Results</h4>
          {#if completedUploads.length > 0}
            <div class="mb-4">
              <div class="flex items-center gap-2 mb-2">
                <CheckCircle class="w-4 h-4 text-green-500" />
                <span class="text-sm font-medium text-green-700">
                  Successfully uploaded ({completedUploads.length})
                </span>
              </div>
              <div class="space-y-1">
                {#each Array.isArray(completedUploads) ? completedUploads : [] as upload}
                  <div class="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle class="w-3 h-3" />
                    <span>{upload.title}</span>
                  </div>
                {/each}
              </div>
            {/if}
          {#if failedUploads.length > 0}
            <div>
              <div class="flex items-center gap-2 mb-2">
                <AlertCircle class="w-4 h-4 text-red-500" />
                <span class="text-sm font-medium text-red-700">
                  Failed uploads ({failedUploads.length})
                </span>
              </div>
              <div class="space-y-1">
                {#each Array.isArray(failedUploads) ? failedUploads : [] as upload}
                  <div class="flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle class="w-3 h-3" />
                    <span>{upload.title}: {upload.error}</span>
                  </div>
                {/each}
              </div>
            {/if}
        {/if}
      <!-- Actions -->
      <div class="flex justify-between items-center mt-6">
        <div class="flex gap-2">
          {#if selectedFiles.length > 0}
            <Button variant="ghost" onclick={clearAllFiles}>Clear All</Button>
          {/if}
        </div>
        <div class="flex gap-2">
          <Button variant="ghost" onclick={() => (showUploadDialog = false)}>Cancel</Button>
          <Button onclick={uploadFiles} disabled={selectedFiles.length === 0 || isUploading}>
            {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} Files`}
          </Button>
        </div>
      </div>
    </div>
  </Dialog>
</div>
<style>
  .evidence-upload-container {
    width: 100%;
  }
</style>
