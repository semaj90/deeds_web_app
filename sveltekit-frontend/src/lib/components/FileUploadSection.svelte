<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		accept?: string;
		multiple?: boolean;
		maxSizeMB?: number;
		label?: string;
		onfiles?: (files: File[]) => void;
		disabled?: boolean;
		class?: string;
	}

	let {
		accept = '.pdf,.doc,.docx,.txt,.jpg,.png',
		multiple = true,
		maxSizeMB = 50,
		label = 'Upload Files',
		onfiles,
		disabled = false,
		class: className = ''
	}: Props = $props();

	let dragOver = $state(false);
	let fileInput: HTMLInputElement | undefined = $state(undefined);
	let selectedFiles = $state<File[]>([]);
	let error = $state<string | null>(null);

	function validateFiles(files: FileList | null): File[] {
		if (!files) return [];
		error = null;
		const valid: File[] = [];
		const maxBytes = maxSizeMB * 1024 * 1024;

		for (const f of files) {
			if (f.size > maxBytes) {
				error = `${f.name} exceeds ${maxSizeMB}MB limit`;
				continue;
			}
			valid.push(f);
		}
		return valid;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (disabled) return;
		const files = validateFiles(e.dataTransfer?.files ?? null);
		if (files.length > 0) {
			selectedFiles = multiple ? [...selectedFiles, ...files] : files.slice(0, 1);
			onfiles?.(selectedFiles);
		}
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = validateFiles(input.files);
		if (files.length > 0) {
			selectedFiles = multiple ? [...selectedFiles, ...files] : files.slice(0, 1);
			onfiles?.(selectedFiles);
		}
		input.value = '';
	}

	function removeFile(idx: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== idx);
		onfiles?.(selectedFiles);
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}
</script>

<div class="file-upload {className}">
	<button
		type="button"
		class="file-upload-zone"
		class:dragging={dragOver}
		class:disabled={disabled}
		ondragover={(e) => { e.preventDefault(); if (!disabled) dragOver = true; }}
		ondragleave={() => (dragOver = false)}
		ondrop={handleDrop}
		onclick={() => !disabled && fileInput?.click()}
		{disabled}
	>
		<span class="file-upload-icon">
			<Icon name="upload" size={24} />
		</span>
		<p class="file-upload-title">{label}</p>
		<p class="file-upload-hint">Drag & drop or click to browse. Max {maxSizeMB}MB per file.</p>
	</button>

	<input
		bind:this={fileInput}
		type="file"
		{accept}
		{multiple}
		class="hidden"
		onchange={handleFileInput}
	/>

	<!-- Error -->
	{#if error}
		<div class="file-upload-error" role="alert">
			<Icon name="triangle-alert" size={12} />
			{error}
		</div>
	{/if}

	<!-- File List -->
	{#if selectedFiles.length > 0}
		<div class="file-upload-list">
			{#each selectedFiles as file, idx}
				<div class="file-upload-row">
					<Icon name="file" size={14} class="file-upload-file-icon" />
					<span class="file-upload-name">{file.name}</span>
					<span class="file-upload-size">{formatSize(file.size)}</span>
					<button
						type="button"
						class="file-upload-remove"
						onclick={() => removeFile(idx)}
						title="Remove file"
					>
						<Icon name="x" size={14} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.file-upload {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.file-upload-zone {
		position: relative;
		display: block;
		width: 100%;
		padding: 1.5rem 1.25rem;
		border: 1px dashed var(--shell-border, rgba(120, 160, 220, 0.22));
		border-radius: 24px;
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.08), transparent 42%),
			linear-gradient(180deg, rgba(12, 18, 31, 0.82) 0%, rgba(7, 10, 17, 0.94) 100%);
		box-shadow:
			0 18px 32px rgba(0, 0, 0, 0.18),
			inset 0 1px 0 rgba(255, 255, 255, 0.04);
		color: inherit;
		font: inherit;
		text-align: center;
		text-transform: none;
		letter-spacing: normal;
		cursor: pointer;
		transition:
			transform 0.18s ease,
			border-color 0.18s ease,
			background 0.18s ease,
			box-shadow 0.18s ease;
		box-shadow: 0 18px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.file-upload-zone::before {
		content: '';
		position: absolute;
		inset: 1px;
		border-radius: 22px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		pointer-events: none;
	}

	.file-upload-zone:hover:not(.disabled),
	.file-upload-zone.dragging {
		border-color: var(--shell-border-strong, rgba(126, 231, 255, 0.3));
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 46%),
			radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.1), transparent 34%),
			linear-gradient(180deg, rgba(16, 24, 39, 0.92) 0%, rgba(8, 12, 20, 0.98) 100%);
		box-shadow:
			0 22px 38px rgba(0, 0, 0, 0.24),
			0 0 0 1px rgba(126, 231, 255, 0.06),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		transform: translateY(-1px);
	}

	.file-upload-zone.disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
		filter: saturate(0.65);
	}

	.file-upload-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		margin: 0 auto 0.75rem;
		border-radius: 18px;
		background: rgba(126, 231, 255, 0.08);
		color: var(--shell-accent, #7ee7ff);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
	}

	.file-upload-title {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--shell-text, rgba(233, 240, 255, 0.88));
	}

	.file-upload-hint {
		margin: 0.45rem 0 0;
		font-size: 0.75rem;
		color: var(--shell-text-soft, rgba(184, 198, 226, 0.72));
	}

	.file-upload-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 0.9rem;
		border-radius: 16px;
		background: rgba(255, 107, 120, 0.08);
		border: 1px solid rgba(255, 107, 120, 0.18);
		color: #ff9da8;
		font-size: 0.75rem;
	}

	.file-upload-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.file-upload-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.8rem 0.95rem;
		border-radius: 18px;
		background: rgba(12, 18, 31, 0.72);
		border: 1px solid rgba(120, 160, 220, 0.12);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.file-upload-file-icon {
		color: rgba(126, 231, 255, 0.58);
		flex-shrink: 0;
	}

	.file-upload-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.875rem;
		color: var(--shell-text, rgba(233, 240, 255, 0.88));
	}

	.file-upload-size {
		flex-shrink: 0;
		font-size: 0.6875rem;
		color: var(--shell-muted, rgba(140, 160, 199, 0.52));
	}

	.file-upload-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 999px;
		background: transparent;
		color: rgba(184, 198, 226, 0.52);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.file-upload-remove::before {
		content: none;
	}

	.file-upload-remove:hover {
		background: rgba(255, 107, 120, 0.1);
		border-color: rgba(255, 107, 120, 0.18);
		color: #ff9da8;
	}
</style>
