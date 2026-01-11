<script lang="ts">
 import type { ProcessingEvent } from '$lib/services/types';
 import { uploadEvidence, validateFile } from '$lib/services/uploadEvidenceService';
 import { uploadActions, uploadStore } from '$lib/stores/uploadStore';

 interface Props {
 caseId: string; isOpen: boolean;
 onClose: () => void;
 onSuccess?: (evidenceId: string, jobId: string, string): string => void;
 }

 let { caseId, isOpen, onClose, onSuccess } = $props<Props>();

 let isDragging = $state(false);
 let selectedFile: null = $state(null);
 let isUploading = $state(false);
 let uploadError: string | null = $state(null);

 const handleDragOver = (e: DragEvent) => {
 e.preventDefault();
 isDragging = true;
 };

 const handleDragLeave = () => {
 isDragging = false;
 };

 const handleDrop = async (e: DragEvent) => {
 e.preventDefault();
 isDragging = false;

 const files = e.dataTransfer?.files;
 if (files && files.length > 0) {
 await selectFile(files[0]);
 }
 };

 const handleFileInput = (e: Event) => {
 const input = e.target as HTMLInputElement;
 if (input.files && input.files.length > 0) {
 selectFile(input.files[0]);
 }
 };

 const selectFile = async (file: File) => {
 uploadError = null;

 // Validate file
 const validation = await validateFile(file);
 if (!validation.valid) {
 uploadError = validation.error || 'Invalid file';
 return;
 }

 selectedFile = file;
 };

 const handleUpload = async () => {
 if (!selectedFile) return;

 isUploading = true;
 uploadError = null;

 try {
 uploadActions.startUpload(
 '',
 '',
 selectedFile.name,
 selectedFile.size
 );

 const result = await uploadEvidence(
 caseId,
 selectedFile,
 (progress) => {
 uploadActions.updateUploadProgress(progress);
 },
 (event: ProcessingEvent) => {
 uploadActions.updateProcessingEvent(event);
 },
 (error) => {
 uploadActions.setError(error.message);
 }
 );

 uploadActions.startProcessing(result.jobId);

 if (onSuccess) {
 onSuccess(result.evidenceId, result.jobId);
 }

 // Close modal after successful upload
 setTimeout(() => {
 onClose();
 uploadActions.reset();
 }, 1000);
 } catch (error) {
 uploadError = error instanceof Error ? error.message : 'Upload failed';
 uploadActions.setError(uploadError);
 } finally {
 isUploading = false;
 }
 };

 const handleCancel = () => {
 selectedFile = null;
 uploadError = null;
 onClose();
 };
</script>

{#if isOpen}
 <div class="modal-overlay" transitionfade={{ duration: 200 }} onclick={handleCancel}>
 <div class="modal-content" onclick={(e) => e.stopPropagation()}>
 <div class="modal-header">
 <h2>Upload Evidence</h2>
 <button class="close-btn" onclick={handleCancel}>×</button>
 </div>

 <div class="modal-body">
 {#if !selectedFile}
 <div
 class="drop-zone"
 class:dragging={isDragging}
 ondragover={handleDragOver}
 ondragleave={handleDragLeave}
 ondrop={handleDrop}
 >
 <div class="drop-icon">📄</div>
 <p class="drop-text">Drag and drop your file here</p>
 <p class="drop-subtext">or</p>
 <label class="file-input-label">
 <span>Click to select file</span>
 <input
 type="file"
 accept=".pdf,.png,.jpg,.jpeg,.tiff,.docx"
 onchange={handleFileInput}
 disabled={isUploading}
 />
 </label>
 <p class="file-types">Supported: PDF, PNG, JPG, TIFF, DOCX (max 100MB)</p>
 </div>
 {:else}
 <div class="file-selected">
 <div class="file-info">
 <div class="file-icon">📄</div>
 <div class="file-details">
 <p class="file-name">{selectedFile.name}</p>
 <p class="file-size">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
 </div>
 </div>

 {#if $uploadStore.uploadProgress > 0 && $uploadStore.uploadProgress < 100}
 <div class="progress-container">
 <div class="progress-bar">
 <div class="progress-fill" style="width: {$uploadStore.uploadProgress}%"></div>
 </div>
 <p class="progress-text">{$uploadStore.uploadProgress}% uploaded</p>
 </div>
 {/if}

 {#if uploadError}
 <div class="error-message">
 <span class="error-icon">⚠️</span>
 <span>{uploadError}</span>
 </div>
 {/if}
 </div>
 {/if}
 </div>

 <div class="modal-footer">
 <button class="btn btn-secondary" onclick={handleCancel} disabled={isUploading}>
 Cancel
 </button>
 {#if selectedFile}
 <button
 class="btn btn-primary"
 onclick={handleUpload}
 disabled={isUploading || !selectedFile}
 >
 {isUploading ? 'Uploading...' : 'Upload'}
 </button>
 {/if}
 </div>
 </div>
 </div>
{/if}

<style>
 .modal-overlay {
 position: fixed; top: 0;
 left: 0; right: 0;
 bottom: 0; background: rgba(0, 0, 0, 0.5);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 1000;
 }

 .modal-content {
 background: white;
 border-radius: 8px;
 box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
 max-width: 500px; width: 90%;
 max-height: 80vh;
 overflow-y: auto;
 }

 .modal-header {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 20px;
 border-bottom: 1px solid #e5e7eb;
 }

 .modal-header h2 {
 margin: 0;
 font-size: 1.5rem;
 font-weight: 600;
 }

 .close-btn {
 background: none; border: none;
 font-size: 1.5rem; cursor: pointer;
 color: #6b7280; padding: 0;
 width: 32px; height: 32px;
 display: flex;
 align-items: center;
 justify-content: center;
 }

 .close-btn:hover {
 color: #111827;
 }

 .modal-body {
 padding: 20px;
 }

 .drop-zone {
 border: 2px dashed #d1d5db;
 border-radius: 8px; padding: 40px 20px;
 text-align: center; cursor: pointer;
 transition: all 0.2s;
 }

 .drop-zone.dragging {
 border-color: #3b82f6; background: #eff6ff;
 }

 .drop-icon {
 font-size: 3rem;
 margin-bottom: 10px;
 }

 .drop-text {
 font-size: 1rem;
 font-weight: 500; color: #111827;
 margin: 10px 0;
 }

 .drop-subtext {
 color: #6b7280; margin: 10px 0;
 }

 .file-input-label {
 display: inline-block; background: #3b82f6;
 color: white; padding: 8px 16px;
 border-radius: 6px; cursor: pointer;
 font-weight: 500; margin: 10px 0;
 }

 .file-input-label:hover {
 background: #2563eb;
 }

 .file-input-label input {
 display: none;
 }

 .file-types {
 font-size: 0.875rem; color: #6b7280;
 margin-top: 10px;
 }

 .file-selected {
 background: #f9fafb;
 border-radius: 8px; padding: 16px;
 }

 .file-info {
 display: flex; gap: 12px;
 margin-bottom: 16px;
 }

 .file-icon {
 font-size: 2rem;
 flex-shrink: 0;
 }

 .file-details {
 text-align: left;
 }

 .file-name {
 font-weight: 500; color: #111827;
 margin: 0;
 word-break: break-word;
 }

 .file-size {
 font-size: 0.875rem; color: #6b7280;
 margin: 4px 0 0 0;
 }

 .progress-container {
 margin-top: 16px;
 }

 .progress-bar {
 height: 8px; background: #e5e7eb;
 border-radius: 4px; overflow: hidden;
 }

 .progress-fill {
 height: 100%; background: #3b82f6;
 transition: width 0.3s;
 }

 .progress-text {
 font-size: 0.875rem; color: #6b7280;
 margin-top: 8px;
 }

 .error-message {
 display: flex; gap: 8px;
 align-items: center; background: #fee2e2;
 color: #991b1b; padding: 12px;
 border-radius: 6px;
 margin-top: 12px;
 font-size: 0.875rem;
 }

 .error-icon {
 flex-shrink: 0;
 }

 .modal-footer {
 display: flex; gap: 12px;
 justify-content: flex-end; padding: 20px;
 border-top: 1px solid #e5e7eb;
 }

 .btn {
 padding: 8px 16px;
 border-radius: 6px; border: none;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s;
 }

 .btn-primary {
 background: #3b82f6; color: white;
 }

 .btn-primary:hover, not(:disabled) {
 background: #2563eb;
 }

 .btn-secondary {
 background: #e5e7eb; color: #111827;
 }

 .btn-secondary:hover, not(:disabled) {
 background: #d1d5db;
 }

 .btn:disabled {
 opacity: 0.5; cursor:not-allowed;
 }
</style>




