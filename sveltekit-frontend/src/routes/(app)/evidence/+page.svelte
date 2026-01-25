<script lang="ts">
  import { applyAction, enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import type { ActionData, PageData } from './$types';
	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	let isDragging = $state(false);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let selectedFile = $state<File | null>(null);

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files?.[0]) {
			selectedFile = input.files[0];
			uploadError = null;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		if (event.dataTransfer?.files?.[0]) {
			selectedFile = event.dataTransfer.files[0];
			uploadError = null;

			// Manually set the file input if needed for form submission
			// But for drag and drop with form actions, we typically need to bind or simulate input
			// Here we just set state, the user still needs to click "Start Upload" which submits the form
			// If we want auto-submit, we'd need to manually trigger submit
		}
	}

	// Real-time updates via SSE
	onMount(() => {
		if (typeof EventSource !== 'undefined') {
			const sse = new EventSource('/api/evidence/realtime');
			sse.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.type === 'progress') {
						console.log('Processing progress:', data.progress);
					} else if (data.type === 'complete') {
						console.log('Processing complete:', data.docId);
						isUploading = false;
						// Trigger a refresh/invalidation if needed
					}
				} catch (e) {
					console.error('SSE Error:', e);
				}
			};
			return () => sse.close();
		}
	});
</script>

<div class="evidence-container">
	<!-- Header -->
	<div class="header">
		<h1>📄 Evidence Upload</h1>
		<p>Upload legal documents for GPU-accelerated processing</p>
	</div>

	<!-- Upload Area -->
	<div class="upload-section">
		<form
			method="POST"
			action="?/upload"
			use:enhance={() => {
				isUploading = true;
				return async ({ result }) => {
					isUploading = false;
					if (result.type === 'failure') {
						uploadError = result.data?.error as string;
					} else if (result.type === 'success') {
						selectedFile = null;
						// Optionally invalidateAll() here to refresh the list
					}
					await applyAction(result);
				};
			}}
			enctype="multipart/form-data"
		>
			<div
				class="drop-zone"
				class:dragging={isDragging}
				class:disabled={isUploading}
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				role="button"
				tabindex="0"
			>
				{#if isUploading}
					<div class="processing-state">
						<div class="spinner"></div>
						<p>Uploading and Processing...</p>
					</div>
				{:else}
					<div class="upload-prompt">
						<span class="icon">📁</span>
						<p>Drop files here or click to upload</p>
						<small>PDF: Images, Documents</small>

						<input
							type="file"
							name="file"
							accept=".pdf,image/*,.doc,.docx"
							onchange={handleFileSelect}
							id="file-input"
							class="hidden-input"
							style="display: none;"
						/>
						<button type="button" onclick={() => document.getElementById('file-input')?.click()}>
							Choose File
						</button>
					</div>
				{/if}
			</div>

			<!-- Selected File Info & Submit -->
			{#if selectedFile && !isUploading}
				<div class="file-info">
					<div class="file-details">
						<span class="filename">{selectedFile.name}</span>
						<span class="filesize">{formatFileSize(selectedFile.size)}</span>
					</div>
					<button type="submit" class="upload-btn">
						Start Upload
					</button>
				</div>
			{/if}

			<!-- Server Error Message -->
			{#if form?.error ?? uploadError}
				<div class="error-message">
					<span class="icon">⚠️</span>
					<p>{form?.error ?? uploadError}</p>
				</div>
			{/if}
		</form>
	</div>

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

	<!-- Evidence List (Server Data) -->
	<div class="evidence-list">
		<h3>Recent Uploads</h3>
		{#if data.evidence && data.evidence.length > 0}
			<ul>
				{#each data.evidence as doc}
					<li>{doc.title} ({doc.status}) - {new Date(doc.createdAt).toLocaleDateString()}</li>
				{/each}
			</ul>
		{:else}
			<p>No evidence found.</p>
		{/if}
	</div>
</div>

<style>
	/* Preserving original styles */
	.evidence-container {
		max-width: 900px; margin: 0 auto;
		padding: 2rem;
		font-family: 'Inter', sans-serif;
	}

	.header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.header h1 {
		font-size: 2rem; color: #2d2d2d;
		margin: 0 0 0.5rem 0;
	}

	.header p {
		color: #666; margin: 0;
	}

	.upload-section {
		margin-bottom: 2rem;
	}

	.drop-zone {
		border: 2px dashed #ccc;
		border-radius: 8px; padding: 3rem;
		text-align: center; background: #f9f9f9;
		transition: all 0.3s ease;
		cursor: pointer;
	}

	.drop-zone.dragging {
		border-color: #8b3a3a; background: #f5f0f0;
	}

	.drop-zone.disabled {
		opacity: 0.6; cursor: not-allowed;
	}

	.upload-prompt {
		display: flex;
		flex-direction: column;
		align-items: center; gap: 1rem;
	}

	.upload-prompt .icon {
		font-size: 3rem;
	}

	.upload-prompt p {
		margin: 0;
		font-size: 1.1rem; color: #2d2d2d;
	}

	.upload-prompt small {
		color: #999;
	}

	.upload-prompt button {
		padding: 0.75rem 1.5rem;
		background: #8b3a3a; color: white;
		border: none;
		border-radius: 4px; cursor: pointer;
		font-weight: 500; transition: background 0.3s ease;
	}

	.upload-prompt button:hover {
		background: #6b2a2a;
	}

	.processing-state {
		display: flex;
		flex-direction: column;
		align-items: center; gap: 1rem;
	}

	.spinner {
		width: 40px; height: 40px;
		border: 4px solid #f3f3f3;
		border-top: 4px solid #8b3a3a;
		border-radius: 50%; animation: spin 1s linear infinite;
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
		align-items: center; padding: 1rem;
		background: #f5f5f5;
		border-radius: 4px;
		margin-top: 1rem;
	}

	.file-details {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.filename {
		font-weight: 500; color: #2d2d2d;
	}

	.filesize {
		font-size: 0.9rem; color: #999;
	}

	.upload-btn {
		padding: 0.75rem 1.5rem;
		background: #8b3a3a; color: white;
		border: none;
		border-radius: 4px; cursor: pointer;
		font-weight: 500; transition: background 0.3s ease;
	}

	.upload-btn:hover {
		background: #6b2a2a;
	}

	.error-message {
		display: flex;
		align-items: center; gap: 0.75rem;
		padding: 1rem; background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;
		margin-top: 1rem; color: #c33;
	}

	.error-message .icon {
		font-size: 1.5rem;
	}

	.info-panel {
		background: #f5f4f0; padding: 1.5rem;
		border-radius: 8px;
		border-left: 4px solid #8b3a3a;
		margin-bottom: 2rem;
	}

	.info-panel h3 {
		margin: 0 0 1rem 0;
		color: #2d2d2d;
	}

	.info-panel ul {
		list-style: none; padding: 0;
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

	.evidence-list {
		margin-top: 2rem;
	}

	.evidence-list ul {
		list-style: none; padding: 0;
	}

	.evidence-list li {
		padding: 0.75rem;
		border-bottom: 1px solid #eee;
	}
</style>



