<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	interface UploadProgress {
		fileName: string;
		progress: number;
		status: 'pending' | 'uploading' | 'completed' | 'error';
		error?: string;
	}

	let caseId: string;
	let uploads: UploadProgress[] = $state([]);
	let isDragging = $state(false);
	let isUploading = false;

	onMount(() => {
		caseId = page.params.id;
	});

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (files) {
			await uploadFiles(Array.from(files));
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			uploadFiles(Array.from(input.files));
		}
	}

	async function uploadFiles(files: File[]) {
		isUploading = true;

		for (const file of files) {
			// Validate file
			const validation = validateFile(file);
			if (!validation.valid) {
				uploads = [
					...uploads,
					{
						fileName: file.name,
						progress: 0,
						status: 'error',
						error: validation.error,
					},
				];
				continue;
			}

			// Add to uploads list
			const uploadIndex = uploads.length;
			uploads = [
				...uploads,
				{
					fileName: file.name,
					progress: 0,
					status: 'pending',
				},
			];

			// Upload file
			await uploadFile(file, uploadIndex);
		}

		isUploading = false;
	}

	function validateFile(file: File): { valid: boolean; error?: string } {
		const maxSize = 50 * 1024 * 1024; // 50MB
		const allowedTypes = [
			'application/pdf',
			'image/png',
			'image/jpeg',
			'image/tiff',
			'application/x-tiff',
		];

		if (file.size > maxSize) {
			return { valid: false, error: 'File size exceeds 50MB limit' };
		}

		if (!allowedTypes.includes(file.type)) {
			return { valid: false, error: 'File type not supported (PDF, PNG, JPG, TIFF)' };
		}

		return { valid: true };
	}

	async function uploadFile(file: File, index: number): Promise<void> {
		try {
			uploads[index].status = 'uploading';
			uploads[index].progress = 0;

			const formData = new FormData();
			formData.append('file', file);
			formData.append('case_id', caseId);

			const xhr = new XMLHttpRequest();

			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable) {
					const progress = Math.round((e.loaded / e.total) * 100);
					uploads[index].progress = progress;
					uploads = [...uploads];
				}
			});

			xhr.addEventListener('load', () => {
				if (xhr.status === 200) {
					uploads[index].status = 'completed';
					uploads[index].progress = 100;
					uploads = [...uploads];
				} else {
					uploads[index].status = 'error';
					uploads[index].error = `Upload failed: ${xhr.statusText}`;
					uploads = [...uploads];
				}
			});

			xhr.addEventListener('error', () => {
				uploads[index].status = 'error';
				uploads[index].error = 'Network error during upload';
				uploads = [...uploads];
			});

			xhr.open('POST', '/api/rag/upload');
			xhr.send(formData);
		} catch (error) {
			uploads[index].status = 'error';
			uploads[index].error = error instanceof Error ? error.message : 'Unknown error';
			uploads = [...uploads];
		}
	}

	function clearCompleted() {
		uploads = uploads.filter((u) => u.status !== 'completed');
	}
</script>

<div class="upload-container">
	<div class="upload-header">
		<h1>📄 Upload Evidence</h1>
		<p>Upload legal documents, PDFs, images, or scans for case analysis</p>
	</div>

	<!-- Drop Zone -->
	<div
		class="drop-zone"
		class:dragging={isDragging}
		ondragover={ handleDragOver }
		ondragleave={ handleDragLeave }
		ondrop={ handleDrop }
	>
		<div class="drop-content">
			<div class="drop-icon">📁</div>
			<h2>Drag & drop files here</h2>
			<p>or</p>
			<label class="file-input-label">
				<span>Browse Files</span>
				<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.tiff" onchange={handleFileSelect} />
			</label>
			<p class="file-info">Supported: PDF, PNG, JPG, TIFF (max 50MB each)</p>
		</div>
	</div>

	<!-- Upload Progress -->
	{#if uploads.length > 0}
		<div class="uploads-section">
			<div class="uploads-header">
				<h3>Upload Progress</h3>
				{#if uploads.some((u) => u.status === 'completed')}
					<button class="clear-btn" onclick={clearCompleted}>Clear Completed</button>
				{/if}
			</div>

			<div class="uploads-list">
				{#each uploads as upload (upload.fileName)}
					<div class="upload-item" class:completed={upload.status === 'completed'} class:error={upload.status === 'error'}>
						<div class="upload-info">
							<div class="file-name">{upload.fileName}</div>
							{#if upload.status === 'error'}
								<div class="error-message">❌ {upload.error}</div>
							{:else}
								<div class="progress-bar">
									<div class="progress-fill" style="width: {upload.progress}%"></div>
								</div>
								<div class="progress-text">{upload.progress}%</div>
							{/if}
						</div>
						<div class="status-icon">
							{#if upload.status === 'pending'}
								<span class="spinner">⏳</span>
							{:else if upload.status === 'uploading'}
								<span class="spinner">⬆️</span>
							{:else if upload.status === 'completed'}
								<span>✅</span>
							{:else if upload.status === 'error'}
								<span>❌</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Info Box -->
	<div class="info-box">
		<h3>📋 What happens next?</h3>
		<ul>
			<li>Files are uploaded to secure storage</li>
			<li>Documents are parsed with Granite-Docling (AI-powered OCR)</li>
			<li>Text is extracted and analyzed for entities and relationships</li>
			<li>Content is indexed for fast searching</li>
			<li>You can search and analyze evidence immediately</li>
		</ul>
	</div>
</div>

<style>
	.upload-container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	.upload-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.upload-header h1 {
		font-size: 2rem;
		color: #00d4ff;
		margin-bottom: 0.5rem;
	}

	.upload-header p {
		color: #a0a0a0;
		font-size: 1rem;
	}

	.drop-zone {
		border: 3px dashed #00d4ff;
		border-radius: 8px;
		padding: 3rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s;
		background: rgba(0, 212, 255, 0.05);
		margin-bottom: 2rem;
	}

	.drop-zone.dragging {
		background: rgba(0, 212, 255, 0.15);
		border-color: #00ff00;
		transform: scale(1.02);
	}

	.drop-content {
		pointer-events: none;
	}

	.drop-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.drop-zone h2 {
		color: #e0e0e0;
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.drop-zone p {
		color: #a0a0a0;
		margin: 0.5rem 0;
	}

	.file-input-label {
		display: inline-block;
		background: #00d4ff;
		color: #1a1a2e;
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
		margin: 1rem 0;
		transition: all 0.3s;
	}

	.file-input-label:hover {
		background: #00ff00;
		transform: scale(1.05);
	}

	.file-input-label input {
		display: none;
	}

	.file-info {
		font-size: 0.9rem;
		color: #808080;
		margin-top: 1rem;
	}

	.uploads-section {
		background: rgba(0, 212, 255, 0.05);
		border: 1px solid #00d4ff;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	.uploads-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.uploads-header h3 {
		color: #00d4ff;
		margin: 0;
	}

	.clear-btn {
		background: #ff6b6b;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.clear-btn:hover {
		background: #ff5252;
	}

	.uploads-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.upload-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: rgba(0, 0, 0, 0.3);
		border-left: 3px solid #00d4ff;
		padding: 1rem;
		border-radius: 4px;
		transition: all 0.3s;
	}

	.upload-item.completed {
		border-left-color: #00ff00;
		opacity: 0.7;
	}

	.upload-item.error {
		border-left-color: #ff6b6b;
	}

	.upload-info {
		flex: 1;
	}

	.file-name {
		color: #e0e0e0;
		font-weight: bold;
		margin-bottom: 0.5rem;
		word-break: break-all;
	}

	.progress-bar {
		width: 100%;
		height: 6px;
		background: rgba(0, 212, 255, 0.2);
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 0.25rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #00d4ff, #00ff00);
		transition: width 0.3s;
	}

	.progress-text {
		font-size: 0.8rem;
		color: #a0a0a0;
	}

	.error-message {
		color: #ff6b6b;
		font-size: 0.9rem;
	}

	.status-icon {
		font-size: 1.5rem;
		margin-left: 1rem;
	}

	.spinner {
		display: inline-block;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.info-box {
		background: rgba(0, 212, 255, 0.05);
		border-left: 4px solid #00d4ff;
		padding: 1.5rem;
		border-radius: 4px;
	}

	.info-box h3 {
		color: #00d4ff;
		margin-top: 0;
	}

	.info-box ul {
		color: #a0a0a0;
		margin: 0;
		padding-left: 1.5rem;
	}

	.info-box li {
		margin-bottom: 0.5rem;
	}
</style>
