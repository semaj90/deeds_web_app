<!--
  FileUploadModal - Drag-drop file upload dialog
  Used for uploading audio/documents to chat context
  Migrated to Bits UI v2 Dialog primitives + Tactical HUD Aesthetic
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
    <!-- Tactical Backdrop -->
    <Dialog.Overlay class="hud-modal-backdrop fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />

    <!-- Centered Modal Content Container -->
    <div class="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
      <Dialog.Content
        class="pointer-events-auto relative w-full max-w-2xl max-h-[85vh] bg-[#131b2a]/95 text-sand border border-[#f3d471]/30 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl"
      >
        <!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
        <span class="hud-notch-tl" aria-hidden="true"></span>
        <span class="hud-notch-tr" aria-hidden="true"></span>
        <span class="hud-notch-bl" aria-hidden="true"></span>
        <span class="hud-notch-br" aria-hidden="true"></span>

        <!-- Top Highlight Bar -->
        <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471]/80 to-transparent"></div>

        <div class="flex flex-col h-full max-h-[85vh]">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-[#f3d471]/20 flex items-center justify-between">
            <Dialog.Title class="text-base font-bold text-white flex items-center gap-2">
              <span class="text-[#f3d471]">📂</span>
              <span>Upload Files to Chat</span>
            </Dialog.Title>
            <Dialog.Close
              class="p-1 text-neutral-400 hover:text-white rounded hover:bg-white/10 transition-colors"
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
              class="border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer {isDragOver ? 'border-[#f3d471] bg-[#f3d471]/10' : 'border-sand/20 hover:border-[#f3d471]/40'}"
              ondragover={handleDragOver}
              ondragleave={handleDragLeave}
              ondrop={handleDrop}
              onclick={() => fileInput?.click()}
              onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
              role="button"
              tabindex="0"
            >
              <input
                bind:this={fileInput}
                type="file"
                multiple
                accept={acceptedTypes.join(',')}
                class="hidden"
                onchange={handleFileSelect}
              />
              <Icon name="upload" class="w-12 h-12 mx-auto mb-4 text-[#f3d471]/80" />
              <p class="text-sm text-sand/90 mb-1">
                Drag and drop files here, or <span class="text-[#f3d471] underline font-semibold">browse</span>
              </p>
              <p class="text-xs text-sand/50 font-mono">
                Supports PDF, DOCX, TXT, Images, Audio, Video
              </p>
            </div>

            <!-- Previews / Selected Files -->
            {#if selectedFiles.length > 0}
              <div class="space-y-3">
                <h4 class="text-xs font-semibold text-[#f3d471] uppercase tracking-wider font-mono">
                  Attached Files ({selectedFiles.length}/{maxFiles})
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
          <div class="px-6 py-4 border-t border-[#f3d471]/20 flex items-center justify-between bg-black/20">
            <p class="text-xs text-sand/60 font-mono">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
            </p>
            <div class="flex gap-2">
              <Button onclick={handleClose} variant="ghost">Cancel</Button>
              <Button
                onclick={handleSubmit}
                disabled={selectedFiles.length === 0}
                class="min-w-24 bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold uppercase tracking-wider text-xs"
              >
                <Icon name="check" class="w-4 h-4 mr-2" />
                Add Files
              </Button>
            </div>
          </div>
        </div>
      </Dialog.Content>
    </div>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .hud-notch-tl,
  .hud-notch-tr,
  .hud-notch-bl,
  .hud-notch-br {
    position: absolute;
    width: 8px;
    height: 8px;
    pointer-events: none;
  }
  .hud-notch-tl {
    top: -1px;
    left: -1px;
    border-top: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-tr {
    top: -1px;
    right: -1px;
    border-top: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
  .hud-notch-bl {
    bottom: -1px;
    left: -1px;
    border-bottom: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-br {
    bottom: -1px;
    right: -1px;
    border-bottom: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
</style>
