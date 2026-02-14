<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { toast } from 'svelte-sonner';
  import Upload from '@lucide/svelte/icons/upload';
  import FileText from '@lucide/svelte/icons/file-text';
  import ImageIcon from '@lucide/svelte/icons/image';
  import Video from '@lucide/svelte/icons/video';
  import Music from '@lucide/svelte/icons/music';
  import FileIcon from '@lucide/svelte/icons/file';
  import X from '@lucide/svelte/icons/x';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';

  // Props
  interface Props {
    caseId?: string;
    onUploadComplete?: (uploads: any[]) => void;
  }

  let {
    caseId = '',
    onUploadComplete = () => {}
  }: Props = $props();

  // State
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let showUploadDialog = $state(false);
  let dragOver = $state(false);
  let selectedFiles = $state<any[]>([]);
  let uploadQueue = $state<any[]>([]);
  let completedUploads = $state<any[]>([]);
  let failedUploads = $state<any[]>([]);

  // Form data
  let evidenceData = $state({
    title: '',
    description: '',
    evidenceType: 'document',
    tags: '',
    isAdmissible: true,
    admissibilityNotes: ''
  });

  // File type icons
  const fileTypeIcons: Record<string, any> = {
    'image/jpeg': ImageIcon,
    'image/png': ImageIcon,
    'image/gif': ImageIcon,
    'image/webp': ImageIcon,
    'video/mp4': Video,
    'video/avi': Video,
    'video/mov': Video,
    'video/wmv': Video,
    'audio/mp3': Music,
    'audio/wav': Music,
    'audio/m4a': Music,
    'application/pdf': FileText,
    'text/plain': FileText,
    'application/msword': FileText,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText
  };

  // Get file type icon
  function getFileIcon(file: File) {
    return fileTypeIcons[file.type] || FileIcon;
  }

  // Format file size
  function formatFileSize(bytes: number) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Handle file selection
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    addFiles(files);
  }

  // Handle drag and drop
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
    const files = Array.from(event.dataTransfer?.files || []);
    addFiles(files);
  }

  // Add files to selection
  function addFiles(files: File[]) {
    const validFiles = files.filter(file => {
      // Check file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`File ${file.name} is too large (max 50MB)`);
        return false;
      }
      return true;
    });

    selectedFiles = [...selectedFiles, ...validFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      title: file.name.replace(/\.[^/.]+$/, ''),
      description: '',
      evidenceType: getEvidenceTypeFromMimeType(file.type),
      tags: '',
      isAdmissible: true,
      admissibilityNotes: ''
    }))];
  }

  // Get evidence type from MIME type
  function getEvidenceTypeFromMimeType(mimeType: string) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'document';
    if (mimeType.includes('word') || mimeType.includes('text')) return 'document';
    return 'document';
  }

  // Remove file from selection
  function removeFile(fileId: string) {
    selectedFiles = selectedFiles.filter(f => f.id !== fileId);
  }

  // Update file data
  function updateFileData(fileId: string, field: string, value: any) {
    selectedFiles = selectedFiles.map(f =>
      f.id === fileId ? { ...f, [field]: value } : f
    );
  }

  // Upload files
  async function uploadFiles() {
    if (selectedFiles.length === 0) return;

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
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          completedUploads = [...completedUploads, { ...fileData, evidenceId: result.data.id }];
          toast.success(`Uploaded: ${fileData.title}`);
        } else {
          failedUploads = [...failedUploads, { ...fileData, error: result.error }];
          toast.error(`Failed to upload: ${fileData.title}`);
        }
      } catch (error: any) {
        console.error('Upload error:', error);
        failedUploads = [...failedUploads, { ...fileData, error: error.message }];
        toast.error(`Failed to upload: ${fileData.title}`);
      }

      uploadProgress = ((i + 1) / selectedFiles.length) * 100;
    }

    isUploading = false;

    if (completedUploads.length > 0) {
      onUploadComplete(completedUploads);
      selectedFiles = [];
      showUploadDialog = false;
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
  function resetForm() {
    evidenceData = {
      title: '',
      description: '',
      evidenceType: 'document',
      tags: '',
      isAdmissible: true,
      admissibilityNotes: ''
    };
  }
</script>

<div class="evidence-upload-container">
  <!-- Upload Button -->
  <Button onclick={() => showUploadDialog = true} class="w-full">
    <Upload class="w-4 h-4 mr-2" />
    Upload Evidence
  </Button>

  <!-- Upload Dialog -->
  {#if showUploadDialog}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-4">Upload Evidence</h3>

          <!-- Upload Area -->
          <div
            class="border-2 border-dashed border-sand/20 rounded-lg p-8 text-center transition-colors {dragOver ? 'border-info bg-info/5' : 'hover:border-sand/30'}"
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            role="button"
            tabindex="0"
          >
            <Upload class="w-12 h-12 text-sand/40 mx-auto mb-4" />
            <p class="text-lg font-medium text-sand mb-2">
              Drop files here or click to select
            </p>
            <p class="text-sm text-sand/60 mb-4">
              Supports images, videos, audio, documents (max 50MB each)
            </p>
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              onchange={handleFileSelect}
              class="hidden"
              id="file-input"
            />
            <Button onclick={() => document.getElementById('file-input')?.click()}>
              Select Files
            </Button>
          </div>

          <!-- Selected Files -->
          {#if selectedFiles.length > 0}
            <div class="mt-6">
              <h4 class="font-medium text-sand mb-3">
                Selected Files ({selectedFiles.length})
              </h4>
              <div class="space-y-3 max-h-96 overflow-y-auto">
                {#each selectedFiles as fileData (fileData.id)}
                  <div class="border rounded-lg p-4">
                    <div class="flex items-start gap-3">
                      <div class="flex-shrink-0">
                        <svelte:component this={getFileIcon(fileData.file)} class="w-8 h-8 text-sand/40" />
                      </div>

                      <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-2">
                          <h5 class="font-medium text-sand truncate">
                            {fileData.title}
                          </h5>
                          <button
                            onclick={() => removeFile(fileData.id)}
                            class="p-1 hover:bg-sand/10 rounded"
                          >
                            <X class="w-4 h-4" />
                          </button>
                        </div>

                        <p class="text-sm text-sand/60 mb-3">
                          {formatFileSize(fileData.file.size)} &bull; {fileData.file.type}
                        </p>

                        <!-- File Details Form -->
                        <div class="grid grid-cols-2 gap-3">
                          <div>
                            <label for="title-{fileData.id}" class="block text-sm font-medium text-sand/80">Title</label>
                            <input
                              id="title-{fileData.id}"
                              bind:value={fileData.title}
                              placeholder="Evidence title"
                              class="mt-1 block w-full rounded-md border border-sand/20 px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label for="type-{fileData.id}" class="block text-sm font-medium text-sand/80">Type</label>
                            <select
                              id="type-{fileData.id}"
                              bind:value={fileData.evidenceType}
                              class="mt-1 block w-full rounded-md border border-sand/20 px-3 py-2 text-sm"
                            >
                              <option value="document">Document</option>
                              <option value="image">Image</option>
                              <option value="video">Video</option>
                              <option value="audio">Audio</option>
                              <option value="physical">Physical</option>
                            </select>
                          </div>

                          <div class="col-span-2">
                            <label for="description-{fileData.id}" class="block text-sm font-medium text-sand/80">Description</label>
                            <textarea
                              id="description-{fileData.id}"
                              bind:value={fileData.description}
                              placeholder="Describe this evidence"
                              class="mt-1 block w-full rounded-md border border-sand/20 px-3 py-2 text-sm min-h-[60px]"
                            ></textarea>
                          </div>

                          <div>
                            <label for="tags-{fileData.id}" class="block text-sm font-medium text-sand/80">Tags</label>
                            <input
                              id="tags-{fileData.id}"
                              bind:value={fileData.tags}
                              placeholder="Comma-separated tags"
                              class="mt-1 block w-full rounded-md border border-sand/20 px-3 py-2 text-sm"
                            />
                          </div>

                          <div class="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="admissible-{fileData.id}"
                              bind:checked={fileData.isAdmissible}
                              class="rounded"
                            />
                            <label for="admissible-{fileData.id}" class="text-sm font-medium text-sand/80">Admissible</label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Upload Progress -->
          {#if isUploading}
            <div class="mt-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium">Uploading files...</span>
                <span class="text-sm text-sand/60">{Math.round(uploadProgress)}%</span>
              </div>
              <progress value={uploadProgress} max="100" class="w-full h-2"></progress>
            </div>
          {/if}

          <!-- Upload Results -->
          {#if completedUploads.length > 0 || failedUploads.length > 0}
            <div class="mt-6">
              <h4 class="font-medium text-sand mb-3">Upload Results</h4>

              {#if completedUploads.length > 0}
                <div class="mb-4">
                  <div class="flex items-center gap-2 mb-2">
                    <CheckCircle class="w-4 h-4 text-accent" />
                    <span class="text-sm font-medium text-accent">
                      Successfully uploaded ({completedUploads.length})
                    </span>
                  </div>
                  <div class="space-y-1">
                    {#each completedUploads as upload}
                      <div class="flex items-center gap-2 text-sm text-accent">
                        <CheckCircle class="w-3 h-3" />
                        <span>{upload.title}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if failedUploads.length > 0}
                <div>
                  <div class="flex items-center gap-2 mb-2">
                    <AlertCircle class="w-4 h-4 text-danger" />
                    <span class="text-sm font-medium text-danger">
                      Failed uploads ({failedUploads.length})
                    </span>
                  </div>
                  <div class="space-y-1">
                    {#each failedUploads as upload}
                      <div class="flex items-center gap-2 text-sm text-danger">
                        <AlertCircle class="w-3 h-3" />
                        <span>{upload.title}: {upload.error}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex justify-between items-center mt-6">
            <div class="flex gap-2">
              {#if selectedFiles.length > 0}
                <Button onclick={clearAllFiles} class="text-sand/60">
                  Clear All
                </Button>
              {/if}
            </div>

            <div class="flex gap-2">
              <Button onclick={() => showUploadDialog = false} class="text-sand/60">
                Cancel
              </Button>
              <Button
                onclick={uploadFiles}
                disabled={selectedFiles.length === 0 || isUploading}
              >
                {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} Files`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .evidence-upload-container {
    width: 100%;
  }
</style>
