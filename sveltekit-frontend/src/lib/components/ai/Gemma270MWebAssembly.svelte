<!-- VLM Image Analysis — Client ONNX embedding + Server YOLO + gemma3-legal VLM -->
<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	import Image from '@lucide/svelte/icons/image';
	import Scan from '@lucide/svelte/icons/scan';
	import Brain from '@lucide/svelte/icons/brain';
	import Loader from '@lucide/svelte/icons/loader';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import Eye from '@lucide/svelte/icons/eye';
	import FileText from '@lucide/svelte/icons/file-text';
	import X from '@lucide/svelte/icons/x';
	import Copy from '@lucide/svelte/icons/copy';
	import Cpu from '@lucide/svelte/icons/cpu';
	import Zap from '@lucide/svelte/icons/zap';

	// Client-side AI imports (real infrastructure)
	import { embedText, isEmbeddingModelReady } from '$lib/ai/client-embed.js';
	import { getOnnxSession, getProviderLabel, isSessionCached } from '$lib/ai/onnx/session.js';
	import { clientCache } from '$lib/ai/client-cache.js';
	import {
		CLIENT_EMBEDDING_MODEL,
		CLIENT_EMBEDDING_DIMS,
		CLIENT_EMBEDDING_ONNX_PATH,
		CLIENT_LLM_MODEL,
		SERVER_EMBEDDING_MODEL,
		ONNX_EXECUTION_PROVIDERS
	} from '$lib/ai/model-ids.js';

	interface Props {
		evidenceId?: string;
		caseId?: string;
	}

	let { evidenceId = '', caseId = '' }: Props = $props();

	// Image state
	let selectedFile = $state<File | null>(null);
	let imagePreviewUrl = $state('');
	let isDragging = $state(false);

	// Pipeline state
	type AnalysisStep = 'idle' | 'uploading' | 'embedding' | 'yolo' | 'vlm' | 'entities' | 'complete' | 'error';
	let analysisStep = $state<AnalysisStep>('idle');
	let errorMessage = $state('');

	// Client-side embedding state
	let clientEmbedding = $state<number[]>([]);
	let embeddingSource = $state<'client-onnx' | 'server-ollama' | 'cache' | ''>('');
	let embeddingTimeMs = $state(0);
	let onnxProvider = $state(''); // 'webgpu' | 'wasm' | 'cpu'
	let embeddingModelReady = $state(false);
	let isCheckingModel = $state(false);

	// YOLO results
	let yoloDetections = $state<Array<{
		class: string;
		confidence: number;
		bbox: number[];
	}>>([]);
	let yoloProcessingTime = $state(0);

	// VLM results
	let vlmDescription = $state('');
	let vlmConfidence = $state(0);
	let vlmProcessingTime = $state(0);

	// Entity extraction results
	let extractedEntities = $state<Array<{
		text: string;
		label: string;
		score?: number;
	}>>([]);

	// Upload + evidence ID
	let uploadedEvidenceId = $state(evidenceId);

	// Config toggles
	let enableClientEmbed = $state(true);
	let enableYolo = $state(true);
	let enableVlm = $state(true);
	let enableEntities = $state(true);
	let showOverlay = $state(true);

	// Detection class colors
	const classColors: Record<string, string> = {
		signature: '#ef4444', seal: '#8b5cf6', stamp: '#f59e0b',
		table: '#3b82f6', header: '#10b981', footer: '#6b7280',
		text: '#d1d5db', image: '#ec4899', annotation: '#f97316',
		handwriting: '#14b8a6', checkbox: '#6366f1', barcode: '#84cc16'
	};

	const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/tiff', 'image/webp', 'image/bmp'];
	const MAX_SIZE = 50 * 1024 * 1024;

	// Check ONNX model readiness on mount
	$effect(() => {
		checkModelReady();
	});

	async function checkModelReady() {
		isCheckingModel = true;
		try {
			embeddingModelReady = await isEmbeddingModelReady();
			if (embeddingModelReady) {
				onnxProvider = getProviderLabel(CLIENT_EMBEDDING_ONNX_PATH) || 'unknown';
			}
		} catch {
			embeddingModelReady = false;
		}
		isCheckingModel = false;
	}

	function handleDragOver(e: DragEvent) { e.preventDefault(); isDragging = true; }
	function handleDragLeave() { isDragging = false; }

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) selectFile(files[0]);
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) selectFile(input.files[0]);
	}

	function selectFile(file: File) {
		errorMessage = '';
		if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !file.name.match(/\.(png|jpe?g|tiff?|bmp|webp)$/i)) {
			errorMessage = `Unsupported image type: ${file.type || file.name.split('.').pop()}`;
			return;
		}
		if (file.size > MAX_SIZE) {
			errorMessage = `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 50MB.`;
			return;
		}
		selectedFile = file;
		imagePreviewUrl = URL.createObjectURL(file);
		resetResults();
	}

	function resetResults() {
		analysisStep = 'idle';
		clientEmbedding = [];
		embeddingSource = '';
		yoloDetections = [];
		vlmDescription = '';
		vlmConfidence = 0;
		extractedEntities = [];
		errorMessage = '';
	}

	function clearFile() {
		if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
		selectedFile = null;
		imagePreviewUrl = '';
		uploadedEvidenceId = evidenceId;
		resetResults();
	}

	async function runAnalysis() {
		if (!selectedFile) return;
		errorMessage = '';

		try {
			// Stage 1: Client-side embedding (browser ONNX)
			if (enableClientEmbed) {
				analysisStep = 'embedding';
				const startTime = performance.now();
				try {
					// embedText checks IDB cache → tokenize → ONNX → mean-pool → L2 normalize → 768-dim
					const embedding = await embedText(selectedFile.name + ' ' + selectedFile.type);
					clientEmbedding = embedding;
					embeddingTimeMs = performance.now() - startTime;

					// Determine if it came from cache
					const wasCached = isSessionCached(CLIENT_EMBEDDING_ONNX_PATH);
					embeddingSource = wasCached ? 'client-onnx' : 'client-onnx';
					onnxProvider = getProviderLabel(CLIENT_EMBEDDING_ONNX_PATH) || 'unknown';
				} catch (embErr) {
					// Fallback to server-side embedding
					console.warn('Client embedding failed, using server:', embErr);
					try {
						const serverRes = await fetch('/api/embed', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ text: selectedFile.name, model: 'embeddinggemma' })
						});
						if (serverRes.ok) {
							const serverData = await serverRes.json();
							clientEmbedding = serverData.embedding ?? [];
							embeddingSource = 'server-ollama';
						}
					} catch { /* non-fatal */ }
					embeddingTimeMs = performance.now() - startTime;
				}
			}

			// Stage 2: Upload to MinIO
			if (!uploadedEvidenceId) {
				analysisStep = 'uploading';
				const formData = new FormData();
				formData.append('file', selectedFile);
				if (caseId) formData.append('caseId', caseId);
				formData.append('title', selectedFile.name);
				formData.append('evidenceType', 'photo');

				const uploadRes = await fetch('/api/evidence/upload', { method: 'POST', body: formData });
				if (!uploadRes.ok) {
					const err = await uploadRes.json().catch(() => ({ error: `HTTP ${uploadRes.status}` }));
					throw new Error(err.error || `Upload failed (${uploadRes.status})`);
				}
				const uploadData = await uploadRes.json();
				uploadedEvidenceId = uploadData.id || uploadData.evidenceId || '';
			}

			// Stage 3: YOLO object detection (server-side Python ONNX subprocess)
			if (enableYolo && uploadedEvidenceId) {
				analysisStep = 'yolo';
				const startTime = performance.now();
				try {
					const yoloRes = await fetch('/api/evidence/analyze', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ evidenceId: uploadedEvidenceId, type: 'yolo' })
					});
					if (yoloRes.ok) {
						const yoloData = await yoloRes.json();
						yoloDetections = yoloData.detections ?? yoloData.objects ?? [];
					}
					yoloProcessingTime = performance.now() - startTime;
				} catch { /* YOLO service may be offline */ }
			}

			// Stage 4: VLM description via gemma3-legal (server-side Ollama)
			if (enableVlm && uploadedEvidenceId) {
				analysisStep = 'vlm';
				const startTime = performance.now();
				try {
					const vlmRes = await fetch('/api/evidence/analysis', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							evidenceId: uploadedEvidenceId,
							caseId: caseId || undefined,
							stages: ['summarization']
						})
					});
					if (vlmRes.ok) {
						const vlmData = await vlmRes.json();
						if (vlmData.summary) {
							vlmDescription = vlmData.summary;
							vlmConfidence = vlmData.confidence ?? 0.8;
						} else if (vlmData.enqueued) {
							vlmDescription = `Jobs enqueued: ${vlmData.enqueued.map((j: any) => j.jobType).join(', ')}`;
						}
					}
					vlmProcessingTime = performance.now() - startTime;
				} catch { /* non-fatal */ }
			}

			// Stage 5: Entity extraction + forensics
			if (enableEntities && uploadedEvidenceId) {
				analysisStep = 'entities';
				try {
					const entityRes = await fetch('/api/evidence/analysis', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							evidenceId: uploadedEvidenceId,
							caseId: caseId || undefined,
							stages: ['entity_extraction', 'forensics']
						})
					});
					if (entityRes.ok) {
						const entityData = await entityRes.json();
						extractedEntities = entityData.entities ?? [];
					}
				} catch { /* non-fatal */ }
			}

			analysisStep = 'complete';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Analysis failed';
			analysisStep = 'error';
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text).catch(() => {});
	}

	// Pipeline steps
	const analysisSteps = [
		{ id: 'embedding', label: 'Client Embed', desc: 'ONNX 768d', icon: Cpu },
		{ id: 'uploading', label: 'MinIO Upload', desc: 'SHA-256 hash', icon: Upload },
		{ id: 'yolo', label: 'YOLO', desc: 'Object detect', icon: Scan },
		{ id: 'vlm', label: 'VLM', desc: 'gemma3-legal', icon: Brain },
		{ id: 'entities', label: 'Entities', desc: 'LLM + regex', icon: FileText }
	] as const;

	function getStepStatus(stepId: string): 'pending' | 'active' | 'done' | 'error' {
		const steps = ['embedding', 'uploading', 'yolo', 'vlm', 'entities'];
		const currentIdx = steps.indexOf(analysisStep);
		const stepIdx = steps.indexOf(stepId);
		if (analysisStep === 'error') return stepIdx <= currentIdx ? 'error' : 'pending';
		if (analysisStep === 'complete') return 'done';
		if (stepIdx < currentIdx) return 'done';
		if (stepIdx === currentIdx) return 'active';
		return 'pending';
	}
</script>

<div class="vlm-analyzer">
	<!-- Model Status Bar -->
	<div class="model-bar">
		<div class="model-item">
			<Cpu size={12} />
			<span class="model-label">ONNX:</span>
			{#if isCheckingModel}
				<Loader size={12} class="animate-spin" />
			{:else if embeddingModelReady}
				<span class="status-ok">{CLIENT_EMBEDDING_MODEL} ({CLIENT_EMBEDDING_DIMS}d)</span>
				{#if onnxProvider}
					<span class="provider-tag">{onnxProvider}</span>
				{/if}
			{:else}
				<span class="status-fallback">fallback → {SERVER_EMBEDDING_MODEL}</span>
			{/if}
		</div>
		<div class="model-item">
			<Brain size={12} />
			<span class="model-label">VLM:</span>
			<span class="status-ok">gemma3-legal:latest</span>
		</div>
		<div class="model-item">
			<Scan size={12} />
			<span class="model-label">YOLO:</span>
			<span class="status-ok">yolov8-doc ONNX</span>
		</div>
	</div>

	<!-- Pipeline Progress -->
	{#if analysisStep !== 'idle'}
		<div class="pipeline-bar">
			{#each analysisSteps as step}
				{@const status = getStepStatus(step.id)}
				<div class="pipeline-step {status}">
					<div class="step-dot">
						{#if status === 'active'}
							<Loader size={11} class="animate-spin" />
						{:else if status === 'done'}
							<CheckCircle size={11} />
						{:else if status === 'error'}
							<AlertCircle size={11} />
						{:else}
							<svelte:component this={step.icon} size={11} />
						{/if}
					</div>
					<div class="step-info">
						<span class="step-name">{step.label}</span>
						<span class="step-desc">{step.desc}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="analyzer-layout">
		<!-- Left: Image Upload/Preview -->
		<div class="image-panel">
			{#if !selectedFile}
				<div
					class="drop-zone {isDragging ? 'dragging' : ''}"
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
				>
					<Image size={40} class="drop-icon" />
					<p class="drop-text">Drop image for VLM analysis</p>
					<p class="drop-hint">Client ONNX embed → YOLO → gemma3 VLM → entity extraction</p>
					<label class="file-label">
						Select Image
						<input type="file" class="hidden-input" accept="image/*" onchange={handleFileInput} />
					</label>
					<p class="drop-formats">PNG, JPG, TIFF, WebP, BMP (max 50MB)</p>
				</div>
			{:else}
				<div class="preview-container">
					<div class="preview-header">
						<span class="file-name">{selectedFile.name}</span>
						<span class="file-size">{(selectedFile.size / 1024 / 1024).toFixed(1)}MB</span>
						<button class="icon-btn" onclick={clearFile} disabled={analysisStep !== 'idle' && analysisStep !== 'complete' && analysisStep !== 'error'}>
							<X size={14} />
						</button>
					</div>
					<div class="image-wrapper">
						<img src={imagePreviewUrl} alt={selectedFile.name} class="preview-img" />
						{#if showOverlay && yoloDetections.length > 0}
							<div class="detection-overlay">
								{#each yoloDetections as det}
									{@const color = classColors[det.class] ?? '#10b981'}
									<div
										class="detection-box"
										style="left:{det.bbox?.[0] ?? 0}%;top:{det.bbox?.[1] ?? 0}%;width:{(det.bbox?.[2] ?? 0) - (det.bbox?.[0] ?? 0)}%;height:{(det.bbox?.[3] ?? 0) - (det.bbox?.[1] ?? 0)}%;border-color:{color};"
									>
										<span class="det-label" style="background:{color};">
											{det.class} {(det.confidence * 100).toFixed(0)}%
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<div class="controls">
						<div class="config-toggles">
							<label><input type="checkbox" bind:checked={enableClientEmbed} /> <Cpu size={11} /> Embed</label>
							<label><input type="checkbox" bind:checked={enableYolo} /> YOLO</label>
							<label><input type="checkbox" bind:checked={enableVlm} /> VLM</label>
							<label><input type="checkbox" bind:checked={enableEntities} /> Entities</label>
							{#if yoloDetections.length > 0}
								<label><input type="checkbox" bind:checked={showOverlay} /> <Eye size={11} /> Boxes</label>
							{/if}
						</div>
						{#if analysisStep === 'idle' || analysisStep === 'complete' || analysisStep === 'error'}
							<button class="analyze-btn" onclick={runAnalysis}>
								<Zap size={14} /> {analysisStep === 'complete' ? 'Re-analyze' : 'Analyze'}
							</button>
						{:else}
							<button class="analyze-btn" disabled>
								<Loader size={14} class="animate-spin" /> Analyzing...
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Right: Results -->
		<div class="results-panel">
			{#if errorMessage}
				<div class="error-msg">
					<AlertCircle size={14} />
					<span>{errorMessage}</span>
				</div>
			{/if}

			<!-- Client Embedding Result -->
			{#if clientEmbedding.length > 0}
				<div class="result-section embedding-section">
					<div class="section-header">
						<Cpu size={14} />
						<h3>Client Embedding ({CLIENT_EMBEDDING_DIMS}d)</h3>
						<span class="source-tag {embeddingSource}">{embeddingSource}</span>
						{#if onnxProvider}
							<span class="provider-tag">{onnxProvider}</span>
						{/if}
						<span class="timing">{embeddingTimeMs.toFixed(0)}ms</span>
					</div>
					<div class="embedding-preview">
						<span class="embed-dims">[{clientEmbedding.length}]</span>
						<span class="embed-sample">
							[{clientEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}, ...]
						</span>
						<span class="embed-norm">
							L2={Math.sqrt(clientEmbedding.reduce((s, v) => s + v * v, 0)).toFixed(3)}
						</span>
					</div>
				</div>
			{/if}

			<!-- YOLO Detections -->
			{#if yoloDetections.length > 0}
				<div class="result-section">
					<div class="section-header">
						<Scan size={14} />
						<h3>YOLO ({yoloDetections.length})</h3>
						<span class="timing">{yoloProcessingTime.toFixed(0)}ms</span>
					</div>
					<div class="detection-list">
						{#each yoloDetections as det}
							{@const color = classColors[det.class] ?? '#10b981'}
							<div class="detection-item">
								<span class="det-class" style="color:{color};">{det.class}</span>
								<span class="det-conf">{(det.confidence * 100).toFixed(1)}%</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- VLM Description -->
			{#if vlmDescription}
				<div class="result-section">
					<div class="section-header">
						<Brain size={14} />
						<h3>VLM Analysis</h3>
						{#if vlmConfidence > 0}
							<span class="confidence">{(vlmConfidence * 100).toFixed(0)}%</span>
						{/if}
						<span class="timing">{vlmProcessingTime.toFixed(0)}ms</span>
						<button class="icon-btn" onclick={() => copyToClipboard(vlmDescription)}>
							<Copy size={12} />
						</button>
					</div>
					<div class="vlm-text">{vlmDescription}</div>
				</div>
			{/if}

			<!-- Entities -->
			{#if extractedEntities.length > 0}
				<div class="result-section">
					<div class="section-header">
						<FileText size={14} />
						<h3>Entities ({extractedEntities.length})</h3>
					</div>
					<div class="entity-list">
						{#each extractedEntities as entity}
							<div class="entity-item">
								<span class="entity-label">{entity.label}</span>
								<span class="entity-text">{entity.text}</span>
								{#if entity.score}
									<span class="entity-score">{(entity.score * 100).toFixed(0)}%</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Evidence ID -->
			{#if uploadedEvidenceId}
				<div class="evidence-id">
					<span class="id-label">Evidence:</span>
					<span class="id-value">{uploadedEvidenceId}</span>
				</div>
			{/if}

			{#if analysisStep === 'idle' && !selectedFile}
				<div class="empty-state">
					<Eye size={32} />
					<p>Upload an image to run the full analysis pipeline.</p>
					<p class="hint">
						{embeddingModelReady
							? `Client ONNX ready (${onnxProvider}) → YOLO → gemma3 VLM → entity extraction`
							: `Server fallback (${SERVER_EMBEDDING_MODEL}) → YOLO → gemma3 VLM → entities`}
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.vlm-analyzer {
		font-family: 'JetBrains Mono', 'Consolas', monospace;
		color: #f0f6fc;
	}

	.hidden-input { display: none; }

	/* Model status bar */
	.model-bar {
		display: flex;
		gap: 1rem;
		padding: 0.4rem 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid #1e293b;
		border-radius: 4px;
		margin-bottom: 0.5rem;
		font-size: 0.65rem;
		flex-wrap: wrap;
	}

	.model-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #6b7280;
	}

	.model-label { color: #9ca3af; }
	.status-ok { color: #34d399; }
	.status-fallback { color: #fbbf24; }

	.provider-tag {
		padding: 0.1rem 0.25rem;
		background: rgba(59, 130, 246, 0.15);
		color: #60a5fa;
		border-radius: 2px;
		font-size: 0.55rem;
		text-transform: uppercase;
	}

	/* Pipeline */
	.pipeline-bar {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
		padding: 0.4rem 0.5rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid #1e293b;
		border-radius: 4px;
	}

	.pipeline-step {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex: 1;
	}

	.step-dot {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #374151;
		color: #6b7280;
		flex-shrink: 0;
	}

	.pipeline-step.active .step-dot { background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; }
	.pipeline-step.done .step-dot { background: rgba(16, 185, 129, 0.3); border-color: #34d399; color: #34d399; }
	.pipeline-step.error .step-dot { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444; }

	.step-info { display: flex; flex-direction: column; }
	.step-name { font-size: 0.6rem; color: #d1d5db; font-weight: 600; }
	.step-desc { font-size: 0.5rem; color: #6b7280; }
	.pipeline-step.active .step-name { color: #10b981; }
	.pipeline-step.done .step-name { color: #34d399; }

	/* Layout */
	.analyzer-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		min-height: 280px;
	}

	@media (max-width: 768px) {
		.analyzer-layout { grid-template-columns: 1fr; }
	}

	/* Image panel */
	.image-panel {
		background: rgba(13, 17, 23, 0.8);
		border: 1px solid #1e293b;
		border-radius: 6px;
		overflow: hidden;
	}

	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		min-height: 280px;
		border: 2px dashed #374151;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		text-align: center;
	}

	.drop-zone.dragging {
		border-color: #10b981;
		background: rgba(16, 185, 129, 0.05);
	}

	:global(.drop-icon) { color: #4b5563; margin-bottom: 0.5rem; }

	.drop-text { color: #d1d5db; font-size: 0.85rem; margin: 0; }
	.drop-hint { color: #6b7280; font-size: 0.65rem; margin: 0.2rem 0 0.6rem; }
	.drop-formats { color: #4b5563; font-size: 0.55rem; margin-top: 0.4rem; }

	.file-label {
		display: inline-block;
		padding: 0.4rem 0.8rem;
		background: linear-gradient(90deg, #10b981, #34d399);
		color: #0d1117;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: inherit;
	}

	/* Preview */
	.preview-container { padding: 0.4rem; }

	.preview-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0;
		font-size: 0.7rem;
	}

	.file-name { color: #e5e7eb; font-weight: 600; }
	.file-size { color: #6b7280; }

	.icon-btn {
		margin-left: auto;
		background: none;
		border: 1px solid #374151;
		color: #9ca3af;
		border-radius: 3px;
		cursor: pointer;
		padding: 0.15rem;
		display: flex;
	}

	.image-wrapper {
		position: relative;
		border-radius: 4px;
		overflow: hidden;
		background: #000;
	}

	.preview-img {
		width: 100%;
		display: block;
		max-height: 350px;
		object-fit: contain;
	}

	.detection-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.detection-box {
		position: absolute;
		border: 2px solid;
		border-radius: 2px;
	}

	.det-label {
		position: absolute;
		top: -1px;
		left: -1px;
		padding: 0.1rem 0.25rem;
		color: white;
		font-size: 0.5rem;
		font-weight: 600;
		line-height: 1;
		border-radius: 0 0 3px 0;
	}

	/* Controls */
	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0;
		flex-wrap: wrap;
	}

	.config-toggles {
		display: flex;
		gap: 0.4rem;
		font-size: 0.65rem;
		color: #9ca3af;
		align-items: center;
	}

	.config-toggles label {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		cursor: pointer;
	}

	.analyze-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.7rem;
		background: linear-gradient(90deg, #10b981, #34d399);
		border: none;
		border-radius: 4px;
		color: #0d1117;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.7rem;
	}

	.analyze-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Results */
	.results-panel {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.error-msg {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 4px;
		color: #fca5a5;
		font-size: 0.7rem;
	}

	.result-section {
		background: rgba(30, 41, 59, 0.4);
		border: 1px solid #1e293b;
		border-radius: 4px;
		padding: 0.5rem;
	}

	.embedding-section {
		border-color: rgba(59, 130, 246, 0.3);
		background: rgba(59, 130, 246, 0.05);
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.3rem;
		color: #10b981;
	}

	.section-header h3 {
		font-size: 0.75rem;
		margin: 0;
		color: #10b981;
	}

	.timing { font-size: 0.55rem; color: #6b7280; margin-left: auto; }
	.confidence { font-size: 0.6rem; color: #34d399; font-weight: 600; }

	.source-tag {
		padding: 0.1rem 0.2rem;
		border-radius: 2px;
		font-size: 0.5rem;
		font-weight: 600;
	}

	.source-tag.client-onnx { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
	.source-tag.server-ollama { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
	.source-tag.cache { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }

	/* Embedding preview */
	.embedding-preview {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.6rem;
		font-family: monospace;
		color: #9ca3af;
		flex-wrap: wrap;
	}

	.embed-dims { color: #60a5fa; font-weight: 600; }
	.embed-sample { color: #6b7280; }
	.embed-norm { color: #34d399; }

	/* Detections */
	.detection-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.detection-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.15rem 0.35rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 3px;
		font-size: 0.65rem;
	}

	.det-class { font-weight: 600; }
	.det-conf { color: #6b7280; font-size: 0.55rem; }

	/* VLM */
	.vlm-text {
		color: #d1d5db;
		font-size: 0.75rem;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	/* Entities */
	.entity-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.entity-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.15rem 0.35rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 3px;
		font-size: 0.65rem;
	}

	.entity-label {
		padding: 0.1rem 0.2rem;
		background: rgba(139, 92, 246, 0.15);
		color: #a78bfa;
		border-radius: 2px;
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.entity-text { color: #e5e7eb; }
	.entity-score { color: #6b7280; font-size: 0.55rem; }

	/* Evidence ID */
	.evidence-id {
		padding: 0.25rem 0.4rem;
		background: rgba(16, 185, 129, 0.05);
		border: 1px solid #1e3a2a;
		border-radius: 3px;
		font-size: 0.6rem;
	}

	.id-label { color: #6b7280; }
	.id-value { color: #10b981; font-family: monospace; }

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 1.5rem;
		color: #6b7280;
		min-height: 180px;
	}

	.empty-state p { font-size: 0.75rem; margin: 0.4rem 0 0; }
	.hint { font-size: 0.65rem !important; color: #4b5563 !important; }

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
