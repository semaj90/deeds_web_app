<script lang="ts">
	type EventReference =
		| { kind: 'transcript_segment'; referenceId: string; transcriptId: string; segmentIndex: number; startMs: number; endMs: number; text: string; modelRevision: string | null }
		| { kind: 'frame_detection'; referenceId: string; frameIndex: number; timestampMs: number; artifactSha256: string; modelRevision: string | null; label: string; confidence: number; bbox: number[] }
		| { kind: 'frame_ocr'; referenceId: string; frameIndex: number; timestampMs: number; artifactSha256: string; text: string; modelRevision: string | null };
	type VideoEvent = {
		eventId: string;
		startMs: number;
		endMs: number;
		label: string;
		summary: string;
		sourceReferences: EventReference[];
		reviewStatus: 'UNREVIEWED_PROPOSAL' | 'APPROVED' | 'REJECTED';
		sceneAdmission: 'NOT_ADMITTED' | 'APPROVED_FOR_SCENE_PROPOSAL';
	};
	type Timeline = { sourceRevision: string; analysisRevision: string; status: 'PROPOSED' | 'PARTIAL' | 'EMPTY'; events: VideoEvent[] };

	let { evidenceId, onSeek }: { evidenceId: string; onSeek: (timestampMs: number) => void } = $props();
	let timeline = $state<Timeline | null>(null);
	let reviewEnabled = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let savingEventId = $state<string | null>(null);

	$effect(() => {
		const id = evidenceId;
		if (id) void load(id);
	});

	async function load(id: string) {
		loading = true;
		error = null;
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(id)}/video-events`, { cache: 'no-store' });
			const payload = await response.json();
			if (!response.ok || payload?.success !== true) throw new Error(payload?.error ?? 'Could not load events.');
			if (id !== evidenceId) return;
			timeline = payload.eventTimeline ?? null;
			reviewEnabled = payload.reviewEnabled === true;
		} catch (cause) {
			if (id === evidenceId) error = cause instanceof Error ? cause.message : 'Could not load events.';
		} finally {
			if (id === evidenceId) loading = false;
		}
	}

	async function review(event: VideoEvent, reviewStatus: 'APPROVED' | 'REJECTED') {
		savingEventId = event.eventId;
		error = null;
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/video-events`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					eventId: event.eventId,
					sourceRevision: timeline?.sourceRevision,
					analysisRevision: timeline?.analysisRevision,
					reviewStatus
				})
			});
			const payload = await response.json();
			if (!response.ok || payload?.success !== true) throw new Error(payload?.error ?? 'Could not save review.');
			await load(evidenceId);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save review.';
		} finally {
			savingEventId = null;
		}
	}

	function formatTime(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	}
</script>

<section class="video-event-timeline" aria-label="Source-linked event proposals" data-testid="video-event-timeline">
	<header>
		<div>
			<h3>Event timeline</h3>
			<p>Timestamped transcript and frame observations. Order does not establish cause.</p>
		</div>
		{#if timeline}<span class="timeline-state">{timeline.status}</span>{/if}
	</header>
	{#if loading}
		<p class="timeline-empty">Loading source-linked events…</p>
	{:else if error}
		<p class="timeline-error" role="alert">{error}</p>
	{:else if !timeline || timeline.events.length === 0}
		<p class="timeline-empty">No event proposals are available for this video revision yet.</p>
	{:else}
		{#if timeline.status === 'PARTIAL'}
			<p class="timeline-warning">Some observations exceeded the timeline budget and were omitted. Reprocess before relying on full coverage.</p>
		{/if}
		<ol>
			{#each timeline.events as event (event.eventId)}
				<li data-event-id={event.eventId}>
					<div class="event-heading">
						<button type="button" class="event-seek" onclick={() => onSeek(event.startMs)} aria-label={`Seek to ${formatTime(event.startMs)}`}>
							{formatTime(event.startMs)}–{formatTime(event.endMs)}
						</button>
						<span class:approved={event.reviewStatus === 'APPROVED'} class:rejected={event.reviewStatus === 'REJECTED'} class="review-state">{event.reviewStatus.replaceAll('_', ' ')}</span>
					</div>
					<strong>{event.label}</strong>
					<p>{event.summary}</p>
					<ul class="event-sources">
						{#each event.sourceReferences as source (source.referenceId)}
							<li>
								{#if source.kind === 'transcript_segment'}
									<button type="button" onclick={() => onSeek(source.startMs)}>Transcript {formatTime(source.startMs)}: {source.text}</button>
								{:else if source.kind === 'frame_detection'}
									<button type="button" onclick={() => onSeek(source.timestampMs)}>Frame {source.frameIndex + 1} · {source.label} · {Math.round(source.confidence * 100)}%</button>
								{:else}
									<button type="button" onclick={() => onSeek(source.timestampMs)}>Frame {source.frameIndex + 1} OCR · {source.text}</button>
								{/if}
							</li>
						{/each}
					</ul>
					{#if reviewEnabled}
						<div class="event-review-actions">
							<button type="button" disabled={savingEventId === event.eventId} onclick={() => review(event, 'APPROVED')}>Approve for scene proposal</button>
							<button type="button" disabled={savingEventId === event.eventId} onclick={() => review(event, 'REJECTED')}>Reject</button>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.video-event-timeline { padding: 0.9rem 1rem; border-bottom: 1px solid var(--dossier-hairline, #d8cbbb); background: var(--dossier-bg-card, #faf6f0); color: var(--dossier-text-main, #24201c); }
	.video-event-timeline header, .event-heading, .event-review-actions { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.video-event-timeline h3 { margin: 0; font-size: 1rem; }
	.video-event-timeline header p, .video-event-timeline li > p { margin: 0.25rem 0 0.5rem; font-size: 0.82rem; }
	.timeline-state, .review-state { font-size: 0.68rem; letter-spacing: 0.04em; }
	.video-event-timeline ol { display: grid; gap: 0.65rem; padding: 0; margin: 0.8rem 0 0; list-style: none; }
	.video-event-timeline ol > li { border: 1px solid var(--dossier-hairline, #d8cbbb); border-radius: 0.5rem; padding: 0.7rem; background: #fffaf1; }
	.event-seek, .event-sources button, .event-review-actions button { cursor: pointer; font: inherit; }
	.event-seek, .event-sources button { border: 0; padding: 0; color: inherit; background: transparent; text-align: left; }
	.event-seek { font-weight: 700; }
	.event-sources { padding-left: 1rem; margin: 0.5rem 0; font-size: 0.78rem; }
	.event-sources li + li { margin-top: 0.2rem; }
	.event-review-actions { justify-content: flex-start; }
	.event-review-actions button { border: 1px solid #35281f; border-radius: 0.35rem; padding: 0.3rem 0.55rem; background: #211810; color: #fffaf1; }
	.event-review-actions button:disabled { opacity: 0.6; cursor: wait; }
	.review-state.approved { color: #1c6b40; }
	.review-state.rejected { color: #9f2c2c; }
	.timeline-empty, .timeline-warning, .timeline-error { margin: 0.8rem 0 0; font-size: 0.85rem; }
	.timeline-warning, .timeline-error { color: #8c2a20; }
</style>
