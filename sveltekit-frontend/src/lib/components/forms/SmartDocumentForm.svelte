<!-- Smart Document Form — Upload documents for OCR + evidence pipeline processing -->
<!-- Session 64: Rewritten from corrupted ocrService dep → wired to real MinIO/evidence API -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	interface FormField {
		name: string;
		type: 'text' | 'email' | 'phone' | 'date' | 'case_number' | 'address' | 'monetary_amount' | 'text_block' | 'name';
		label: string;
		required: boolean;
		value?: string;
		confidence?: number;
	}

	interface Props {
		title?: string;
		description?: string;
		formSchema?: FormField[];
		enableOCR?: boolean;
		caseId?: string;
		documentTypes?: string[];
		onocrresult?: (payload: any) => void;
		onsubmit?: (payload: any) => void;
	}

	let {
		title = 'Smart Document Form',
		description = 'Upload a document for automatic field extraction via the evidence pipeline',
		formSchema = [] as FormField[],
		enableOCR = true,
		caseId = '',
		documentTypes = ['legal_document', 'contract', 'form'],
		onocrresult,
		onsubmit
	}: Props = $props();

	// Component state
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploadedFile = $state<File | null>(null);
	let populatedFields = $state<FormField[]>([...formSchema]);
	let isProcessing = $state(false);
	let showPreview = $state(false);
	let selectedDocumentType = $state('auto');

	// Upload progress tracking (wired to /api/evidence/realtime SSE)
	let uploadProgress = $state(0);
	let uploadStep = $state('');
	let uploadJobId = $state('');
	let uploadEvidenceId = $state('');
	let uploadError = $state('');

	// Extracted text from pipeline
	let extractedText = $state('');
	let extractedEntities = $state<Array<{ type: string; value: string; confidence: number }>>([]);

	// Form validation
	let formErrors = $state<Record<string, string>>({});
	let isFormValid = $state(false);

	// Default form schema if none provided
	$effect(() => {
		if (formSchema.length === 0) {
			populatedFields = [
				{ name: 'case_number', type: 'case_number', label: 'Case Number', required: false },
				{ name: 'document_date', type: 'date', label: 'Document Date', required: true },
				{ name: 'jurisdiction', type: 'text_block', label: 'Jurisdiction', required: false },
				{ name: 'contact_email', type: 'email', label: 'Contact Email', required: true },
				{ name: 'contact_phone', type: 'phone', label: 'Contact Phone', required: false },
				{ name: 'description', type: 'text_block', label: 'Description', required: true },
				{ name: 'notes', type: 'text_block', label: 'Additional Notes', required: false }
			];
		}
	});

	/** Upload file to MinIO via POST /api/evidence/upload, then track via SSE */
	async function handleFileUpload() {
		if (!uploadedFile || !enableOCR) return;

		isProcessing = true;
		uploadProgress = 0;
		uploadStep = 'uploading';
		uploadError = '';

		try {
			// Stage 1: Upload to MinIO via evidence API
			const formData = new FormData();
			formData.append('file', uploadedFile);
			if (caseId) formData.append('caseId', caseId);
			formData.append('title', uploadedFile.name);
			formData.append('description', `Uploaded via Smart Document Form`);
			formData.append('evidenceType', selectedDocumentType === 'auto' ? 'document' : selectedDocumentType);

			const response = await fetch('/api/evidence/upload', {
				method: 'POST',
				body: formData
			});

			if (response.status === 429) {
				uploadError = 'Rate limited — please wait before uploading again.';
				return;
			}

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `Upload failed (${response.status})`);
			}

			const uploadResult = await response.json();
			uploadJobId = uploadResult.jobId || '';
			uploadEvidenceId = uploadResult.id || '';
			uploadProgress = 30;
			uploadStep = 'storing';

			// Stage 2: Track progress via SSE if we have a jobId
			if (uploadJobId) {
				await trackUploadProgress(uploadJobId);
			} else {
				// No jobId — poll status instead
				await pollUploadStatus(uploadEvidenceId);
			}

			showPreview = true;

			// Auto-populate form fields from extracted entities
			autoPopulateFromEntities();

			onocrresult?.({
				evidenceId: uploadEvidenceId,
				jobId: uploadJobId,
				extractedText,
				entities: extractedEntities
			});
		} catch (error) {
			console.error('Upload failed:', error);
			uploadError = error instanceof Error ? error.message : 'Upload failed';
		} finally {
			isProcessing = false;
		}
	}

	/** Track upload progress via SSE at /api/evidence/realtime */
	async function trackUploadProgress(jobId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const evtSource = new EventSource(`/api/evidence/realtime?jobId=${jobId}`);
			let resolved = false;

			evtSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					if (data.type === 'progress') {
						uploadProgress = data.progress || 0;
						uploadStep = data.step || '';
					} else if (data.type === 'complete') {
						uploadProgress = 100;
						uploadStep = 'complete';
						uploadEvidenceId = data.evidenceId || uploadEvidenceId;
						evtSource.close();
						if (!resolved) {
							resolved = true;
							// Fetch extracted data after completion
							fetchExtractedData(uploadEvidenceId).then(resolve);
						}
					} else if (data.type === 'error') {
						uploadError = data.error || 'Processing failed';
						evtSource.close();
						if (!resolved) {
							resolved = true;
							reject(new Error(data.error));
						}
					}
				} catch {
					// Ignore parse errors from keep-alive or malformed data
				}
			};

			evtSource.onerror = () => {
				evtSource.close();
				if (!resolved) {
					resolved = true;
					// SSE failed — fall back to polling
					pollUploadStatus(uploadEvidenceId).then(resolve).catch(reject);
				}
			};

			// Safety timeout: 5 minutes
			setTimeout(() => {
				evtSource.close();
				if (!resolved) {
					resolved = true;
					resolve();
				}
			}, 300000);
		});
	}

	/** Poll status endpoint as SSE fallback */
	async function pollUploadStatus(evidenceId: string): Promise<void> {
		if (!evidenceId) return;

		for (let i = 0; i < 60; i++) {
			try {
				const response = await fetch(`/api/evidence/${evidenceId}/status`);
				if (!response.ok) break;

				const data = await response.json();
				uploadProgress = data.progress || 0;
				uploadStep = data.step || '';

				if (data.status === 'complete') {
					uploadProgress = 100;
					uploadStep = 'complete';
					await fetchExtractedData(evidenceId);
					return;
				} else if (data.status === 'error') {
					uploadError = data.error || 'Processing failed';
					return;
				}
			} catch {
				break;
			}

			await new Promise((r) => setTimeout(r, 2000));
		}
	}

	/** Fetch extracted text and entities after processing completes */
	async function fetchExtractedData(evidenceId: string): Promise<void> {
		if (!evidenceId) return;

		try {
			// Search for this specific evidence to get extracted data
			const response = await fetch('/api/evidence/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: '*',
					caseId: caseId || undefined,
					limit: 1
				})
			});

			if (response.ok) {
				const data = await response.json();
				if (data.results && data.results.length > 0) {
					extractedText = data.results[0].content || '';
					const metadata = data.results[0].metadata || {};
					if (metadata.entities) {
						extractedEntities = metadata.entities;
					}
				}
			}
		} catch (error) {
			console.error('Failed to fetch extracted data:', error);
		}
	}

	/** Auto-populate form fields from extracted entities */
	function autoPopulateFromEntities() {
		if (extractedEntities.length === 0) return;

		const updated = [...populatedFields];
		for (const entity of extractedEntities) {
			const entityType = entity.type?.toLowerCase();
			for (const field of updated) {
				if (field.value) continue; // Skip already-populated fields

				if (
					(entityType === 'email' && field.type === 'email') ||
					(entityType === 'phone' && field.type === 'phone') ||
					(entityType === 'date' && field.type === 'date') ||
					(entityType === 'money' && field.type === 'monetary_amount') ||
					(entityType === 'citation' && field.type === 'case_number')
				) {
					field.value = entity.value;
					field.confidence = entity.confidence;
					break;
				}
			}
		}
		populatedFields = updated;
	}

	function handleFieldChange(fieldName: string, value: string) {
		const idx = populatedFields.findIndex((f) => f.name === fieldName);
		if (idx !== -1) {
			populatedFields[idx].value = value;
			populatedFields[idx].confidence = undefined;
			populatedFields = [...populatedFields];
		}
		validateField(fieldName, value);
	}

	function validateField(fieldName: string, value: string) {
		const field = populatedFields.find((f) => f.name === fieldName);
		if (!field) return;

		const errors = { ...formErrors };
		if (field.required && !value?.trim()) {
			errors[fieldName] = 'This field is required';
		} else {
			delete errors[fieldName];
		}
		formErrors = errors;
		isFormValid =
			Object.keys(errors).length === 0 &&
			populatedFields.every(
				(f) => !f.required || (f.value && f.value.toString().trim().length > 0)
			);
	}

	function handleSubmit() {
		populatedFields.forEach((field) => {
			if (field.value) validateField(field.name, field.value);
		});

		if (isFormValid) {
			const formData = populatedFields.reduce(
				(acc, field) => {
					acc[field.name] = field.value || '';
					return acc;
				},
				{} as Record<string, string | undefined>
			);

			onsubmit?.({
				formData,
				evidenceId: uploadEvidenceId,
				extractedEntities
			});
		}
	}

	function getFieldTypeIcon(type: string): string {
		const icons: Record<string, string> = {
			name: 'User',
			email: 'Mail',
			phone: 'Phone',
			date: 'Calendar',
			address: 'MapPin',
			case_number: 'FileText',
			monetary_amount: 'DollarSign'
		};
		return icons[type] || 'File';
	}

	function getConfidenceColor(confidence?: number): string {
		if (!confidence) return '#e0e0e0';
		if (confidence >= 0.9) return '#10b981';
		if (confidence >= 0.7) return '#f59e0b';
		return '#ef4444';
	}

	function getStepLabel(step: string): string {
		const labels: Record<string, string> = {
			uploading: 'Uploading file...',
			hashing: 'Computing file hash...',
			storing: 'Storing in MinIO...',
			'db-insert': 'Creating database record...',
			embedding: 'Extracting text & generating embeddings...',
			complete: 'Processing complete!',
			error: 'Processing failed'
		};
		return labels[step] || step;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			uploadedFile = files[0];
			handleFileUpload();
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}
</script>

<div class="smart-document-form">
	<div class="form-header">
		<h1>{title}</h1>
		<p>{description}</p>
	</div>

	{#if enableOCR}
		<div class="upload-section">
			<div class="section-header">
				<h3>Document Upload & Processing</h3>
			</div>

			<div class="section-content">
				<div class="doc-type-row">
					<label class="doc-type-label">Document Type:</label>
					<select bind:value={selectedDocumentType} class="doc-type-select">
						<option value="auto">Auto-detect</option>
						{#each documentTypes as type}
							<option value={type}>{type.replace(/_/g, ' ').toUpperCase()}</option>
						{/each}
					</select>
				</div>

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="drop-zone"
					class:has-file={uploadedFile}
					ondrop={handleDrop}
					ondragover={handleDragOver}
				>
					{#if uploadedFile}
						<div class="file-info">
							<p class="file-name">{uploadedFile.name}</p>
							<p class="file-size">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
						</div>
					{:else}
						<div class="drop-prompt">
							<p>Drop your document here or click to browse</p>
							<p class="supported-types">Supports PDF, PNG, JPG, TIFF (max 100MB)</p>
						</div>
					{/if}

					<input
						bind:this={fileInput}
						type="file"
						accept=".pdf,.png,.jpg,.jpeg,.tiff"
						class="file-input-hidden"
						onchange={(e) => {
							const files = (e.target as HTMLInputElement)?.files;
							if (files && files.length > 0) {
								uploadedFile = files[0];
								handleFileUpload();
							}
						}}
					/>

					{#if !uploadedFile}
						<Button variant="ghost" onclick={() => fileInput?.click()}>Browse Files</Button>
					{/if}
				</div>

				{#if isProcessing}
					<div class="progress-section">
						<div class="progress-header">
							<span class="progress-label">{getStepLabel(uploadStep)}</span>
							<span class="progress-pct">{Math.round(uploadProgress)}%</span>
						</div>
						<div class="progress-bar-bg">
							<div class="progress-bar-fill" style="width: {uploadProgress}%"></div>
						</div>
						<div class="pipeline-stages">
							{#each ['uploading', 'hashing', 'storing', 'db-insert', 'embedding', 'complete'] as stage, i}
								<span
									class="stage-dot"
									class:stage-active={uploadStep === stage}
									class:stage-done={['uploading', 'hashing', 'storing', 'db-insert', 'embedding', 'complete'].indexOf(uploadStep) > i}
								></span>
							{/each}
						</div>
					</div>
				{/if}

				{#if uploadError}
					<div class="error-msg">{uploadError}</div>
				{/if}

				{#if showPreview && extractedEntities.length > 0}
					<div class="extraction-results">
						<div class="results-header">
							<h4>Extraction Results</h4>
							<span class="entity-count">{extractedEntities.length} entities found</span>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<div class="fields-section">
		<div class="section-header">
			<h3>Form Fields</h3>
			{#if extractedEntities.length > 0}
				<span class="auto-populated-badge">Auto-populated</span>
			{/if}
		</div>

		<div class="section-content">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<div class="fields-grid">
					{#each populatedFields as field (field.name)}
						<div class="field-group">
							<label class="field-label">
								<span class="field-icon">{getFieldTypeIcon(field.type)}</span>
								<span>{field.label}</span>
								{#if field.required}
									<span class="required-star">*</span>
								{/if}
								{#if field.confidence}
									<span
										class="confidence-dot"
										style="background: {getConfidenceColor(field.confidence)}"
										title="{Math.round(field.confidence * 100)}% confidence"
									></span>
								{/if}
							</label>

							{#if field.type === 'text_block'}
								<textarea
									value={field.value || ''}
									placeholder="Enter {field.label.toLowerCase()}..."
									class="field-textarea"
									oninput={(e) =>
										handleFieldChange(field.name, (e.target as HTMLTextAreaElement).value)}
									rows="3"
								></textarea>
							{:else}
								<input
									type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
									value={field.value || ''}
									placeholder="Enter {field.label.toLowerCase()}..."
									class="field-input"
									class:field-error={formErrors[field.name]}
									oninput={(e) =>
										handleFieldChange(field.name, (e.target as HTMLInputElement).value)}
								/>
							{/if}

							{#if formErrors[field.name]}
								<p class="error-text">{formErrors[field.name]}</p>
							{/if}
						</div>
					{/each}
				</div>

				<div class="form-footer">
					<div class="form-status">
						<span class="status-badge" class:status-valid={isFormValid}>
							{isFormValid ? 'Ready to Submit' : 'Incomplete'}
						</span>
						{#if extractedEntities.length > 0}
							<span class="field-progress">
								{populatedFields.filter((f) => f.value?.toString().trim()).length} / {populatedFields.length}
								fields completed
							</span>
						{/if}
					</div>
					<div class="form-buttons">
						<Button
							variant="ghost"
							onclick={() => {
								populatedFields = populatedFields.map((f) => ({ ...f, value: '' }));
								formErrors = {};
							}}
						>
							Clear All
						</Button>
						<button type="submit" class="submit-btn" disabled={!isFormValid}>
							Submit Form
						</button>
					</div>
				</div>
			</form>
		</div>
	</div>
</div>

<style>
	.smart-document-form {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.form-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.form-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.form-header p {
		color: #6b7280;
		margin: 0;
	}

	.upload-section,
	.fields-section {
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		margin-bottom: 1.5rem;
		overflow: hidden;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.section-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.section-content {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.doc-type-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.doc-type-label {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.doc-type-select {
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		background: white;
		font-size: 0.875rem;
	}

	.drop-zone {
		border: 2px dashed #d1d5db;
		border-radius: 0.5rem;
		padding: 2rem;
		text-align: center;
		transition: all 0.2s;
		position: relative;
	}

	.drop-zone:hover {
		border-color: #3b82f6;
		background: #f0f7ff;
	}

	.drop-zone.has-file {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.file-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.file-name {
		font-weight: 600;
		margin: 0;
	}

	.file-size {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0;
	}

	.drop-prompt p {
		margin: 0.25rem 0;
	}

	.supported-types {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.file-input-hidden {
		display: none;
	}

	.progress-section {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 1rem;
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}

	.progress-label {
		font-weight: 500;
	}

	.progress-pct {
		color: #6b7280;
	}

	.progress-bar-bg {
		height: 0.5rem;
		background: #e5e7eb;
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: #3b82f6;
		border-radius: 999px;
		transition: width 0.3s ease;
	}

	.pipeline-stages {
		display: flex;
		justify-content: space-between;
		margin-top: 0.5rem;
		padding: 0 0.5rem;
	}

	.stage-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #d1d5db;
	}

	.stage-dot.stage-active {
		background: #3b82f6;
		box-shadow: 0 0 4px rgba(59, 130, 246, 0.5);
	}

	.stage-dot.stage-done {
		background: #10b981;
	}

	.error-msg {
		color: #dc2626;
		font-size: 0.875rem;
		padding: 0.5rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 0.25rem;
	}

	.extraction-results {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 0.25rem;
		padding: 0.75rem;
	}

	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.results-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.entity-count {
		font-size: 0.75rem;
		color: #059669;
		font-weight: 500;
	}

	.auto-populated-badge {
		font-size: 0.75rem;
		background: #dbeafe;
		color: #1d4ed8;
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		font-weight: 500;
	}

	.fields-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.field-icon {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.required-star {
		color: #dc2626;
	}

	.confidence-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		display: inline-block;
	}

	.field-input,
	.field-textarea {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-family: inherit;
		font-size: 0.875rem;
		box-sizing: border-box;
	}

	.field-input:focus,
	.field-textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}

	.field-input.field-error {
		border-color: #dc2626;
	}

	.field-textarea {
		resize: vertical;
		min-height: 60px;
	}

	.error-text {
		font-size: 0.75rem;
		color: #dc2626;
		margin: 0;
	}

	.form-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 1.5rem;
		border-top: 1px solid #e5e7eb;
		margin-top: 1.5rem;
	}

	.form-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.status-badge {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		background: #fef3c7;
		color: #92400e;
	}

	.status-badge.status-valid {
		background: #d1fae5;
		color: #065f46;
	}

	.field-progress {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.form-buttons {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.submit-btn {
		padding: 0.5rem 1.25rem;
		background: #2563eb;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.submit-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.fields-grid {
			grid-template-columns: 1fr;
		}

		.form-footer {
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>
