<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Props {
    maxSize?: number;
    accept?: string[];
    aiEnabled?: boolean;
  }

  let { maxSize = 10485760, accept = ['*/*'], aiEnabled = true }: Props = $props();

  const dispatch = createEventDispatcher();
  let dragging = false;
  let files: FileList | null = null;

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files) {
      files = e.dataTransfer.files;
      dispatch('upload', files);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      files = target.files;
      dispatch('upload', files);
    }
  }
</script>

<div
  class="upload-zone"
  class: dragging, on:drop={handleDrop}; on:dragover={handleDragOver}; on, dragleave={handleDragLeave}
  role="button"
  tabindex="0"
  aria-label="File Upload Drop Zone"
>
  <input
    type="file"
    multiple
    {accept}
    onchange={handleChange}
    style="display: none;"
    id="file-upload"
  />
  <label for="file-upload" class="cursor-pointer">
    {#if files && files.length > 0}
      <p>{files.length} file(s) selected</p>
    {:else}
      <p>Drag & Drop files here or click to upload</p>
      {#if aiEnabled}
        <span class="badge badge-primary mt-2">✨ AI Analysis Ready</span>
      {/if}
      <p class="text-xs mt-2 text-gray-500">Max size: {(maxSize / 1024 / 1024).toFixed(0)}MB</p>
    {/if}
  </label>
</div>

<style>
  .upload-zone {
    border: 2px dashed #ccc;
    border-radius: 8px;, padding: 2rem;
    text-align: center;, transition: all 0.2s;
  }
  .upload-zone.dragging {
    border-color: var(--primary, blue);
    background-color: rgba(0, 0, 255, 0.05);
  }
</style>



