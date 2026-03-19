<script lang="ts">
/**
 * Evidence Upload Progress with Real-Time SSE Tracking
 * Priority #3: Tracks 8-stage evidence upload pipeline
 *
 * Pipeline Stages:
 * 1. uploading - File upload to MinIO
 * 2. hashing - SHA-256 hash computation
 * 3. storing - MinIO storage
 * 4. db-insert - PostgreSQL record creation
 * 5. embedding - Text extraction + chunking + embedding generation
 * 6. complete - Success
 * 7. error - Failure
 */

import { onMount, onDestroy } from 'svelte';
import Icon from '$lib/components/ui/Icon.svelte';

interface Props {
	jobId: string;
	filename?: string;
	onComplete?: (evidenceId: string) => void;
	onError?: (error: string) => void;
	showStages?: boolean;
}

let { jobId, filename = '', onComplete, onError, showStages = true }: Props = $props();

// Progress state
let progress = $state(0);
let step = $state<string>('uploading');
let message = $state('Starting upload...');
let error = $state<string | null>(null);
let evidenceId = $state<string | null>(null);
let isComplete = $state(false);
let isFailed = $state(false);
let isConnected = $state(false);

// SSE connection
let eventSource: EventSource | null = null;
let retryCount = $state(0);
const MAX_RETRIES = 3;

// Stage definitions for 8-stage pipeline
const STAGES = [
	{ id: 'uploading', label: 'Uploading File', icon: 'upload', color: '#3b82f6' },
	{ id: 'hashing', label: 'Computing Hash', icon: 'hash', color: '#8b5cf6' },
	{ id: 'storing', label: 'Storing in MinIO', icon: 'database', color: '#06b6d4' },
	{ id: 'db-insert', label: 'Creating Record', icon: 'file-plus', color: '#10b981' },
	{ id: 'embedding', label: 'Processing Content', icon: 'cpu', color: '#f59e0b' },
	{ id: 'complete', label: 'Complete', icon: 'circle-check', color: '#22c55e' },
	{ id: 'error', label: 'Failed', icon: 'circle-x', color: '#ef4444' }
] as const;

type StageId = typeof STAGES[number]['id'];

// Derived stage info
let currentStage = $derived(
	STAGES.find((s) => s.id === step) ?? STAGES[0]
);

let currentStageIndex = $derived(
	STAGES.findIndex((s) => s.id === step)
);

let completedStages = $derived(
	STAGES.slice(0, currentStageIndex).filter((s) => s.id !== 'error')
);

/**
 * Connect to SSE endpoint for real-time progress updates
 */
function connectSSE() {
	if (eventSource) {
		eventSource.close();
	}

	const url = `/api/evidence/realtime?jobId=${encodeURIComponent(jobId)}`;
	eventSource = new EventSource(url);

	eventSource.onopen = () => {
		console.log('[EvidenceProgress] SSE connected');
		isConnected = true;
	};

	eventSource.addEventListener('connected', (e) => {
		const data = JSON.parse(e.data);
		console.log('[EvidenceProgress] Connected to job:', data.jobId);
	});

	eventSource.addEventListener('progress', (e) => {
		const data = JSON.parse(e.data);
		progress = data.progress ?? 0;
		step = data.step ?? 'uploading';
		message = data.message ?? '';
		evidenceId = data.evidenceId ?? null;

		console.log(`[EvidenceProgress] Progress: ${progress}% - ${step}`);
	});

	eventSource.addEventListener('complete', (e) => {
		const data = JSON.parse(e.data);
		progress = 100;
		step = 'complete';
		message = data.message ?? 'Upload complete!';
		evidenceId = data.evidenceId ?? null;
		isComplete = true;

		console.log('[EvidenceProgress] Complete:', evidenceId);

		if (onComplete && evidenceId) {
			onComplete(evidenceId);
		}

		// Close SSE connection
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	eventSource.addEventListener('error', (e) => {
		const data = e instanceof MessageEvent ? JSON.parse(e.data) : null;
		const errorMsg = data?.error ?? data?.message ?? 'Upload failed';

		step = 'error';
		error = errorMsg;
		message = errorMsg;
		isFailed = true;

		console.error('[EvidenceProgress] Error:', errorMsg);

		if (onError) {
			onError(errorMsg);
		}

		// Retry connection if not at max retries
		if (retryCount < MAX_RETRIES && !isComplete && !isFailed) {
			retryCount++;
			console.log(`[EvidenceProgress] Retrying connection (${retryCount}/${MAX_RETRIES})...`);
			setTimeout(connectSSE, 2000 * retryCount); // Exponential backoff
		} else if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	eventSource.onerror = () => {
		console.warn('[EvidenceProgress] SSE connection error');
		isConnected = false;

		// Auto-retry if not complete/failed
		if (!isComplete && !isFailed && retryCount < MAX_RETRIES) {
			retryCount++;
			console.log(`[EvidenceProgress] Retrying connection (${retryCount}/${MAX_RETRIES})...`);
			setTimeout(connectSSE, 2000 * retryCount);
		}
	};
}

/**
 * Retry failed upload
 */
function retry() {
	error = null;
	isFailed = false;
	progress = 0;
	step = 'uploading';
	message = 'Retrying upload...';
	retryCount = 0;
	connectSSE();
}

onMount(() => {
	connectSSE();
});

onDestroy(() => {
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}
});
</script>

<div class="evidence-upload-progress">
	<!-- Header -->
	<div class="header">
		<div class="file-info">
			<Icon name="file-text" class="w-5 h-5 text-sand-11" />
			<span class="filename">{filename || 'Uploading evidence...'}</span>
		</div>
		<div class="connection-status">
			{#if isConnected}
				<span class="status-dot connected"></span>
				<span class="text-xs text-sand-11">Connected</span>
			{:else}
				<span class="status-dot disconnected"></span>
				<span class="text-xs text-sand-10">Connecting...</span>
			{/if}
		</div>
	</div>

	<!-- Current Stage -->
	<div class="current-stage" style="border-left-color: {currentStage.color}">
		<span class="stage-icon" style="color: {currentStage.color}">
			<Icon name={currentStage.icon} class="w-6 h-6" />
		</span>
		<div class="stage-details">
			<div class="stage-label">{currentStage.label}</div>
			<div class="stage-message">{message}</div>
		</div>
		<div class="stage-progress">{progress}%</div>
	</div>

	<!-- Progress Bar -->
	<div class="progress-bar-container">
		<div
			class="progress-bar"
			style="width: {progress}%; background: {currentStage.color}"
		></div>
	</div>

	<!-- Stage Timeline (if enabled) -->
	{#if showStages && !isFailed}
		<div class="stage-timeline">
			{#each STAGES.filter((s) => s.id !== 'error') as stage, index}
				{@const isCurrentStage = stage.id === step}
				{@const isPastStage = index < currentStageIndex}
				{@const isFutureStage = index > currentStageIndex}

				<div
					class="timeline-item"
					class:current={isCurrentStage}
					class:completed={isPastStage}
					class:future={isFutureStage}
				>
					<div
						class="timeline-dot"
						style="background: {isPastStage || isCurrentStage ? stage.color : '#e5e7eb'}"
					>
						{#if isPastStage}
							<Icon name="check" class="w-3 h-3 text-white" />
						{:else if isCurrentStage}
							<div class="pulse-dot"></div>
						{/if}
					</div>
					<div class="timeline-label">{stage.label}</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Error State -->
	{#if isFailed && error}
		<div class="error-container">
			<Icon name="triangle-alert" class="w-5 h-5 text-danger" />
			<div class="error-message">
				<strong>Upload Failed</strong>
				<p>{error}</p>
			</div>
			<button class="btn-retry" onclick={retry}>
				<Icon name="rotate-cw" class="w-4 h-4" />
				Retry
			</button>
		</div>
	{/if}

	<!-- Success State -->
	{#if isComplete && evidenceId}
		<div class="success-container">
			<Icon name="circle-check" class="w-5 h-5 text-info" />
			<div class="success-message">
				<strong>Upload Complete!</strong>
				<p class="text-sm text-sand-11">Evidence ID: {evidenceId.slice(0, 8)}...</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.evidence-upload-progress {
		background: var(--panel);
		border: 1px solid var(--sand-6);
		border-radius: 8px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.filename {
		font-weight: 600;
		color: var(--sand-12);
		font-size: 0.95rem;
	}

	.connection-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.status-dot.connected {
		background: var(--info);
		animation: pulse 2s infinite;
	}

	.status-dot.disconnected {
		background: var(--sand-8);
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.current-stage {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--panel-soft);
		border-left: 4px solid;
		border-radius: 6px;
	}

	.stage-details {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stage-label {
		font-weight: 600;
		color: var(--sand-12);
		font-size: 1rem;
	}

	.stage-message {
		font-size: 0.875rem;
		color: var(--sand-11);
	}

	.stage-progress {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--sand-12);
	}

	.progress-bar-container {
		width: 100%;
		height: 8px;
		background: var(--sand-4);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		transition: width 0.3s ease-out, background 0.3s;
		border-radius: 4px;
	}

	.stage-timeline {
		display: flex;
		justify-content: space-between;
		padding: 1rem 0;
		position: relative;
	}

	.stage-timeline::before {
		content: '';
		position: absolute;
		top: 2rem;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--sand-6);
		z-index: 0;
	}

	.timeline-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		position: relative;
		z-index: 1;
	}

	.timeline-dot {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid var(--panel);
		transition: all 0.3s;
	}

	.timeline-item.current .timeline-dot {
		box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
		animation: pulse-ring 2s infinite;
	}

	@keyframes pulse-ring {
		0%, 100% {
			box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.1);
		}
	}

	.pulse-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: white;
		animation: pulse 1.5s infinite;
	}

	.timeline-label {
		font-size: 0.75rem;
		color: var(--sand-11);
		text-align: center;
		max-width: 80px;
	}

	.timeline-item.completed .timeline-label {
		color: var(--sand-12);
		font-weight: 600;
	}

	.timeline-item.current .timeline-label {
		color: var(--accent);
		font-weight: 600;
	}

	.error-container,
	.success-container {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 6px;
	}

	.error-container {
		background: #fef2f2;
		border: 1px solid #fecaca;
	}

	.success-container {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
	}

	.error-message,
	.success-message {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.error-message strong,
	.success-message strong {
		color: var(--sand-12);
		font-size: 0.95rem;
	}

	.error-message p {
		color: var(--danger);
		font-size: 0.875rem;
		margin: 0;
	}

	.btn-retry {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--danger);
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-retry:hover {
		background: #dc2626;
		transform: translateY(-1px);
		box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2);
	}

	@media (max-width: 768px) {
		.evidence-upload-progress {
			padding: 1rem;
		}

		.stage-timeline {
			flex-wrap: wrap;
			gap: 1rem;
		}

		.timeline-item {
			flex-basis: 30%;
		}
	}
</style>
