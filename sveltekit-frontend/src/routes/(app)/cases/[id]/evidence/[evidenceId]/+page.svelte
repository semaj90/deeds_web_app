<script lang="ts">
	import { estimateEtaSeconds, formatEta } from '$lib/utils/progress-eta.js';
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';

	type Detail = {
		evidence: {
			id: string;
			fileName: string | null;
			fileType: string | null;
			evidenceType: string | null;
			fileSize: number | null;
			status: string | null;
			uploadedAt: string | null;
			createdAt: string | null;
			updatedAt: string | null;
			tags: string[];
			summary: string | null;
			text: string;
			textLength: number;
		};
		provenance: { sha256: string | null; sourceRevision: string | null; note: string };
		jobs: Array<{
			id: string;
			jobType: string;
			status: string;
			progress: string | number;
			createdAt: string;
			updatedAt: string;
			progressStep?: string;
			progressMessage?: string;
		}>;
		vectors: Array<{
			modality: string;
			sourceRevision: string;
			analysisRevision: string;
			model: string;
			outputSha256: string;
			analysisStatus: string | null;
			visionSummary: string | null;
			objectDetections: Array<{ class?: string; label?: string; confidence?: number }>;
			stageErrors: string[];
			entities: Array<{ text: string; label: string; source?: string }>;
			forensicFlags: unknown[];
			chunkIndex: string | null;
			chunkExcerpt: string | null;
		}>;
		transcript?: {
			videoTitle?: string | null;
			sourceRevision?: string | null;
			analysisRevision?: string | null;
			status?: string;
			segments?: Array<{
				id: string;
				startMs: number;
				endMs: number;
				text: string;
				speakerId?: string | null;
				reviewStatus?: string;
				analysisRevision?: string | null;
			}>;
		} | null;
		video: {
			status: string | null;
			substages: Record<string, { status?: string }> | null;
			sourceRevision: string | null;
			analysisRevision: string | null;
			frameCount: number;
			frames: Array<{ index: number; timestampMs: number | null; width: number | null; height: number | null; modelRevision: string | null; objects: Array<{ label: string; confidence: number | null; bbox: number[] | null }> }>;
		} | null;
	};

	let detail = $state<Detail | null>(null);
	let loadError = $state<string | null>(null);
	let loading = $state(true);
let mediaElement = $state<HTMLVideoElement | HTMLAudioElement | null>(null);
let selectedTranscriptId = $state<string | null>(null);
let selectedFrameIndex = $state<number | null>(null);
let transcriptError = $state<string | null>(null);
const jobProgressStreams = new Map<string, EventSource>();

function closeJobProgressStreams(): void {
	for (const source of jobProgressStreams.values()) source.close();
	jobProgressStreams.clear();
}

function updateJobProgress(jobId: string, patch: Partial<Detail['jobs'][number]>): void {
	if (!detail) return;
	detail = {
		...detail,
		jobs: detail.jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job),
	};
}

function connectJobProgressStreams(jobs: Detail['jobs']): void {
	closeJobProgressStreams();
	if (typeof EventSource === 'undefined') return;
	for (const job of jobs) {
		if (!['queued', 'running', 'processing'].includes(job.status.toLowerCase())) continue;
		const source = new EventSource(`/api/evidence/realtime?jobId=${encodeURIComponent(job.id)}`);
		jobProgressStreams.set(job.id, source);
		source.addEventListener('progress', (event) => {
			let payload: { progress?: unknown; step?: unknown; message?: unknown };
			try { payload = JSON.parse((event as MessageEvent<string>).data); } catch { return; }
			const rawProgress = Number(payload.progress);
			const step = typeof payload.step === 'string' ? payload.step : undefined;
			const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(step === 'complete' ? 100 : 99, rawProgress)) : 0;
			updateJobProgress(job.id, {
				progress,
				status: step === 'queued' ? 'queued' : step === 'complete' ? 'completed' : step === 'error' ? 'failed' : 'running',
				progressStep: step,
				updatedAt: new Date().toISOString(),
			});
		});
		source.addEventListener('complete', () => {
			updateJobProgress(job.id, { progress: 100, status: 'completed', progressStep: 'complete', progressMessage: 'Processing complete.' });
			source.close();
			jobProgressStreams.delete(job.id);
		});
		source.addEventListener('error', (event) => {
			if (!(event instanceof MessageEvent) || !event.data) return;
			let message = 'Processing failed.';
			try {
				const payload = JSON.parse(event.data) as { error?: unknown; message?: unknown };
				if (typeof payload.error === 'string') message = payload.error.slice(0, 180);
				else if (typeof payload.message === 'string') message = payload.message.slice(0, 180);
			} catch { /* keep stable message */ }
			updateJobProgress(job.id, { status: 'failed', progressStep: 'error', progressMessage: message });
			source.close();
			jobProgressStreams.delete(job.id);
		});
	}
}

	$effect(() => {
		const caseId = page.params.id;
		const evidenceId = page.params.evidenceId;
		closeJobProgressStreams();
		loading = true;
		loadError = null;
		detail = null;
		fetch(`/api/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/detail`)
			.then(async (res) => {
				if (!res.ok) throw new Error(res.status === 404 ? 'Evidence not found for this case.' : `Request failed (${res.status})`);
				return (await res.json()) as Detail;
			})
			.then(async (data) => {
				detail = data;
				if (data.evidence.fileType?.startsWith('video/') || data.evidence.fileType?.startsWith('audio/')) {
					const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/transcript?limit=500`);
					if (!response.ok) throw new Error(`Transcript request failed (${response.status})`);
					detail = { ...data, transcript: await response.json() as NonNullable<Detail['transcript']> };
				}
				connectJobProgressStreams(data.jobs);
			})
			.catch((err: unknown) => {
				if (detail) transcriptError = err instanceof Error ? err.message : 'Transcript could not be loaded.';
				else loadError = err instanceof Error ? err.message : 'Failed to load evidence detail.';
			})
			.finally(() => {
				loading = false;
			});
	});

	onDestroy(closeJobProgressStreams);

	function objectLabel(o: { class?: string; label?: string }): string {
		return o.class ?? o.label ?? 'unknown';
	}

	function formatBytes(n: number | null): string {
		if (n === null) return '—';
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}

	function seekTo(ms: number, selectedId?: string): void {
		if (!mediaElement || !Number.isFinite(ms) || ms < 0) return;
		mediaElement.currentTime = ms / 1000;
		if (selectedId) selectedTranscriptId = selectedId;
	}

function seekFromSourceLink(): void {
	const raw = page.url.searchParams.get('timeMs');
	if (raw === null || !mediaElement || mediaElement.readyState < 1) return;
	const requested = Number(raw);
	if (!Number.isSafeInteger(requested) || requested < 0) return;
	const durationMs = Number.isFinite(mediaElement.duration) ? mediaElement.duration * 1000 : requested;
	seekTo(Math.min(requested, durationMs));
}

$effect(() => {
	const query = page.url.searchParams.get('timeMs');
	const ready = mediaElement?.readyState;
	if (query !== null && ready !== undefined) seekFromSourceLink();
});

	function selectFrame(frameIndex: number, timestampMs: number | null): void {
		selectedFrameIndex = frameIndex;
		if (timestampMs !== null) seekTo(timestampMs);
	}

	function transcriptUrl(format: string): string {
		return `/api/evidence/${encodeURIComponent(page.params.evidenceId)}/transcript?export=${encodeURIComponent(format)}`;
	}

	function originalEvidenceUrl(inline: boolean): string {
		const suffix = inline ? '&inline=1' : '';
		return `/api/evidence/${encodeURIComponent(page.params.evidenceId)}/download?caseId=${encodeURIComponent(page.params.id)}${suffix}`;
	}
</script>

<svelte:head>
	<title>Evidence detail</title>
</svelte:head>

<main class="mx-auto max-w-4xl p-4 text-sm text-neutral-100">
	<nav class="mb-3 text-xs">
		<a class="underline" href={`/cases/${page.params.id}/evidence`}>← Back to evidence board</a>
	</nav>

	{#if loading}
		<p>Loading evidence detail…</p>
	{:else if loadError}
		<p class="text-red-300" role="alert">{loadError}</p>
	{:else if detail}
		<header class="mb-4 border-b-2 border-amber-300 pb-3">
			<h1 class="text-lg font-semibold">{detail.evidence.fileName ?? 'Untitled evidence'}</h1>
			<p class="text-xs text-neutral-400">
				{detail.evidence.evidenceType ?? 'unspecified'} · {detail.evidence.fileType ?? 'unknown type'} · {formatBytes(detail.evidence.fileSize)} · status {detail.evidence.status ?? '—'}
			</p>
			{#if detail.evidence.summary}
				<p class="mt-2 rounded border-2 border-neutral-700 bg-neutral-900 p-2 text-xs">Stored summary: {detail.evidence.summary}</p>
			{/if}
		</header>

		<section class="mb-4 rounded border-2 border-neutral-700 bg-neutral-900 p-3 shadow-[4px_4px_0_#080808]" aria-labelledby="source-h">
			<div class="mb-2 flex items-center justify-between gap-2">
				<h2 id="source-h" class="font-semibold text-neutral-100" style="color: #f5f5f5">Original evidence</h2>
				<a class="text-xs underline" href={originalEvidenceUrl(false)}>Download original</a>
			</div>
			{#if detail.evidence.fileType?.startsWith('video/')}
				<video bind:this={mediaElement} onloadedmetadata={seekFromSourceLink} controls preload="metadata" class="max-h-[60vh] w-full bg-black" aria-label="Original evidence video">
					<source src={originalEvidenceUrl(true)} type={detail.evidence.fileType} />
					Your browser does not support video playback.
				</video>
			{:else if detail.evidence.fileType?.startsWith('audio/')}
				<audio bind:this={mediaElement} controls preload="metadata" class="w-full" aria-label="Original evidence audio">
					<source src={originalEvidenceUrl(true)} type={detail.evidence.fileType} />
					Your browser does not support audio playback.
				</audio>
			{:else if detail.evidence.fileType?.startsWith('image/')}
				<img src={originalEvidenceUrl(true)} alt={`Original evidence: ${detail.evidence.fileName ?? 'image'}`} class="mx-auto max-h-[60vh] max-w-full object-contain" />
			{:else if detail.evidence.fileType === 'application/pdf'}
				<iframe title="Original evidence PDF" src={originalEvidenceUrl(true)} class="h-[65vh] w-full border-0"></iframe>
			{:else}
				<p class="text-xs text-neutral-400">Preview is unavailable for this file type. Use Download original to inspect the admitted source.</p>
			{/if}
		</section>

		<p class="mb-4 rounded border border-neutral-600 p-2 text-xs text-neutral-300">
			{detail.provenance.note} Detector labels, descriptions and entities are unreviewed proposals.
		</p>

		<section class="mb-4" aria-labelledby="prov-h">
			<h2 id="prov-h" class="mb-1 font-semibold">Provenance</h2>
			<dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
				<dt class="text-neutral-400">Source SHA-256</dt>
				<dd class="break-all font-mono">{detail.provenance.sourceRevision ?? '—'}</dd>
				<dt class="text-neutral-400">Uploaded</dt>
				<dd>{detail.evidence.uploadedAt ?? '—'}</dd>
				<dt class="text-neutral-400">Evidence ID</dt>
				<dd class="break-all font-mono">{detail.evidence.id}</dd>
			</dl>
		</section>

		<section class="mb-4" aria-labelledby="jobs-h">
			<h2 id="jobs-h" class="mb-1 font-semibold">Processing jobs</h2>
			{#if detail.jobs.length === 0}
				<p class="text-xs text-neutral-400">No jobs recorded.</p>
			{:else}
				<ul class="space-y-1 text-xs">
					{#each detail.jobs as job (job.id)}
						{@const progressValue = Math.max(0, Math.min(100, Number(job.progress) || 0))}
						<li class="analysis-job-progress">
							<div class="analysis-job-progress-label">
								<span><span class="font-mono">{job.jobType}</span> · {job.status}</span>
								<span class="flex items-center gap-2">
									{#if job.status.toLowerCase() === 'running' && estimateEtaSeconds(job.createdAt, progressValue, Date.now()) !== null}
										<span class="analysis-job-eta font-mono" title="Linear estimate from job start; approximate">~{formatEta(estimateEtaSeconds(job.createdAt, progressValue, Date.now()) ?? 0)} left</span>
									{/if}
									<strong>{Math.round(progressValue)}%</strong>
								</span>
							</div>
							<div
								class="analysis-progress-track"
								class:indeterminate={['queued', 'running', 'processing'].includes(job.status.toLowerCase()) && progressValue === 0}
								role="progressbar"
								aria-label={`${job.jobType} processing progress`}
								aria-valuemin="0"
								aria-valuemax="100"
								aria-valuenow={Math.round(progressValue)}
								aria-valuetext={progressValue === 0 && ['queued', 'running', 'processing'].includes(job.status.toLowerCase()) ? 'Waiting for the worker to report progress' : `${Math.round(progressValue)} percent`}
							>
								<span class="analysis-progress-fill" style={`--progress: ${progressValue}%`}></span>
							</div>
							<p class="analysis-job-progress-note" aria-live="polite">
				{job.status === 'queued' ? 'Waiting for an available worker.' : job.status === 'completed' ? 'Processing complete.' : job.status === 'failed' ? job.progressMessage ?? 'Processing failed.' : progressValue === 0 ? 'The worker has not reported a percentage yet.' : `Durable worker reported ${Math.round(progressValue)}% completion.`}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="mb-4" aria-labelledby="tags-h">
			<h2 id="tags-h" class="mb-1 font-semibold">Detector labels and tags</h2>
			{#if detail.evidence.tags.length === 0}
				<p class="text-xs text-neutral-400">No labels stored.</p>
			{:else}
				<p class="text-xs">{detail.evidence.tags.join(', ')}</p>
			{/if}
		</section>

		{#if detail.vectors.length > 0}
			<section class="mb-4" aria-labelledby="analysis-h">
				<h2 id="analysis-h" class="mb-1 font-semibold">Derived analysis</h2>
				{#each detail.vectors as v, i (i)}
					<article class="mb-3 rounded border border-neutral-700 p-2 text-xs">
						<p class="mb-1 font-semibold">{v.modality} · analysis {v.analysisStatus ?? '—'}</p>
						<p class="mb-1 font-mono text-[10px] text-neutral-400">model {v.model} · output {v.outputSha256}</p>
						{#if v.visionSummary}
							<p class="mb-1"><span class="text-neutral-400">Description (VLM):</span> {v.visionSummary}</p>
						{/if}
						{#if v.objectDetections.length > 0}
							<p class="mb-1"><span class="text-neutral-400">Objects (YOLO):</span>
								{v.objectDetections.map((o) => `${objectLabel(o)} ${typeof o.confidence === 'number' ? o.confidence.toFixed(2) : ''}`.trim()).join(' · ')}
							</p>
						{/if}
						{#if v.entities.length > 0}
							<p class="mb-1"><span class="text-neutral-400">Entities (LLM):</span>
								{v.entities.map((e) => `${e.text} (${e.label})`).join(' · ')}
							</p>
						{/if}
						{#if v.chunkExcerpt}
							<p class="mb-1"><span class="text-neutral-400">Source text excerpt, chunk {v.chunkIndex ?? ''}:</span> {v.chunkExcerpt}</p>
						{/if}
						{#if v.stageErrors.length > 0}
							<p class="text-amber-300">Stage errors: {v.stageErrors.join('; ')}</p>
						{/if}
					</article>
				{/each}
			</section>
		{/if}

		{#if detail.video}
			<section class="mb-4" aria-labelledby="video-h">
				<h2 id="video-h" class="mb-1 font-semibold">Video analysis</h2>
				<p class="mb-1 text-xs">Status {detail.video.status ?? '—'} · {detail.video.frameCount} frames</p>
				<p class="mb-1 break-all font-mono text-[10px] text-neutral-400">Source {detail.video.sourceRevision ?? '—'} · analysis {detail.video.analysisRevision ?? '—'}</p>
				{#if detail.video.substages}
					<ul class="mb-2 text-xs">
						{#each Object.entries(detail.video.substages) as [name, sub] (name)}
							<li>{name}: {sub.status ?? '—'}</li>
						{/each}
					</ul>
				{/if}
				<ul class="space-y-1 text-xs">
					{#each detail.video.frames as frame (frame.index)}
						<li class={selectedFrameIndex === frame.index ? 'rounded bg-neutral-800' : ''}>
							<button type="button" class="underline" onclick={() => selectFrame(frame.index, frame.timestampMs)}>
							Frame {frame.index}{frame.timestampMs !== null ? ` @ ${(frame.timestampMs / 1000).toFixed(1)}s` : ''}:
							{frame.objects.length === 0 ? 'no detections' : frame.objects.map((o) => o.label).join(', ')}
							</button>
							{#each frame.objects.filter((object) => object.bbox) as object, objectIndex (`${frame.index}-${objectIndex}`)}
								<p class="ml-3 rounded bg-neutral-900 px-2 py-1 font-mono text-[10px] text-neutral-300">{object.label} · source box [{object.bbox.join(', ')}] · {frame.width ?? '—'}×{frame.height ?? '—'} · model {frame.modelRevision ?? '—'} · unreviewed</p>
							{/each}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if detail.transcript}
			<section class="mb-4 rounded border-2 border-neutral-700 bg-neutral-900 p-3 shadow-[4px_4px_0_#080808]" aria-labelledby="transcript-h">
				<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
					<h2 id="transcript-h" class="font-semibold text-neutral-100" style="color: #f5f5f5">Transcript · {detail.transcript.status ?? 'unknown'}</h2>
					<div class="flex gap-3 text-xs">
						<a class="underline" href={transcriptUrl('json')}>Export JSON</a>
						<a class="underline" href={transcriptUrl('vtt')}>Export VTT</a>
					</div>
				</div>
				{#if transcriptError}
					<p role="status" class="text-xs text-amber-200">{transcriptError}</p>
				{:else if (detail.transcript.segments?.length ?? 0) === 0}
					<p class="text-xs text-neutral-400">No transcript segments are available for this source revision.</p>
				{:else}
					<ol class="max-h-80 space-y-1 overflow-y-auto">
						{#each detail.transcript.segments ?? [] as segment (segment.id)}
							<li class={selectedTranscriptId === segment.id ? 'rounded bg-neutral-800' : ''}>
								<button type="button" class="w-full rounded border border-neutral-700 p-2 text-left text-xs hover:bg-neutral-800" onclick={() => seekTo(segment.startMs, segment.id)}>
									<span class="mr-2 font-mono text-amber-200">{(segment.startMs / 1000).toFixed(2)}s</span>
									{#if segment.speakerId}<span class="mr-2 text-neutral-400">{segment.speakerId} · unverified</span>{/if}
									<span>{segment.text}</span>
									<span class="ml-2 text-neutral-400">{segment.reviewStatus ?? 'unreviewed proposal'}</span>
								</button>
							</li>
						{/each}
					</ol>
				{/if}
				<p class="mt-2 text-[10px] text-neutral-400">Transcript source revision: {detail.transcript.sourceRevision ?? '—'} · analysis revision: {detail.transcript.analysisRevision ?? '—'}</p>
			</section>
		{/if}

		{#if detail.evidence.text}
			<section class="mb-4" aria-labelledby="text-h">
				<h2 id="text-h" class="mb-1 font-semibold">Extracted text</h2>
				<pre class="whitespace-pre-wrap rounded border border-neutral-700 p-2 text-xs">{detail.evidence.text}</pre>
				{#if detail.evidence.textLength > detail.evidence.text.length}
					<p class="text-xs text-neutral-400">Showing the first {detail.evidence.text.length} of {detail.evidence.textLength} characters.</p>
				{/if}
			</section>
		{/if}
	{/if}
</main>

<style>
	.analysis-job-progress { display: grid; gap: 0.35rem; max-width: 28rem; padding: 0.45rem 0; }
	.analysis-job-progress-label { display: flex; justify-content: space-between; gap: 0.75rem; align-items: baseline; }
	.analysis-job-progress-label strong { font: 700 0.7rem ui-monospace, monospace; color: #f3d471; }
	.analysis-progress-track {
		position: relative;
		height: 0.8rem;
		overflow: hidden;
		border: 2px solid #111;
		border-radius: 0.2rem;
		background: #27231d;
		box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35) inset;
	}
	.analysis-progress-fill {
		display: block;
		width: var(--progress);
		height: 100%;
		background: linear-gradient(90deg, #16804f, #48ba68 55%, #f3d471);
		background-size: 1.1rem 100%;
		transition: width 320ms ease-out;
	}
	.analysis-progress-track.indeterminate .analysis-progress-fill {
		width: 38%;
		background-image: repeating-linear-gradient(135deg, #48ba68 0 8px, #247d4b 8px 16px);
		animation: analysis-progress-sweep 1.2s ease-in-out infinite alternate;
	}
	.analysis-job-progress-note { margin: 0; color: #b9b1a1; font-size: 0.68rem; }
	@keyframes analysis-progress-sweep { from { transform: translateX(-35%); } to { transform: translateX(165%); } }
	@media (prefers-reduced-motion: reduce) {
		.analysis-progress-fill { transition: none; }
		.analysis-progress-track.indeterminate .analysis-progress-fill { animation: none; width: 25%; transform: none; }
	}
</style>
