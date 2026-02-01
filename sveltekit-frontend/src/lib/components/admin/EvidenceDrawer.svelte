<script lang="ts">

	interface EvidenceFile {
		id: string;
	filename: string;
	file_type: string;
	file_size: number;
	jurisdiction: string;
	processing_status: string;
	minio_path: string;
	metadata: Record<string, any>;
		created_at: string;
	updated_at: string;
	chunk_count: number;
	}

	interface DrawerProps {
		isOpen: boolean;
	data: EvidenceFile | null;
		isLoading: boolean;
	isSaving: boolean;
	onClose: () => void;
		onSave: (data: Partial<EvidenceFile>) => Promise<void>;
		onDelete: (id: string) => Promise<void>;
	}

	let {
		isOpen = false,
		data = null,
		isLoading = false,
		isSaving = false,
		onClose = () => {},
	onSave = async () => {},
	onDelete = async () => {}
	}: DrawerProps = $props();

	let formData = $state<Partial<EvidenceFile>>({});
	let errors = $state<Record<string, string>>({});
	let showDeleteConfirm = $state(false);
	let metadataJson = $state('{}');

	const jurisdictions = ['CA', 'NY', 'TX', 'Fed-US', 'Other'];
	const statuses = ['pending', 'processing', 'completed', 'failed'];

	$effect(() => {
		if (data) {
			formData = { ...data };
			metadataJson = JSON.stringify(data.metadata || {},
	null, 2);
		}
	});

	function validateForm(): boolean {
		errors = {};

		if (!formData.filename?.trim()) {
			errors.filename = 'Filename is required';
		}

		if (!formData.jurisdiction) {
			errors.jurisdiction = 'Jurisdiction is required';
		}

		if (!formData.processing_status) {
			errors.processing_status = 'Status is required';
		}

		try {
			JSON.parse(metadataJson);
		} catch {
			errors.metadata = 'Invalid JSON format';
		}

		return Object.keys(errors).length === 0;
	}

	async function handleSave() {
		if (!validateForm()) return;

		try {
			const saveData = {
				...formData, metadata: JSON.parse(metadataJson)
			};
			await onSave(saveData);
		} catch (error) {
			console.error('Save error:', error);
		}
	}

	async function handleDelete() {
		if (!data?.id) return;

		try {
			await onDelete(data.id);
			showDeleteConfirm = false;
			onClose();
		} catch (error) {
			console.error('Delete error:', error);
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
	}
</script>

<div class="drawer-overlay" class:open={ isOpen } onclick={() => !isSaving && onClose()}>
	<div class="drawer" class:open={ isOpen } onclick={(e) => e.stopPropagation()}>
		{#if isLoading}
			<div class="drawer-loading">
				<div class="spinner"></div>
				<p>Loading evidence...</p>
			</div>
		{:else if data}
			<!-- Header -->
			<div class="drawer-header">
				<h2>{data.filename}</h2>
				<button class="close-btn" onclick={onClose} disabled={ isSaving }>✕</button>
			</div>

			<!-- Content -->
			<div class="drawer-content">
				<!-- Read-only Info Section -->
				<div class="info-section">
					<h3>File Information</h3>
					<div class="info-grid">
						<div class="info-item">
							<label>File ID</label>
							<code>{data.id}</code>
						</div>
						<div class="info-item">
							<label>File Type</label>
							<span>{data.file_type.toUpperCase()}</span>
						</div>
						<div class="info-item">
							<label>File Size</label>
							<span>{formatFileSize(data.file_size)}</span>
						</div>
						<div class="info-item">
							<label>Chunks</label>
							<span>{data.chunk_count}</span>
						</div>
						<div class="info-item">
							<label>Created</label>
							<span>{formatDate(data.created_at)}</span>
						</div>
						<div class="info-item">
							<label>Updated</label>
							<span>{formatDate(data.updated_at)}</span>
						</div>
						<div class="info-item">
							<label>MinIO Path</label>
							<code class="path">{data.minio_path}</code>
						</div>
					</div>
				</div>

				<!-- Editable Form Section -->
				<div class="form-section">
					<h3>Edit Metadata</h3>

					<!-- Filename -->
					<div class="form-group">
						<label for="filename">Filename</label>
						<input
							id="filename"
							type="text"
							bind:value={formData.filename}
							placeholder="Enter filename"
							class="form-input"
							class:error={errors.filename}
							disabled={ isSaving }
						/>
						{#if errors.filename}
							<span class="error-message">{errors.filename}</span>
						{/if}
					</div>

					<!-- Jurisdiction -->
					<div class="form-group">
						<label for="jurisdiction">Jurisdiction</label>
						<select
							id="jurisdiction"
							bind:value={formData.jurisdiction}
							class="form-select"
							class:error={errors.jurisdiction}
							disabled={ isSaving }
						>
							<option value="">Select Jurisdiction</option>
							{#each jurisdictions as j}
								<option value={j}>{j}</option>
							{/each}
						</select>
						{#if errors.jurisdiction}
							<span class="error-message">{errors.jurisdiction}</span>
						{/if}
					</div>

					<!-- Processing Status -->
					<div class="form-group">
						<label for="status">Processing Status</label>
						<select
							id="status"
							bind:value={formData.processing_status}
							class="form-select"
							class:error={errors.processing_status}
							disabled={isSaving}
						>
							<option value="">Select Status</option>
							{#each statuses as s}
								<option value={s}>{s}</option>
							{/each}
						</select>
						{#if errors.processing_status}
							<span class="error-message">{errors.processing_status}</span>
						{/if}
					</div>

					<!-- Metadata JSON -->
					<div class="form-group">
						<label for="metadata">Metadata (JSON)</label>
						<textarea
							id="metadata"
							bind:value={metadataJson}
							placeholder="Enter JSON metadata"
							class="form-textarea"
							class:error={errors.metadata}
							disabled={isSaving}
							rows="6"
						></textarea>
						{#if errors.metadata}
							<span class="error-message">{errors.metadata}</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="drawer-footer">
				<div class="footer-actions">
					<button
						class="btn btn-danger"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isSaving}
					>
						🗑️ Delete
					</button>
				</div>

				<div class="footer-buttons">
					<button class="btn btn-secondary" onclick={onClose} disabled={isSaving}>
						Cancel
					</button>
					<button
						class="btn btn-primary"
						onclick={handleSave}
						disabled={isSaving}
					>
						{isSaving ? 'Saving...' : '💾 Save'}
					</button>
				</div>
			</div>

			<!-- Delete Confirmation Modal -->
			{#if showDeleteConfirm}
				<div class="modal-overlay" onclick={() => (showDeleteConfirm = false)}>
					<div class="modal" onclick={(e) => e.stopPropagation()}>
						<h3>Delete Evidence?</h3>
						<p>This action cannot be undone. All chunks and embeddings will be deleted.</p>
						<div class="modal-buttons">
							<button
								class="btn btn-secondary"
								onclick={() => (showDeleteConfirm = false)}
								disabled={isSaving}
							>
								Cancel
							</button>
							<button
								class="btn btn-danger"
								onclick={handleDelete}
								disabled={isSaving}
							>
								{isSaving ? 'Deleting...' : 'Delete'}
							</button>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.drawer-overlay {
		position: fixed;
	top: 0;
	right: 0;
	bottom: 0;
	left: 0;
	background: rgba(0, 0, 0, 0.5);
		opacity: 0;
		pointer-events: none;
	transition: opacity 0.3s ease;
		z-index: 1000;
	}

	.drawer-overlay.open {
		opacity: 1;
		pointer-events: auto;
	}

	.drawer {
		position: fixed;
	top: 0;
	right: 0;
	bottom: 0;
	width: 500px;
	background: #0d0d0f;
		border-left: 1px solid #222;
		display: flex;
		flex-direction: column;
	transform: translateX(100%);
	transition: transform 0.3s ease;
		z-index: 1001;
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.5);
	}

	.drawer.open {
		transform: translateX(0);
	}

	.drawer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	padding: 1.5rem;
	background: #111;
		border-bottom: 1px solid #222;
		flex-shrink: 0;
	}

	.drawer-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	color: #ddd;
	overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	flex: 1;
	}

	.close-btn {
		background: none;
	border: none;
	color: #999;
		font-size: 1.5rem;
	cursor: pointer;
	padding: 0;
	width: 32px;
	height: 32px;
	display: flex;
		align-items: center;
		justify-content: center;
	transition: color 0.2s ease;
		margin-left: 1rem;
	}

	.close-btn:hover:not(:disabled) {
		color: #ddd;
	}

	.close-btn:disabled {
		opacity: 0.5;
	cursor: not-allowed;
	}

	.drawer-content {
		flex: 1;
		overflow-y: auto;
	padding: 1.5rem;
	}

	.drawer-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	height: 100%;
	color: #666;
	}

	.spinner {
		width: 40px;
	height: 40px;
	border: 3px solid #333;
		border-top-color: #9df;
		border-radius: 50%;
	animation: spin 0.8s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Sections */
	.info-section,
	.form-section {
		margin-bottom: 2rem;
	}

	.info-section h3,
	.form-section h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: 600;
	color: #9df;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* Info Grid */
	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
	gap: 0.25rem;
	}

	.info-item label {
		font-size: 0.8rem;
	color: #999;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.info-item span,
	.info-item code {
		color: #ddd;
		font-size: 0.9rem;
		word-break: break-word;
	}

	.info-item code {
		background: #16161a;
	padding: 0.25rem 0.5rem;
		border-radius: 3px;
		font-family: 'Courier New', monospace;
		font-size: 0.85rem;
	}

	.info-item code.path {
		display: block;
	padding: 0.5rem;
		margin-top: 0.25rem;
		overflow-x: auto;
	}

	/* Form */
	.form-group {
		display: flex;
		flex-direction: column;
	gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.form-group label {
		font-size: 0.9rem;
		font-weight: 500;
	color: #ddd;
	}

	.form-input,
	.form-select,
	.form-textarea {
		padding: 0.75rem;
	background: #16161a;
	border: 1px solid #333;
		border-radius: 4px;
	color: #ddd;
		font-size: 0.9rem;
		font-family: inherit;
	transition: all 0.2s ease;
	}

	.form-input:focus,
	.form-select:focus,
	.form-textarea:focus {
		outline: none;
		border-color: #9df;
		box-shadow: 0 0 0 2px rgba(153, 221, 255, 0.1);
	}

	.form-input:disabled,
	.form-select:disabled,
	.form-textarea:disabled {
		opacity: 0.6;
	cursor: not-allowed;
	}

	.form-input.error,
	.form-select.error,
	.form-textarea.error {
		border-color: #f44;
	}

	.form-textarea {
		resize: vertical;
		font-family: 'Courier New', monospace;
		font-size: 0.85rem;
	}

	.error-message {
		font-size: 0.8rem;
	color: #f44;
	}

	/* Footer */
	.drawer-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
	padding: 1.5rem;
	background: #111;
		border-top: 1px solid #222;
		flex-shrink: 0;
	gap: 1rem;
	}

	.footer-actions {
		flex: 1;
	}

	.footer-buttons {
		display: flex;
	gap: 0.75rem;
	}

	/* Buttons */
	.btn {
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 4px;
		font-size: 0.9rem;
		font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
		white-space: nowrap;
	}

	.btn-primary {
		background: #9df;
	color: #000;
	}

	.btn-primary:hover:not(:disabled) {
		background: #7ce;
		box-shadow: 0 0 8px rgba(153, 221, 255, 0.3);
	}

	.btn-secondary {
		background: #333;
	color: #ddd;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #444;
	}

	.btn-danger {
		background: #f44;
	color: #fff;
	}

	.btn-danger:hover:not(:disabled) {
		background: #e33;
	}

	.btn:disabled {
		opacity: 0.5;
	cursor: not-allowed;
	}

	/* Modal */
	.modal-overlay {
		position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.modal {
		background: #111;
	border: 1px solid #333;
		border-radius: 8px;
	padding: 2rem;
		max-width: 400px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
	}

	.modal h3 {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
	color: #ddd;
	}

	.modal p {
		margin: 0 0 1.5rem 0;
		color: #999;
		line-height: 1.5;
	}

	.modal-buttons {
		display: flex;
	gap: 0.75rem;
		justify-content: flex-end;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.drawer {
			width: 100%;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}

		.drawer-footer {
			flex-direction: column;
		}

		.footer-buttons {
			width: 100%;
		}

		.footer-buttons .btn {
			flex: 1;
		}
	}

	/* Scrollbar */
	.drawer-content::-webkit-scrollbar {
		width: 6px;
	}

	.drawer-content::-webkit-scrollbar-track {
		background: #0d0d0f;
	}

	.drawer-content::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 3px;
	}

	.drawer-content::-webkit-scrollbar-thumb:hover {
		background: #444;
	}
</style>




