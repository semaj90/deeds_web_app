<!-- Enhanced Evidence Upload Modal — Direct SeaweedFS + 8-stage pipeline -->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		caseId: string;
		isOpen: boolean;
		onClose: () => void;
		onSuccess?: (evidenceId: string, jobId: string, filename: string, fileSize: number, startedAt: number) => void;
	}

	let { caseId, isOpen, onClose, onSuccess }: Props = $props();

	// Upload state
	let isDragging = $state(false);
	let selectedFile: File | null = $state(null);
	let isUploading = $state(false);
	let uploadError: string | null = $state(null);
	let uploadResult: { evidenceId: string; jobId: string; hash: string } | null = $state(null);

	let fileInputEl = $state<HTMLInputElement | null>(null);

	// File validation (inline — no excluded service imports)
	const ALLOWED_TYPES = [
		'application/pdf', 'image/png', 'image/jpeg', 'image/tiff',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'text/plain', 'text/markdown', 'text/csv', 'application/json'
	];
	const MAX_SIZE = 100 * 1024 * 1024; // 100MB

	function validateFile(file: File): { valid: boolean; error?: string } {
		if (file.size > MAX_SIZE) return { valid: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 100MB.` };
		if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|png|jpe?g|tiff?|docx|txt|md|csv|json|xml|log|bmp|webp)$/i)) {
			return { valid: false, error: `Unsupported file type: ${file.type || file.name.split('.').pop()}` };
		}
		return { valid: true };
	}

	function isImageFile(file: File): boolean {
		return file.type.startsWith('image/') || /\.(png|jpe?g|tiff?|bmp|webp)$/i.test(file.name);
	}

	let fileTypeIconName = $derived(
		selectedFile && isImageFile(selectedFile) ? 'image' :
		selectedFile?.type.startsWith('video/') ? 'video' : 'file-text'
	);

	const handleDragOver = (e: DragEvent) => { e.preventDefault(); isDragging = true; };
	const handleDragLeave = () => { isDragging = false; };

	const handleDrop = async (e: DragEvent) => {
		e.preventDefault();
		isDragging = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) selectFile(files[0]);
	};

	const handleFileInput = (e: Event) => {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) selectFile(input.files[0]);
	};

	function openFilePicker() {
		if (!isUploading) {
			fileInputEl?.click();
		}
	}

	function handleDropZoneKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
			e.preventDefault();
			openFilePicker();
		}
	}

	const selectFile = (file: File) => {
		uploadError = null;
		uploadResult = null;
		const validation = validateFile(file);
		if (!validation.valid) { uploadError = validation.error || 'Invalid file'; return; }
		selectedFile = file;
	};

	function formatUploadErrorMessage(message: string | null | undefined): string {
		if (!message) return 'Upload could not be completed';

		return message
			.replace(/^Upload failed/i, 'Upload could not be completed')
			.replace(/^Failed to upload/i, 'Upload could not be completed');
	}

	const handleUpload = async () => {
		if (!selectedFile) return;
		isUploading = true;
		uploadError = null;
		uploadResult = null;
		const startedAt = Date.now();

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);
			if (caseId) {
				formData.append('case_id', caseId);
				formData.append('caseId', caseId);
			}
			formData.append('enableAiAnalysis', 'true');
			formData.append('enableOcr', 'true');
			formData.append('enableEmbeddings', 'true');
			formData.append('enableSummarization', 'true');
			formData.append('title', selectedFile.name);
			formData.append('evidenceType', isImageFile(selectedFile) ? 'photo' : 'document');

			const res = await fetch('/api/evidence/upload', { method: 'POST', body: formData });
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				throw new Error(err.error || err.message || `Upload could not be completed (${res.status})`);
			}
			const data = await res.json();
			const evidenceId = data.id || data.evidenceId;
			const jobId = data.jobId;
			if (!evidenceId || !jobId) throw new Error('Upload response did not include a trackable processing job');
			uploadResult = { evidenceId, jobId, hash: data.hash || '' };
			onSuccess?.(evidenceId, jobId, selectedFile.name, selectedFile.size, startedAt);
		} catch (error) {
			uploadError = formatUploadErrorMessage(error instanceof Error ? error.message : null);
		} finally {
			isUploading = false;
		}
	};

	const handleCancel = () => {
		selectedFile = null;
		uploadError = null;
		uploadResult = null;
		onClose();
	};

	const resetUpload = () => {
		selectedFile = null;
		uploadError = null;
		uploadResult = null;
	};

	// Keyboard shortcuts
	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) return;

		if (e.key === 'Escape') {
			handleCancel();
		} else if (e.key === 'Enter' && selectedFile && !isUploading && !uploadResult) {
			e.preventDefault();
			handleUpload();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		class="upload-modal-overlay"
		transition:fade={{ duration: 150 }}
		onclick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
		role="presentation"
	>
		<div
			class="upload-modal-card"
			role="dialog"
			aria-modal="true"
			aria-label="Evidence Upload Pipeline"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="upload-modal-header">
				<div>
					<h2 class="text-lg font-semibold text-sand">Upload Evidence</h2>
					<p class="text-xs text-sand/50 mt-0.5">Processing status appears after the evidence record is accepted.</p>
				</div>
				<button type="button" class="upload-modal-close" onclick={handleCancel}>
					<Icon name="x" size={20} />
				</button>
			</div>

			<div class="upload-modal-body">
				<!-- Drop Zone -->
				{#if !selectedFile}
					<div
						class="upload-modal-zone"
						class:dragging={isDragging}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDrop}
						onclick={openFilePicker}
						onkeydown={handleDropZoneKeydown}
						role="button"
						tabindex={isUploading ? -1 : 0}
						aria-disabled={isUploading}
					>
					<Icon name="yorha-evidence" size={48} class="mx-auto text-sand/30 mb-3" />
						<p class="text-sand/80 font-medium">Drag and drop evidence file</p>
						<p class="text-sand/40 text-sm mt-1">or</p>
						<button type="button" class="upload-modal-select" onclick={(event) => { event.stopPropagation(); openFilePicker(); }}>
							Select File
						</button>
						<input bind:this={fileInputEl} type="file" class="upload-modal-input" accept=".pdf,.png,.jpg,.jpeg,.tiff,.docx,.txt,.md,.csv,.json" onchange={handleFileInput} disabled={isUploading} />
						<p class="upload-modal-hint">PDF, PNG, JPG, TIFF, DOCX, TXT, MD, CSV, JSON up to 100MB</p>
					</div>
				{:else}
					<!-- Selected File Info -->
					<div class="upload-modal-file-card">
						<div class="flex items-center gap-3">
							<Icon name={fileTypeIconName} size={28} class="text-accent/70 shrink-0" />
							<div class="min-w-0 flex-1">
								<p class="text-sand font-medium text-sm truncate">{selectedFile.name}</p>
								<p class="text-sand/40 text-xs">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &middot; {selectedFile.type || 'unknown type'}</p>
							</div>
							{#if !isUploading}
								<button type="button" class="upload-modal-change" onclick={resetUpload}>Change</button>
							{/if}
						</div>

					</div>

					<!-- Success Result -->
					{#if uploadResult}
						<div class="bg-green-900/10 border border-green-800/20 rounded-lg p-4 text-sm">
							<div class="flex items-center gap-2 text-green-400 font-medium mb-2">
								<Icon name="circle-check" size={16} />
								Upload received; processing queued
							</div>
							<div class="grid grid-cols-2 gap-2 text-xs text-sand/50">
								<span>Evidence ID:</span><span class="text-sand/70 font-mono">{uploadResult.evidenceId}</span>
								<span>Job ID:</span><span class="text-sand/70 font-mono">{uploadResult.jobId}</span>
								{#if uploadResult.hash}
									<span>SHA-256:</span><span class="text-sand/70 font-mono truncate">{uploadResult.hash.slice(0, 16)}...</span>
								{/if}
							</div>
							<p class="mt-3 text-xs text-sand/50">This confirms receipt only. The progress panel tracks processing; it does not claim search indexing is complete.</p>
						</div>
					{/if}

					<!-- Error -->
					{#if uploadError}
						<div class="flex items-center gap-2 bg-red-900/10 border border-red-800/20 rounded-lg p-3 text-sm text-red-400 mt-3">
							<Icon name="circle-alert" size={16} class="shrink-0" />
							<span class="font-medium">Upload issue:</span>
							<span>{uploadError}</span>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="upload-modal-footer">
				<button type="button" class="upload-modal-secondary" onclick={handleCancel} disabled={isUploading}>
					{uploadResult ? 'Close' : 'Cancel upload'}
				</button>
				{#if selectedFile && !uploadResult}
					<button
						type="button"
						class="upload-modal-primary"
						onclick={handleUpload}
						disabled={isUploading}
					>
						{#if isUploading}
							<span class="flex items-center gap-2">
								<Icon name="loader" size={14} class="animate-spin" />
								Uploading...
							</span>
						{:else}
							Upload evidence
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.upload-modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 26%),
			radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.12), transparent 24%),
			rgba(4, 8, 15, 0.82);
		backdrop-filter: blur(16px) saturate(1.12);
	}

	.upload-modal-card {
		width: min(95vw, 46rem);
		max-height: 85vh;
		overflow-y: auto;
		background: linear-gradient(180deg, rgba(19, 27, 42, 0.96) 0%, rgba(8, 12, 20, 0.98) 100%);
		border: 1px solid var(--shell-border, rgba(120, 160, 220, 0.18));
		border-radius: var(--shell-radius-curve, 26px 26px 18px 18px / 22px 22px 30px 30px);
		box-shadow:
			0 0 0 1px rgba(126, 231, 255, 0.04),
			0 28px 56px -18px rgba(0, 0, 0, 0.72),
			0 0 72px rgba(0, 0, 0, 0.36),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		color: var(--shell-text, rgba(233, 240, 255, 0.88));
	}

	.upload-modal-card::-webkit-scrollbar {
		width: 6px;
	}

	.upload-modal-card::-webkit-scrollbar-track {
		background: transparent;
	}

	.upload-modal-card::-webkit-scrollbar-thumb {
		background: rgba(212, 199, 163, 0.12);
		border-radius: 999px;
	}

	.upload-modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.5rem 1.75rem;
		border-bottom: 1px solid rgba(126, 231, 255, 0.08);
	}

	.upload-modal-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 1px solid rgba(120, 160, 220, 0.14);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		color: rgba(214, 226, 248, 0.64);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.upload-modal-close::before {
		content: none;
	}

	.upload-modal-close:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(126, 231, 255, 0.18);
		color: rgba(240, 248, 255, 0.92);
	}

	.upload-modal-body {
		padding: 1.5rem 1.75rem;
	}

	.upload-modal-zone {
		position: relative;
		overflow: hidden;
		padding: 2rem 1.5rem;
		border: 1px dashed var(--shell-border, rgba(120, 160, 220, 0.2));
		border-radius: 28px;
		text-align: center;
		cursor: pointer;
		transition:
			transform 0.18s ease,
			border-color 0.18s ease,
			background 0.18s ease,
			box-shadow 0.18s ease;
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.08), transparent 42%),
			linear-gradient(180deg, rgba(13, 19, 31, 0.84) 0%, rgba(7, 10, 17, 0.94) 100%);
		box-shadow:
			0 18px 34px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.upload-modal-zone::before {
		content: '';
		position: absolute;
		inset: 1px;
		border-radius: 26px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		pointer-events: none;
	}

	.upload-modal-zone:hover,
	.upload-modal-zone.dragging {
		border-color: var(--shell-border-strong, rgba(126, 231, 255, 0.3));
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 46%),
			radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.1), transparent 34%),
			linear-gradient(180deg, rgba(16, 24, 39, 0.94) 0%, rgba(8, 12, 20, 0.98) 100%);
		box-shadow:
			0 22px 42px rgba(0, 0, 0, 0.24),
			0 0 0 1px rgba(126, 231, 255, 0.06),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		transform: translateY(-1px);
	}

	.upload-modal-zone:focus-visible {
		outline: 2px solid rgba(126, 231, 255, 0.32);
		outline-offset: 2px;
	}

	.upload-modal-select {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-top: 0.75rem;
		padding: 0.65rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 999px;
		background: linear-gradient(135deg, #7ee7ff 0%, #53b7ff 45%, #ffd479 100%);
		color: #06101b;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
		box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
	}

	.upload-modal-select::before,
	.upload-modal-secondary::before,
	.upload-modal-primary::before,
	.upload-modal-change::before {
		content: none;
	}

	.upload-modal-select:hover {
		filter: brightness(1.05);
		transform: translateY(-1px);
	}

	.upload-modal-input {
		display: none;
	}

	.upload-modal-hint {
		margin: 0.85rem 0 0;
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.54);
	}

	.upload-modal-file-card {
		padding: 1rem 1.1rem;
		margin-bottom: 1rem;
		border-radius: 20px;
		background:
			radial-gradient(circle at top right, rgba(255, 212, 121, 0.08), transparent 36%),
			linear-gradient(180deg, rgba(18, 23, 34, 0.96) 0%, rgba(10, 13, 20, 0.98) 100%);
		border: 1px solid rgba(255, 212, 121, 0.14);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.upload-modal-change {
		padding: 0.5rem 0.85rem;
		border: 1px solid rgba(120, 160, 220, 0.14);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		color: rgba(214, 226, 248, 0.68);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.upload-modal-change:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(126, 231, 255, 0.18);
		color: rgba(240, 248, 255, 0.9);
	}

	.upload-modal-footer {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding: 1.25rem 1.75rem;
		border-top: 1px solid rgba(126, 231, 255, 0.08);
	}

	.upload-modal-secondary,
	.upload-modal-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.6rem;
		padding: 0.7rem 1.1rem;
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 700;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease, background 0.15s ease;
	}

	.upload-modal-secondary {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(120, 160, 220, 0.14);
		color: rgba(214, 226, 248, 0.72);
	}

	.upload-modal-secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(126, 231, 255, 0.18);
		color: rgba(240, 248, 255, 0.9);
	}

	.upload-modal-primary {
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: linear-gradient(135deg, #7ee7ff 0%, #53b7ff 45%, #ffd479 100%);
		color: #06101b;
		box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
	}

	.upload-modal-primary:hover:not(:disabled) {
		filter: brightness(1.05);
		transform: translateY(-1px);
	}

	.upload-modal-primary:disabled,
	.upload-modal-secondary:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		transform: none;
		filter: saturate(0.65);
	}

	@media (max-width: 640px) {
		.upload-modal-card {
			width: 100%;
		}

		.upload-modal-header,
		.upload-modal-body,
		.upload-modal-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.upload-modal-footer {
			flex-direction: column-reverse;
		}
	}
	.upload-modal-card {
		background: linear-gradient(155deg, #fffdf8 0%, #f5ead6 100%);
		border: 1px solid #d8c39a;
		box-shadow: 0 24px 64px rgba(36, 26, 20, 0.28), inset 0 1px 0 #fff;
		color: #342621;
	}
	.upload-modal-card :global(.text-sand) { color: #342621; }
	.upload-modal-card :global(.text-sand\/80) { color: #514138; }
	.upload-modal-card :global(.text-sand\/70) { color: #66554a; }
	.upload-modal-card :global(.text-sand\/50),
	.upload-modal-card :global(.text-sand\/40) { color: #796b5d; }
	.upload-modal-header, .upload-modal-footer { border-color: #e0d1b7; }
	.upload-modal-close, .upload-modal-change, .upload-modal-secondary {
		background: #fffaf0;
		border-color: #ddcdb3;
		color: #5e4b3e;
	}
	.upload-modal-zone {
		border-color: #cbb789;
		background: radial-gradient(circle at 92% 8%, rgba(190, 154, 86, 0.12), transparent 34%), linear-gradient(180deg, #fffdf8, #f6eddc);
		box-shadow: 0 12px 28px rgba(77, 49, 32, 0.08), inset 0 1px 0 #fff;
	}
	.upload-modal-zone:hover, .upload-modal-zone.dragging { border-color: #8c3335; background: linear-gradient(180deg, #fffaf0, #f2e3c9); }
	.upload-modal-select, .upload-modal-primary { background: linear-gradient(135deg, #812a30, #5b1f27); border-color: #6a2026; color: #fff8e9; }
	.upload-modal-hint { color: #796b5d; }
	.upload-modal-file-card { background: linear-gradient(180deg, #fffdf7, #f3ead7); border-color: #d6bd8d; box-shadow: inset 0 1px 0 #fff; }
	.upload-modal-secondary:hover:not(:disabled), .upload-modal-change:hover { background: #f5ead6; border-color: #c9ae7b; color: #67272d; }
	.upload-modal-close:hover { background: #f5ead6; border-color: #c9ae7b; color: #67272d; }
</style>
