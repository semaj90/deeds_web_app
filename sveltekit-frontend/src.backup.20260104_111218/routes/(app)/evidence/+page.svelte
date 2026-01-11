<script lang="ts">
	import { isProcessing, registerServiceWorker, uploadFileViaQUIC, uploadProgress } from '$lib/mlp';
	import { onMount } from 'svelte';

	let selectedFile = $state<File | null>(null);
	let isDragging = $state(false);
	let uploadError = $state<string | null>(null);

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	onMount(() => {
 (async () => {
 		// Register service worker for background uploads
 		await registerServiceWorker();
 })();
 });

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files?.[0]) {
			selectedFile = input.files[0];
			uploadError = null;
		}
	}

	async function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	async function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		if (event.dataTransfer?.files?.[0]) {
			selectedFile = event.dataTransfer.files[0];
			uploadError = null;
			await startUpload();
		}
	}

	async function startUpload() {
		if (!selectedFile) {
			uploadError = 'Please select a file';
			return;
		}

		try {
			uploadError = null;
			const docId = await uploadFileViaQUIC(selectedFile, (progress) => {
				// Progress is automatically updated in the store
			});

			console.log('✅ Upload complete:', docId);
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Upload failed';
			console.error('Upload error:', error);
		}
	}

	function getProgressColor(stage: string): string {
		switch (stage) {
			case 'uploading':
				return 'bg-blue-500';
			case 'processing':
				return 'bg-amber-500';
			case 'mirroring':
				return 'bg-purple-500';
			case 'complete':
				return 'bg-green-500';
			default:
				return 'bg-gray-500';
		}
	}

	function getStageLabel(stage: string): string {
		switch (stage) {
			case 'uploading':
				return '📤 Uploading...';
			case 'processing':
				return '🔄 Processing (DocLing GPU)...';
			case 'mirroring':
				return '🪞 Mirroring to Qdrant + Postgres...';
			case 'complete':
				return '✅ Complete!';
			default:
				return 'Ready';
		}
	}
</script>

<div class="evidence-container">
	<!-- Header -->
	<div class="header">
		<h1>📄 Evidence Upload</h1>
		<p>Upload legal documents for GPU-accelerated processing</p>
	</div>

	<!-- Upload Area -->
	<div class="upload-section">
		<div
			class="drop-zone"
			class:dragging={isDragging}
			class:disabled={$isProcessing}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			role="button"
			tabindex="0"
		>
			{#if $isProcessing}
				<div class="processing-state">
					<div class="spinner"></div>
					<p>{getStageLabel($uploadProgress.stage)}</p>
				</div>
			{:else}
				<div class="upload-prompt">
					<span class="icon">📁</span>
					<p>Drop files here or click to upload</p>
					<small>PDF, Images, Documents</small>
					<input
						type="file"
						accept=".pdf,image/*,.doc,.docx"
						onchange={handleFileSelect}
						style="display: none"
						id="file-input"
					/>
					<button onclick={() => document.getElementById('file-input')?.click()}>
						Choose File
					</button>
				</div>
			{/if}
		</div>

		<!-- Selected File Info -->
		{#if selectedFile && !$isProcessing}
			<div class="file-info">
				<div class="file-details">
					<span class="filename">{selectedFile.name}</span>
					<span class="filesize">{formatFileSize(selectedFile.size)}</span>
				</div>
				<button class="upload-btn" onclick={startUpload}>
					Start Upload
				</button>
			</div>
		{/if}

		<!-- Error Message -->
		{#if uploadError}
			<div class="error-message">
				<span class="icon">⚠️</span>
				<p>{uploadError}</p>
			</div>
		{/if}
	</div>

	<!-- Progress Bar -->
	{#if $isProcessing}
		<div class="progress-section">
			<div class="progress-header">
				<span class="stage-label">{getStageLabel($uploadProgress.stage)}</span>
				<span class="percentage">{Math.round($uploadProgress.percentage)}%</span>
			</div>

			<div class="progress-bar">
				<div
					class="progress-fill {getProgressColor($uploadProgress.stage)}"
					style="width: {$uploadProgress.percentage}%"
				></div>
			</div>

			<div class="progress-details">
				<span class="uploaded">
					{formatFileSize($uploadProgress.uploadedBytes)} / {formatFileSize($uploadProgress.fileSize)}
				</span>
				<span class="timestamp">
					{new Date($uploadProgress.timestamp).toLocaleTimeString()}
				</span>
			</div>

			<!-- Stage Indicators -->
			<div class="stage-indicators">
				<div class="stage" class:active={$uploadProgress.stage === 'uploading'}>
					<span class="dot"></span>
					<span>Upload</span>
				</div>
				<div class="stage" class:active={$uploadProgress.stage === 'processing'}>
					<span class="dot"></span>
					<span>Process</span>
				</div>
				<div class="stage" class:active={$uploadProgress.stage === 'mirroring'}>
					<span class="dot"></span>
					<span>Mirror</span>
				</div>
				<div class="stage" class:active={$uploadProgress.stage === 'complete'}>
					<span class="dot"></span>
					<span>Complete</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Info Panel -->
	<div class="info-panel">
		<h3>🚀 GPU Processing Pipeline</h3>
		<ul>
			<li>
				<strong>DocLing GPU:</strong> Extracts text, layout, tables, and OCR from documents
			</li>
			<li>
				<strong>EmbeddingGemma:</strong> Generates 768-dim embeddings with fp16 compression
			</li>
			<li>
				<strong>Qdrant GPU:</strong> Indexes embeddings for fast cosine similarity search
			</li>
			<li>
				<strong>Postgres pgvector:</strong> Stores metadata, citations, and case relationships
			</li>
			<li>
				<strong>MiniLM Reranker:</strong> Reranks top-K results to top-5 for precision
			</li>
		</ul>
	</div>
</div>

<style>
	.evidence-container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
		font-family: 'Inter', sans-serif;
	}

	.header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.header h1 {
		font-size: 2rem;
		color: #2d2d2d;
		margin: 0 0 0.5rem 0;
	}

	.header p {
		color: #666;
		margin: 0;
	}

	.upload-section {
		margin-bottom: 2rem;
	}

	.drop-zone {
		border: 2px dashed #ccc;
		border-radius: 8px;
		padding: 3rem;
		text-align: center;
		background: #f9f9f9;
		transition: all 0.3s ease;
		cursor: pointer;
	}

	.drop-zone.dragging {
		border-color: #8b3a3a;
		background: #f5f0f0;
	}

	.drop-zone.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.upload-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.upload-prompt .icon {
		font-size: 3rem;
	}

	.upload-prompt p {
		margin: 0;
		font-size: 1.1rem;
		color: #2d2d2d;
	}

	.upload-prompt small {
		color: #999;
	}

	.upload-prompt button {
		padding: 0.75rem 1.5rem;
		background: #8b3a3a;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
		transition: background 0.3s ease;
	}

	.upload-prompt button:hover {
		background: #6b2a2a;
	}

	.processing-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #f3f3f3;
		border-top: 4px solid #8b3a3a;
		border-radius: 50%;
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

	.file-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #f5f5f5;
		border-radius: 4px;
		margin-top: 1rem;
	}

	.file-details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.filename {
		font-weight: 500;
		color: #2d2d2d;
	}

	.filesize {
		font-size: 0.9rem;
		color: #999;
	}

	.upload-btn {
		padding: 0.75rem 1.5rem;
		background: #8b3a3a;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
		transition: background 0.3s ease;
	}

	.upload-btn:hover {
		background: #6b2a2a;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;
		margin-top: 1rem;
		color: #c33;
	}

	.error-message .icon {
		font-size: 1.5rem;
	}

	.progress-section {
		background: #f9f9f9;
		padding: 2rem;
		border-radius: 8px;
		margin-bottom: 2rem;
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.stage-label {
		font-weight: 500;
		color: #2d2d2d;
	}

	.percentage {
		font-size: 1.5rem;
		font-weight: 600;
		color: #8b3a3a;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: #e0e0e0;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s ease;
	}

	.progress-details {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
		color: #666;
		margin-bottom: 1.5rem;
	}

	.stage-indicators {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		opacity: 0.5;
		transition: opacity 0.3s ease;
	}

	.stage.active {
		opacity: 1;
	}

	.stage .dot {
		width: 12px;
		height: 12px;
		background: #ccc;
		border-radius: 50%;
		transition: background 0.3s ease;
	}

	.stage.active .dot {
		background: #8b3a3a;
	}

	.stage span:last-child {
		font-size: 0.85rem;
		color: #666;
	}

	.info-panel {
		background: #f5f4f0;
		padding: 1.5rem;
		border-radius: 8px;
		border-left: 4px solid #8b3a3a;
	}

	.info-panel h3 {
		margin: 0 0 1rem 0;
		color: #2d2d2d;
	}

	.info-panel ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.info-panel li {
		padding: 0.5rem 0;
		color: #666;
		line-height: 1.6;
	}

	.info-panel strong {
		color: #2d2d2d;
	}
</style>
