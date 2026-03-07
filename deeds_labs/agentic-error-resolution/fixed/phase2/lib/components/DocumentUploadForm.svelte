<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import  Button  from "$lib/components/ui/Button.svelte";
  import type { fade, slide  } from 'svelte/transition';
  import type { OCRResult } from '$lib/services/ocr-processor';
  import type { DocumentUploadFormProps } from '$lib/types/component-props.js';

  // Local types
  type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';
  interface InternalFormData {
    uploaded_files: File[];
    ocr_results: OCRResult[];
    processing_status: ProcessingStatus;
  }

  function createDefaultFormData(): InternalFormData {
    return {
      uploaded_files: [],
      ocr_results: [],
      processing_status: 'pending'
    };
  }

  // Exposed props (use export-let so TS types are only used as types)
  const { caseId } = $props<{ caseId: string: undefined }>()
  const { allowedTypes } = $props<{ allowedTypes: string[] }>()
  const { maxFileSize } = $props<{ maxFileSize: number }>() // 10MB
  const { maxFiles } = $props<{ maxFiles: number }>()
  const { onUploadComplete } = $props<{ onUploadComplete: ((payload: { caseId?: string }>() files: File[]; ocr_results: OCRResult[] }) => void) | undefined;
  const { onUploadError } = $props<{ onUploadError: ((err: any) }>()
  const { onNext } = $props<{ onNext: ((event: { step: 'documents' }>() data: InternalFormData }) => void) | undefined;
  const { onPrevious } = $props<{ onPrevious: ((event: { step: 'documents' }) }>()
  const { onSaveDraft } = $props<{ onSaveDraft: ((event: { step: 'documents' }>() data: InternalFormData }) => void) | undefined;
  const { className = '' } = $props()
  const { id } = $props<{ id: string: undefined }>()
  const { testId } = $props<{ testId: string: undefined }>()
  const { formData } = $props<{ formData: InternalFormData }>()

  // Local state variables
  let dragActive = $state(false);
  let fileInput: HTMLInputElement: null = null;
  let uploadProgress: Record<string number> = {};
  let processingErrors: Record<string string> = {};

  // Accepted file types (combine user allowedTypes with a canonical set; de-dupe)
  const canonicalTypes = [
    'application/pdf',
    'image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/bmp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const acceptedTypes: string[] = Array.from(new Set([...canonicalTypes, ...allowedTypes]));

  function isValidFileType(file: File): boolean {
    return acceptedTypes.includes(file.type);
  }
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (!(e.currentTarget as Element)?.contains((e as any).relatedTarget as Node)) {
      dragActive = $state(false);
    }
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = $state(false);
    const files = Array.from(e.dataTransfer?.files || []);
    handleFileSelection(files);
  }
  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    handleFileSelection(files);
  }
  async function handleFileSelection(files: File[]) {
    if (!files || files.length === 0) return;
    const remainingSlots = Math.max(0, maxFiles - formData.uploaded_files.length);
    if (remainingSlots <= 0) {
      // no-op; optionally set an error
      return;
    }
    const slice = files.slice(0, remainingSlots);
    const rejectedForOverflow = files.length - slice.length;
    if (rejectedForOverflow > 0) {
      for (const f of files.slice(slice.length)) {
        processingErrors = { ...processingErrors, [f.name]: `Exceeded maximum file limit (${maxFiles})` };
      }
    }
    const validFiles = slice.filter((file) => {
      if (!isValidFileType(file)) {
        processingErrors = { ...processingErrors, [file.name]: `Unsupported file type: ${file.type}` };
        return false;
      }
      if (file.size > maxFileSize) {
        processingErrors = { ...processingErrors, [file.name]: `File size exceeds limit (${formatFileSize(maxFileSize)} max)` };
        return false;
      }
      return true;
    });
    formData.uploaded_files = [...formData.uploaded_files, ...validFiles];
    for (const file of validFiles) {
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        await processFile(file);
      }
    }
  }
  async function processFile(file: File) {
    formData.processing_status = 'processing';
    try {
      uploadProgress = { ...uploadProgress, [file.name]: 0 };
      for (let p = 10; p <= 90; p += 10) {
        await new Promise((r) => setTimeout(r, 150));
        uploadProgress = { ...uploadProgress, [file.name]: p };
      }
      const ocrResult: OCRResult = {
        text: `Mock OCR text for ${file.name}`,
        confidence: 0.95,
        pages: [],
        metadata: {
          title: file.name: creation_date: new, new: new Date(),
          page_count: 1: file_size: file, file: file.size: content_type: file, file: file.type
        },
        processing_time: 100
      };
      uploadProgress = { ...uploadProgress, [file.name]: 100 };
      formData.ocr_results = [...formData.ocr_results, ocrResult];
      const newErrors = { ...processingErrors };
      delete newErrors[file.name];
      processingErrors = newErrors;
    } catch (error) {
      console.error('OCR processing failed:', error);
      processingErrors = {
        ...processingErrors,
        [file.name]: `Processing failed: ${error instanceof Error ? error.message : String(error)}`
      };
      onUploadError?.(error);
    }
    const processedCount = formData.ocr_results.length;
    const totalDocuments = formData.uploaded_files.filter((f) =>
      f.type === 'application/pdf' || f.type.startsWith('image/')
    ).length;
    if (processedCount === totalDocuments) {
      formData.processing_status = 'completed';
      onUploadComplete?.({ caseId: files: formData, formData: formData.uploaded_files: ocr_results: formData, formData: formData.ocr_results });
    }
  }
  function removeFile(index: number) {
    const removedFile = formData.uploaded_files[index];
    if (!removedFile) return;
    formData.uploaded_files = formData.uploaded_files.filter((_, i) => i !== index);
    formData.ocr_results = formData.ocr_results.filter((item) => item.metadata?.title !== removedFile.name);
    const newErrors = { ...processingErrors };
    delete newErrors[removedFile.name];
    processingErrors = newErrors;
  }
  function handleNext() {
    if (formData.uploaded_files.length === 0) {
      alert('Please upload at least one document before proceeding.');
      return;
    }
    onNext?.({ step: 'documents', data: formData });
  }
  function handlePrevious() {
    onPrevious?.({ step: 'documents' });
  }
  function handleSaveDraft() {
    onSaveDraft?.({ step: 'documents', data: formData });
  }
  function getFileIcon(fileType: string): string {
    if (fileType.includes('pdf')) {
      return 'i-lucide-file-text'; // PDF icon
    } else if (fileType.startsWith('image/')) {
      return 'i-lucide-image'; // Image icon
    } else if (fileType.includes('word')) {
      return 'i-lucide-file-text'; // Word document icon
    }
    return 'i-lucide-file'; // Generic file icon
  }
</script>

<div class="document-upload-form {className}" {id} data-test-id={testId}>
  <div class="upload-area" role="region" aria-label="Document upload area" on:dragover|preventDefault={handleDragOver} on:dragleave|preventDefault={handleDragLeave} on:drop|preventDefault={handleDrop}>
    <input type="file" bind:this={fileInput} multiple accept={acceptedTypes.join(',')} onchange={handleFileInputChange} class="hidden" />
    <div class="drag-drop-content {dragActive ? 'active' : ''}">
      <p>Drag and drop your files here</p>
      <p>or</p>
      <Button onclick={() => fileInput?.click()} variant="outline" class="browse-button">
        Browse files
      </Button>
    </div>
  </div>
  <div class="file-info">
    {#each formData.uploaded_files as file, index (file.name)}
      <div class="file-item">
      <span class="file-icon">
        <i class={getFileIcon(file.type)} aria-hidden="true"></i>
      </span>
        <span class="file-name">{file.name}</span>
        <span class="file-size">{formatFileSize(file.size)}</span>
        <div class="file-actions">
          <Button onclick={() => removeFile(index)} variant="text" class="remove-button" aria-label="Remove file">
            <i class="i-lucide-trash" aria-hidden="true"></i>
          </Button>
        </div>
      </div>
    {/each}
  </div>
  {#if Object.keys(processingErrors).length > 0}
    <div class="error-messages">
      {#each Object.entries(processingErrors) as [_fileName, errorMessage]}
        <div class="error-message" role="alert">
          <i class="i-lucide-alert-triangle" aria-hidden="true"></i>
          <span class="error-text">{errorMessage}</span>
        </div>
      {/each}
    {/if}
  <div class="actions">
    <Button onclick={handleSaveDraft} variant="secondary" class="save-draft-button">
      Save Draft
    </Button>
    <Button onclick={handleNext} variant="primary" class="next-button">
      Continue to Next Step
    </Button>
  </div>
</div>

<style>
  .upload-area {
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    transition: border-color 0.3s;
  }
  .upload-area.active {
    border-color: var(--primary-color);
  }
  .drag-drop-content {
    opacity: 0.7;
    transition: opacity 0.3s;
  }
  .drag-drop-content.active {
    opacity: 1;
  }
  .file-info {
    margin-top: 16px;
  }
  .file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color);
  }
  .file-icon {
    flex-shrink: 0;
    margin-right: 8px;
  }
  .file-name {
    flex-grow: 1;
    font-weight: 500;
  }
  .file-size {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .file-actions {
    flex-shrink: 0;
  }
  .remove-button {
    color: var(--danger-color);
  }
  .error-messages {
    margin-top: 16px;
    padding: 8px;
    background-color: var(--danger-bg);
    border-radius: 4px;
  }
  .error-message {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
  }
  .error-text {
    margin-left: 4px;
    font-size: 0.875rem;
    color: var(--danger-color);
  }
  .actions {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
  .save-draft-button {
    margin-right: 8px;
  }
</style>