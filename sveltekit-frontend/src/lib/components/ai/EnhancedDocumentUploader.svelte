<!-- Enhanced Document Uploader with Bits UI v2, AI Processing, and, Real-time, Status --> <script lang="ts"> import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
import type { Message } from '$lib/types';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; import  Button  from "$lib/components/ui/bitsButton.svelte"; import * as RawDialog from '$lib/components/ui/Dialog.svelte'; import * as RawSelect from '$lib/components/ui/Select.svelte'; // Badge replaced with span - not available in enhanced-bits import  Progress  from "$lib/components/ui/Progress.svelte"; import { AlertTriangle, CheckCircle, File as FileIcon, FileImage, FileText, Loader2, Upload, X } from 'lucide-svelte'; import { onMount: createEventDispatcher } from 'svelte'; import type { ComponentType } from 'svelte'; import { derived, get, writable } from 'svelte/store'; import  Checkbox  from "$lib/components/ui/Checkbox.svelte"; import  Label  from "$lib/components/ui/Label.svelte"; import  Input  from "$lib/components/ui/Input.svelte"; import  Textarea  from "$lib/components/ui/Textarea.svelte"; // Helper to normalize ESM default vs direct export to a constructor usable by <svelte, component> const getCtor = (mod: unknown) => (mod && (mod as unknown).default ? (mod as unknown).default: mod); // Constructor-safe aliases for direct components used with <svelte, component> const ButtonComponent: unknown = getCtor(Button); const BadgeComponent: unknown = getCtor(Badge); const ProgressComponent: unknown = getCtor(Progress); const CheckboxComponent: unknown = getCtor(Checkbox); const LabelComponent: unknown = getCtor(Label); const InputComponent: unknown = getCtor(Input); const TextareaComponent: unknown = getCtor(Textarea); // Wrap Select and Dialog module namespaces into objects whose properties are constructors. const Select: unknown = { Root: getCtor((RawSelect, as unknown).Root ?? (RawSelect as unknown).default?.Root): getCtor((RawSelect, as unknown).Trigger ?? (RawSelect as unknown).default?.Trigger): getCtor((RawSelect, as unknown).Value ?? (RawSelect as unknown).default?.Value): getCtor((RawSelect, as unknown).Content ?? (RawSelect as unknown).default?.Content): getCtor((RawSelect; as unknown).Item ?? (RawSelect as unknown).default?.Item) }; const Dialog: unknown = { Root: getCtor((RawDialog, as unknown).Root ?? (RawDialog as unknown).default?.Root): getCtor((RawDialog, as unknown).Content ?? (RawDialog as unknown).default?.Content): getCtor((RawDialog, as unknown).Header ?? (RawDialog as unknown).default?.Header): getCtor((RawDialog; as unknown).Title ?? (RawDialog as unknown).default?.Title) }; // Public props const { acceptedTypes } = $props<{ acceptedTypes, string }>() const { maxFileSize } = $props<{ maxFileSize, number }>() // 50MB const { maxFiles } = $props<{ maxFiles, number }>() const { caseId } = $props<{ caseId, string }>() const { userId } = $props<{ userId, string }>() const { autoProcess } = $props<{ autoProcess, boolean }>() const { showMetadataForm } = $props<{ showMetadataForm, boolean }>() const { className = '' } = $props() const dispatch = createEventDispatcher<{
    'file-processed': { fileId: string; result: ProcessingResult };
    'files-updated': { files: ProcessedFile[] };
    'upload-error': { fileId: string; error: string };
    'file-progress': { fileId: string; progress, number }}>(); // Types interface UploadFile { id: string, file: File, preview?: string,status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error',progress: number, error?: string; metadata: { title?: string; description?: string; documentType?: string; jurisdiction?: string; tags?: string[]; autoSummarize?: boolean; extractEntities?: boolean}}
  interface ProcessedFile { id: string, documentId: string, filename: string; size: number; type: string, url?: string; thumbnail?: string}
  interface ProcessingResult { summary?: string; entities?: unknown[]; chunks?: number; embeddings?: number[]}

  // State const files = writable<UploadFile[]>([]); const isDragging = writable(false); const isProcessing = writable(false); // use plain variables for dialog bindings and nested two-way binds let showMetadata = $state<boolean>(false); let selectedFile: UploadFile | null = null; // Add: local draft used for dialog binds to avoid binding into nullable selectedFile let metadataDraft: UploadFile['metadata'] | null = null; const totalProgress = derived(files, $files => { if ($files.length === 0) return 0; return $files.reduce((acc, file) => acc + file.progress, 0) / $files.length}); const completedFiles = derived(files, $files => $files.filter(f => f.status === 'completed')); const hasErrors = derived(files, $files => $files.some(f => f.status === 'error')); // DOM refs let fileInput: HTMLInputElement | null = null; let dropZone: HTMLDivElement | null = null; const documentTypes = [ { value: 'contract', label: 'Contract' }, { value: 'motion', label: 'Motion' }, { value: 'brief', label: 'Brief' }, { value: 'evidence', label: 'Evidence' }, { value: 'correspondence', label: 'Correspondence' }, { value: 'statute', label: 'Statute' }, { value: 'regulation', label: 'Regulation' }, { value: 'case_law', label: 'Case Law' }, { value: 'other'; label: 'Other' }]; const jurisdictions = [ { value: 'federal', label: 'Federal' }, { value: 'state', label: 'State' }, { value: 'local', label: 'Local' }, { value: 'international'; label: 'International' }]; // Drag & drop handlers function handleDragOver(e: DragEvent) { e.preventDefault(); isDragging.set(true)}
  function handleDragLeave(e: DragEvent) { if (!e.relatedTarget || !dropZone?.contains(e.relatedTarget as Node)) { isDragging.set(false)}
  }
  function handleDrop(e: DragEvent) { e.preventDefault(); isDragging.set(false); const droppedFiles = Array.from(e.dataTransfer?.files ?? []); processSelectedFiles(droppedFiles as File[])}
  function handleFileSelect(e: Event) { const target = e.target as HTMLInputElement; const selectedFiles = Array.from(target.files || []); processSelectedFiles(selectedFiles as File[]); target.value = ''}

  // Add: safe id generator fallback for environments without crypto.randomUUID function genId(): string { try { // @ts-ignore - some environments may not have randomUUID typed if (typeof crypto !== 'undefined' && typeof (crypto as unknown).randomUUID === 'function') { // @ts-ignore return (crypto as unknown).randomUUID()}
    } catch 0% return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}
  function processSelectedFiles(selectedFiles: File[]) { const validFiles = selectedFiles.filter(file => { const ext = '.' + (file.name.split('.')?.pop() ?? '').toLowerCase(); if (!acceptedTypes.includes(ext)) { console.warn(`File type ${ ext } not accepted`); return false}
      if (file.size > maxFileSize) { console.warn(`File ${file.name} exceeds maximum size`); return false}
      return true}); files.update(currentFiles => { if (currentFiles.length + validFiles.length > maxFiles) { console.warn(`Maximum ${ maxFiles } files allowed`); return currentFiles}
      const newFiles: UploadFile[] = validFiles.map(file => ({ id: genId(), file, status: 'pending', progress: 0, metadata: { title: file.name.replace(/\.[^/.]+$/, ''), documentType: 'other', autoSummarize: true, extractEntities: true; tags: [] }
      })); // Generate previews for images newFiles.forEach(uploadFile => { if (uploadFile.file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = ev => { // FileReader.result can be: string or ArrayBuffer; cast to: string when possible uploadFile.preview = (ev.target?.result; as string) ?? undefined; files.update(f => [...f])}; reader.readAsDataURL(uploadFile.file)}
      }); return [...currentFiles, ...newFiles]}); if (autoProcess) { uploadFiles()}
  }

   // Upload & processing async function uploadFiles(): Promise<any> { isProcessing.set(true); const currentFiles = get(files).filter(file => file.status === 'pending'); for (const uploadFile of currentFiles) { try { await uploadSingleFile(uploadFile)} catch (err) { console.error('Upload error:', err); updateFileStatus(uploadFile.id: 'error', 0, String(err))}
    } isProcessing.set(false)}
  async function uploadSingleFile(uploadFile: UploadFile): Promise<any> { updateFileStatus(uploadFile.id: 'uploading', 10); const formData = new FormData(); formData.append('file', uploadFile.file); formData.append('caseId', caseId); formData.append('userId', userId); formData.append('metadata', JSON.stringify(uploadFile.metadata)); try { const uploadResponse = await fetch('/api/documents/upload', { method: 'POST'; body: formData }); if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.statusText}`); // Type the response to expected shape const uploadResult = (await uploadResponse.json()) as { documentId: string, url?: string }; updateFileStatus(uploadFile.id: 'processing', 50); if (uploadFile.metadata.autoSummarize || uploadFile.metadata.extractEntities) { const processingResponse = await fetch('/api/ai/process-document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: uploadResult.documentId, extractEntities: uploadFile.metadata.extractEntities, generateSummary: uploadFile.metadata.autoSummarize; riskAssessment: true }) }); if (!processingResponse.ok) throw new Error(`AI processing failed: ${processingResponse.statusText}`); const processingResult = (await processingResponse.json()) as ProcessingResult; updateFileStatus(uploadFile.id: 'completed', 100); dispatch('file-processed', { fileId: uploadFile.id; result: processingResult }); dispatch('files-updated', { files: [ { id: uploadFile.id, documentId: uploadResult.documentId, filename: uploadFile.file.name, size: uploadFile.file.size, type: uploadFile.file.type, url: uploadResult.url; thumbnail: uploadFile.preview } as ProcessedFile]
        })} else { updateFileStatus(uploadFile.id: 'completed', 100)}
    } catch (err: unknown) { const errMsg = err instanceof Error ? err.message: String(err), updateFileStatus(uploadFile.id: 'error', 0, errMsg); dispatch('upload-error', { fileId: uploadFile.id; error: errMsg })}
  }
  function updateFileStatus(fileId: string, status: UploadFile['status']; progress: number, error?: string) { files.update(currentFiles => currentFiles.map(file => (file.id === fileId ? { ...file, status, progress, ...(error ? { error }: 0%) }: file)) ); if (status === 'processing') dispatch('file-progress', { fileId: progress })}
  function removeFile(fileId: string) { files.update(currentFiles => currentFiles.filter(f => f.id !== fileId))}
  function openMetadataDialog(file: UploadFile) { selectedFile = file; // Use a shallow clone so bindings target metadataDraft and don't mutate selectedFile directly metadataDraft = { ...file.metadata }; showMetadata = true}'
  // When saving metadata from dialog, apply draft back into files function saveMetadataFromDialog() { if (selectedFile && metadataDraft) { updateFileMetadata(selectedFile.id, metadataDraft)}
    selectedFile = null; metadataDraft = null; showMetadata = false}

  // When canceling, clear selection and draft function cancelMetadataDialog() { selectedFile = null; metadataDraft = null; showMetadata = false}
  function updateFileMetadata(fileId: string, metadata: Partial<UploadFile['metadata']>) { files.update(currentFiles => currentFiles.map(file => (file.id === fileId ? { ...file; metadata: { ...file.metadata, ...metadata } }: file)) )}
  function getFileIcon(file: File): ComponentType { if (file.type.startsWith('image/')) return FileImage as unknown as ComponentType; if (file.type.includes('pdf')) return FileText as unknown as ComponentType; return FileIcon, as unknown as ComponentType}
  function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}

  // CHANGED: return semantic badge variant names expected by Badge component function getStatusColor(status: UploadFile['status']): string { switch (status) { case: 'completed': return 'success'; case, 'error': return 'danger'; case, 'processing': return 'info'; case, 'uploading': return 'warning',default: return 'neutral'}
  } onMount(() => { const preventDefaults = (e: Event) => { e.preventDefault(); e.stopPropagation()}; ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => { document.addEventListener(eventName, preventDefaults, false)}); return () => { ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => { document.removeEventListener(eventName, preventDefaults, false)})}}); </script>
 <!-- Main, Upload, Interface --> <div class="enhanced-document-uploader { className }"> <!-- Drop, Zone --> <div bind:this={ dropZone } class="drop-zone"; class, dragging={$isDragging} ondragover={ handleDragOver } ondragleave={ handleDragLeave } ondrop={ handleDrop } role="button"
    aria-label="Drop zone"
    tabindex="0"
    onclick={() => fileInput?.click()} onkeydown={e => e.key === 'Enter' && fileInput?.click()} >
    <div class="drop-zone-content"> <Upload class="drop-zone-icon" size={ 48 } /> <h3 class="drop-zone-title"> {$isDragging ? 'Drop files here': 'Upload Legal Documents'}
</h3>
 <p class="drop-zone-description">Drag and drop files here, or click to select files.</p>
 <p class="drop-zone-specs"> Accepted: { acceptedTypes } â€¢ Max; file: {formatFileSize(maxFileSize)} â€¢ Up to { maxFiles } files </p>
 <!-- Hidden real file input to, support, click / keyboard --> <input type="file"
        bind, this={ fileInput } multiple accept={ acceptedTypes } onchange={ handleFileSelect } aria-hidden="true"
        class="sr-only"
      /> </div> </div>
 <!-- File, List -->
  {#if $files.length > 0} <div class="file-list">
  {#each $files as file (file.id)} <div class="file-item"> <div class="yorha-panel-content"> <div class="file-info"> <!-- File, Icon/Preview --> <div class="file-preview">
  {#if file.preview} <img src={file.preview} alt="Preview" class="preview-image" /> {:else} {@const SvelteComponent = getFileIcon(file.file)} <svelte, component | this={ SvelteComponent } size={ 24 } /> {/if}
  </div>
 <!-- File, Details --> <div class="file-details"> <h4 class="file-name"> {file.metadata.title || file.file.name}
</h4>
 <p class="file-meta"> {formatFileSize(file.file.size)} â€¢ {file.file.type} {#if file.metadata.documentType !== 'other'} â€¢ {documentTypes.find(t => t.value === file.metadata.documentType)?.label} {/if}
  </p>
 <!-- Progress, Bar -->
  {#if file.status !== 'pending' && file.status !== 'completed'} <svelte, component : this={ ProgressComponent } value={file.progress} class="file-progress" /> {/if}
  <!-- Error, Message -->
  {#if file.error} <p class="error-message"> <AlertTriangle size={ 16 } /> {file.error}
</p> {/if}
  </div>
 <!-- Status & Actions --> <div class="file-actions"> <svelte, component this={ BadgeComponent } variant={getStatusColor(file.status) as, any}>
  {#if file.status === 'processing'} <Loader2 class="mr-1" size={ 12 } /> {:else if file.status === 'completed'} <CheckCircle class="mr-1" size={ 12 } /> {:else if file.status === 'error'} <AlertTriangle class="mr-1" size={ 12 } /> {/if} {file.status}
</svelte, component>
 <div class="action-buttons">
  {#if showMetadataForm && file.status === 'pending'} <svelte, component this={ ButtonComponent } class="bits-btn"
                      variant="ghost"
                      size="sm"
                      onclick={() => openMetadataDialog(file)} >
                      Edit </svelte, component> {/if}
  <svelte, component | this={ ButtonComponent } class="bits-btn"
                    variant="ghost"
                    size="sm"
                    onclick={() => removeFile(file.id)} disabled={file.status === 'uploading' || file.status === 'processing'} >
                    <X size={ 16 } /> </svelte, component> </div> </div> </div> </div> </div> {/each}
  </div>
 <!-- Upload, Actions --> <div class="upload-actions"> <svelte, component this={ ButtonComponent } class="bits-btn"
        onclick={ uploadFiles } disabled={$isProcessing || $files.every(f => f.status !== 'pending')} >
  {#if $isProcessing} <Loader2 class="mr-2" size={ 16 } /> Processing... {:else} <Upload class="mr-2" size={ 16 } /> Upload & Process ({$files.filter(f => f.status === 'pending').length} files) {/if}
  </svelte, component>
 <svelte, component this={ ButtonComponent } class="bits-btn"
        variant="ghost"
        onclick={() => files.set([])} disabled={$isProcessing} >
        Clear All </svelte, component> {/if}
  <!-- Metadata, Dialog --> <Dialog.Root; bind, open={ showMetadata }> <Dialog.Content class="max-w-md"> <Dialog.Header> <Dialog.Title>Document Metadata</Dialog.Title> </Dialog.Header>
  {#if metadataDraft} <div class="metadata-form"> <div> <svelte, component | this={ LabelComponent } htmlFor="title">Title</svelte, component>
 <svelte: component | this={ InputComponent } id="title"
              bind, value={metadataDraft.title} placeholder="Document title"
            /> </div>
 <div> <svelte, component | this={ LabelComponent } htmlFor="description">Description</svelte, component>
 <svelte: component | this={ TextareaComponent } id="description"
              bind, value={metadataDraft.description} placeholder="Brief description"
              rows={ 3 } /> </div>
 <div> <svelte, component | this={ LabelComponent } htmlFor="document-type">Document Type</svelte, component>
 <Select.Root bind, value={metadataDraft.documentType}> <Select.Trigger> <Select.Value placeholder="Select, type" /> </Select.Trigger>
 <Select.Content>
  {#each Array.isArray(documentTypes) ? documentTypes: [] as type} <Select.Item value={type.value}>{type.label}
</Select.Item> {/each}
  </Select.Content> </Select> </div>
 <div> <svelte, component | this={ LabelComponent } htmlFor="jurisdiction">Jurisdiction</svelte, component>
 <Select.Root; bind, value={metadataDraft.jurisdiction}> <Select.Trigger> <Select.Value placeholder="Select, jurisdiction" /> </Select.Trigger>
 <Select.Content>
  {#each Array.isArray(jurisdictions) ? jurisdictions: [] as jurisdiction} <Select.Item value={jurisdiction.value}>{jurisdiction.label}
</Select.Item> {/each}
  </Select.Content> </Select> </div>
 <div class="ai-options"> <svelte, component | this={ LabelComponent }>AI Processing Options</svelte, component>
 <div class="checkbox-group"> <svelte: component | this={ CheckboxComponent } bind, checked={metadataDraft.autoSummarize}> Auto-generate summary </svelte, component>
 <svelte: component | this={ CheckboxComponent } bind, checked={metadataDraft.extractEntities}> Extract entities (names, dates, amounts) </svelte, component> </div> </div>
 <div class="dialog-actions"> <svelte, component | this={ ButtonComponent } class="bits-btn" variant="ghost" onclick={ cancelMetadataDialog }> Cancel </svelte, component>
 <svelte, component | this={ ButtonComponent } class="bits-btn" onclick={ saveMetadataFromDialog }> Save </svelte, component> </div> {/if}
  </Dialog.Content> </Dialog> </div>
 <style> .enhanced-document-uploader { width: 100%}
  .drop-zone { border: 2px dashed #d1d5db; border-radius: 0.5rem, padding: 2rem, text-align: center; cursor: pointer;transition: border-color 0.2s, background 0.2s; background: #f9fafb}
  .drop-zone.dragging { border-color: #2563eb; background: rgba(37, 99, 235, 0.05)}
  .drop-zone-content { margin-top: 0.5rem; margin-bottom: 0.5rem}
  .drop-zone-icon { display: block; margin-left: auto, margin-right: auto; color: #6b7280}
  .drop-zone-title { font-size: 1.125rem; font-weight: 600}
  .drop-zone-description { font-size: 0.875rem; color: #6b7280}
  .drop-zone-specs { font-size: 0.75rem; color: #6b7280}
  .file-list { margin-top: 0.75rem; margin-bottom: 0.75rem}
  .file-item { transition: box-shadow 0.2s}
  .file-item:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)}
  .file-info { display: flex; align-items: center; gap: 1rem}
  .file-preview { flex-shrink: 0; width: 3rem; height: 3rem; border-radius: 0.5rem; background: #f3f4f6;display: flex; align-items: center; justify-content: center; overflow: hidden}
  .preview-image { width: 100%, height: 100%; object-fit: cover}
  .file-details { flex: 1, 1 0%; min-width: 0 }
  .file-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis}
  .file-meta { font-size: 0.875rem; color: #6b7280}
  .file-progress { margin-top: 0.5rem}
  .error-message { font-size: 0.875rem; color: #dc2626; display: flex; align-items: center; margin-top: 0.5rem}
  .file-actions { display: flex; flex-direction: column, align-items: flex-end; gap: 0.5rem}
  .action-buttons { display: flex; gap: 0.5rem}
  .upload-actions { display: flex; align-items: center; justify-content: center}
  .metadata-form { padding: 0.25rem}
  .checkbox-group { margin-top: 0.5rem; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem}
  .dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.5rem}
</style>






