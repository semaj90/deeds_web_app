<!-- Evidence Analysis Dashboard — Upload + analyze evidence via real API pipeline -->
<!-- Session 64: Rewritten from corrupted AIEvidenceAnalyzer dep → wired to real evidence API -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { invalidateAll } from '$app/navigation';


	interface EvidenceItem {
		id: string;
		caseId: string;
		type: string;
		title: string;
		description: string;
		fileName?: string;
		fileSize?: number;
		status?: string;
		createdAt?: string;
	}

	interface AnalysisJob {
		jobType: string;
		jobId: string;
	}

	interface Props {
		caseId?: string;
		onUpload?: (item: EvidenceItem) => void;
	}


	let { caseId = '', onUpload }: Props = $props();


	let evidenceItems = $state<EvidenceItem[]>([]);
	let selectedEvidence = $state<EvidenceItem | null>(null);
	let isAnalyzing = $state(false);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let analysisJobs = $state<AnalysisJob[]>([]);
	let analysisError = $state('');
	let dropZoneActive = $state(false);

	$effect(() => {
		if (caseId) {
			loadEvidenceItems();
		}
	});

	async function loadEvidenceItems() {
		try {
			const response = await fetch('/api/evidence/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: '*',
					caseId: caseId || undefined,
					limit: 50
				})
			});

			if (response.ok) {
				const data = await response.json();
				if (data.results) {
					evidenceItems = data.results.map((r: any) => ({
						id: r.evidenceId || r.id || crypto.randomUUID(),
						caseId: caseId,
						type: r.metadata?.evidenceType || 'document',
						title: r.metadata?.fileName || 'Untitled Evidence',
						description: r.content?.substring(0, 200) || '',
						fileName: r.metadata?.fileName,
						status: 'indexed',
						createdAt: r.metadata?.uploadedAt
					}));
				}
			}
		} catch (error) {
			console.error('Failed to load evidence:', error);
		}
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			await processUploadedFile(input.files[0]);
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		dropZoneActive = false;
		if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
			await processUploadedFile(event.dataTransfer.files[0]);
		}
	}

	async function processUploadedFile(file: File) {
		isUploading = true;
		uploadProgress = 10;
		analysisError = '';

		try {
			const formData = new FormData();
			formData.append('file', file);
			if (caseId) formData.append('caseId', caseId);
			formData.append('title', file.name);
			formData.append('evidenceType', determineFileType(file));

			uploadProgress = 30;

			const response = await fetch('/api/evidence/upload', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `Upload failed (${response.status})`);
			}

			const result = await response.json();
			uploadProgress = 70;

			const newItem: EvidenceItem = {
				id: result.id,
				caseId: caseId || 'unassigned',
				type: determineFileType(file),
				title: file.name,
				description: `Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
				fileName: file.name,
				fileSize: file.size,
				status: 'uploaded',
				createdAt: new Date().toISOString()
			};

			evidenceItems = [...evidenceItems, newItem];
			uploadProgress = 100;

			if (onUpload) onUpload(newItem);
			await invalidateAll();

			await analyzeEvidence(newItem);

		} catch (error) {
			console.error('Upload failed:', error);
			analysisError = error instanceof Error ? error.message : 'Upload failed';
		} finally {
			isUploading = false;
			uploadProgress = 0;
		}
	}

	function determineFileType(file: File): string {
		if (file.type.startsWith('image/')) return 'image';
		if (file.type.startsWith('video/')) return 'video';
		if (file.type.startsWith('audio/')) return 'audio';
		if (file.type.includes('pdf') || file.type.includes('document')) return 'document';
		return 'digital';
	}

	async function analyzeEvidence(evidence: EvidenceItem) {
		isAnalyzing = true;
		selectedEvidence = evidence;
		analysisError = '';
		analysisJobs = [];

		try {
			const response = await fetch('/api/evidence/analysis', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					evidenceId: evidence.id,
					caseId: caseId || undefined,
					stages: ['entity_extraction', 'forensics', 'summarization']
				})
			});

			if (!response.ok) {
				throw new Error(`Analysis request failed (${response.status})`);
			}

			const data = await response.json();
			analysisJobs = data.enqueued || [];
		} catch (error) {
			console.error('Analysis failed:', error);
			analysisError = error instanceof Error ? error.message : 'Analysis failed';
		} finally {
			isAnalyzing = false;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dropZoneActive = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dropZoneActive = false;
	}

	function getTypeIcon(type: string): string {
		const icons: Record<string, string> = {
			document: 'DOC',
			image: 'IMG',
			video: 'VID',
			audio: 'AUD',
			digital: 'DIG',
			physical: 'PHY'
		};
		return icons[type] || 'FILE';
	}
</script>

<div class="evidence-dashboard">
	<header class="dashboard-header">
		<h1>Evidence Analysis Dashboard</h1>
		<p>Upload and analyze legal evidence using the AI pipeline (Gemma 3 Legal)</p>
	</header>

	<div class="dashboard-grid">
		<div class="evidence-panel">
			<div class="panel-header">
				<h2>Evidence Items</h2>
			</div>

			<div
				class="upload-zone"
				class:active={dropZoneActive}
				ondrop={handleDrop}
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				role="region"
				aria-label="File upload zone"
			>
				<input
					type="file"
					id="evidence-upload"
					class="file-input-hidden"
					onchange={handleFileUpload}
				/>
				<label for="evidence-upload" class="upload-label">
					<span class="upload-icon">+</span>
					<span class="upload-text">Drop evidence files here or click to upload</span>
				</label>
			</div>

			{#if isUploading}
				<div class="upload-progress">
					<div class="progress-bar-bg">
						<div class="progress-bar-fill" style="width: {uploadProgress}%"></div>
					</div>
					<span class="progress-text">Uploading... {Math.round(uploadProgress)}%</span>
				</div>
			{/if}

			{#if analysisError}
				<div class="error-msg">{analysisError}</div>
			{/if}

			<div class="evidence-list">
				{#each evidenceItems as evidence (evidence.id)}
					<button
						class="evidence-item"
						class:selected={selectedEvidence?.id === evidence.id}
						onclick={() => analyzeEvidence(evidence)}
					>
						<span class="evidence-type-badge">{getTypeIcon(evidence.type)}</span>
						<div class="evidence-info">
							<h3 class="evidence-title">{evidence.title}</h3>
							<p class="evidence-desc">{evidence.description}</p>
							<div class="evidence-meta">
								<span>Case: {evidence.caseId}</span>
								<span>Type: {evidence.type}</span>
							</div>
						</div>
						{#if selectedEvidence?.id === evidence.id && isAnalyzing}
							<div class="analyzing-spinner"></div>
						{/if}
					</button>
				{/each}

				{#if evidenceItems.length === 0}
					<p class="empty-state">No evidence items yet. Upload files to get started.</p>
				{/if}
			</div>
		</div>

		<div class="analysis-panel">
			{#if isAnalyzing}
				<div class="loading-state">
					<div class="loading-spinner"></div>
					<h2>Analyzing Evidence...</h2>
					<p>Running entity extraction, forensics, and summarization</p>
				</div>
			{:else if analysisJobs.length > 0}
				<div class="analysis-content">
					<div class="analysis-header">
						<h2>Analysis Queued</h2>
						<Button
							variant="secondary"
							onclick={() => selectedEvidence && analyzeEvidence(selectedEvidence)}
						>
							Re-analyze
						</Button>
					</div>
					<div class="jobs-list">
						{#each analysisJobs as job}
							<div class="job-card">
								<span class="job-type">{job.jobType.replace(/_/g, ' ')}</span>
								<span class="job-id">{job.jobId}</span>
								<span class="job-status">Queued</span>
							</div>
						{/each}
					</div>
					{#if selectedEvidence}
						<div class="selected-detail">
							<h3>{selectedEvidence.title}</h3>
							<p>{selectedEvidence.description}</p>
							<div class="detail-meta">
								<span>ID: {selectedEvidence.id}</span>
								<span>Type: {selectedEvidence.type}</span>
								{#if selectedEvidence.createdAt}
									<span>Uploaded: {new Date(selectedEvidence.createdAt).toLocaleDateString()}</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="empty-analysis">
					<h2>Select Evidence to Analyze</h2>
					<p>Choose an evidence item from the list or upload a new file</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.evidence-dashboard {
		min-height: 100%;
		padding: 1.5rem;
	}

	.dashboard-header {
		margin-bottom: 1.5rem;
	}

	.dashboard-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
	}

	.dashboard-header p {
		color: var(--t-text-muted, #a0a0a0);
		margin: 0;
		font-size: 0.875rem;
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 1.5rem;
	}

	.evidence-panel {
		border: 1px solid var(--t-border, rgba(255,255,255,0.1));
		border-radius: 0.5rem;
		overflow: hidden;
		background: var(--t-panel, #1a1a1a);
	}

	.panel-header {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--t-border, rgba(255,255,255,0.1));
		background: var(--t-panel-2, #2a2a2a);
	}

	.panel-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.upload-zone {
		border: 2px dashed var(--t-border, rgba(255,255,255,0.15));
		margin: 1rem;
		border-radius: 0.5rem;
		text-align: center;
		transition: all 0.2s;
	}

	.upload-zone.active {
		border-color: #3b82f6;
		background: rgba(59, 130, 246, 0.1);
	}

	.upload-label {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem;
		cursor: pointer;
		gap: 0.5rem;
	}

	.upload-icon {
		font-size: 2rem;
		color: var(--t-text-muted, #888);
	}

	.upload-text {
		font-size: 0.875rem;
		color: var(--t-text-muted, #a0a0a0);
	}

	.file-input-hidden {
		display: none;
	}

	.upload-progress {
		margin: 0 1rem 1rem;
	}

	.progress-bar-bg {
		height: 0.375rem;
		background: rgba(255,255,255,0.1);
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: #3b82f6;
		border-radius: 999px;
		transition: width 0.3s;
	}

	.progress-text {
		font-size: 0.75rem;
		color: var(--t-text-muted, #a0a0a0);
	}

	.error-msg {
		margin: 0 1rem 1rem;
		padding: 0.5rem 0.75rem;
		background: rgba(220, 38, 38, 0.1);
		border: 1px solid rgba(220, 38, 38, 0.3);
		border-radius: 0.25rem;
		color: #f87171;
		font-size: 0.875rem;
	}

	.evidence-list {
		max-height: 60vh;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.evidence-item {
		width: 100%;
		text-align: left;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--t-border, rgba(255,255,255,0.1));
		border-radius: 0.375rem;
		background: var(--t-panel, #1a1a1a);
		cursor: pointer;
		transition: all 0.2s;
		margin-bottom: 0.5rem;
	}

	.evidence-item:hover {
		background: var(--t-panel-2, #2a2a2a);
		border-color: var(--t-border, rgba(255,255,255,0.15));
	}

	.evidence-item.selected {
		background: rgba(59, 130, 246, 0.1);
		border-color: #3b82f6;
	}

	.evidence-type-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.375rem;
		background: rgba(255,255,255,0.08);
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--t-text-muted, #a0a0a0);
		flex-shrink: 0;
	}

	.evidence-info {
		flex: 1;
		min-width: 0;
	}

	.evidence-title {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.evidence-desc {
		font-size: 0.75rem;
		color: var(--t-text-muted, #a0a0a0);
		margin: 0 0 0.375rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.evidence-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.625rem;
		color: var(--t-text-muted, #888);
	}

	.analyzing-spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid rgba(255,255,255,0.15);
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		flex-shrink: 0;
	}

	.empty-state {
		padding: 2rem;
		text-align: center;
		color: var(--t-text-muted, #888);
		font-size: 0.875rem;
	}

	.analysis-panel {
		border: 1px solid var(--t-border, rgba(255,255,255,0.1));
		border-radius: 0.5rem;
		background: var(--t-panel, #1a1a1a);
		min-height: 400px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 400px;
		text-align: center;
	}

	.loading-spinner {
		width: 3rem;
		height: 3rem;
		border: 4px solid rgba(255,255,255,0.15);
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	.loading-state h2 {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}

	.loading-state p {
		color: var(--t-text-muted, #a0a0a0);
		font-size: 0.875rem;
		margin: 0;
	}

	.analysis-content {
		padding: 1.25rem;
	}

	.analysis-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.analysis-header h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.jobs-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.job-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: var(--t-panel-2, #2a2a2a);
		border: 1px solid var(--t-border, rgba(255,255,255,0.1));
		border-radius: 0.375rem;
	}

	.job-type {
		font-weight: 600;
		font-size: 0.875rem;
		text-transform: capitalize;
	}

	.job-id {
		font-family: monospace;
		font-size: 0.75rem;
		color: var(--t-text-muted, #a0a0a0);
		flex: 1;
	}

	.job-status {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		background: rgba(59, 130, 246, 0.2);
		color: #60a5fa;
		border-radius: 999px;
		font-weight: 500;
	}

	.selected-detail {
		padding: 1rem;
		background: var(--t-panel-2, #2a2a2a);
		border: 1px solid var(--t-border, rgba(255,255,255,0.1));
		border-radius: 0.375rem;
	}

	.selected-detail h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		font-weight: 600;
	}

	.selected-detail p {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		color: var(--t-text, #e0e0e0);
	}

	.detail-meta {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--t-text-muted, #a0a0a0);
	}

	.empty-analysis {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 400px;
		text-align: center;
	}

	.empty-analysis h2 {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
		color: var(--t-text-muted, #a0a0a0);
	}

	.empty-analysis p {
		color: var(--t-text-muted, #888);
		font-size: 0.875rem;
		margin: 0;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
