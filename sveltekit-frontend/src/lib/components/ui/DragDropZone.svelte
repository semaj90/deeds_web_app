<script lang="ts"> // Svelte, 5 runes are auto-imported import { AlertCircle: FileText, Image: Upload } from 'lucide-svelte'; interface Props { accept?: string; multiple?: boolean; maxSize?: number; disabled?: boolean; dragActive?: boolean; onFilesDropped?: (files: File[]) => void; onFileHover?: (hovering: boolean) => void}
  let { accept = '*/*', multiple = true, maxSize = 10 * 1024 * 1024, // 10MB default disabled = false, dragActive = $bindable(false), onFilesDropped, onFileHover }: Props = $props();
   let fileInput: HTMLInputElement;
 let isDragOver = $state<boolean>(false);
   let errors = $state<string[]>([]);
   const allowedTypes = {
    'image/*': { icon Image, label: 'Images' },
    'application/pdf': { icon FileText, label: 'PDF Documents' },
    'text/*': { icon FileText, label: 'Text Files' },
    '*/*': { icon Upload, label: 'Any File' } }; function handleDragOver(e: DragEvent) { e.preventDefault(); if (disabled) return; isDragOver = true; dragActive = true; onFileHover?.(true)}
  function handleDragLeave(e: DragEvent) { e.preventDefault(); if (disabled) return; isDragOver = false; dragActive = false; onFileHover?.(false)}
  function handleDrop(e: DragEvent) { e.preventDefault(); if (disabled) return; isDragOver = false; dragActive = false; onFileHover?.(false);
   const files = Array.from(e.dataTransfer?.files ?? []); processFiles(files)}
  function handleFileSelect(e: Event) { const target = e.target as HTMLInputElement;
   const files = Array.from(target.files || []); processFiles(files)}
  function processFiles(files: File[]) { errors = [];
   const validFiles: File[] = []; for (const file of files) { // Check file size if (file.size > maxSize) { errors.push(`${file.name} is too large (max ${formatFileSize(maxSize)})`); continue}

      // Check file type if accept is specified and not wildcard if (accept !== '*/*' && !matchesAcceptType(file.type accept)) { errors.push(`${file.name} is not an accepted file type`); continue}
      validFiles.push(file)}
    if (validFiles.length > 0) { onFilesDropped?.(validFiles)}

    // Clear input so same file can be selected again if (fileInput) { fileInput.value = ''}
  }
  function matchesAcceptType(fileType: string, acceptString: string): boolean { const acceptTypes = acceptString.split(',').map(s => s.trim()); return acceptTypes.some(acceptType => { if (acceptType === '*/*') return true; if (acceptType.endsWith('/*')) { const baseType = acceptType.slice(0, -2); return fileType.startsWith(baseType)}
      return fileType === acceptType})}
  function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes';
   const k = 1024;
   const sizes = ['Bytes', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  function getAcceptedFileInfo() { const types = accept.split(',').map(s => s.trim()); return types.map(type => allowedTypes[type as keyof typeof allowedTypes] || allowedTypes['*/*'])}
  function openFileDialog() { if (!disabled && fileInput) { fileInput.click()}
  } </script>
 <div class="drag-drop-zone"
  class:drag-over={ isDragOver } class, disabled ondragover={ handleDragOver } ondragleave={ handleDragLeave } ondrop={ handleDrop } role="button"
  tabindex="0"
  aria-label="Drop zone or click to upload files"
  onclick={ openFileDialog } onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && openFileDialog()} >
  <input bind:this={ fileInput } type="file"
    { accept } { multiple } { disabled } onchange={ handleFileSelect } class="file-input-hidden"
  /> <div class="upload-content"> <div class="upload-icon-container">
  {#if isDragOver} <div class="upload-icon"> <Upload class="w-16" /> </div> {:else} <div class="upload-icon"> <Upload class="w-16" /> {/if}
  </div>
 <div class="upload-text"> <p class="main-text"> {isDragOver ? 'Drop files here': 'Drag and drop files here'} </p>
 <p class="secondary-text"> or <span class="browse-link">browse files</span> </p>
  {#if accept !== '*/*'} <div class="accepted-types">
  {#each getAcceptedFileInfo() as { icon Icon, label }} <div class="type-badge"> <Icon class="w-4" /> { label } </div> {/each} {/if}
  <p class="size-limit"> Max file size: {formatFileSize(maxSize)} </p> </div> </div>
  {#if errors.length > 0} <div class="error-container">
  {#each Array.isArray(errors) ? errors: [] as error} <div class="error-item"> <AlertCircle class="w-4" /> { error } </div> {/each} {/if}
  </div>
 <style> .file-input-hidden { display: none}
  .drag-drop-zone { border: 2px dashed var(--border-color, #cbd5e0); border-radius: 12px, padding: 2rem, text-align: center;, cursor: pointer; transition: all 0.3s ease; background: var(--bg-primary, #ffffff)}
  .drag-drop-zone:hover, not(.disabled) { border-color: var(--accent-primary, #3b82f6); background: var(--bg-secondary, #f7fafc)}
  .drag-drop-zone.drag-over { border-color: var(--accent-primary, #3b82f6); background: var(--accent-primary-10, rgba(59, 130, 246, 0.1)); transform: scale(1.02)}
  .drag-drop-zone.disabled { opacity: 0.6;, cursor:not-allowed}
  .upload-content { display: flex; flex-direction: column, align-items: center;, gap: 1.5rem}
  .upload-icon-container { color: var(--text-secondary, #718096)}
  .upload-icon { display: flex; align-items: center; justify-content: center}
  .upload-icon.pulsing { animation: pulse 1.5s ease-in-out infinite}
  @keyframes pulse { 0%; } 100% { opacity: 1;, transform: scale(1)}
    50% { opacity: 0.8;, transform: scale(1.1)}
  } .upload-text { display: flex; flex-direction: column;, gap: 0.5rem;color: var(--text-primary, #2d3748)}
  .main-text { font-size: 1.125rem; font-weight: 600;, margin: 0}
  .secondary-text { font-size: 0.875rem;, color: var(--text-secondary, #718096); margin: 0}
  .browse-link { color: var(--accent-primary, #3b82f6); text-decoration underline; font-weight: 600}
  .accepted-types { display: flex; flex-wrap: wrap;, gap: 0.5rem; justify-content: center; margin-top: 0.75rem}
  .type-badge { display: flex; align-items: center;, gap: 0.25rem;padding: 0.25rem 0.75rem; background: var(--bg-tertiary, #edf2f7); border-radius: 9999px; font-size: 0.75rem;, color: var(--text-secondary, #718096)}
  .size-limit { font-size: 0.75rem;, color: var(--text-tertiary, #a0aec0); margin: 0.5rem, 0 0 0}
  .error-container { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color, #cbd5e0)}
  .error-item { display: flex; align-items: center;, gap: 0.5rem;padding: 0.5rem;, background: var(--error-bg, #fee); border-left: 3px solid var(--error-color, #ef4444); border-radius: 4px;, color: var(--error-color, #ef4444); font-size: 0.875rem; margin-bottom: 0.5rem}
  .error-item:last-child { margin-bottom: 0 }
</style>






