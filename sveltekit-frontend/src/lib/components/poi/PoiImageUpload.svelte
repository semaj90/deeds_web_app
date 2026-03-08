<script lang="ts">
	interface Props {
		poiId?: string;
		poiName?: string;
		onuploaded?: (photo: unknown) => void;
	}
	let { poiId = '', poiName = '', onuploaded }: Props = $props();

	let uploading = $state(false);
	let error = $state<string | null>(null);
	let dragOver = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
	const MAX_SIZE = 10 * 1024 * 1024; // 10MB

	async function uploadFile(file: File) {
		if (!ACCEPTED.includes(file.type)) {
			error = 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.';
			return;
		}
		if (file.size > MAX_SIZE) {
			error = 'File too large. Maximum 10MB.';
			return;
		}
		if (!poiId) {
			error = 'No POI ID provided.';
			return;
		}

		error = null;
		uploading = true;
		try {
			const formData = new FormData();
			formData.append('photo', file);

			const res = await fetch(`/api/persons-of-interest/${poiId}/photos`, {
				method: 'POST',
				body: formData,
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || `Upload failed (${res.status})`);
			}

			const photo = await res.json();
			onuploaded?.(photo);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) uploadFile(file);
		input.value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) uploadFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}
</script>

<div
	class="poi-upload"
	class:drag-over={dragOver}
	class:uploading={uploading}
	ondrop={handleDrop}
	ondragover={handleDragOver}
	ondragleave={() => (dragOver = false)}
	role="button"
	tabindex="0"
	onclick={() => fileInput?.click()}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput?.click(); }}
>
	<input
		type="file"
		accept={ACCEPTED.join(',')}
		onchange={handleFileSelected}
		bind:this={fileInput}
		hidden
	/>

	{#if uploading}
		<div class="upload-status">
			<span class="spinner"></span>
			<span>Uploading & analyzing...</span>
		</div>
	{:else}
		<div class="upload-prompt">
			<span class="upload-icon">+</span>
			<span>Upload photo for {poiName || 'POI'}</span>
			<span class="upload-hint">Click or drag & drop (JPEG, PNG, WebP, GIF — max 10MB)</span>
		</div>
	{/if}

	{#if error}
		<p class="upload-error">{error}</p>
	{/if}
</div>

<style>
	.poi-upload {
		padding: 1.5rem;
		border: 2px dashed rgba(212, 199, 163, 0.3);
		border-radius: 0.5rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		background: rgba(0, 0, 0, 0.1);
	}
	.poi-upload:hover, .poi-upload.drag-over {
		border-color: rgba(74, 222, 128, 0.5);
		background: rgba(74, 222, 128, 0.05);
	}
	.poi-upload.uploading {
		cursor: wait;
		opacity: 0.7;
	}
	.upload-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		color: rgba(212, 199, 163, 0.6);
		font-size: 0.875rem;
	}
	.upload-icon {
		font-size: 1.5rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.4);
	}
	.upload-hint {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.35);
	}
	.upload-status {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: rgba(74, 222, 128, 0.8);
		font-size: 0.875rem;
	}
	.spinner {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(74, 222, 128, 0.3);
		border-top-color: rgba(74, 222, 128, 0.8);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.upload-error {
		margin-top: 0.5rem;
		color: #ef4444;
		font-size: 0.75rem;
	}
</style>
