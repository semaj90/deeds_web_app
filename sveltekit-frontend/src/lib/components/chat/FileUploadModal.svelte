<!--
  FileUploadModal - Drag-drop file upload dialog
  Used for uploading audio/documents to chat context
-->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DocumentChip from './DocumentChip.svelte';

  interface Props {
    open?: boolean;
    maxFiles?: number;
    maxSizeMB?: number;
    acceptedTypes?: string[];
    selectedFiles?: File[];
    onclose?: () => void;
    onfilesselected?: (files: File[]) => void;
  }

  let {
    open = $bindable(false),
    maxFiles = 5,
    maxSizeMB = 100,
    acceptedTypes = [
      '.pdf', '.doc', '.docx', '.txt', '.md',
      '.jpg', '.jpeg', '.png', '.webp',
      '.mp3', '.wav', '.m4a', '.ogg',
      '.mp4', '.webm', '.mov'
    ],
    selectedFiles = $bindable<File[]>([]),
    onclose = () => {},
    onfilesselected = () => {}
  }: Props = $props();

  let fileInput: HTMLInputElement;
  let isDragOver = $state(false);
  let previews = $state<Record<string, string>>({});

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    const files = Array.from(event.dataTransfer?.files || []);
    addFiles(files);
  }

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addFiles(Array.from(target.files));
    }
  }

  function addFiles(files: File[]) {
    const validFiles = files.filter(file => validateFile(file));
    const totalFiles = selectedFiles.length + validFiles.length;

    if (totalFiles > maxFiles) {
      alert(`Maximum ${maxFiles} files allowed. Only adding ${maxFiles - selectedFiles.length} files.`);
      validFiles.splice(maxFiles - selectedFiles.length);
    }

    selectedFiles = [...selectedFiles, ...validFiles];

    // Generate previews for images
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previews[file.name] = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function validateFile(file: File): boolean {
    // Check size
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File "${file.name}" is too large. Maximum size is ${maxSizeMB}MB.`);
      return false;
    }

    // Check type
    const isValidType = acceptedTypes.some(type => {
      if (type.startsWith('.')) {
        return file.name.toLowerCase().endsWith(type.toLowerCase());
      }
      if (type.includes('*')) {
        const category = type.split('/')[0];
        return file.type.startsWith(category);
      }
      return file.type === type;
    });

    if (!isValidType) {
      alert(`File type "${file.type || 'unknown'}" is not supported.`);
      return false;
    }

    return true;
  }

  function removeFile(fileName: string) {
    selectedFiles = selectedFiles.filter(f => f.name !== fileName);
    delete previews[fileName];
  }

  function handleSubmit() {
    if (selectedFiles.length === 0) return;
    onfilesselected(selectedFiles);
    open = false;
  }

  function handleClose() {
    onclose();
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/50 z-50" />
    <Dialog.Content
      class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[85vh] bg-panel border border-sand/20 rounded-lg shadow-lg overflow-hidden"
    >
      <div class="flex flex-col h-full max-h-[85vh]">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-sand/20 flex items-center justify-between">
          <Dialog.Title class="text-lg font-semibold flex items-center gap-2">
            <Icon name="upload" class="w-5 h-5" />
            Upload Files to Chat
          </Dialog.Title>
          <Dialog.Close
            class="p-1 hover:bg-sand/10 rounded transition-colors"
            aria-label="Close dialog"
          >
            <Icon name="x" class="w-5 h-5" />
          </Dialog.Close>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <Dialog.Description class="text-sm text-sand/70">
            Upload documents, images, or audio files to add context to your conversation.
            Maximum {maxFiles} files, {maxSizeMB}MB each.
          </Dialog.Description>

          <!-- Drop Zone -->
          <div
            class="border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer {isDragOver ? 'border-info bg-info/5' : 'border-sand/20 hover:border-sand/40'}"
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            onclick={() => fileInput?.click()}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput?.click()}
            role="button"
            tabindex="0"
          >
            <Icon name="upload-cloud" class="w-12 h-12 mx-auto text-sand/40 mb-4" />
            <p class="text-base font-medium mb-1">
              Drop files here or click to browse
            </p>
            <p class="text-sm text-sand/60">
              PDF, Documents, Images, Audio, Video
            </p>
          </div>

          <!-- Hidden file input -->
          <input
            bind:this={fileInput}
            type="file"
            multiple
            accept={acceptedTypes.join(',')}
            onchange={handleFileSelect}
            class="hidden"
          />

          <!-- Selected Files -->
          {#if selectedFiles.length > 0}
            <div class="space-y-3">
              <h4 class="font-medium text-sm">
                Selected Files ({selectedFiles.length}/{maxFiles})
              </h4>
              <div class="grid gap-2">
                {#each selectedFiles as file (file.name)}
                  <DocumentChip
                    fileName={file.name}
                    fileSize={file.size}
                    fileType={file.type}
                    previewUrl={previews[file.name]}
                    onremove={() => removeFile(file.name)}
                  />
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-sand/20 flex items-center justify-between">
          <p class="text-sm text-sand/60">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </p>
          <div class="flex gap-2">
            <Button onclick={handleClose}>Cancel</Button>
            <Button
              onclick={handleSubmit}
              disabled={selectedFiles.length === 0}
              class="min-w-24"
            >
              <Icon name="check" class="w-4 h-4 mr-2" />
              Add Files
            </Button>
          </div>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
