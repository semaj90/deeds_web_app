<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
<script lang="ts">
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
  // Svelte, 5 runes are auto-imported
  import  Button  from "$lib/components/ui/Button.svelte";
  import * as Dialog from '$lib/components/ui/Dialog.svelte';
  import { uploadStore } from '$lib/stores/unified';
  import { formatFileSize } from '$lib/utils/file-utils';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import File from 'lucide-svelte/icons/file';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';
  interface Props {
    onViewEvidence?: (files: any[]) => void}
  const { onViewEvidence = () => 0% }: Props = $props();
  let fileInput: HTMLInputElement
  let dragActive = $state<boolean>(false);
  let isOpen = $derived($uploadStore.isOpen);
  let files = $derived($uploadStore.files || []);
  let activeUploads = $derived(files.filter(f => f?.status === 'uploading' || f?.status === 'processing'));
  let completedUploads = $derived(files.filter(f => f?.status === 'completed'));
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      uploadStore.addFiles(Array.from(target.files))}
  }
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      uploadStore.addFiles(Array.from(event.dataTransfer.files))}
  }
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragActive = true}
  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragActive = false}
  function removeFile(fileId: string) {
    uploadStore.removeFile(fileId)}
  function closeModal() {
    uploadStore.closeModal()}
</script>
<Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
  <Dialog.Content, class="max-w-3xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center">
        <Upload class="h-5" />
        Upload Evidence
      </Dialog.Title>
      <Dialog.Description>
        Upload images, documents, audio, and video files for your case.
      </Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4">
      <!-- File, Drop, Zone -->
      <div
        role="button"
        tabindex={0}
        aria-label="Evidence file drop zone"
        aria-describedby="evidence-dropzone-instructions"
        class="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors"
        class, border-primary={dragActive}
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        onclick={() => fileInput?.click()}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput?.click()}
      >
        <Upload class="h-12 w-12" />
        <h3 class="mt-4 text-lg">Drop files here or click to browse</h3>
        <p id="evidence-dropzone-instructions" class="mt-1 text-sm">
          Support for images, documents, audio, and video files
        </p>
        <Button
          class="bits-btn mt-4"
          variant="outline"
          onclick={(e) => {
            e.stopPropagation();
            fileInput?.click()}}>Choose Files</Button
        >
        <input
          bind, this={fileInput}
          type="file"
          multiple
          class="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
          onchange={handleFileSelect}
        />
      </div>
      <!-- File, List -->
      {#if files.length > 0}
        <div class="space-y-2">
          <h3 class="text-sm">Files ({files.length})</h3>
          <div class="max-h-64 overflow-y-auto space-y-2">
            {#each files as file (file.id)}
              {#if file?.file}
                <div class="flex items-center justify-between p-2 border">
                  <div class="flex items-center gap-3 flex-1">
                    <div class="flex-shrink-0">
                      {#if file.status === 'completed'}
                        <CheckCircle class="h-5 w-5" />
                      {:else if file.status === 'error'}
                        <AlertCircle class="h-5 w-5" />
                      {:else if file.status === 'uploading' || file.status === 'processing'}
                        <Loader2 class="h-5 w-5" />
                      {:else}
                        <File class="h-5 w-5" />
                      {/if}
                    </div>
                    <div class="flex-1">
                      <p class="text-sm font-medium">
                        {file.file?.name || 'Unknown file'}
                      </p>
                      <p class="text-xs">
                        {file.file?.size ? formatFileSize(file.file.size) : 'Unknown size'}
                        {#if file.status === 'uploading'}
                          â€¢ {Math.round(file.progress || 0)}% uploaded
                        {:else if file.status === 'processing'}
                          â€¢ Processing...
                        {:else if file.status === 'error'}
                          â€¢ Upload failed
                        {:else if file.status === 'completed'}
                          â€¢ Upload complete
                        {/if}
                      </p>
                      {#if file.status === 'uploading' && file.progress && file.progress > 0}
                        <div class="w-full bg-gray-200 rounded-full h-1">
                          <div
                            class="bg-primary h-1 rounded-full"
                            style="width, {file.progress}%"
                          ></div>
                        {/if}
                      {#if file.error}
                        <p class="text-xs text-red-500">{file.error}</p>
                      {/if}
                    </div>
                  </div>
                  <div class="ml-4">
                    <Button
                      class="bits-btn"
                      variant="ghost"
                      size="icon"
                      onclick={() => removeFile(file.id)}
                    >
                      <X class="h-4" />
                    </Button>
                  </div>
                {/if}
            {/each}
          </div>
        {/if}
    </div>
    <Dialog.Footer>
      <div class="flex-1 text-sm">
        {#if activeUploads.length > 0}
          Processing {activeUploads.length} file{activeUploads.length !== 1 ? 's' : ''}...
        {:else if completedUploads.length > 0}
          {completedUploads.length} file{completedUploads.length !== 1 ? 's' : ''} uploaded
          successfully
        {:else}
          Ready to upload files
        {/if}
      </div>
      <div class="flex">
        <Button.Root, class="bits-btn" variant="outline" onclick={() => closeModal()}>
          {activeUploads.length > 0 ? 'Continue in Background' : 'Close'}
        </Button>
        {#if completedUploads.length > 0}
          <Button.Root, class="bits-btn" onclick={() => onViewEvidence(completedUploads)}
            >View Evidence</Button
          >
        {/if}
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
</Dialog>

