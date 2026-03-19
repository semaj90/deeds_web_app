<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { analytics } from '$lib/stores/analytics.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatFileSize, getIcon } from './evidence-utils.js';

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
		}
	}
</script>

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
					analytics.track('evidence_uploaded', { caseId });
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
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			role="button"
			tabindex="0"
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
							Drop files here or
							<label class="upload-browse">
								browse
								<input type="file" name="file" accept=".pdf,image/*,.doc,.docx" onchange={handleFileSelect} class="sr-only" />
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
</div>

<style>
	.upload-section {
		padding: 1rem 1.5rem;
	}
	.upload-zone {
		border: 1.5px dashed rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
		transition: all 0.2s;
		background: rgba(255, 255, 255, 0.015);
		cursor: pointer;
	}
	.upload-zone.dragging {
		border-color: rgba(96, 165, 250, 0.4);
		background: rgba(96, 165, 250, 0.04);
	}
	.upload-zone.has-file {
		border-color: rgba(139, 92, 246, 0.3);
		background: rgba(139, 92, 246, 0.03);
		cursor: default;
	}
	.upload-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}
	.upload-state.empty {
		gap: 1rem;
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
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.5);
	}
	.upload-icon-wrap {
		width: 44px;
		height: 44px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(212, 199, 163, 0.25);
	}
	.upload-cta {
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.5);
		margin: 0;
	}
	.upload-browse {
		color: #60a5fa;
		cursor: pointer;
		font-weight: 500;
	}
	.upload-browse:hover {
		text-decoration: underline;
	}
	.upload-hint {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.25);
		margin: 0.25rem 0 0;
	}
	.file-icon {
		font-size: 1.75rem;
	}
	.file-info {
		flex: 1;
	}
	.file-name {
		font-size: 0.85rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.85);
		margin: 0;
	}
	.file-size {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.35);
		margin: 0.125rem 0 0;
	}
	.upload-submit {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.25);
		border-radius: 8px;
		color: #60a5fa;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}
	.upload-submit:hover {
		background: rgba(96, 165, 250, 0.25);
	}
	.upload-cancel {
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		color: rgba(212, 199, 163, 0.4);
		font-size: 0.8rem;
		cursor: pointer;
		transition: color 0.15s;
	}
	.upload-cancel:hover {
		color: rgba(212, 199, 163, 0.7);
	}
	.upload-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.06);
		border: 1px solid rgba(239, 68, 68, 0.15);
		border-radius: 8px;
		color: #f87171;
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