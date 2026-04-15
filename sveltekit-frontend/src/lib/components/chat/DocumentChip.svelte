<!--
  DocumentChip - ChatGPT-style file preview chip
  Shows uploaded file with preview and remove button
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    fileName: string;
    fileSize: number;
    fileType: string;
    previewUrl?: string;
    progress?: number; // 0-100, shows upload progress
    onremove?: () => void;
    onclick?: () => void;
    disabled?: boolean;
  }

  let {
    fileName,
    fileSize,
    fileType,
    previewUrl = undefined,
    progress = undefined,
    onremove = () => {},
    onclick = undefined,
    disabled = false
  }: Props = $props();

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function getFileIcon(type: string): string {
    if (type.startsWith('audio/')) return 'music';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('image/')) return 'image';
    if (type.includes('pdf')) return 'file-text';
    if (type.includes('document') || type.includes('word')) return 'file-text';
    if (type.includes('spreadsheet') || type.includes('excel')) return 'table';
    return 'file';
  }

  function getFileTypeLabel(type: string): string {
    if (type.startsWith('audio/')) return 'Audio';
    if (type.startsWith('video/')) return 'Video';
    if (type.startsWith('image/')) return 'Image';
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('word')) return 'Document';
    if (type.includes('excel')) return 'Spreadsheet';
    return 'File';
  }

  const isClickable = $derived(onclick !== undefined && !disabled);
  const isUploading = $derived(progress !== undefined && progress < 100);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sand/20 bg-panel/50 hover:bg-panel transition-colors max-w-64"
  class:cursor-pointer={isClickable}
  class:opacity-70={disabled}
  onclick={() => !disabled && onclick?.()}
  role={isClickable ? 'button' : undefined}
  tabindex={isClickable ? 0 : undefined}
  onkeydown={(e) => isClickable && (e.key === 'Enter' || e.key === ' ') && onclick?.()}
>
  <!-- File icon or preview thumbnail -->
  <div class="flex-shrink-0 w-8 h-8 flex items-center justify-center">
    {#if previewUrl}
      <img src={previewUrl} alt={fileName} class="w-8 h-8 object-cover rounded" />
    {:else}
      <Icon name={getFileIcon(fileType)} class="w-5 h-5 text-sand/60" />
    {/if}
  </div>

  <!-- File info -->
  <div class="flex-1 min-w-0 text-sm">
    <p class="font-medium truncate" title={fileName}>{fileName}</p>
    <div class="flex items-center gap-2 text-xs text-sand/60">
      <span>{getFileTypeLabel(fileType)}</span>
      <span>•</span>
      <span>{formatSize(fileSize)}</span>
    </div>

    <!-- Upload progress bar -->
    {#if isUploading}
      <div class="mt-1 w-full h-1 bg-sand/10 rounded-full overflow-hidden">
        <div
          class="h-full bg-info transition-all duration-300"
          style="width: {progress}%"
        ></div>
      </div>
    {/if}
  </div>

  <!-- Status indicator or remove button -->
  <div class="flex-shrink-0">
    {#if isUploading}
      <Icon name="loader-2" class="w-4 h-4 animate-spin text-info" />
    {:else if !disabled}
      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          onremove();
        }}
        class="p-0.5 hover:bg-sand/10 rounded transition-colors"
        aria-label="Remove file"
      >
        <Icon name="x" class="w-3.5 h-3.5 text-sand/60 hover:text-sand" />
      </button>
    {/if}
  </div>
</div>
