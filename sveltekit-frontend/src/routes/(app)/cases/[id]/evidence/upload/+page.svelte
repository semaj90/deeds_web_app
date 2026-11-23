<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { CacheInvalidation } from '$lib/cache/cache-invalidation';
	import { detectSensitiveInfo, type SensitiveInfoHit } from '$lib/utils/sensitive-info-detector.js';
	import { admitEvidenceProgressEventV1, caseEvidenceProgressEventUrlV1 } from '$lib/components/evidence/evidence-progress-event-client-v1.js';

	interface UploadProgress {
		key: number;
		fileName: string;
		evidenceId?: string;
		progress: number;
		status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
		error?: string;
		requiresSignIn?: boolean;
		piiWarnings?: SensitiveInfoHit[];
	}

	const caseId = $derived(page.params.id);

	function openExhibitInDetectiveMode(event: MouseEvent, href: string) {
		event.preventDefault();
		void goto(href);
	}
	let uploads: UploadProgress[] = $state([]);
	let isDragging = $state(false);
	let ready = $state(false);
	let nextUploadKey = 0;
	let activeSources: EventSource[] = [];

	onMount(() => { ready = true; });

	onDestroy(() => {
		activeSources.forEach((es) => es.close());
		activeSources = [];
	});

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (files) {
			await uploadFiles(Array.from(files));
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			uploadFiles(Array.from(input.files));
		}
	}

	/** Scan a text-based file for PII before upload */
	async function scanForPII(file: File): Promise<SensitiveInfoHit[]> {
		// Only scan text-extractable files under 2MB
		if (file.size > 2 * 1024 * 1024) return [];
		if (!file.type.includes('text') && file.type !== 'application/pdf') return [];
		try {
			const text = await file.text();
			return detectSensitiveInfo(text);
		} catch {
			return []; // Binary file or read error — skip scan
		}
	}

	let piiDismissed = $state<Set<number>>(new Set());

	function dismissPII(key: number) {
		piiDismissed = new Set([...piiDismissed, key]);
	}

	async function uploadFiles(files: File[]) {
		for (const file of files) {
			const key = nextUploadKey++;
			const validation = validateFile(file);
			if (!validation.valid) {
				uploads = [
					...uploads,
					{
						key,
						fileName: file.name,
						progress: 0,
						status: 'error',
						error: validation.error
					}
				];
				continue;
			}

			// Pre-upload PII scan
			const piiHits = await scanForPII(file);

			uploads = [
				...uploads,
				{
					key,
					fileName: file.name,
					progress: 0,
					status: 'pending',
					piiWarnings: piiHits.length > 0 ? piiHits : undefined
				}
			];

			uploadFile(file, uploads[uploads.length - 1]);
		}
	}

	function validateFile(file: File): { valid: boolean; error?: string } {
		const maxSize = 100 * 1024 * 1024; // 100MB
		const allowedTypes = [
			'application/pdf',
			'image/png',
			'image/jpeg',
			'image/tiff',
			'application/x-tiff',
			'video/mp4',
			'video/quicktime',
			'video/webm',
			'video/x-msvideo',
			'video/x-matroska',
			'audio/wav',
			'audio/x-wav',
			'audio/mpeg',
			'audio/mp3'
		];

		if (file.size > maxSize) {
			return { valid: false, error: 'File size exceeds 100MB limit' };
		}

		const isAllowedType = allowedTypes.includes(file.type) ||
			/\.(pdf|png|jpe?g|tiff?|mp4|mov|webm|avi|mkv|wav|mp3)$/i.test(file.name);

		if (!isAllowedType) {
			return { valid: false, error: 'File type not supported (PDF, PNG, JPG, MP4, MOV, WEBM, WAV)' };
		}

		return { valid: true };
	}

	function uploadFile(file: File, row: UploadProgress): void {
		const uploadCaseId = caseId;
		try {
			row.status = 'uploading';
			row.progress = 0;

			const formData = new FormData();
			formData.append('file', file);
			formData.append('case_id', uploadCaseId);
			formData.append('enableAiAnalysis', 'true');
			formData.append('enableOcr', 'true');
			formData.append('enableEmbeddings', 'true');
			formData.append('enableSummarization', 'true');

			const xhr = new XMLHttpRequest();

			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable) {
					const progress = Math.round((e.loaded / e.total) * 100);
					row.progress = progress;
				}
			});

			xhr.addEventListener('load', async () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const result = JSON.parse(xhr.responseText);
						const evidenceId = typeof result.id === 'string' ? result.id : result.evidenceId;
						if (typeof evidenceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceId)) {
							throw new Error('Upload response did not include a valid saved evidence ID.');
						}
						row.evidenceId = evidenceId;
						if (typeof result.jobId !== 'string') throw new Error('Upload accepted without a processing job ID.');
						row.status = 'processing';
						row.progress = 60;
						connectSSE(uploadCaseId, result.jobId, row);
					} catch (error) {
						row.status = 'error';
						row.error = error instanceof Error ? error.message : 'Upload response was invalid.';
					}

					await CacheInvalidation.invalidateEvidence(uploadCaseId);
				} else {
					row.status = 'error';
					let serverMessage = '';
					try {
						const response = JSON.parse(xhr.responseText);
						serverMessage = typeof response.error === 'string' ? response.error : '';
					} catch { /* use status fallback */ }
					row.error = xhr.status === 401
						? 'This tab did not send a valid sign-in session to the upload service. Confirm you are on the same app address and sign in again; then choose the file again to retry.'
						: serverMessage || `Upload failed (${xhr.status}${xhr.statusText ? `: ${xhr.statusText}` : ''}).`;
					row.requiresSignIn = xhr.status === 401;
				}
			});

			xhr.addEventListener('error', () => {
				row.status = 'error';
				row.error = 'Network error during upload';
			});

			xhr.open('POST', '/api/evidence/upload');
			xhr.withCredentials = true;
			xhr.send(formData);
		} catch (error) {
			row.status = 'error';
			row.error = error instanceof Error ? error.message : 'Unknown error';
		}
	}

	function connectSSE(caseId: string, jobId: string, row: UploadProgress) {
		let lastSequence = 0n;
		let streamUrl: string;
		try {
			streamUrl = caseEvidenceProgressEventUrlV1(caseId, jobId);
		} catch {
			row.status = 'error';
			row.error = 'The case or processing job identity is invalid.';
			return;
		}
		const es = new EventSource(streamUrl);
		activeSources.push(es);

		es.addEventListener('analysis-progress', (event) => {
			const admitted = admitEvidenceProgressEventV1({
				lastEventId: (event as MessageEvent<string>).lastEventId,
				data: (event as MessageEvent<string>).data,
				jobId,
				caseId,
				lastSequence,
			});
			if (!admitted.accepted || admitted.envelope.evidenceId !== row.evidenceId) return;

			lastSequence = admitted.sequence;
			const { status, progress } = admitted.envelope;
			row.progress = status === 'completed' ? 100 : progress;
			if (status === 'completed') {
				row.status = 'completed';
				es.close();
			} else if (status === 'failed') {
				row.status = 'error';
				row.error = 'Evidence processing failed.';
				es.close();
			} else {
				row.status = 'processing';
			}
		});

		es.addEventListener('stream-ended', () => {
			row.status = 'error';
			row.error = 'Case access changed or progress history is unavailable.';
			es.close();
		});

		es.addEventListener('stream-error', () => {
			row.status = 'error';
			row.error = 'Evidence progress could not be verified.';
			es.close();
		});

		es.onerror = () => {
			// Preserve native EventSource reconnect and Last-Event-ID while connecting.
			if (es.readyState === EventSource.CLOSED && row.status === 'processing') {
				row.status = 'error';
				row.error = 'Progress connection closed before completion was verified.';
			}
		};
	}

	function clearCompleted() {
		uploads = uploads.filter((u) => u.status !== 'completed');
	}
</script>

<div class="upload-container">
	<div class="upload-header">
		<h1>Upload Evidence</h1>
		<p>Upload legal documents: PDFs, images, or scans for case analysis</p>
	</div>

	<!-- Drop Zone -->
	<div
		class="drop-zone"
		class:dragging={isDragging}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		role="region"
		aria-label="File drop zone"
	>
		<div class="drop-content">
			<div class="drop-icon">+</div>
			<h2>Drag & drop files here</h2>
			<p>or</p>
			<label class="file-input-label">
				<span>Browse Files</span>
				<input
					type="file"
					multiple
					accept=".pdf,.png,.jpg,.jpeg,.tiff,.mp4,.mov,.webm,.avi,.mkv,.wav,.mp3,video/*,audio/*,image/*"
					onchange={handleFileSelect}
					disabled={!ready}
				/>
			</label>
			<p class="file-info">Supported: PDF, PNG, JPG, TIFF, MP4, MOV, WEBM, WAV (max 100MB each)</p>
		</div>
	</div>

	<!-- Upload Progress -->
	{#if uploads.length > 0}
		<div class="uploads-section">
			<div class="uploads-header">
				<h3>Upload Progress</h3>
				{#if uploads.some((u) => u.status === 'completed')}
					<button class="clear-btn" onclick={clearCompleted}>Clear Completed</button>
				{/if}
			</div>

			<div class="uploads-list">
				{#each uploads as upload (upload.key)}
					<div
						class="upload-item"
						class:processing={upload.status === 'processing'}
						class:completed={upload.status === 'completed'}
						class:error={upload.status === 'error'}
					>
						<div class="upload-info">
							<div class="file-name">{upload.fileName}</div>
							{#if upload.piiWarnings && upload.piiWarnings.length > 0 && !piiDismissed.has(upload.key)}
								<div class="pii-warning">
									<strong>Sensitive info detected:</strong>
									{upload.piiWarnings.length} item{upload.piiWarnings.length > 1 ? 's' : ''} found
									({upload.piiWarnings.map(h => h.type).filter((v, i, a) => a.indexOf(v) === i).join(', ')})
									<button class="pii-dismiss" onclick={() => dismissPII(upload.key)}>Dismiss</button>
								</div>
							{/if}
							{#if upload.status === 'error'}
								<div class="error-message">{upload.error}</div>
								{#if upload.requiresSignIn}
									<a class="place-in-scene-link" href={`/login?force=1&redirect=${encodeURIComponent(`/cases/${caseId}/evidence/upload`)}`} target="_blank" rel="noreferrer">
										Sign in in a new tab, then return here to retry
									</a>
								{/if}
							{:else}
								<div class="progress-bar" role="progressbar" aria-label={`Progress for ${upload.fileName}`} aria-valuenow={upload.progress}>
									<div class="progress-fill" style="width: {upload.progress}%"></div>
								</div>
								<div class="progress-text" role="status">
									{#if upload.status === 'processing'}
										Analyzing evidence… {upload.progress}%
									{:else}
										{upload.progress}%
									{/if}
								</div>
							{/if}
							{#if upload.evidenceId}
								<a class="place-in-scene-link" aria-label={`Place in scene: ${upload.fileName}`} href={`/cases/${encodeURIComponent(caseId)}/board?view=detective&evidenceId=${encodeURIComponent(upload.evidenceId)}`} onclick={(event) => openExhibitInDetectiveMode(event, `/cases/${encodeURIComponent(caseId)}/board?view=detective&evidenceId=${encodeURIComponent(upload.evidenceId)}`)}>
									Place in scene · open in Detective Mode
								</a>
							{/if}
						</div>
						<div class="status-icon">
							{#if upload.status === 'pending'}
								<span class="spinner">...</span>
							{:else if upload.status === 'uploading'}
								<span class="spinner">^</span>
							{:else if upload.status === 'processing'}
								<span class="spinner">*</span>
							{:else if upload.status === 'completed'}
								<span>[ok]</span>
							{:else if upload.status === 'error'}
								<span>[x]</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Info Box -->
	<div class="info-box">
		<h3>What happens next?</h3>
		<ul>
			<li>Files are uploaded to secure storage</li>
			<li>Documents are parsed with AI-powered OCR</li>
			<li>Text is extracted and analyzed for entities and relationships</li>
			<li>Embeddings are generated for semantic search</li>
			<li>You can search and analyze evidence immediately</li>
		</ul>
	</div>
</div>

<style>
	.upload-container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	.upload-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.upload-header h1 {
		font-size: 2rem;
		color: #00d4ff;
		margin-bottom: 0.5rem;
	}

	.upload-header p {
		color: #a0a0a0;
		font-size: 1rem;
	}

	.drop-zone {
		border: 3px dashed #00d4ff;
		border-radius: 8px;
		padding: 3rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s;
		background: rgba(0, 212, 255, 0.05);
		margin-bottom: 2rem;
	}

	.drop-zone.dragging {
		background: rgba(0, 212, 255, 0.15);
		border-color: #00ff00;
		transform: scale(1.02);
	}

	.drop-content {
		pointer-events: none;
	}

	.drop-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.drop-zone h2 {
		color: #e0e0e0;
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.drop-zone p {
		color: #a0a0a0;
		margin: 0.5rem 0;
	}

	.file-input-label {
		display: inline-block;
		background: #00d4ff;
		color: #1a1a2e;
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
		margin: 1rem 0;
		transition: all 0.3s;
	}

	.file-input-label:hover {
		background: #00ff00;
		transform: scale(1.05);
	}

	.file-input-label input {
		display: none;
	}

	.file-info {
		font-size: 0.9rem;
		color: #808080;
		margin-top: 1rem;
	}

	.uploads-section {
		background: rgba(0, 212, 255, 0.05);
		border: 1px solid #00d4ff;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	.uploads-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.uploads-header h3 {
		color: #00d4ff;
		margin: 0;
	}

	.clear-btn {
		background: #ff6b6b;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.clear-btn:hover {
		background: #ff5252;
	}

	.uploads-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.upload-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: rgba(0, 0, 0, 0.3);
		border-left: 3px solid #00d4ff;
		padding: 1rem;
		border-radius: 4px;
		transition: all 0.3s;
	}

	.upload-item.completed {
		border-left-color: #00ff00;
		opacity: 0.7;
	}

	.place-in-scene-link {
		display: inline-flex;
		margin-top: 0.55rem;
		color: #d4b66f;
		font-size: 0.82rem;
		font-weight: 650;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.upload-item.error {
		border-left-color: #ff6b6b;
	}

	.upload-info {
		flex: 1;
	}

	.file-name {
		color: #e0e0e0;
		font-weight: bold;
		margin-bottom: 0.5rem;
		word-break: break-all;
	}

	.progress-bar {
		width: 100%;
		height: 6px;
		background: rgba(0, 212, 255, 0.2);
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 0.25rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #47846e, #94d5b8);
		transition: width 0.3s;
	}

	.upload-item.processing .progress-fill {
		animation: progress-glow 2s ease-in-out infinite alternate;
	}

	@keyframes progress-glow {
		to { filter: brightness(1.22); }
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-fill, .upload-item.processing .progress-fill, .spinner {
			animation: none;
			transition: none;
		}
	}

	.progress-text {
		font-size: 0.8rem;
		color: #a0a0a0;
	}

	.error-message {
		color: #ff6b6b;
		font-size: 0.9rem;
	}

	.pii-warning {
		background: rgba(255, 165, 0, 0.15);
		border: 1px solid rgba(255, 165, 0, 0.4);
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
		color: #ffa500;
	}

	.pii-dismiss {
		margin-left: 0.75rem;
		background: transparent;
		border: 1px solid rgba(255, 165, 0, 0.4);
		color: #ffa500;
		padding: 0.15rem 0.5rem;
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.pii-dismiss:hover {
		background: rgba(255, 165, 0, 0.2);
	}

	.status-icon {
		font-size: 1.5rem;
		margin-left: 1rem;
	}

	.spinner {
		display: inline-block;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.info-box {
		background: rgba(0, 212, 255, 0.05);
		border-left: 4px solid #00d4ff;
		padding: 1.5rem;
		border-radius: 4px;
	}

	.info-box h3 {
		color: #00d4ff;
		margin-top: 0;
	}

	.info-box ul {
		color: #a0a0a0;
		margin: 0;
		padding-left: 1.5rem;
	}

	.info-box li {
		margin-bottom: 0.5rem;
	}
</style>
