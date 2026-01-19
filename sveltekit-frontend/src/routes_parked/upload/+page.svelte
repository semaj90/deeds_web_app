<!-- @migration-task Error while migrating Svelte code: 'ondragover|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'ondragover|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'ondragover|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'ondragover|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<script lang="ts">
	import { onMount } from 'svelte';
	import UploadProgress from '$lib/components/UploadProgress.svelte';
	import UploadHistory from '$lib/components/UploadHistory.svelte';
	import { uploadService } from '$lib/services/uploadService';

	let caseId = '';
	let isDragging = false;
	let isUploading = false;
	let uploadProgress = 0;
	let uploadStatus = '';
	let currentDocId = '';
	let error = '';
	let uploadHistory = [];

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files?.[0]) {
			await uploadFile(input.files[0]);
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		if (event.dataTransfer?.files?.[0]) {
			await uploadFile(event.dataTransfer.files[0]);
		}
	}

	async function uploadFile(file: File) {
		if (!caseId) {
			error = 'Please enter a case ID';
			return;
		}

		if (!file) {
			error = 'Please select a file';
			return;
		}

		error = '';
		isUploading = true;
		uploadProgress = 0;
		uploadStatus = 'uploading';

		try {
			const result = await uploadService.uploadFile(file, caseId);
			currentDocId = result.doc_id;

			// Stream progress
			await uploadService.streamProgress(result.doc_id, (event) => {
				if (event.type === 'progress') {
					uploadProgress = event.data.progress;
					uploadStatus = event.data.status;
				} else if (event.type === 'done') {
					uploadProgress = 100;
					uploadStatus = 'complete';
					isUploading = false;
					loadHistory();
				} else if (event.type === 'error') {
					error = event.data.error;
					isUploading = false;
				}
			});
		} catch (e) {
			error = e.message || 'Upload failed';
			isUploading = false;
		}
	}

	async function loadHistory() {
		if (!caseId) return;

		try {
			uploadHistory = await uploadService.getHistory(caseId);
		} catch (e) {
			console.error('Failed to load history:', e);
		}
	}

	function handleCaseIdChange() {
		loadHistory();
	}

	onMount(() => {
		const input = document.querySelector('input[type="text"]');
		if (input) (input as HTMLInputElement).focus();
	});
</script>

<div class="upload-container">
	<div class="upload-header">
		<h1>Upload Evidence</h1>
		<p>Upload legal documents for processing and analysis</p>
	</div>

	<div class="upload-main">
		<!-- Configuration -->
		<div class="config-section">
			<label>Case ID</label>
			<input
				type="text"
				bind:value={caseId}
				onchange={ handleCaseIdChange }
				placeholder="Enter case ID"
				disabled={isUploading}
			/>
		</div>

		<!-- Upload Area -->
		<div
			class="upload-area"
			class:dragging={isDragging}
			ondragover|preventDefault={() => (isDragging = true)}
			ondragleave={() => (isDragging = false)}
			ondrop={handleDrop}
		>
			<div class="upload-content">
				<div class="upload-icon">📄</div>
				<h2>Drag and drop your file here</h2>
				<p>or</p>
				<label class="upload-button">
					<input
						type="file"
						onchange={handleFileSelect}
						disabled={isUploading}
						accept=".pdf,.doc,.docx,.jpg,.png,.tiff"
					/>
					Select File
				</label>
				<p class="file-info">Supported: PDF, DOC, DOCX, JPG, PNG, TIFF (max 100MB)</p>
			</div>
		</div>

		<!-- Error Message -->
		{#if error}
			<div class="error-message">
				<span>⚠️ {error}</span>
			</div>
		{/if}

		<!-- Upload Progress -->
		{#if isUploading}
			<UploadProgress {uploadProgress} {uploadStatus} {currentDocId} />
		{/if}

		<!-- Upload History -->
		{#if uploadHistory.length > 0}
			<UploadHistory {uploadHistory} />
		{/if}
	</div>
</div>

<style>
	.upload-container {
		display: flex;
		flex-direction: column; height: 100vh;
		background: #f5f4f0;
	}

	.upload-header {
		padding: 2rem; background: white;
		border-bottom: 1px solid #e0ddd8;
	}

	.upload-header h1 {
		margin: 0;
		font-size: 2rem; color: #2d2d2d;
		font-family: 'Crimson Text', serif;
	}

	.upload-header p {
		margin: 0.5rem 0 0 0;
		color: #666;
		font-size: 0.95rem;
	}

	.upload-main {
		flex: 1; padding: 2rem;
		display: flex;
		flex-direction: column; gap: 2rem;
		overflow-y: auto;
	}

	.config-section {
		display: flex;
		flex-direction: column; gap: 0.5rem;
		max-width: 400px;
	}

	.config-section label {
		font-size: 0.85rem;
		font-weight: 600; color: #2d2d2d;
		text-transform: uppercase;
	}

	.config-section input {
		padding: 0.75rem 1rem;
		border: 1px solid #d0ccc7;
		border-radius: 4px;
		font-size: 1rem;
		font-family: 'Source Sans 3', sans-serif;
	}

	.config-section input:focus {
		outline: none;
		border-color: #8b3a3a;
		box-shadow: 0 0 0 2px rgba(139, 58, 58, 0.1);
	}

	.config-section input:disabled {
		opacity: 0.6; cursor:not-allowed;
	}

	.upload-area {
		flex: 1; border: 2px dashed #d0ccc7;
		border-radius: 8px; background: white;
		display: flex;
		align-items: center;
		justify-content: center; cursor: pointer;
		transition: all 0.2s;
		min-height: 300px;
	}

	.upload-area.dragging {
		border-color: #8b3a3a; background: rgba(139, 58, 58, 0.05);
	}

	.upload-content {
		text-align: center; padding: 2rem;
	}

	.upload-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.upload-content h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.3rem; color: #2d2d2d;
	}

	.upload-content p {
		margin: 0.5rem 0;
		color: #666;
		font-size: 0.95rem;
	}

	.upload-button {
		display: inline-block; padding: 0.75rem 1.5rem;
		background: #8b3a3a; color: white;
		border-radius: 4px;
		font-weight: 600; cursor: pointer;
		transition: background 0.2s;
		margin: 1rem 0;
	}

	.upload-button:hover {
		background: #6b2a2a;
	}

	.upload-button input {
		display: none;
	}

	.file-info {
		font-size: 0.85rem; color: #999;
		margin-top: 1rem;
	}

	.error-message {
		padding: 1rem; background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px; color: #c33;
	}

	@media (max-width: 768px) {
		.upload-main {
			padding: 1rem; gap: 1rem;
		}

		.upload-area {
			min-height: 200px;
		}

		.upload-content {
			padding: 1rem;
		}

		.upload-icon {
			font-size: 2rem;
		}
	}
</style>



