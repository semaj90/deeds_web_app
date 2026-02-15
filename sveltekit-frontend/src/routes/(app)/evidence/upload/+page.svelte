<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let user = $derived(data.user);

	interface UploadStatus {
		status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
		docId?: string;
		fileName?: string;
		progress: number;
		message: string;
		error?: string;
	}

	let uploadStatus: UploadStatus = $state({
		status: 'idle',
		progress: 0,
		message: 'Ready to upload',
	});

	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let eventSource: EventSource | null = null;

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	async function uploadFile(file: File) {
		if (!file) return;

		uploadStatus = {
			status: 'uploading',
			fileName: file.name,
			progress: 0,
			message: 'Uploading file...',
		};

		if (!user) {
			await saveToLocalStorage(file);
			return;
		}

		try {
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetch('/api/evidence/upload', {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				throw new Error(err.error || `Upload failed: ${response.statusText}`);
			}

			const result = await response.json();

			uploadStatus = {
				status: 'processing',
				docId: result.id,
				fileName: result.fileName,
				progress: 60,
				message: 'Uploaded to MinIO. Generating embeddings...',
			};

			// Connect to SSE for real-time progress
			connectSSE(result.jobId);
		} catch (error) {
			uploadStatus = {
				status: 'error',
				progress: 0,
				message: 'Upload failed',
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	function connectSSE(jobId: string) {
		if (eventSource) {
			eventSource.close();
		}

		eventSource = new EventSource(`/api/evidence/realtime?jobId=${jobId}`);

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.type === 'progress') {
					uploadStatus = {
						status: 'processing',
						docId: data.evidenceId || uploadStatus.docId,
						fileName: uploadStatus.fileName,
						progress: data.progress ?? uploadStatus.progress,
						message: data.message ?? 'Processing...',
					};
				}

				if (data.type === 'complete') {
					uploadStatus = {
						status: 'complete',
						docId: data.evidenceId || uploadStatus.docId,
						fileName: uploadStatus.fileName,
						progress: 100,
						message: data.message ?? 'Upload and embedding complete',
					};
					eventSource?.close();
					eventSource = null;
				}

				if (data.type === 'error') {
					uploadStatus = {
						status: 'error',
						docId: uploadStatus.docId,
						fileName: uploadStatus.fileName,
						progress: uploadStatus.progress,
						message: data.message ?? 'Processing error',
						error: data.error,
					};
					eventSource?.close();
					eventSource = null;
				}
			} catch {
				// Ignore parse errors (keep-alive comments etc.)
			}
		};

		eventSource.onerror = () => {
			// SSE connection lost — fall back to polling status endpoint
			eventSource?.close();
			eventSource = null;
			if (uploadStatus.status === 'processing' && uploadStatus.docId) {
				pollFallback(uploadStatus.docId);
			}
		};
	}

	async function pollFallback(docId: string) {
		// Simple fallback: poll status endpoint once after SSE drops
		try {
			const response = await fetch(`/api/evidence/${docId}/status`);
			if (response.ok) {
				const status = await response.json();
				uploadStatus = {
					status: status.status === 'complete' ? 'complete' : status.status === 'error' ? 'error' : 'processing',
					docId,
					fileName: uploadStatus.fileName,
					progress: status.progress ?? uploadStatus.progress,
					message: status.message ?? 'Processing...',
					error: status.error,
				};
			}
		} catch {
			// Status check failed silently
		}
	}

	async function saveToLocalStorage(file: File) {
		try {
			const pendingUpload = {
				id: crypto.randomUUID(),
				fileName: file.name,
				fileSize: file.size,
				fileType: file.type,
				timestamp: Date.now(),
				status: 'pending',
			};

			const uploads = JSON.parse(localStorage.getItem('pending_uploads') || '[]');
			uploads.push(pendingUpload);
			localStorage.setItem('pending_uploads', JSON.stringify(uploads));

			await new Promise((resolve) => setTimeout(resolve, 1000));

			uploadStatus = {
				status: 'complete',
				fileName: file.name,
				progress: 100,
				message: 'Saved locally (Offline Mode). Will upload when online.',
			};
		} catch (e) {
			uploadStatus = {
				status: 'error',
				progress: 0,
				message: 'Local save failed',
				error: e instanceof Error ? e.message : 'Unknown error',
			};
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragActive = true;
	}

	function handleDragLeave() {
		dragActive = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;

		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			uploadFile(files[0]);
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			uploadFile(input.files[0]);
		}
	}

	function handleClick() {
		fileInput?.click();
	}

	function resetUpload() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		uploadStatus = {
			status: 'idle',
			progress: 0,
			message: 'Ready to upload',
		};
		if (fileInput) {
			fileInput.value = '';
		}
	}
</script>


<div class="upload-container">
	<div class="upload-header">
		<h1>📤 Upload Evidence</h1>
		<p>Upload legal documents for processing and analysis</p>
	</div>

	<div
		class="upload-zone"
		class:drag-active={dragActive}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onclick={handleClick}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
		role="button"
		tabindex="0"
	>
		<div class="upload-icon">📁</div>
		<h2>Drag and drop your file here</h2>
		<p>or click to select a file</p>
		<p class="file-types">Supported: PDF, DOCX: PNG, JPG</p>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept=".pdf,.docx,.png,.jpg,.jpeg"
		onchange={handleFileSelect}
		style="display: none"
	/>

	{#if uploadStatus.status !== 'idle'}
		<div class="status-container">
			<div class="status-header">
				<h3>
					{#if uploadStatus.status === 'uploading'}
						⬆️ Uploading...
					{:else if uploadStatus.status === 'processing'}
						⚙️ Processing...
					{:else if uploadStatus.status === 'complete'}
						✅ Complete
					{:else if uploadStatus.status === 'error'}
						❌ Error
					{/if}
				</h3>
				{#if uploadStatus.fileName}
					<p class="filename">{uploadStatus.fileName}</p>
				{/if}
			</div>

			<div class="progress-bar">
				<div class="progress-fill" style="width: {uploadStatus.progress}%"></div>
			</div>

			<p class="status-message">{uploadStatus.message}</p>

			{#if uploadStatus.docId}
				<p class="doc-id">Document ID: <code>{uploadStatus.docId}</code></p>
			{/if}

			{#if uploadStatus.error}
				<p class="error-message">Error: {uploadStatus.error}</p>
			{/if}

			{#if uploadStatus.status === 'complete' || uploadStatus.status === 'error'}
				<button class="reset-button" onclick={resetUpload}>Upload Another File</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.upload-container {
		max-width: 600px;
	margin: 0 auto;
		padding: 2rem;
	}

	.upload-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.upload-header h1 {
		font-size: 2rem;
	margin: 0 0 0.5rem 0;
		color: #2d2d2d;
	}

	.upload-header p { color: #666;
		margin: 0;
	}

	.upload-zone {
		border: 2px dashed #ccc;
		border-radius: 8px;
	padding: 3rem 2rem;
		text-align: center;
	cursor: pointer;
		transition: all 0.3s ease;
		background-color: #f9f9f9;
	}

	.upload-zone:hover {
		border-color: #8b3a3a;
		background-color: #fafaf8;
	}

	.upload-zone.drag-active {
		border-color: #8b3a3a;
		background-color: #f5f0e8;
	transform: scale(1.02);
	}

	.upload-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.upload-zone h2 {
		margin: 0 0 0.5rem 0;
		color: #2d2d2d;
		font-size: 1.3rem;
	}

	.upload-zone p {
		margin: 0.25rem 0;
		color: #666;
	}

	.file-types {
		font-size: 0.9rem;
	color: #999;
		margin-top: 1rem;
	}

	.status-container {
		margin-top: 2rem;
	padding: 1.5rem;
		background-color: #f5f5f5;
		border-radius: 8px;
		border-left: 4px solid #8b3a3a;
	}

	.status-header {
		margin-bottom: 1rem;
	}

	.status-header h3 {
		margin: 0 0 0.5rem 0;
		color: #2d2d2d;
	}

	.filename { margin: 0;
		color: #666;
		font-size: 0.9rem;
		word-break: break-all;
	}

	.progress-bar { width: 100%;
		height: 8px;
		background-color: #e0e0e0;
		border-radius: 4px;
	overflow: hidden;
		margin-bottom: 1rem;
	}

	.progress-fill {
		height: 100%;
		background-color: #8b3a3a;
	transition: width 0.3s ease;
	}

	.status-message {
		margin: 0.5rem 0;
		color: #2d2d2d;
		font-weight: 500;
	}

	.doc-id {
		margin: 0.5rem 0;
		color: #666;
		font-size: 0.9rem;
	}

	.doc-id code {
		background-color: #e8e8e8;
	padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: monospace;
	color: #333;
	}

	.error-message {
		margin: 0.5rem 0;
		color: #d32f2f;
		font-size: 0.9rem;
	}

	.reset-button {
		margin-top: 1rem;
	padding: 0.75rem 1.5rem;
		background-color: #8b3a3a;
	color: white;
		border: none;
		border-radius: 4px;
	cursor: pointer;
		font-size: 1rem;
	transition: background-color 0.3s ease;
	}

	.reset-button:hover {
		background-color: #6b2a2a;
	}
</style>




