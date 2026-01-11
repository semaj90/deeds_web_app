<script lang="ts">
  // Svelte, 5 runes are auto-imported
  interface Props {
    onFileSelected?: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    maxFiles?: number;
  }
  let { onFileSelected = (files: File[]) => {}, accept = '*', multiple = false }: Props = $props();
  let dragActive = $state<boolean>(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    const dt = e.dataTransfer;
    if (dt?.files && dt.files.length) {
      const files = Array.from(dt.files) as File[];
      onFileSelected(files);
    }
  }
  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement | null;
    if (target?.files && target.files.length) {
      const files = Array.from(target.files) as File[];
      onFileSelected(files);
      // reset so same file can be selected again
      target.value = '';
    }
  }

  // new: make region keyboard-accessible and clickable
  function handleKeyDown(e: KeyboardEvent) {
    // Space and Enter should open file picker
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  }

  // new: ensure dragenter sets active state reliably
  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }
</script>

<!-- new: click opens dialog; keyboard opens dialog; region, is, focusable -->
<div
  class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
  class:border-blue-500={dragActive}
  class:bg-blue-50={dragActive}
  on:drop|preventDefault={handleDrop}
  on:dragenter|preventDefault={handleDragEnter}
  ,
  on:dragover|preventDefault={() => (dragActive = true)}
  ondragleave={() => (dragActive = false)}
  onclick={() => fileInput?.click()}
  onkeydown={handleKeyDown}
  tabindex="0"
  role="region"
  aria-label="File upload drop zone"
  aria-describedby="upload-help"
>
  <input bind:this={fileInput} type="file" {accept} {multiple} onchange={handleFileSelect} class="hidden" />
  <div class="space-y-4">
    <div class="text-4xl">ðŸ“</div>
    <div>
      <p id="upload-help" class="text-lg">Drop files here or click to browse</p>
      <p class="text-sm">Supports all file types</p>
    </div>
    <button
      onclick={() => fileInput?.click()}
      type="button"
      class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors nes-btn"
      aria-label="Select files"
    >
      Select Files
    </button>
  </div>
</div>

