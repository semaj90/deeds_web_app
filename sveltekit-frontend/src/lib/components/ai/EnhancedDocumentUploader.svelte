<!-- Enhanced Document Uploader with AI Processing and Real-time Status -->
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Button from '$lib/components/ui/Button.svelte';
	import Progress from '$lib/components/ui/Progress.svelte';
	// Types
	interface UploadFile {
		id: string;
		file: File;
		preview?: string;
		status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
		progress: number;
		error?: string;
		metadata: {
			title?: string;
			description?: string;
			documentType?: string;
			jurisdiction?: string;
			tags?: string[];
			autoSummarize?: boolean;
			extractEntities?: boolean;
		};
	}

	interface ProcessedFile {
		id: string;
		documentId: string;
		filename: string;
		size: number;
		type: string;
		url?: string;
		thumbnail?: string;
	}

	interface ProcessingResult {
		summary?: string;
		entities?: unknown[];
		chunks?: number;
		embeddings?: number[];
	}

	interface Props {
		acceptedTypes?: string;
		maxFileSize?: number;
		maxFiles?: number;
		caseId?: string;
		userId?: string;
		autoProcess?: boolean;
		showMetadataForm?: boolean;
		class?: string;
		onFileProcessed?: (data: { fileId: string; result: ProcessingResult }) => void;
		onFilesUpdated?: (data: { files: ProcessedFile[] }) => void;
		onUploadError?: (data: { fileId: string; error: string }) => void;
		onFileProgress?: (data: { fileId: string; progress: number }) => void;
	}

	let {
		acceptedTypes = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png',
		maxFileSize = 50 * 1024 * 1024,
		maxFiles = 10,
		caseId = '',
		userId = '',
		autoProcess = false,
		showMetadataForm = true,
		class: className = '',
		onFileProcessed,
		onFilesUpdated,
		onUploadError,
		onFileProgress
	}: Props = $props();

	// State
	let files = $state<UploadFile[]>([]);
	let isDragging = $state(false);
	let isProcessing = $state(false);
	let showMetadata = $state(false);
	let selectedFile = $state<UploadFile | null>(null);
	let metadataDraft = $state<UploadFile['metadata'] | null>(null);

	// DOM refs
	let fileInput = $state<HTMLInputElement | undefined>(undefined);
	let dropZone = $state<HTMLDivElement | undefined>(undefined);

	// Derived state
	let totalProgress = $derived(
		files.length === 0 ? 0 : files.reduce((acc, f) => acc + f.progress, 0) / files.length
	);
	let completedFiles = $derived(files.filter((f) => f.status === 'completed'));
	let hasErrors = $derived(files.some((f) => f.status === 'error'));
	let pendingCount = $derived(files.filter((f) => f.status === 'pending').length);

	const documentTypes = [
		{ value: 'contract', label: 'Contract' },
		{ value: 'motion', label: 'Motion' },
		{ value: 'brief', label: 'Brief' },
		{ value: 'evidence', label: 'Evidence' },
		{ value: 'correspondence', label: 'Correspondence' },
		{ value: 'statute', label: 'Statute' },
		{ value: 'regulation', label: 'Regulation' },
		{ value: 'case_law', label: 'Case Law' },
		{ value: 'other', label: 'Other' }
	];

	const jurisdictions = [
		{ value: 'federal', label: 'Federal' },
		{ value: 'state', label: 'State' },
		{ value: 'local', label: 'Local' },
		{ value: 'international', label: 'International' }
	];

	// ID generator with fallback
	function genId(): string {
		try {
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
				return crypto.randomUUID();
			}
		} catch {
			// fallback below
		}
		return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	// Drag & drop handlers
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		if (!e.relatedTarget || !dropZone?.contains(e.relatedTarget as Node)) {
			isDragging = false;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
		processSelectedFiles(droppedFiles);
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const selectedFiles = Array.from(target.files || []);
		processSelectedFiles(selectedFiles);
		target.value = '';
	}

	function processSelectedFiles(selectedFiles: File[]) {
		const validFiles = selectedFiles.filter((file) => {
			const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
			if (!acceptedTypes.includes(ext)) {
				console.warn(`File type ${ext} not accepted`);
				return false;
			}
			if (file.size > maxFileSize) {
				console.warn(`File ${file.name} exceeds maximum size`);
				return false;
			}
			return true;
		});

		if (files.length + validFiles.length > maxFiles) {
			console.warn(`Maximum ${maxFiles} files allowed`);
			return;
		}

		const newFiles: UploadFile[] = validFiles.map((file) => ({
			id: genId(),
			file,
			status: 'pending' as const,
			progress: 0,
			metadata: {
				title: file.name.replace(/\.[^/.]+$/, ''),
				documentType: 'other',
				autoSummarize: true,
				extractEntities: true,
				tags: []
			}
		}));

		// Generate previews for images
		newFiles.forEach((uploadFile) => {
			if (uploadFile.file.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = (ev) => {
					uploadFile.preview = (ev.target?.result as string) ?? undefined;
					files = [...files];
				};
				reader.readAsDataURL(uploadFile.file);
			}
		});

		files = [...files, ...newFiles];

		if (autoProcess) {
			uploadFiles();
		}
	}

	// Upload & processing
	async function uploadFiles() {
		isProcessing = true;
		const pendingFiles = files.filter((f) => f.status === 'pending');

		for (const uploadFile of pendingFiles) {
			try {
				await uploadSingleFile(uploadFile);
			} catch (err) {
				console.error('Upload error:', err);
				updateFileStatus(uploadFile.id, 'error', 0, String(err));
			}
		}

		isProcessing = false;
	}

	async function uploadSingleFile(uploadFile: UploadFile) {
		updateFileStatus(uploadFile.id, 'uploading', 10);

		const formData = new FormData();
		formData.append('file', uploadFile.file);
		formData.append('caseId', caseId);
		formData.append('userId', userId);
		formData.append('metadata', JSON.stringify(uploadFile.metadata));

		try {
			const uploadResponse = await fetch('/api/documents/upload', {
				method: 'POST',
				body: formData
			});

			if (!uploadResponse.ok) {
				throw new Error(`Upload failed: ${uploadResponse.statusText}`);
			}

			const uploadResult = (await uploadResponse.json()) as {
				documentId: string;
				url?: string;
			};

			updateFileStatus(uploadFile.id, 'processing', 50);

			if (uploadFile.metadata.autoSummarize || uploadFile.metadata.extractEntities) {
				const processingResponse = await fetch('/api/ai/process-document', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						documentId: uploadResult.documentId,
						extractEntities: uploadFile.metadata.extractEntities,
						generateSummary: uploadFile.metadata.autoSummarize,
						riskAssessment: true
					})
				});

				if (!processingResponse.ok) {
					throw new Error(`AI processing failed: ${processingResponse.statusText}`);
				}

				const processingResult = (await processingResponse.json()) as ProcessingResult;
				updateFileStatus(uploadFile.id, 'completed', 100);

				onFileProcessed?.({ fileId: uploadFile.id, result: processingResult });
				onFilesUpdated?.({
					files: [
						{
							id: uploadFile.id,
							documentId: uploadResult.documentId,
							filename: uploadFile.file.name,
							size: uploadFile.file.size,
							type: uploadFile.file.type,
							url: uploadResult.url,
							thumbnail: uploadFile.preview
						}
					]
				});
			} else {
				updateFileStatus(uploadFile.id, 'completed', 100);
			}
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : String(err);
			updateFileStatus(uploadFile.id, 'error', 0, errMsg);
			onUploadError?.({ fileId: uploadFile.id, error: errMsg });
		}
	}

	function updateFileStatus(
		fileId: string,
		status: UploadFile['status'],
		progress: number,
		error?: string
	) {
		files = files.map((f) =>
			f.id === fileId ? { ...f, status, progress, ...(error ? { error } : {}) } : f
		);

		if (status === 'processing') {
			onFileProgress?.({ fileId, progress });
		}
	}

	function removeFile(fileId: string) {
		files = files.filter((f) => f.id !== fileId);
	}

	function openMetadataDialog(file: UploadFile) {
		selectedFile = file;
		metadataDraft = { ...file.metadata };
		showMetadata = true;
	}

	function saveMetadataFromDialog() {
		if (selectedFile && metadataDraft) {
			updateFileMetadata(selectedFile.id, metadataDraft);
		}
		selectedFile = null;
		metadataDraft = null;
		showMetadata = false;
	}

	function cancelMetadataDialog() {
		selectedFile = null;
		metadataDraft = null;
		showMetadata = false;
	}

	function updateFileMetadata(fileId: string, metadata: Partial<UploadFile['metadata']>) {
		files = files.map((f) =>
			f.id === fileId ? { ...f, metadata: { ...f.metadata, ...metadata } } : f
		);
	}

	function getStatusColor(status: UploadFile['status']): string {
		switch (status) {
			case 'completed':
				return 'success';
			case 'error':
				return 'danger';
			case 'processing':
				return 'info';
			case 'uploading':
				return 'warning';
			default:
				return 'neutral';
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	// Prevent default drag behaviors on document
	$effect(() => {
		const preventDefaults = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
		};

		const events = ['dragenter', 'dragover', 'dragleave', 'drop'];
		events.forEach((name) => document.addEventListener(name, preventDefaults, false));

		return () => {
			events.forEach((name) => document.removeEventListener(name, preventDefaults, false));
		};
	});
</script>

<!-- Main Upload Interface -->
<div class="enhanced-document-uploader {className}">
	<!-- Drop Zone -->
	<div
		bind:this={dropZone}
		class="drop-zone"
		class:dragging={isDragging}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		role="button"
		aria-label="Drop zone for file upload"
		tabindex="0"
		onclick={() => fileInput?.click()}
		onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
	>
		<div class="drop-zone-content">
			<span class="i-lucide-upload drop-zone-icon w-12 h-12 inline-block" />
			<h3 class="drop-zone-title">
				{isDragging ? 'Drop files here' : 'Upload Legal Documents'}
			</h3>
			<p class="drop-zone-description">Drag and drop files here, or click to select files.</p>
			<p class="drop-zone-specs">
				Accepted: {acceptedTypes} &bull; Max file: {formatFileSize(maxFileSize)} &bull; Up to {maxFiles}
				files
			</p>

			<!-- Hidden file input -->
			<input
				type="file"
				bind:this={fileInput}
				multiple
				accept={acceptedTypes}
				onchange={handleFileSelect}
				aria-hidden="true"
				class="sr-only"
			/>
		</div>
	</div>

	<!-- File List -->
	{#if files.length > 0}
		<div class="file-list">
			{#each files as file (file.id)}
				<div class="file-item">
					<div class="file-info">
						<!-- File Icon/Preview -->
						<div class="file-preview">
							{#if file.preview}
								<img src={file.preview} alt="Preview" class="preview-image" />
							{:else if file.file.type.startsWith('image/')}
								<span class="i-lucide-file-image w-6 h-6 inline-block" />
							{:else if file.file.type.includes('pdf')}
								<span class="i-lucide-file-text w-6 h-6 inline-block" />
							{:else}
								<span class="i-lucide-file w-6 h-6 inline-block" />
							{/if}
						</div>

						<!-- File Details -->
						<div class="file-details">
							<h4 class="file-name">
								{file.metadata.title || file.file.name}
							</h4>
							<p class="file-meta">
								{formatFileSize(file.file.size)} &bull; {file.file.type}
								{#if file.metadata.documentType !== 'other'}
									&bull; {documentTypes.find((t) => t.value === file.metadata.documentType)
										?.label}
								{/if}
							</p>

							<!-- Progress Bar -->
							{#if file.status === 'uploading' || file.status === 'processing'}
								<Progress value={file.progress} class="file-progress" />
							{/if}

							<!-- Error Message -->
							{#if file.error}
								<p class="error-message">
									<span class="i-lucide-alert-triangle w-4 h-4 inline-block" />
									{file.error}
								</p>
							{/if}
						</div>

						<!-- Status & Actions -->
						<div class="file-actions">
							<span class="status-badge status-{getStatusColor(file.status)}">
								{#if file.status === 'processing'}
									<span class="i-lucide-loader-2 badge-icon spinning w-3 h-3 inline-block" />
								{:else if file.status === 'completed'}
									<span class="i-lucide-check-circle badge-icon w-3 h-3 inline-block" />
								{:else if file.status === 'error'}
									<span class="i-lucide-alert-triangle badge-icon w-3 h-3 inline-block" />
								{/if}
								{file.status}
							</span>

							<div class="action-buttons">
								{#if showMetadataForm && file.status === 'pending'}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => openMetadataDialog(file)}
									>
										Edit
									</Button>
								{/if}

								<Button
									variant="ghost"
									size="sm"
									onclick={() => removeFile(file.id)}
									disabled={file.status === 'uploading' ||
										file.status === 'processing'}
								>
									<span class="i-lucide-x w-4 h-4 inline-block" />
								</Button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Upload Actions -->
		<div class="upload-actions">
			<Button
				onclick={uploadFiles}
				disabled={isProcessing || pendingCount === 0}
			>
				{#if isProcessing}
					<span class="i-lucide-loader-2 mr-2 spinning w-4 h-4 inline-block" />
					Processing...
				{:else}
					<span class="i-lucide-upload mr-2 w-4 h-4 inline-block" />
					Upload &amp; Process ({pendingCount} files)
				{/if}
			</Button>

			<Button variant="ghost" onclick={() => (files = [])} disabled={isProcessing}>
				Clear All
			</Button>
		</div>
	{/if}

	<!-- Metadata Dialog -->
	<Dialog.Root bind:open={showMetadata}>
		<Dialog.Content class="max-w-md">
			<Dialog.Title>Document Metadata</Dialog.Title>
			<Dialog.Description>Edit document details and AI processing options.</Dialog.Description>

			{#if metadataDraft}
				<div class="metadata-form">
					<div class="form-field">
						<label for="meta-title">Title</label>
						<input
							id="meta-title"
							type="text"
							bind:value={metadataDraft.title}
							placeholder="Document title"
							class="form-input"
						/>
					</div>

					<div class="form-field">
						<label for="meta-description">Description</label>
						<textarea
							id="meta-description"
							bind:value={metadataDraft.description}
							placeholder="Brief description"
							rows="3"
							class="form-input"
						></textarea>
					</div>

					<div class="form-field">
						<label for="meta-doc-type">Document Type</label>
						<select
							id="meta-doc-type"
							bind:value={metadataDraft.documentType}
							class="form-input"
						>
							{#each documentTypes as dtype}
								<option value={dtype.value}>{dtype.label}</option>
							{/each}
						</select>
					</div>

					<div class="form-field">
						<label for="meta-jurisdiction">Jurisdiction</label>
						<select
							id="meta-jurisdiction"
							bind:value={metadataDraft.jurisdiction}
							class="form-input"
						>
							<option value="">Select jurisdiction</option>
							{#each jurisdictions as jur}
								<option value={jur.value}>{jur.label}</option>
							{/each}
						</select>
					</div>

					<div class="ai-options">
						<label class="section-label">AI Processing Options</label>
						<div class="checkbox-group">
							<label class="checkbox-label">
								<input
									type="checkbox"
									bind:checked={metadataDraft.autoSummarize}
								/>
								Auto-generate summary
							</label>
							<label class="checkbox-label">
								<input
									type="checkbox"
									bind:checked={metadataDraft.extractEntities}
								/>
								Extract entities (names, dates, amounts)
							</label>
						</div>
					</div>

					<div class="dialog-actions">
						<Button variant="ghost" onclick={cancelMetadataDialog}>
							Cancel
						</Button>
						<Button onclick={saveMetadataFromDialog}>
							Save
						</Button>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</div>

<style>
	.enhanced-document-uploader {
		width: 100%;
	}

	.drop-zone {
		border: 2px dashed #d1d5db;
		border-radius: 0.5rem;
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: border-color 0.2s, background-color 0.2s;
		background: #f9fafb;
	}

	.drop-zone:hover {
		border-color: #9ca3af;
	}

	.drop-zone.dragging {
		border-color: #2563eb;
		background: rgba(37, 99, 235, 0.05);
	}

	.drop-zone-content {
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
	}

	:global(.drop-zone-icon) {
		display: block;
		margin-left: auto;
		margin-right: auto;
		color: #6b7280;
	}

	.drop-zone-title {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0.5rem 0;
	}

	.drop-zone-description {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0.25rem 0;
	}

	.drop-zone-specs {
		font-size: 0.75rem;
		color: #9ca3af;
		margin: 0.25rem 0;
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
		border-width: 0;
	}

	.file-list {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.file-item {
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 0.75rem;
		background: #ffffff;
		transition: box-shadow 0.2s;
	}

	.file-item:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.file-preview {
		flex-shrink: 0;
		width: 3rem;
		height: 3rem;
		border-radius: 0.5rem;
		background: #f3f4f6;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.preview-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.file-details {
		flex: 1;
		min-width: 0;
	}

	.file-name {
		font-weight: 500;
		font-size: 0.875rem;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-meta {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0.25rem 0 0;
	}

	:global(.file-progress) {
		margin-top: 0.5rem;
	}

	.error-message {
		font-size: 0.75rem;
		color: #dc2626;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.5rem;
	}

	.file-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: capitalize;
	}

	.status-success {
		background: rgba(34, 197, 94, 0.1);
		color: #16a34a;
	}

	.status-danger {
		background: rgba(239, 68, 68, 0.1);
		color: #dc2626;
	}

	.status-info {
		background: rgba(59, 130, 246, 0.1);
		color: #2563eb;
	}

	.status-warning {
		background: rgba(245, 158, 11, 0.1);
		color: #d97706;
	}

	.status-neutral {
		background: rgba(107, 114, 128, 0.1);
		color: #6b7280;
	}

	:global(.badge-icon) {
		flex-shrink: 0;
	}

	:global(.spinning) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.action-buttons {
		display: flex;
		gap: 0.25rem;
	}

	.upload-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	:global(.mr-2) {
		margin-right: 0.5rem;
	}

	/* Metadata Dialog */
	.metadata-form {
		padding: 1rem 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-field label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
	}

	.form-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-family: inherit;
		background: #ffffff;
		color: #111827;
		transition: border-color 0.2s;
	}

	.form-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	textarea.form-input {
		resize: vertical;
		min-height: 4rem;
	}

	select.form-input {
		cursor: pointer;
	}

	.ai-options {
		margin-top: 0.5rem;
	}

	.section-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}

	.checkbox-group {
		margin-top: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #4b5563;
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		cursor: pointer;
		accent-color: #2563eb;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
