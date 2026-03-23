<script lang="ts">
	import type { PageData } from './$types';
	import EvidenceUploadProgress from '$lib/components/evidence/EvidenceUploadProgress.svelte';
	import { analytics } from '$lib/stores/analytics.svelte';

	let { data }: { data: PageData } = $props();
	let user = $derived(data.user);

	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let currentJobId = $state<string | null>(null);
	let currentFileName = $state<string | null>(null);
	let uploadComplete = $state(false);
	let completedEvidenceId = $state<string | null>(null);
	let error = $state<string | null>(null);

	async function uploadFile(file: File) {
		if (!file) return;

		currentFileName = file.name;
		uploadComplete = false;
		completedEvidenceId = null;

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

			// Start SSE progress tracking via component
			currentJobId = result.jobId;
			error = null;
			analytics.track('evidence_uploaded', { fileName: file.name, fileSize: file.size, jobId: result.jobId });
		} catch (err) {
			console.error('[Upload] Error:', err);
			currentJobId = null;
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
		}
	}

	function handleUploadComplete(evidenceId: string) {
		console.log('[Upload] Complete:', evidenceId);
		uploadComplete = true;
		completedEvidenceId = evidenceId;
	}

	function handleUploadError(error: string) {
		console.error('[Upload] Error:', error);
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

			// Offline mode: mark upload as complete
			uploadComplete = true;
			console.log('[Upload] Saved locally (Offline Mode). Will upload when online.');
		} catch (e) {
			// Offline mode: show error
			console.error('[Upload] Local save failed:', e instanceof Error ? e.message : 'Unknown error');
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
		currentJobId = null;
		currentFileName = null;
		uploadComplete = false;
		completedEvidenceId = null;
		error = null;
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
		<p class="file-types">Supported: PDF, DOCX, PNG, JPG</p>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept=".pdf,.docx,.png,.jpg,.jpeg"
		onchange={handleFileSelect}
		style="display: none"
	/>

	{#if error}
		<div class="error-alert">
			<div class="error-icon">⚠️</div>
			<div class="error-content">
				<strong>Upload Failed</strong>
				<p>{error}</p>
			</div>
			<button class="close-error" onclick={() => { error = null; }}>×</button>
		</div>
	{/if}

	{#if currentJobId}
		<div class="progress-container">
			<EvidenceUploadProgress
				jobId={currentJobId}
				filename={currentFileName ?? undefined}
				onComplete={handleUploadComplete}
				onError={handleUploadError}
				showStages={true}
			/>

			{#if uploadComplete && completedEvidenceId}
				<div class="completion-actions">
					<a href="/evidence/{completedEvidenceId}" class="view-button">
						View Evidence
					</a>
					<button class="reset-button" onclick={resetUpload}>Upload Another File</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.upload-container {
		min-height: 100vh;
		background: #0e0d0b;
		color: #d4c7a3;
		margin: -2.5rem;
		padding: 2rem max(1.5rem, calc(50% - 300px));
	}
	.upload-container :global(h1), .upload-container :global(h2), .upload-container :global(h3), .upload-container :global(h4), .upload-container :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.upload-container :global(a) { color: inherit; border-bottom: none; }
	.upload-container :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.upload-container :global(input), .upload-container :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.upload-container :global(.panel), .upload-container :global(.card), .upload-container :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	.upload-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.upload-header h1 {
		font-size: 2rem;
		margin: 0 0 0.5rem 0;
		color: #2d2d2d;
	}

	.upload-header p {
		color: #666;
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

	.progress-container {
		margin-top: 2rem;
	}

	.completion-actions {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
		justify-content: center;
	}

	.view-button {
		padding: 0.75rem 1.5rem;
		background-color: #10b981;
		color: white;
		text-decoration: none;
		border-radius: 4px;
		font-size: 1rem;
		transition: background-color 0.3s ease;
		display: inline-block;
	}

	.view-button:hover {
		background-color: #059669;
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

	.error-alert {
		margin-top: 1.5rem;
		padding: 1rem;
		background-color: #fcecea;
		border: 1px solid #f5c2bc;
		border-radius: 6px;
		display: flex;
		align-items: center;
		gap: 1rem;
		position: relative;
	}

	.error-icon {
		font-size: 1.5rem;
	}

	.error-content {
		flex: 1;
	}

	.error-content strong {
		display: block;
		color: #b91c1c;
		margin-bottom: 0.25rem;
	}

	.error-content p {
		margin: 0;
		font-size: 0.9rem;
		color: #7f1d1d;
	}

	.close-error {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: #991b1b;
		cursor: pointer;
		padding: 0 0.5rem;
	}
</style>