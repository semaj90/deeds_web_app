<script lang="ts">
	let $uploadProgress$ = $state<any>(undefined);
	let $errorMessage$ = $state<any>(undefined);

 /**
 * Document Upload Component - XState v5 Integration Example
 * Demonstrates proper usage of documentUploadMachine with Svelte
 */
 import documentUploadMachine from '$lib/ai/documentUploadMachine';
 import { machineContext, machineState, useMachine } from '$lib/stores/xstateIntegration';
 import { onMount } from 'svelte';
 import type { AnyStateMachine } from 'xstate';

 let { onUploadComplete, onError, maxFileSize = 50 } = $props();

 // Initialize state machine
 const { state$, send, cleanup } = useMachine(documentUploadMachine as AnyStateMachine, {
 autoStart: true
 });
  
 const hasError$ = machineState($state$, (s) =>
 s.matches('validationError') || s.matches('uploadError') || s.matches('processingError')
 );

 const context$ = machineContext($state$, (ctx) => ctx);
 const currentFile$ = machineContext($state$, (ctx) => ctx.file);
 const errorMessage$ = machineContext($state$, (ctx) => ctx.error);
 const uploadProgress$ = machineContext($state$, (ctx) => ctx.uploadProgress);

 const isValidating$ = machineState($state$, (s) => s.matches('validating'));
 const isUploading$ = machineState($state$, (s) => s.matches('uploading'));
 const isProcessing$ = machineState($state$, (s) => s.matches('processing'));

 // Local state
 let dragOver = $state(false);
 let fileInput: HTMLInputElement;

 // Handle file drop
 function handleDrop(e: DragEvent) {
 e.preventDefault();
 e.stopPropagation();
 dragOver = false;

 const files = e.dataTransfer?.files;
 if (files && files.length > 0) {
 handleFileSelected(files[0]);
 }
 }

 // Handle file selection
 function handleFileSelected(file: File) {
 // Validate file size
 const fileSizeMB = file.size / (1024 * 1024);
 if (fileSizeMB > maxFileSize) {
 send({
 type: 'SET_ERROR',
 error: `File size exceeds ${ maxFileSize }MB limit`
 });
 onError?.(`File size exceeds ${ maxFileSize }MB limit`);
 return;
 }

 // Send file to machine
 send({
 type: 'FILE_SELECTED',
 file
 });
 }

 // Handle retry
 function handleRetry() {
 send({ type: 'RETRY' });
 }

 // Handle cancel
 function handleCancel() {
 send({ type: 'CANCEL' });
 }

 // Cleanup on mount/destroy
 onMount(() => {
 return () => {
 cleanup();
 };
 });
  
 $effect(() => {
 if ($state$ && $state$.matches('completed')) {
 onUploadComplete?.($context$);
 }
 });
</script>

<div class="document-upload-container">
 <!-- Upload Area -->
 <div
 class="upload-area"
 class:drag-over={dragOver}
 role="button"
 tabindex="0"
 ondrop={ handleDrop }
 ondragover={(e) => {
 e.preventDefault();
 dragOver = true;
 }}
 ondragleave={() => (dragOver = false)}
 >
 <input
 bind:this={fileInput}
 type="file"
 accept=".pdf,.doc,.docx,.txt"
 style="display: none"
 onchange={(e) => {
 const file = (e.target as HTMLInputElement).files?.[0];
 if (file) handleFileSelected(file);
 }}
 />

 <button
 onclick={() => fileInput.click()}
 disabled={$isUploading$ || $isValidating$ || $isProcessing$}
 class="upload-button"
 >
 {#if $isValidating$}
 Validating...
 {:else if $isUploading$}
 Uploading ({Math.round($uploadProgress$ || 0)}%)
 {:else if $isProcessing$}
 Processing...
 {:else}
 Click to Upload or Drag & Drop
 {/if}
 </button>

 <p class="upload-hint">
 Supported: PDF, DOC, DOCX, TXT (max { maxFileSize }MB)
 </p>
 </div>

 <!-- Current File Info -->
 {#if $currentFile$}
 <div class="file-info">
 <p><strong>File:</strong> {$currentFile$.name}</p>
 <p><strong>Size:</strong> {(($currentFile$.size || 0) / 1024).toFixed(2)} KB</p>
 </div>
 {/if}

 <!-- Progress Bar -->
 {#if $isUploading$ && $uploadProgress$}
 <div class="progress-container">
 <div class="progress-bar" style="width: {$uploadProgress$}%"></div>
 </div>
 {/if}

 <!-- Error State -->
 {#if $hasError$}
 <div class="error-message">
 <p><strong>Error:</strong> {$errorMessage$}</p>
 <button onclick={ handleRetry } class="retry-button">Retry</button>
 <button onclick={handleCancel} class="cancel-button">Cancel</button>
 </div>
 {/if}

 <!-- Success State -->
 {#if $state$.matches('completed')}
 <div class="success-message">
 <p>✅ Upload completed successfully!</p>
 <p>File has been processed and stored.</p>
 </div>
 {/if}

 <!-- Status Info -->
 <div class="status-info">
 <p class="current-state">State: {$state$.value}</p>
 {#if $context$.fileHash}
 <p class="file-hash">Hash: {$context$.fileHash.substring(0, 16)}...</p>
 {/if}
 </div>
</div>

<style>
 .document-upload-container {
 max-width: 600px; margin: 2rem auto;
 padding: 2rem;
 }

 .upload-area {
 border: 2px dashed #ccc;
 border-radius: 8px; padding: 3rem 2rem;
 text-align: center; transition: all 0.2s ease;
 background-color: #f9f9f9;
 }

 .upload-area.drag-over {
 border-color: #0066cc;
 background-color: #e6f2ff;
 }

 .upload-button {
 background-color: #0066cc; color: white;
 border: none;
 border-radius: 6px; padding: 0.75rem 1.5rem;
 font-size: 1rem; cursor: pointer;
 transition: background-color 0.2s;
 }

 .upload-button:hover, not(disabled) {
 background-color: #0052a3;
 }

 .upload-button:disabled {
 background-color: #ccc; cursor:not-allowed;
 }

 .upload-hint {
 margin-top: 1rem; color: #666;
 font-size: 0.9rem;
 }

 .file-info {
 margin-top: 1rem; padding: 1rem;
 background-color: #f0f0f0;
 border-radius: 6px;
 }

 .progress-container {
 margin-top: 1rem; width: 100%;
 height: 8px;
 background-color: #e0e0e0;
 border-radius: 4px; overflow: hidden;
 }

 .progress-bar {
 height: 100%;
 background-color: #0066cc; transition: width 0.3s ease;
 }

 .error-message {
 margin-top: 1rem; padding: 1rem;
 background-color: #ffe0e0;
 border-left: 4px solid #cc0000;
 border-radius: 4px; color: #cc0000;
 }

 .retry-button,
 .cancel-button {
 margin-top: 0.5rem;
 margin-right: 0.5rem; padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px; cursor: pointer;
 font-size: 0.9rem;
 }

 .retry-button {
 background-color: #0066cc; color: white;
 }

 .cancel-button {
 background-color: #cc0000; color: white;
 }

 .success-message {
 margin-top: 1rem; padding: 1rem;
 background-color: #e0ffe0;
 border-left: 4px solid #00cc00;
 border-radius: 4px; color: #006600;
 }

 .status-info {
 margin-top: 1rem; padding: 0.75rem;
 background-color: #f5f5f5;
 border-radius: 4px;
 font-size: 0.85rem; color: #666;
 }

 .current-state {
 font-weight: 600; color: #333;
 }

 .file-hash {
 margin-top: 0.25rem;
 font-family: monospace;
 }
</style>




