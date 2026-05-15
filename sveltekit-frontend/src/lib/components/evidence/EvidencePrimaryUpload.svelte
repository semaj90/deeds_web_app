<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { analytics } from '$lib/stores/analytics.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import EvidenceUploadResults from './EvidenceUploadResults.svelte';
	import { formatFileSize, getIcon } from './evidence-utils.js';
	import { onMount } from 'svelte';

	let {
		form = null,
		activeCaseId = '',
		caseId = null,
		selectedFile = $bindable<File | null>(null),
		isUploading = $bindable(false),
		uploadError = $bindable<string | null>(null)
	}: {
		form?: any;
		activeCaseId?: string;
		caseId?: string | null;
		selectedFile?: File | null;
		isUploading?: boolean;
		uploadError?: string | null;
	} = $props();

	let isDragging = $state(false);
	let uploadInput = $state<HTMLInputElement | null>(null);
	let uploadedEvidence = $state<any | null>(null);
	let isPolling = $state(false);
	let processingStage = $state<string | null>(null);
	let pollingIntervalId: NodeJS.Timeout | null = null;

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files?.[0]) {
			selectedFile = input.files[0];
			uploadError = null;
		}
	}

	function resetToUploadForm() {
		uploadedEvidence = null;
		selectedFile = null;
		uploadError = null;
		isPolling = false;
		processingStage = null;
		if (pollingIntervalId) clearInterval(pollingIntervalId);
	}

	async function pollForUpdates() {
		if (!uploadedEvidence?.id) return;

		try {
			const response = await fetch(`/api/evidence/${uploadedEvidence.id}`);
			if (!response.ok) return;

			const data = await response.json();
			if (data.evidence) {
				uploadedEvidence = data.evidence;

				// Detect processing stages from metadata
				const metadata = data.evidence.metadata || {};
				if (metadata.extractedText && !metadata.chunks) {
					processingStage = 'Chunking document...';
				} else if (metadata.chunks && !metadata.gpuAnalysis) {
					processingStage = 'Running GPU analysis...';
				} else if (metadata.gpuAnalysis) {
					processingStage = 'Analysis complete!';
					isPolling = false;
					if (pollingIntervalId) clearInterval(pollingIntervalId);
				}
			}
		} catch (err) {
			console.warn('Polling failed:', err);
		}
	}

	// Start polling when evidence is uploaded
	$effect(() => {
		if (uploadedEvidence?.id && !isPolling) {
			isPolling = true;
			processingStage = 'Processing evidence...';
			pollingIntervalId = setInterval(pollForUpdates, 3000); // Poll every 3 seconds
			return () => {
				if (pollingIntervalId) clearInterval(pollingIntervalId);
			};
		}
	});

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
		}
	}

	function openFilePicker() {
		if (!isUploading) {
			uploadInput?.click();
		}
	}

	function handleZoneKeydown(event: KeyboardEvent) {
		if (selectedFile || isUploading) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openFilePicker();
		}
	}
</script>

<div class="upload-section">
	{#if uploadedEvidence}
		{#if isPolling && processingStage}
			<div class="processing-indicator">
				<div class="spinner"></div>
				<div class="processing-text">
					<p class="stage-label">{processingStage}</p>
					<p class="stage-hint">This may take a minute...</p>
				</div>
			</div>
		{/if}
		<EvidenceUploadResults
			evidenceId={uploadedEvidence.id}
			fileName={uploadedEvidence.fileName}
			extractedText={uploadedEvidence.metadata?.extractedText}
			chunks={uploadedEvidence.metadata?.chunks ?? []}
			gpuAnalysis={uploadedEvidence.metadata?.gpuAnalysis}
			caseId={caseId}
			previewUrl={form?.previewUrl ?? ''}
			onBack={resetToUploadForm}
		/>
	{:else}
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
					uploadedEvidence = result.data?.evidence ?? null;
					selectedFile = null;
					analytics.track('evidence_uploaded', { caseId, evidenceId: uploadedEvidence?.id });
				}
				await applyAction(result);
			};
		}}
		enctype="multipart/form-data"
	>
		{#if activeCaseId}
			<input type="hidden" name="caseId" value={activeCaseId} />
		{/if}

		<div
			class="upload-zone"
			class:dragging={isDragging}
			class:has-file={!!selectedFile}
			class:interactive={!selectedFile && !isUploading}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			onclick={() => {
				if (!selectedFile) openFilePicker();
			}}
			onkeydown={handleZoneKeydown}
			role="button"
			tabindex={selectedFile || isUploading ? -1 : 0}
			aria-busy={isUploading}
		>
			{#if isUploading}
				<div class="upload-state">
					<div class="upload-spinner"></div>
					<span class="upload-text">Processing evidence...</span>
				</div>
			{:else if selectedFile}
				<div class="upload-state file-ready">
					<span class="file-icon">{getIcon(selectedFile.type)}</span>
					<div class="file-info">
						<p class="file-name">{selectedFile.name}</p>
						<p class="file-size">{formatFileSize(selectedFile.size)}</p>
					</div>
					<button type="submit" class="upload-submit">
						<Icon name="upload" class="w-4 h-4" />
						Upload
					</button>
					<button type="button" class="upload-cancel" onclick={() => (selectedFile = null)}>
						Cancel
					</button>
				</div>
			{:else}
				<div class="upload-state empty">
					<div class="upload-icon-wrap">
						<Icon name="cloud-upload" class="w-6 h-6" />
					</div>
					<div>
						<p class="upload-cta">
							Drop files here or use
							<label class="upload-browse">
								browse
								<input bind:this={uploadInput} type="file" name="file" accept=".pdf,image/*,.doc,.docx" onchange={handleFileSelect} class="sr-only" />
							</label>
						</p>
						<p class="upload-hint">PDF, images, documents up to 100MB</p>
					</div>
				</div>
			{/if}
		</div>

			{#if form?.error ?? uploadError}
				<div class="upload-error">
					<Icon name="circle-alert" class="w-4 h-4" />
					<span>{form?.error ?? uploadError}</span>
				</div>
			{/if}
		</form>
	{/if}
</div>

<style>
	.upload-section {
		padding: 1rem 1.5rem;
	}

	.processing-indicator {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		margin-bottom: 1rem;
		border-radius: 12px;
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.08) 0%, rgba(83, 183, 255, 0.04) 100%);
		border: 1px solid rgba(126, 231, 255, 0.14);
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(126, 231, 255, 0.2);
		border-top-color: #7ee7ff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	.processing-text {
		flex: 1;
	}

	.stage-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(240, 248, 255, 0.95);
		margin: 0;
	}

	.stage-hint {
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.64);
		margin: 0.25rem 0 0;
	}
	.upload-zone {
		position: relative;
		overflow: hidden;
		border: 1px dashed var(--shell-border, rgba(120, 160, 220, 0.2));
		border-radius: 24px;
		padding: 1.35rem 1.5rem;
		transition:
			transform 0.18s ease,
			border-color 0.18s ease,
			background 0.18s ease,
			box-shadow 0.18s ease;
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.08), transparent 44%),
			linear-gradient(180deg, rgba(13, 19, 31, 0.84) 0%, rgba(7, 10, 17, 0.94) 100%);
		box-shadow:
			0 18px 34px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}
	.upload-zone::before {
		content: '';
		position: absolute;
		inset: 1px;
		border-radius: 22px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		pointer-events: none;
	}
	.upload-zone.interactive {
		cursor: pointer;
	}
	.upload-zone:focus-visible {
		outline: 2px solid rgba(126, 231, 255, 0.32);
		outline-offset: 2px;
	}
	.upload-zone.dragging {
		border-color: var(--shell-border-strong, rgba(126, 231, 255, 0.32));
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 46%),
			radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.1), transparent 34%),
			linear-gradient(180deg, rgba(15, 23, 39, 0.94) 0%, rgba(9, 13, 22, 0.98) 100%);
		box-shadow:
			0 22px 42px rgba(0, 0, 0, 0.24),
			0 0 0 1px rgba(126, 231, 255, 0.06),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		transform: translateY(-1px);
	}
	.upload-zone.has-file {
		border-style: solid;
		border-color: rgba(255, 212, 121, 0.22);
		background:
			radial-gradient(circle at top right, rgba(255, 212, 121, 0.08), transparent 36%),
			linear-gradient(180deg, rgba(18, 23, 34, 0.96) 0%, rgba(10, 13, 20, 0.98) 100%);
		cursor: default;
	}
	.upload-state {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}
	.upload-state.empty {
		text-align: center;
	}
	.upload-state.file-ready {
		justify-content: flex-start;
	}
	.upload-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(96, 165, 250, 0.2);
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	.upload-text {
		font-size: 0.8125rem;
		color: rgba(214, 226, 248, 0.72);
	}
	.upload-icon-wrap {
		width: 48px;
		height: 48px;
		border-radius: 16px;
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.12) 0%, rgba(83, 183, 255, 0.06) 100%);
		border: 1px solid rgba(126, 231, 255, 0.14);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(214, 226, 248, 0.8);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
	}
	.upload-cta {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.45rem;
		font-size: 0.875rem;
		color: rgba(214, 226, 248, 0.82);
		margin: 0;
	}
	.upload-browse {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		background: rgba(126, 231, 255, 0.12);
		border: 1px solid rgba(126, 231, 255, 0.18);
		color: rgba(240, 248, 255, 0.94);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		transition: all 0.15s ease;
	}
	.upload-browse:hover {
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.2) 0%, rgba(255, 212, 121, 0.14) 100%);
		border-color: rgba(126, 231, 255, 0.24);
	}
	.upload-hint {
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.54);
		margin: 0.5rem 0 0;
	}
	.file-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		font-size: 1.6rem;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.04);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}
	.file-info {
		flex: 1;
		min-width: 0;
	}
	.file-name {
		font-size: 0.9rem;
		font-weight: 500;
		color: rgba(233, 240, 255, 0.9);
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.file-size {
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.56);
		margin: 0.125rem 0 0;
	}
	.upload-submit {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.65rem 1.05rem;
		background: linear-gradient(135deg, #7ee7ff 0%, #53b7ff 45%, #ffd479 100%);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 999px;
		color: #06101b;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
		box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
	}
	.upload-submit::before,
	.upload-cancel::before {
		content: none;
	}
	.upload-submit:hover {
		filter: brightness(1.05);
		transform: translateY(-1px);
		box-shadow: 0 18px 30px rgba(0, 0, 0, 0.28);
	}
	.upload-cancel {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.65rem 0.95rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(120, 160, 220, 0.14);
		border-radius: 999px;
		color: rgba(214, 226, 248, 0.68);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.upload-cancel:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(126, 231, 255, 0.18);
		color: rgba(240, 248, 255, 0.9);
	}
	.upload-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
		padding: 0.75rem 0.9rem;
		background: rgba(255, 107, 120, 0.08);
		border: 1px solid rgba(255, 107, 120, 0.18);
		border-radius: 16px;
		color: #ff9da8;
		font-size: 0.8rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
