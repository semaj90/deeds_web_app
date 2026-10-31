<script lang="ts">
/**
 * Evidence Upload Progress with Real-Time SSE Tracking
 * Displays server-reported upload and processing progress over SSE.
 */

import { onMount, onDestroy } from 'svelte';
import { createActor, type ActorRefFrom } from 'xstate';
import Icon from '$lib/components/ui/Icon.svelte';
import { getEvidenceUploadDurationSamples, recordEvidenceUploadDuration } from './upload-progress-storage';
import { evidenceUploadProgressMachine } from '$lib/machines/evidence-upload-progress-machine';

interface Props {
	jobId: string;
	filename?: string;
	fileSize?: number;
	userId?: string;
	startedAt?: number;
	onComplete?: (evidenceId: string) => void;
	onError?: (error: string) => void;
	showStages?: boolean;
}

let { jobId, filename = '', fileSize = 0, userId = 'anonymous', startedAt = Date.now(), onComplete, onError, showStages = true }: Props = $props();

// Progress state
let progress = $state(0);
let step = $state<string>('uploading');
let message = $state('Starting upload...');
let error = $state<string | null>(null);
let evidenceId = $state<string | null>(null);
let isComplete = $state(false);
let isFailed = $state(false);
let isConnected = $state(false);
let elapsedMs = $state(0);
let durationSamples = $state<number[]>([]);
let elapsedTimer: ReturnType<typeof setInterval> | undefined;

// SSE connection
let eventSource: EventSource | null = null;
let actor: ActorRefFrom<typeof evidenceUploadProgressMachine> | undefined;
let actorSubscription: { unsubscribe: () => void } | undefined;

// Progress is an observation from the server, not a prediction of completed work.
const STAGES = [
	{ id: 'uploading', label: 'Uploading File', icon: 'file-up', color: '#7b2735' },
	{ id: 'hashing', label: 'Verifying File', icon: 'fingerprint', color: '#9a7037' },
	{ id: 'storing', label: 'Securing Original', icon: 'archive', color: '#344967' },
	{ id: 'db-insert', label: 'Recording Evidence', icon: 'file-plus-2', color: '#7b2735' },
	{ id: 'extracting', label: 'Extracting Text', icon: 'file-search', color: '#9a7037' },
	{ id: 'structuring', label: 'Structuring Record', icon: 'list-tree', color: '#344967' },
	{ id: 'embedding', label: 'Generating Embeddings', icon: 'sparkles', color: '#7b2735' },
	{ id: 'vector-storage', label: 'Saving Search Projection', icon: 'database', color: '#9a7037' },
	{ id: 'graph', label: 'Linking Case Relations', icon: 'network', color: '#344967' },
	{ id: 'entity-extraction', label: 'Extracting Entities', icon: 'scale', color: '#7b2735' },
	{ id: 'summarizing', label: 'Preparing Summary', icon: 'scroll', color: '#9a7037' },
	{ id: 'complete', label: 'Processing Complete', icon: 'badge-check', color: '#3c6b57' },
	{ id: 'error', label: 'Processing Issue', icon: 'circle-x', color: '#9a3540' }
] as const;

// Derived stage info
let currentStage = $derived(
	STAGES.find((s) => s.id === step) ?? STAGES[0]
);

let currentStageIndex = $derived(
	STAGES.findIndex((s) => s.id === step)
);

const sortedSamples = $derived([...durationSamples].sort((a, b) => a - b));
const medianDurationMs = $derived(sortedSamples.length >= 5 ? sortedSamples[Math.floor(sortedSamples.length / 2)] : null);
const etaMs = $derived(medianDurationMs && progress > 0 && !isComplete
	? Math.max(0, medianDurationMs * (100 - Math.min(progress, 99)) / 100)
	: null);

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`;
}

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
		actor?.send({ type: 'CONNECTED' });
	};

	eventSource.addEventListener('connected', (e) => {
		const data = JSON.parse(e.data);
		console.log('[EvidenceProgress] Connected to job:', data.jobId);
	});

	eventSource.addEventListener('progress', (e) => {
		let data: { progress?: number; step?: string; message?: string; evidenceId?: string };
		try { data = JSON.parse((e as MessageEvent<string>).data); } catch { return; }
		actor?.send({
			type: 'PROGRESS',
			progress: Number(data.progress) || 0,
			step: STAGES.some((stage) => stage.id === data.step) ? data.step! : 'uploading',
			message: data.message ?? '',
			evidenceId: data.evidenceId ?? null,
		});
	});

	eventSource.addEventListener('complete', (e) => {
		const data = JSON.parse(e.data);
		actor?.send({ type: 'COMPLETE', message: data.message ?? 'Processing complete', evidenceId: data.evidenceId ?? null });
		if (fileSize > 0) void recordEvidenceUploadDuration(userId, fileSize, Date.now() - startedAt).then(async () => {
			durationSamples = await getEvidenceUploadDurationSamples(userId, fileSize);
		}).catch(() => {});

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
		if (!(e instanceof MessageEvent) || !e.data) return;
		let data: { error?: string; message?: string };
		try { data = JSON.parse(e.data); } catch { data = { message: 'Processing failed' }; }
		const errorMsg = data?.error ?? data?.message ?? 'Upload failed';

		actor?.send({ type: 'FAILED', message: errorMsg });

		console.error('[EvidenceProgress] Error:', errorMsg);

		if (onError) {
			onError(errorMsg);
		}

		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	eventSource.onerror = () => {
		actor?.send({ type: 'CONNECTION_LOST' });
	};
}

/**
 * Retry failed upload
 */
function retry() {
	actor?.send({ type: 'RECONNECT' });
	connectSSE();
}

onMount(() => {
	actor = createActor(evidenceUploadProgressMachine);
	actorSubscription = actor.subscribe((snapshot) => {
		progress = snapshot.context.progress;
		step = snapshot.context.step;
		message = snapshot.context.message;
		evidenceId = snapshot.context.evidenceId;
		isConnected = snapshot.context.connected;
		error = snapshot.context.error;
		isComplete = snapshot.matches('complete');
		isFailed = snapshot.matches('failed');
	});
	actor.start();
	void getEvidenceUploadDurationSamples(userId, fileSize).then((samples) => { durationSamples = samples; }).catch(() => {});
	elapsedMs = Math.max(0, Date.now() - startedAt);
	elapsedTimer = setInterval(() => { elapsedMs = Math.max(0, Date.now() - startedAt); }, 1000);
	connectSSE();
});

onDestroy(() => {
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}
	if (elapsedTimer) clearInterval(elapsedTimer);
	actorSubscription?.unsubscribe();
	actor?.stop();
});
</script>

<div class="evidence-upload-progress">
	<!-- Header -->
	<div class="header">
		<div class="file-info">
			<Icon name="yorha-evidence" size={21} class="progress-emblem" />
			<span class="filename">{filename || 'Uploading evidence...'}</span>
		</div>
		<div class="connection-status">
			{#if isConnected}
				<span class="status-dot connected"></span>
				<span class="connection-label">Live status</span>
			{:else}
				<span class="status-dot disconnected"></span>
				<span class="connection-label">Reconnecting…</span>
			{/if}
		</div>
	</div>

	<!-- Current Stage -->
	<div class="current-stage" style="border-left-color: {currentStage.color}">
		<span class="stage-icon" style="--stage-color: {currentStage.color}">
			<Icon name={currentStage.icon} size={23} />
		</span>
		<div class="stage-details">
			<div class="stage-label">{currentStage.label}</div>
			<div class="stage-message">{message}</div>
		</div>
		<div class="stage-progress">{progress}%</div>
	</div>
	<div class="eta-line" aria-live="polite">
		Elapsed {formatDuration(elapsedMs)}
		{#if etaMs !== null}
			<span> · Rough remaining estimate {formatDuration(etaMs)} (based on {durationSamples.length} similar uploads)</span>
		{:else}
			<span> · ETA calibrating; no estimate until five similar uploads complete</span>
		{/if}
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
			{#each STAGES.filter((s) => s.id !== 'error') as stage, index (stage.id)}
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
						<Icon name="check" class="timeline-check" />
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
			<Icon name="yorha-warning" size={22} class="status-emblem error-emblem" />
			<div class="error-message">
				<strong>Processing failed</strong>
				<p>{error}</p>
			</div>
			<button class="btn-retry" onclick={retry}>
				<Icon name="rotate-cw" class="w-4 h-4" />
				Check status again
			</button>
		</div>
	{/if}

	<!-- Success State -->
	{#if isComplete && evidenceId}
		<div class="success-container">
			<Icon name="yorha-integrity" size={22} class="status-emblem success-emblem" />
			<div class="success-message">
				<strong>Processing complete</strong>
				<p class="evidence-id">Evidence reference · {evidenceId.slice(0, 8)}…</p>
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

	.evidence-upload-progress {
		--progress-ink: #26364f;
		--progress-muted: #68758a;
		--progress-paper: #fffdf8;
		--progress-line: #dfd4bf;
		--progress-gold: #ae8745;
		padding: clamp(1rem, 3vw, 1.5rem);
		border: 1px solid #ded2bb;
		border-radius: 20px;
		background: linear-gradient(145deg, rgba(255,253,248,0.98), rgba(246,240,229,0.97));
		box-shadow: 0 16px 38px rgba(43,49,62,0.09), inset 0 1px #fff;
		color: var(--progress-ink);
	}
	.evidence-upload-progress .header { gap: 0.75rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--progress-line); }
	.evidence-upload-progress .file-info { min-width: 0; gap: 0.65rem; color: #7b2735; }
	.evidence-upload-progress .filename { overflow: hidden; color: var(--progress-ink); text-overflow: ellipsis; white-space: nowrap; }
	.evidence-upload-progress .connection-status { flex: 0 0 auto; color: var(--progress-muted); }
	.evidence-upload-progress .connection-label { font-size: 0.72rem; font-weight: 700; }
	.evidence-upload-progress .status-dot.connected { background: #3c6b57; box-shadow: 0 0 0 3px rgba(60,107,87,0.12); }
	.evidence-upload-progress .status-dot.disconnected { background: #ae8745; box-shadow: 0 0 0 3px rgba(174,135,69,0.13); }
	.evidence-upload-progress .current-stage { gap: 0.9rem; border-radius: 13px; border-left-width: 3px; background: rgba(255,255,255,0.68); box-shadow: inset 0 1px rgba(255,255,255,0.9); }
	.evidence-upload-progress .stage-icon { display: grid; width: 2.8rem; height: 2.8rem; flex: 0 0 auto; place-items: center; border: 1px solid rgba(174,135,69,0.22); border-radius: 12px; background: #f7efdf; color: var(--stage-color) !important; }
	.evidence-upload-progress .stage-label { color: var(--progress-ink); font-family: Georgia, 'Times New Roman', serif; font-size: 1.05rem; }
	.evidence-upload-progress .stage-message { color: #68758a; line-height: 1.45; }
	.evidence-upload-progress .stage-progress { color: #7b2735; font-family: Georgia, 'Times New Roman', serif; font-size: 1.75rem; }
	.evidence-upload-progress .eta-line { color: #6c7788; font-size: 0.75rem; line-height: 1.5; }
	.evidence-upload-progress .progress-bar-container { height: 11px; border: 1px solid rgba(174,135,69,0.25); border-radius: 999px; background: #e9e0d0; box-shadow: inset 0 2px 3px rgba(57,49,38,0.08); }
	.evidence-upload-progress .progress-bar { border-radius: 999px; background-image: linear-gradient(90deg, #7b2735, #ae8745) !important; box-shadow: 0 0 9px rgba(174,135,69,0.28); }
	.evidence-upload-progress .stage-timeline { gap: 0.5rem; overflow-x: auto; padding: 0.7rem 0 0.85rem; scrollbar-color: #c3aa7c transparent; }
	.evidence-upload-progress .stage-timeline::before { top: 1.62rem; right: 1rem; left: 1rem; height: 1px; background: linear-gradient(90deg, #cbb98f, #e5dac6); }
	.evidence-upload-progress .timeline-item { min-width: 5.1rem; gap: 0.42rem; }
	.evidence-upload-progress .timeline-dot { width: 1.9rem; height: 1.9rem; border: 2px solid var(--progress-paper); background: #e6ddcd !important; box-shadow: 0 0 0 1px #d9cbb1; }
	.evidence-upload-progress .timeline-item.completed .timeline-dot,
	.evidence-upload-progress .timeline-item.current .timeline-dot { background: #ae8745 !important; box-shadow: 0 0 0 1px #ae8745, 0 0 0 4px rgba(174,135,69,0.12); }
	.evidence-upload-progress .timeline-item.current .timeline-dot { animation: celestial-pulse 2.2s ease-in-out infinite; }
	.evidence-upload-progress .pulse-dot { width: 0.45rem; height: 0.45rem; background: #fffdf8; }
	.evidence-upload-progress .timeline-label { max-width: 5.5rem; color: #8991a0; font-size: 0.66rem; line-height: 1.25; }
	.evidence-upload-progress .timeline-item.completed .timeline-label { color: #526078; }
	.evidence-upload-progress .timeline-item.current .timeline-label { color: #7b2735; }
	.evidence-upload-progress :global(.timeline-check) { width: 0.75rem; height: 0.75rem; color: white; }
	.evidence-upload-progress .error-container { border: 1px solid #e5c5c1; background: #fff4f1; color: #722f37; }
	.evidence-upload-progress .success-container { border: 1px solid #c7d7c9; background: #f2f7ef; color: #315b48; }
	.evidence-upload-progress .error-message strong,
	.evidence-upload-progress .success-message strong { color: inherit; }
	.evidence-upload-progress .error-message p,
	.evidence-upload-progress .evidence-id { color: #657086; overflow-wrap: anywhere; }
	.evidence-upload-progress .btn-retry { border: 1px solid #e0c7a0; background: #f4ead7; color: #63303b; }
	.evidence-upload-progress .btn-retry:hover { background: #eee0c5; box-shadow: 0 6px 16px rgba(87,64,43,0.12); }
	.evidence-upload-progress :global(.error-emblem) { color: #7b2735; }
	.evidence-upload-progress :global(.success-emblem) { color: #3c6b57; }
	@keyframes celestial-pulse { 0%, 100% { box-shadow: 0 0 0 1px #ae8745, 0 0 0 4px rgba(174,135,69,0.1); } 50% { box-shadow: 0 0 0 1px #ae8745, 0 0 0 7px rgba(174,135,69,0.04); } }
	@media (max-width: 640px) {
		.evidence-upload-progress .header { align-items: flex-start; }
		.evidence-upload-progress .connection-label { font-size: 0.65rem; }
		.evidence-upload-progress .current-stage { align-items: flex-start; }
		.evidence-upload-progress .stage-progress { font-size: 1.35rem; }
	}
	@media (prefers-reduced-motion: reduce) {
		.evidence-upload-progress .status-dot.connected,
		.evidence-upload-progress .timeline-item.current .timeline-dot { animation: none; }
	}
</style>
