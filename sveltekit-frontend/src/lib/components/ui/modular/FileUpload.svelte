<script lang="ts">
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';
  import FileText from 'lucide-svelte/icons/file-text';

  interface UploadFile {
    id: string;
    file: File;
    name: string;
    type: string;
    size: number;
    status: string;
    progress: number;
    error?: string;
  }

  interface Props {
    multiple?: boolean;
    maxFiles?: number;
    maxSize?: number;
    accept?: string;
    files?: UploadFile[];
    onfileschange?: (files: UploadFile[]) => void;
    onupload?: (file: UploadFile) => void;
    onremove?: (fileId: string) => void;
    dragDropText?: string;
    browseText?: string;
    supportedFormats?: string[];
    class?: string;
  }

  let {
    multiple = false,
    maxFiles = 5,
    maxSize = 50 * 1024 * 1024,
    accept = '*',
    files = $bindable<UploadFile[]>([]),
    onfileschange,
    onupload,
    onremove,
    dragDropText = 'Drop files here or click to browse',
    browseText = 'Browse Files',
    supportedFormats = [],
    class: className = ''
  }: Props = $props();

  let dragActive = $state(false);
  let inputRef: HTMLInputElement | undefined = $state();
  let errorMessage = $state('');

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function createUploadFile(file: File): UploadFile {
    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      status: 'pending',
      progress: 0
    };
  }

  function validateFile(file: File): string | null {
    if (file.size > maxSize) {
      return `${file.name} exceeds max size of ${formatSize(maxSize)}`;
    }
    if (accept !== '*') {
      const acceptedTypes = accept.split(',').map(t => t.trim());
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const matchesExt = acceptedTypes.some(t => t.startsWith('.') && t.toLowerCase() === ext);
      const matchesMime = acceptedTypes.some(t => !t.startsWith('.') && file.type.match(t.replace('*', '.*')));
      if (!matchesExt && !matchesMime) {
        return `${file.name} is not an accepted file type`;
      }
    }
    return null;
  }

  function addFiles(fileList: FileList | File[]) {
    errorMessage = '';
    const newFiles: UploadFile[] = [];

    for (const file of Array.from(fileList)) {
      if (!multiple && files.length + newFiles.length >= 1) break;
      if (files.length + newFiles.length >= maxFiles) {
        errorMessage = `Maximum ${maxFiles} file(s) allowed`;
        break;
      }

      const validationError = validateFile(file);
      if (validationError) {
        errorMessage = validationError;
        continue;
      }

      const uploadFile = createUploadFile(file);
      newFiles.push(uploadFile);
    }

    if (newFiles.length > 0) {
      files = [...files, ...newFiles];
      onfileschange?.(files);
      for (const f of newFiles) {
        onupload?.(f);
      }
    }
  }

  function removeFile(fileId: string) {
    files = files.filter(f => f.id !== fileId);
    onfileschange?.(files);
    onremove?.(fileId);
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    if (e.dataTransfer?.files) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      addFiles(target.files);
      target.value = '';
    }
  }

  function openFilePicker() {
    inputRef?.click();
  }
</script>

<div class="file-upload-container {className}">
  <!-- Drop Zone -->
  <button
    type="button"
    class="drop-zone"
    class:drag-active={dragActive}
    class:has-files={files.length > 0}
    ondragenter={handleDragEnter}
    ondragleave={handleDragLeave}
    ondragover={handleDragOver}
    ondrop={handleDrop}
    onclick={openFilePicker}
  >
    <Upload class="h-8 w-8 text-muted-foreground mb-2" />
    <p class="text-sm text-muted-foreground">{dragDropText}</p>
    <span class="browse-btn">{browseText}</span>
    {#if supportedFormats.length > 0}
      <p class="text-xs text-muted-foreground mt-1">
        Supported: {supportedFormats.join(', ')} &bull; Max {formatSize(maxSize)}
      </p>
    {/if}
  </button>

  <input
    bind:this={inputRef}
    type="file"
    {accept}
    {multiple}
    onchange={handleInputChange}
    class="hidden"
    tabindex={-1}
  />

  <!-- Error Message -->
  {#if errorMessage}
    <p class="text-sm text-danger mt-1">{errorMessage}</p>
  {/if}

  <!-- File List -->
  {#if files.length > 0}
    <ul class="file-list">
      {#each files as file (file.id)}
        <li class="file-item">
          <FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
          <div class="file-info">
            <span class="file-name">{file.name}</span>
            <span class="file-size">{formatSize(file.size)}</span>
          </div>
          {#if file.status === 'uploading'}
            <div class="progress-bar">
              <div class="progress-fill" style="width: {file.progress}%"></div>
            </div>
          {:else if file.status === 'completed'}
            <span class="text-xs text-accent">Done</span>
          {:else if file.status === 'error'}
            <span class="text-xs text-danger">{file.error ?? 'Error'}</span>
          {/if}
          <button type="button" class="remove-btn" onclick={() => removeFile(file.id)}>
            <X class="h-3 w-3" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .file-upload-container {
    width: 100%;
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 120px;
    padding: 1.5rem;
    border: 2px dashed hsl(var(--border, 220 13% 69%));
    border-radius: 0.5rem;
    background: transparent;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
    text-align: center;
  }

  .drop-zone:hover,
  .drop-zone.drag-active {
    border-color: hsl(var(--primary, 220 90% 56%));
    background: hsl(var(--accent, 220 14% 96%) / 0.5);
  }

  .browse-btn {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.375rem 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid hsl(var(--border, 220 13% 69%));
    border-radius: 0.375rem;
    background: hsl(var(--background, 0 0% 100%));
    transition: background-color 0.15s;
  }

  .drop-zone:hover .browse-btn {
    background: hsl(var(--accent, 220 14% 96%));
  }

  .file-list {
    margin-top: 0.75rem;
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border, 220 13% 69%));
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground, 220 9% 46%));
  }

  .progress-bar {
    width: 60px;
    height: 4px;
    background: hsl(var(--muted, 220 14% 96%));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: hsl(var(--primary, 220 90% 56%));
    transition: width 0.2s;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    color: hsl(var(--muted-foreground, 220 9% 46%));
    transition: color 0.15s, background-color 0.15s;
  }

  .remove-btn:hover {
    color: hsl(var(--destructive, 0 84% 60%));
    background: hsl(var(--destructive, 0 84% 60%) / 0.1);
  }

  .hidden {
    display: none;
  }
</style>