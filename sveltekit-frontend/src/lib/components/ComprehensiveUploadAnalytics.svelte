<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createActor } from 'xstate';
	import {
		comprehensiveUploadAnalyticsMachine,
		generateUserInsights,
		calculateUserEngagementScore,
		getContextualPromptsByTiming,
		type UploadContext,
		type UserAnalytics
	} from '$lib/machines/enhanced-legal-upload-analytics-machine.js';
	import type { UploadResult } from '$lib/machines/enhanced-legal-upload-analytics-machine.js';

	interface Props {
		caseId?: string;
		userId?: string;
		maxFiles?: number;
		allowedTypes?: string[];
		enableAnalytics?: boolean;
		enableAIPrompts?: boolean;
		expertiseLevel?: 'paralegal' | 'associate' | 'senior' | 'partner';
	}

	let {
		caseId = '',
		userId = '',
		maxFiles = 10,
		allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'],
		enableAnalytics = true,
		enableAIPrompts = true,
		expertiseLevel = 'associate'
	}: Props = $props();

	// State
	let uploadActor = $state<ReturnType<typeof createActor<typeof comprehensiveUploadAnalyticsMachine>> | null>(null);
	let machineState = $state<any>(null); // Ideally strictly typed, but xstate types can be complex
	let fileInput = $state<HTMLInputElement | null>(null);
	let dragOver = $state<boolean>(false);
	let selectedFiles = $state<File[]>([]);

	// Derived State
	let context = $derived(machineState?.context as UploadContext : undefined);
	let contextualPrompts = $derived(context?.contextualPrompts ?? []);
	let beforeUploadPrompts = $derived(context ? getContextualPromptsByTiming(context, 'before-upload') : []);
	let duringUploadPrompts = $derived(context ? getContextualPromptsByTiming(context, 'during-upload') : []);
	let afterUploadPrompts = $derived(context ? getContextualPromptsByTiming(context, 'after-upload') : []);

	let currentUserInsights = $derived(context ? generateUserInsights(context) : null);
	let engagementScore = $derived(context ? calculateUserEngagementScore(context) : 0);

	let uploadProgress = $derived(context?.uploadProgress ?? 0);
	let isUploading = $derived(machineState?.matches('uploadPipeline') ?? false);
	let isComplete = $derived(machineState?.matches('completed') ?? false);
	let hasErrors = $derived((context?.errors?.length ?? 0) > 0);
	let uploadResults = $derived(context?.uploadResults ?? []);
	let pipelineStatus = $derived(context?.pipeline ?? {});

	// Lifecycle
	onMount(() => {
		initializeUploadAnalytics();
		if (enableAnalytics) {
			setupUserTracking();
		}
	});

	onDestroy(() => {
		uploadActor?.stop();
		cleanupUserTracking();
	});

	function initializeUploadAnalytics() {
		const userAnalytics: UserAnalytics = {
			userId: userId || 'anonymous',
			sessionId: `session-${Date.now()}`,
			behaviorPattern: 'intermediate',
			uploadHistory: { totalUploads: 0,
				successRate: 0.0,
				averageFileSize: 0,
				preferredFormats: [],
				commonUploadTimes: []
			},
			interactionMetrics: { typingSpeed: 0,
				clickPatterns: [],
				scrollBehavior: { depth: 0, speed: 0 },
				focusTime: 0
			},
			contextualPreferences: { preferredAIPromptStyle: 'detailed',
				helpLevel: 'moderate',
				autoSuggestions: enableAIPrompts,
				proactiveInsights: enableAIPrompts
			},
			caseContext: { activeCases: caseId ? [caseId] : [],
				currentCaseId: caseId,
				workflowStage: 'discovery',
				expertise: expertiseLevel
			}
		};

		const actor = createActor(comprehensiveUploadAnalyticsMachine, {
			input: {
				userAnalytics,
				files: [], // Initial state
				uploadProgress: 0,
				uploadResults: [],
				errors: [],
				contextualPrompts: [],
				pipeline: { fileValidation: { status: 'pending' },
					fileUpload: { status: 'pending' },
					aiAnalysis: { status: 'pending' },
					indexing: { status: 'pending' },
					vectorEmbedding: { status: 'pending' },
					dbStorage: { status: 'pending' },
				},
				evidenceMetadata: [],
				aiAnalysisResults: []
			}
		});

		actor.subscribe((state) => {
			machineState = state;
		});

		actor.start();
		uploadActor = actor;
	}

	// User Tracking Logic
	let keydownHandler: (e: KeyboardEvent) => void;
	let clickHandler: (e: MouseEvent) => void;
	let scrollHandler: () => void;

	function setupUserTracking() {
		let typingStartTime = 0;
		let keyStrokes = 0;

		keydownHandler = (e: KeyboardEvent) => {
			if (typingStartTime === 0) typingStartTime = Date.now();
			keyStrokes++;
			if (keyStrokes % 10 === 0) {
				const timeDiff = Date.now() - typingStartTime;
				const wpm = Math.round((keyStrokes / 5) / (timeDiff / 60000));
				uploadActor?.send({ type: 'USER_TYPING', speed: wpm });
			}
		};

		clickHandler = (e: MouseEvent) => {
			uploadActor?.send({
				type: 'USER_CLICK',
				x: e.clientX,
				y: e.clientY,
				element: (e.target as HTMLElement)?.tagName ?? 'unknown'
			});
		};

		let lastScrollTime = 0;
		scrollHandler = () => {
			const currentTime = Date.now();
			const scrollDepth = window.scrollY / Math.max(1, (document.body.scrollHeight - window.innerHeight));
			if (lastScrollTime > 0) {
				const scrollSpeed = Math.abs(window.scrollY) / (currentTime - lastScrollTime);
				uploadActor?.send({ type: 'USER_SCROLL', depth: scrollDepth, speed: scrollSpeed || 0 }); // Fix nan
			}
			lastScrollTime = currentTime;
		};

		if (typeof document !== 'undefined') {
			document.addEventListener('keydown', keydownHandler);
			document.addEventListener('click', clickHandler);
			document.addEventListener('scroll', scrollHandler);
		}
	}

	function cleanupUserTracking() {
		if (typeof document !== 'undefined') {
			if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
			if (clickHandler) document.removeEventListener('click', clickHandler);
			if (scrollHandler) document.removeEventListener('scroll', scrollHandler);
		}
	}

	// Event Handlers
	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target?.files) {
			const files = Array.from(target.files);
			selectFiles(files);
		}
	}

	function handleDrop(evt: DragEvent) {
		evt.preventDefault();
		dragOver = false;
		if (evt.dataTransfer?.files) {
			const files = Array.from(evt.dataTransfer.files);
			selectFiles(files);
		}
	}

	function handleDragOver(evt: DragEvent) {
		evt.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function selectFiles(files: File[]) {
		const validFiles = files.filter(file => allowedTypes.includes(file.type));
		const limitedFiles = validFiles.slice(0, maxFiles);
		selectedFiles = limitedFiles;

		if (uploadActor) {
			uploadActor.send({ type: 'SELECT_FILES', files: limitedFiles, caseId });
			uploadActor.send({
				type: 'TRACK_USER_ACTION',
				data: { caseId }
			});
		}
	}

	function startUpload() {
		if (uploadActor && selectedFiles.length > 0) {
			uploadActor.send({ type: 'START_UPLOAD' });
		}
	}

	function cancelUpload() {
		if (uploadActor) {
			uploadActor.send({ type: 'CANCEL_UPLOAD' });
		}
		selectedFiles = [];
	}

	function retryUpload() {
		if (uploadActor) {
			uploadActor.send({ type: 'RETRY_UPLOAD' });
		}
	}

	function resetUpload() {
		if (uploadActor) {
			uploadActor.send({ type: 'RESET' });
		}
		selectedFiles = [];
	}

	function handlePromptReaction(promptId: string, reaction: 'accepted' | 'dismissed' | 'ignored') {
		if (uploadActor) {
			uploadActor.send({ type: 'USER_REACTED_TO_PROMPT', promptId, reaction });
		}
	}

	function requestAISuggestions() {
		if (uploadActor) {
			uploadActor.send({ type: 'REQUEST_AI_SUGGESTIONS' });
		}
	}

	function activateDropZoneKey(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			fileInput?.click();
		}
	}

	// Utilities
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function formatDuration(ms: number): string {
		if (!ms || isNaN(ms)) return '0s';
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		}
		return `${seconds}s`;
	}

	function getStageIcon(status: string) {
		if (status === 'completed') return '✓';
		if (status === 'processing') return '⏳';
		if (status === 'failed') return '✕';
		return '○';
	}
</script>

<div class="comprehensive-upload-analytics">
	<!-- Header -->
	<div class="upload-header">
		<h2>Legal Document Upload & Analysis</h2>
		{#if enableAnalytics && currentUserInsights}
			<div class="user-insights-badge">
				<span class="expertise-level">{currentUserInsights.behaviorPattern}</span>
				<span class="engagement-score">Engagement: {Math.round(engagementScore * 100)}%</span>
			</div>
		{/if}
	</div>

	<!-- Contextual AI Prompts - Before Upload -->
	{#if enableAIPrompts && beforeUploadPrompts.length > 0}
		<div class="ai-prompts before-upload">
			<h3>💡 AI Suggestions</h3>
			{#each beforeUploadPrompts as prompt (prompt.id)}
				<div class="ai-prompt" class:high-confidence={prompt.confidence > 0.8}>
					<p class="prompt-content">{prompt.content}</p>
					<div class="prompt-actions">
						<button class="btn-accept" onclick={() => handlePromptReaction(prompt.id, 'accepted')}>✓ Accept</button>
						<button class="btn-dismiss" onclick={() => handlePromptReaction(prompt.id, 'dismissed')}>✕ Dismiss</button>
					</div>
					<div class="prompt-confidence">Confidence: {Math.round(prompt.confidence * 100)}%</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- File Selection Area -->
	<div
		class="file-drop-zone"
		class:drag-over={dragOver}
		class:has-files={selectedFiles.length > 0}
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		role="button"
		tabindex="0"
		aria-label="File upload drop zone"
		onclick={() => fileInput?.click()}
		onkeydown={activateDropZoneKey}
	>
		{#if selectedFiles.length === 0}
			<div class="drop-zone-content">
				<div class="upload-icon">📄</div>
				<p>Drag & drop files here or click to select</p>
				<p class="file-constraints">
					Max {maxFiles} files • {allowedTypes.map(type => type.split('/')[1]).join(', ')}
				</p>
				<input
					bind:this={fileInput}
					type="file"
					multiple
					accept={allowedTypes.join(',')}
					onchange={handleFileSelect}
					style="display: none;"
				/>
				<button class="btn-select-files">Select Files</button>
			</div>
		{:else}
			<div class="selected-files">
				<h3>Selected Files ({selectedFiles.length})</h3>
				{#each selectedFiles as file, index}
					<div class="file-item">
						<div class="file-info">
							<span class="file-name">{file.name}</span>
							<span class="file-size">{formatFileSize(file.size)}</span>
							<span class="file-type">{file.type}</span>
						</div>
						{#if uploadResults[index]}
							<div class="file-status">
								{#if uploadResults[index].success}
									<span class="status-success">✓ Complete</span>
								{:else if uploadResults[index].error}
									<span class="status-error">✕ Failed</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				{#if !isUploading && !isComplete}
					<div class="file-actions">
						<button class="nes-btn is-primary" onclick={startUpload}>Start Upload & Analysis</button>
						<button class="nes-btn is-error" onclick={() => { selectedFiles = []; }}>Clear Files</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Contextual AI Prompts - During Upload -->
	{#if enableAIPrompts && duringUploadPrompts.length > 0 && isUploading}
		<div class="ai-prompts during-upload">
			<h3>🤖 Processing Insights</h3>
			{#each duringUploadPrompts as prompt}
				<div class="ai-prompt">
					<p class="prompt-content">{prompt.content}</p>
					<div class="prompt-confidence">Confidence: {Math.round(prompt.confidence * 100)}%</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Upload Progress & Pipeline -->
	{#if isUploading}
		<div class="upload-progress">
			<div class="progress-header">
				<h3>Processing Files</h3>
				<span class="progress-percentage">{Math.round(uploadProgress)}%</span>
			</div>
			<div class="progress-bar">
				<div class="progress-fill" style="width: {uploadProgress}%"></div>
			</div>

			<div class="pipeline-status">
				{#each Object.entries(pipelineStatus) as [stage, status]}
					{#if status && typeof status === 'object' && 'status' in status}
						<div class="pipeline-stage"
							class:active={status.status === 'processing'}; class:completed={status.status === 'completed'}; class:failed={status.status === 'failed'}
						>
							<div class="stage-icon">{getStageIcon(status.status as string)}</div>
							<span class="stage-name">{stage.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
						</div>
					{/if}
				{/each}
			</div>

			<div class="upload-actions">
				<button class="btn-cancel" onclick={cancelUpload}>Cancel Upload</button>
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if isComplete && uploadResults.length > 0}
		<div class="upload-results">
			<h3>Upload Complete</h3>
			<div class="results-summary">
				<div class="summary-stat">
					<span class="stat-value">{uploadResults.filter(r => r.success).length}</span>
					<span class="stat-label">Successful</span>
				</div>
				<div class="summary-stat">
					<span class="stat-value">{uploadResults.filter(r => !r.success).length}</span>
					<span class="stat-label">Failed</span>
				</div>
			</div>

			<div class="results-list">
				{#each uploadResults as result}
					<div class="result-item" class:success={result.success}; class:error={!result.success}>
						<div class="result-info">
							<span class="result-filename">{result.fileName}</span>
							{#if result.success && result.documentId}
								<span class="result-document-id">ID: {result.documentId}</span>
							{/if}
						</div>

						{#if result.success && result.aiInsights}
							<div class="ai-insights">
								<h4>AI Analysis Results</h4>
								<p class="insights-summary">{result.aiInsights.summary}</p>

								{#if result.aiInsights.suggestedTags}
									<div class="suggested-tags">
										<strong>Tags:</strong>
										{#each result.aiInsights.suggestedTags as tag}
											<span class="tag">{tag}</span>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						{#if !result.success && result.error}
							<div class="error-message">
								<strong>Error:</strong> {result.error}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="final-actions">
				<button class="nes-btn" onclick={resetUpload}>Upload More Files</button>
				{#if enableAIPrompts}
					<button class="nes-btn is-warning" onclick={requestAISuggestions}>Get AI Suggestions</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Errors -->
	{#if hasErrors}
		<div class="error-section">
			<h3>⚠️ Issues Detected</h3>
			{#each (context?.errors ?? []) as error}
				<div class="error-item">
					<p>{error}</p>
				</div>
			{/each}
			<div class="error-actions">
				<button class="btn-retry" onclick={retryUpload}>Retry Upload</button>
				<button class="btn-reset" onclick={resetUpload}>Start Over</button>
			</div>
		</div>
	{/if}

	<!-- Analytics Dashboard -->
	{#if enableAnalytics && currentUserInsights}
		<details class="analytics-dashboard">
			<summary>📊 Analytics Dashboard</summary>
			<div class="analytics-content">
				<div class="insight-card">
					<h4>Behavior Pattern</h4>
					<p class="behavior-pattern">{currentUserInsights.behaviorPattern}</p>
					<p class="engagement-level">Engagement: {currentUserInsights.engagementLevel}</p>
				</div>
				<div class="insight-card">
					<h4>Efficiency</h4>
					<p class="efficiency-score">{Math.round((currentUserInsights.uploadEfficiency || 0) * 100)}% Success Rate</p>
				</div>
				<div class="insight-card">
					<h4>Recommendations</h4>
					<ul class="recommendations-list">
						{#each currentUserInsights.recommendations as recommendation}
							<li>{recommendation}</li>
						{/each}
					</ul>
				</div>
			</div>
		</details>
	{/if}
</div>

<style>
	.comprehensive-upload-analytics {
		max-width: 800px; margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.upload-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.upload-header h2 {
		margin: 0; color: #2563eb;
	}

	.user-insights-badge {
		display: flex; gap: 1rem;
		font-size: 0.875rem;
	}

	.expertise-level {
		background: #dbeafe; color: #2563eb;
		padding: 0.25rem 0.75rem;
		border-radius: 1rem;
		text-transform: capitalize;
	}

	.engagement-score {
		background: #dcfce7; color: #16a34a;
		padding: 0.25rem 0.75rem;
		border-radius: 1rem;
	}

	.ai-prompts {
		margin-bottom: 2rem; padding: 1.5rem;
		border-radius: 0.75rem; border: 2px solid #e5e7eb;
	}

	.ai-prompts.before-upload { background: #fef3c7; border-color: #f59e0b; }
	.ai-prompts.during-upload { background: #dbeafe; border-color: #3b82f6; }
	.ai-prompts.after-upload { background: #dcfce7; border-color: #10b981; }

	.ai-prompts h3 { margin: 0 0 1rem 0; color: #374151; }

	.ai-prompt {
		background: white; padding: 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.ai-prompt.high-confidence { border-left: 4px solid #10b981; }

	.prompt-content { margin: 0 0 1rem 0; line-height: 1.5; }

	.prompt-actions { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
	.prompt-confidence { font-size: 0.75rem; color: #6b7280; }

	.file-drop-zone {
		border: 2px dashed #d1d5db;
		border-radius: 0.75rem; padding: 2rem;
		text-align: center; transition: all 0.2s ease;
		margin-bottom: 2rem; cursor: pointer;
	}

	.file-drop-zone.drag-over { border-color: #3b82f6; background: #eff6ff; }
	.file-drop-zone.has-files { border-color: #10b981; background: #f0fdf4; }

	.drop-zone-content { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
	.upload-icon { font-size: 3rem; }
	.file-constraints { font-size: 0.875rem; color: #6b7280; }

	.file-item {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 0.75rem;
		background: white;
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.file-info { display: flex; flex-direction: column; gap: 0.25rem; }
	.file-name { font-weight: 500; }
	.file-size, .file-type { font-size: 0.75rem; color: #6b7280; }

	.status-success { color: #16a34a; font-weight: 500; }
	.status-error { color: #dc2626; font-weight: 500; }

	.file-actions { display: flex; gap: 1rem; margin-top: 1rem; justify-content: center; }

	.upload-progress {
		background: #f9fafb; padding: 1.5rem;
		border-radius: 0.75rem;
		margin-bottom: 2rem;
	}

	.progress-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
	.progress-bar {
		height: 0.5rem; background: #e5e7eb;
		border-radius: 0.25rem; overflow: hidden;
		margin-bottom: 1rem;
	}
	.progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.3s ease; }

	.pipeline-status { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.pipeline-stage {
		display: flex;
		align-items: center; gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: white;
		border-radius: 0.5rem; border: 1px solid #e5e7eb;
	}
	.pipeline-stage.active { border-color: #3b82f6; background: #eff6ff; }
	.pipeline-stage.completed { border-color: #10b981; background: #f0fdf4; }
	.pipeline-stage.failed { border-color: #ef4444; background: #fef2f2; }

	.upload-results { background: #f0fdf4; padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 2rem; }
	.results-summary { display: flex; gap: 2rem; margin-bottom: 1.5rem; justify-content: center; }
	.summary-stat { text-align: center; }
	.stat-value { display: block; font-size: 2rem; font-weight: bold; color: #10b981; }

	.result-item {
		background: white; padding: 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		border-left: 4px solid #e5e7eb;
	}
	.result-item.success { border-left-color: #10b981; }
	.result-item.error { border-left-color: #ef4444; }

	.ai-insights { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
	.insights-summary { margin-bottom: 1rem; line-height: 1.5; }
	.tag { display: inline-block; background: #e5e7eb; color: #374151; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; margin-right: 0.5rem; margin-bottom: 0.25rem; }

	.analytics-dashboard { margin-top: 2rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; }
	.analytics-dashboard summary { padding: 1rem; cursor: pointer; font-weight: 500; }
	.analytics-content { padding: 1rem; border-top: 1px solid #e5e7eb; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
	.insight-card { background: #f9fafb; padding: 1rem; border-radius: 0.5rem; }
	.insight-card h4 { margin: 0 0 0.5rem 0; color: #374151; }

	/* Buttons */
	.btn-accept { background: #10b981; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; }
	.btn-dismiss { background: #ef4444; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; }
	.btn-select-files { background: #3b82f6; color: white; border: none; padding: 1rem 2rem; border-radius: 0.5rem; cursor: pointer; font-size: 1rem; }
	.btn-cancel { background: #ef4444; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; }
	.btn-retry { background: #f59e0b; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; }
	.btn-reset { background: #6b7280; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; }

	.error-section { background: #fef2f2; border: 1px solid #fecaca; padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 2rem; }
	.error-section h3 { margin: 0 0 1rem 0; color: #dc2626; }
	.error-item { background: white; padding: 1rem; margin-bottom: 0.5rem; border-left: 4px solid #ef4444; }
	.error-actions { display: flex; gap: 1rem; margin-top: 1rem; }

	.final-actions { display: flex; gap: 1rem; justify-content: center; margin-top: 2rem; }

	@media (max-width: 640px) {
		.upload-header { flex-direction: column; gap: 1rem; align-items: flex-start; }
		.results-summary { flex-direction: column; gap: 1rem; }
		.file-actions, .final-actions, .error-actions { flex-direction: column; }
	}
</style>




