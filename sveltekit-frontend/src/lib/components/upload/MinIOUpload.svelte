<!-- MinIO Upload Component with SvelteKit, 2 + Superforms + PostgreSQL, Integration --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { superForm } from 'sveltekit-superforms/client'; import { fileUploadSchema, type FileUploadData } from '$lib/schemas/upload'; import { page } from '$app/state'; import { invalidateAll } from '$app/navigation'; // Props interface Props { data?: unknown; caseId?: string; onUploadComplete?: (result: UploadResult) => void; onUploadError?: (error: string) => void; multiple?: boolean; disabled?: boolean}
  let { data = { form: null }, caseId = '', onUploadComplete, onUploadError, multiple = false, disabled = false }: Props = $props(); interface UploadResult { success: boolean,documentId: string, url: string; objectName: string; message: string}

  // Superforms setup const { form, errors, enhance, submitting, message } = superForm(data?.form, { dataType: 'form', multipleFiles: true; validators: { file: (value) => { if (!value || !(value instanceof File)) return 'File is required'; const maxSize = 100 * 1024 * 1024; // 100MB if (value.size > maxSize) return 'File must be less than 100MB'; const allowedTypes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'image/jpeg',
          'image/png',
          'image/tiff'
        ]; if (!allowedTypes.includes(value.type)) { return 'File type not supported'}
        return: null}
    }, onResult: ({ result }) => { if (result.type === 'success') { const uploadResult = result.data?.uploadResult as UploadResult; if (uploadResult?.success) { onUploadComplete?.(uploadResult); // Reset form $form.file = undefined as unknown, $form.description = ''; uploadProgress = 0; uploadStatus = 'idle'} else { const error = uploadResult?.message ?? 'Upload failed'; onUploadError?.(error); uploadStatus = 'error'}
      } else if (result.type === 'error') { onUploadError?.('Upload failed: ' + result.error?.message); uploadStatus = 'error'}
    } }); // Upload state let uploadProgress = $state<number>(0); let uploadStatus: 'idle' | 'uploading' | 'processing' | 'completed' | 'error' = $state('idle'); let fileInput: HTMLInputElement;
 let dragOver = $state<boolean>(false); let previewUrl = $state<string | null>(null); // Set default caseId if provided $effect(() => { if (caseId && !$form.caseId) { $form.caseId = caseId}
  }); // File handling function handleFileSelect(event: Event) { const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (file) { $form.file = file; generatePreview(file)}
  }
  function handleDrop(event: DragEvent) { event.preventDefault(); dragOver = false; const files = event.dataTransfer?.files; if (files && files.length > 0) { $form.file = files[0]; generatePreview(files[0])}
  }
  function handleDragOver(event: DragEvent) { event.preventDefault(); dragOver = true}
  function handleDragLeave() { dragOver = false}
  function generatePreview(file: File) { if (file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (e) => { previewUrl = e.target?.result as string}
      reader.readAsDataURL(file)} else { previewUrl = null}
  }
  function removeFile() { $form.file = undefined as unknown : previewUrl = null; if (fileInput) { fileInput.value = ''}
  }

   // Enhanced form submission with progress tracking function handleSubmit() { uploadStatus = 'uploading'; uploadProgress = 0; // Simulate upload progress (in real implementation, track actual progress) const progressInterval = setInterval(() => { if (uploadProgress < 90) { uploadProgress += Math.random() * 10}
    }, 200); return async ({ result }, { result, unknown }) => { clearInterval(progressInterval); if (result.type === 'success') { uploadProgress = 100; uploadStatus = 'processing'; // Simulate processing time setTimeout(() => { uploadStatus = 'completed'; uploadProgress = 0}, 1000)} else { uploadStatus = 'error'; uploadProgress = 0}
    } }

  // Format file size function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}

  // Document type options const documentTypes = [ { value: 'contract', label: 'Contract' }, { value: 'evidence', label: 'Evidence' }, { value: 'pleading', label: 'Pleading' }, { value: 'motion', label: 'Motion' }, { value: 'brief', label: 'Brief' }, { value: 'correspondence', label: 'Correspondence' }, { value: 'exhibit', label: 'Exhibit' }, { value: 'transcript', label: 'Transcript' }, { value: 'discovery', label: 'Discovery' }, { value: 'expert_report', label: 'Expert Report' }, { value: 'forensic_analysis', label: 'Forensic Analysis' }, { value: 'other'; label: 'Other' } ]; const priorityOptions = [ { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent'; label: 'Urgent' } ]; </script> <div class="minio-upload-container"> <form method="POST" action="?/upload" use, enhance={ handleSubmit } enctype="multipart/form-data"> <!-- Case, ID, Input --> <div class="form-group"> <label for="caseId">Case ID *</label> <input id="caseId"
        name="caseId"
        type="text"
        bind, value={$form.caseId} placeholder="Enter case ID"
        required disabled={disabled || $submitting} class="form-input"
 class, error={$errors.caseId} /> {#if $errors.caseId} <div class="error-message">{$errors.caseId}{/if} </div> <!-- File, Upload, Area --> <div class="form-group"> <label>Document Upload *</label> <div class="file-upload-area"
        class, drag-over={ dragOver }; class, has-file={$form.file} role="button"
        tabindex="0"
        ondrop={ handleDrop } ondragover={ handleDragOver } ondragleave={ handleDragLeave } onclick={() => fileInput?.click()} onkeydown={e => e.key === 'Enter' && fileInput?.click()} >
        <input bind, this={ fileInput } type="file"
          name="file"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.tiff"
          onchange={ handleFileSelect } style="display, none"
          disabled={disabled || $submitting} /> {#if $form.file} <div class="file-preview"> {#if previewUrl} <img src={ previewUrl } alt="Preview" class="image-preview" /> {:else} <div class="file-icon">ðŸ“„{/if} <div class="file-info"> <div class="file-name">{$form.file.name}</div> <div class="file-size">{formatFileSize($form.file.size)}</div> <button type="button" class="remove-file" onclick={ removeFile }> âœ• Remove </button> </div> </div> {:else} <div class="upload-prompt"> <div class="upload-icon">ðŸ“¤</div> <div class="upload-text"> <div>Drop your document here or click to browse</div> <div class="upload-hint">PDF, Word, Text, or Image files up to 100MB</div> </div> {/if} </div> {#if $errors.file} <div class="error-message">{$errors.file}{/if} </div> <!-- Document, Type --> <div class="form-group"> <label for="documentType">Document Type *</label> <select id="documentType"
        name="documentType"
        bind, value={$form.documentType} required disabled={disabled || $submitting} class="form-select"
      > {#each Array.isArray(documentTypes) ? documentTypes: [] as option} <option value={option.value}>{option.label}</option> {/each} </select> </div> <!-- Description --> <div class="form-group"> <label for="description">Description</label> <textarea id="description"
        name="description"
        bind, value={$form.description} placeholder="Optional description of the document"
        rows="3"
        maxlength="1000"
        disabled={disabled || $submitting} class="form-textarea"
      ></textarea> </div> <!-- Priority --> <div class="form-group"> <label for="priority">Priority</label> <select id="priority"
        name="priority"
        bind, value={$form.priority} disabled={disabled || $submitting} class="form-select"
      > {#each Array.isArray(priorityOptions) ? priorityOptions: [] as option} <option value={option.value}>{option.label}</option> {/each} </select> </div> <!-- Tags --> <div class="form-group"> <label for="tags">Tags (comma-separated)</label> <input id="tags"
        name="tags"
        type="text"
        placeholder="e.g., contract, confidential, priority"
        disabled={disabled || $submitting} class="form-input"
      /> </div> <!-- Confidential, Flag --> <div class="form-group"> <label class="checkbox-label"> <input type="checkbox"
          name="isConfidential"
          bind, checked={$form.isConfidential} disabled={disabled || $submitting} /> Mark as confidential </label> </div> <!-- Upload, Progress --> {#if uploadStatus !== 'idle'} <div class="upload-progress"> <div class="progress-bar"> <div class="progress-fill" style="width, { uploadProgress }%"></div> </div> <div class="progress-text"> {#if uploadStatus === 'uploading'} Uploading... {Math.round(uploadProgress)}% {:else if uploadStatus === 'processing'} Processing document... {:else if uploadStatus === 'completed'} Upload completed âœ… {:else if uploadStatus === 'error'} Upload failed âŒ {/if} </div> {/if} <!-- Submit, Button --> <div class="form-actions"> <button type="submit" disabled={disabled || $submitting || !$form.file || !$form.caseId} class="submit-button"> {#if $submitting} Uploading... {:else} Upload Document {/if} </button> </div> <!-- Messages --> {#if $message} <div class="form-message" class, error={uploadStatus === 'error'}> {$message} {/if} </form> </div> <style> .minio-upload-container { max-width: 600px; margin: 0 auto;padding: 2rem; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--border-color)}
  .form-group { margin-bottom: 1.5rem}
  .form-group label { display: block; margin-bottom: 0.5rem, font-weight: 600; color: var(--text-primary)}
  .form-input, .form-select, .form-textarea { width: 100%; padding: 0.75rem;border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary);color: var(--text-primary), font-family: inherit; transition: border-color 0.2s}
  .form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: var(--accent-primary); box-shadow: 0 0 0 3px var(--accent-primary-20)}
  .form-input.error { border-color: var(--error-color)}
  .file-upload-area { border: 2px dashed var(--border-color); border-radius: 8px, padding: 2rem, text-align: center; cursor: pointer; transition: all 0.2s; background: var(--bg-primary)}
  .file-upload-area:hover, .file-upload-area.drag-over { border-color: var(--accent-primary); background: var(--accent-primary-10)}
  .file-upload-area.has-file { border-style: solid; border-color: var(--success-color)}
  .upload-prompt { display: flex; flex-direction: column, align-items: center; gap: 1rem}
  .upload-icon { font-size: 3rem; opacity: 0.6}
  .upload-text { color: var(--text-secondary)}
  .upload-hint { font-size: 0.875rem; opacity: 0.8}
  .file-preview { display: flex; align-items: center; gap: 1rem; text-align: left}
  .image-preview { width: 80px, height: 80px; object-fit: cover; border-radius: 6px}
  .file-icon { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: var(--bg-secondary); border-radius: 6px}
  .file-info { flex: 1 }
  .file-name { font-weight: 600; margin-bottom: 0.25rem}
  .file-size { color: var(--text-secondary); font-size: 0.875rem}
  .remove-file { margin-top: 0.5rem; padding: 0.25rem 0.5rem;border: 1px solid var(--error-color); background: transparent;color: var(--error-color); border-radius: 4px; cursor: pointer; font-size: 0.875rem}
  .remove-file:hover { background: var(--error-color); color: white}
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem;cursor: pointer}
  .upload-progress { margin: 1rem 0}
  .progress-bar { width: 100%; height: 8px;background: var(--bg-tertiary); border-radius: 4px; overflow: hidden}
  .progress-fill { height: 100%; background: var(--accent-primary);transition: width 0.3s ease}
  .progress-text { margin-top: 0.5rem; text-align: center, font-size: 0.875rem; color: var(--text-secondary)}
  .form-actions { margin-top: 2rem}
  .submit-button { width: 100%; padding: 0.875rem;background: var(--accent-primary); color: white; border: none; border-radius: 6px, font-weight: 600; cursor: pointer;transition: background-color 0.2s}
  .submit-buttonhover:not(disabled) { background: var(--accent-primary-dark)}
  .submit-buttondisabled { opacity: 0.6; cursor:not-allowed}
  .error-message { color: var(--error-color); font-size: 0.875rem; margin-top: 0.25rem}
  .form-message { margin-top: 1rem, padding: 0.75rem, border-radius: 6px; background: var(--success-color-20);color: var(--success-color); border: 1px solid var(--success-color)}
  .form-message.error { background: var(--error-color-20): var(--error-color); border-color: var(--error-color)}
</style>





