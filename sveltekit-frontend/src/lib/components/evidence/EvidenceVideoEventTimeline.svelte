<script lang="ts">
	import { createSceneDocumentV1, createSceneQualityReceiptV1 } from '$lib/splat/scene-document-v1.js';
	import { evidenceSceneIdV1, fetchSceneRevisionV1, saveSceneManifestRevisionV1 } from '$lib/splat/scene-persistence-client-v1.js';
	import { deriveReviewedGroundPlaneTrackFromHistoryV1, groundTrackSnapshotPointsV1, sameGroundTrackSnapshotPointsV1, type ReviewedGroundPlanePointV1 } from '$lib/splat/reviewed-ground-plane-track-v1.js';
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
	type Timeline = { caseId: string; evidenceId: string; sourceRevision: string; analysisRevision: string; status: 'PROPOSED' | 'PARTIAL' | 'EMPTY'; events: VideoEvent[] };

	let { evidenceId, onSeek }: { evidenceId: string; onSeek: (timestampMs: number) => void } = $props();
	let timeline = $state<Timeline | null>(null);
	let reviewEnabled = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let savingEventId = $state<string | null>(null);
	let savingSceneEventId = $state<string | null>(null);
	let sceneSaveMessage = $state<string | null>(null);
	let reviewedGroundTracks = $state<Array<{ key: string; trackId: string; trackScopeId: string; calibrationRevisionId: string; points: ReviewedGroundPlanePointV1[] }>>([]);
	let savingGroundTrackKey = $state<string | null>(null);
	let localPreview = $state(false);
	const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	$effect(() => {
		const id = evidenceId;
		localPreview = !UUID_PATTERN.test(id);
		if (localPreview) {
			timeline = null;
			error = null;
			loading = false;
			return;
		}
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
			reviewedGroundTracks = [];
			if (timeline) {
				const historyResponse = await fetch(`/api/evidence/${encodeURIComponent(id)}/versions?limit=200`, { cache: 'no-store' });
				const history = historyResponse.ok ? await historyResponse.json().catch(() => null) : null;
				const projected = await deriveReviewedGroundPlaneTrackFromHistoryV1({
					history, evidenceId: timeline.evidenceId, caseId: timeline.caseId,
					sourceRevision: timeline.sourceRevision, analysisRevision: timeline.analysisRevision
				});
				const groups = new Map<string, ReviewedGroundPlanePointV1[]>();
				for (const point of projected) {
					if (!point.trackId || !point.trackScopeId) continue;
					const key = `${point.trackId}:${point.trackScopeId}:${point.calibrationRevisionId}`;
					const group = groups.get(key) ?? [];
					group.push(point);
					groups.set(key, group);
				}
				reviewedGroundTracks = [...groups.entries()].filter(([, points]) => points.length >= 2).map(([key, points]) => ({
					key, trackId: points[0]!.trackId!, trackScopeId: points[0]!.trackScopeId!,
					calibrationRevisionId: points[0]!.calibrationRevisionId, points
				}));
			}
		} catch (cause) {
			if (id === evidenceId) error = cause instanceof Error ? cause.message : 'Could not load events.';
		} finally {
			if (id === evidenceId) loading = false;
		}
	}

	async function saveGroundTrackToScene(track: (typeof reviewedGroundTracks)[number]) {
		if (!timeline || savingGroundTrackKey !== null || track.points.length < 2) return;
		const { caseId, sourceRevision, analysisRevision } = timeline;
		const sourceEvidenceId = evidenceId;
		savingGroundTrackKey = track.key;
		sceneSaveMessage = null;
		error = null;
		try {
			const sceneId = await evidenceSceneIdV1(caseId, sourceEvidenceId);
			const current = await fetchSceneRevisionV1({ caseId, sceneId });
			const prior = current?.manifest.groundPlaneTrackProposals ?? [];
			const sameTrack = (proposal: (typeof prior)[number]) => proposal.evidenceId === sourceEvidenceId
				&& proposal.sourceRevision === sourceRevision && proposal.analysisRevision === analysisRevision
				&& proposal.trackId === track.trackId && proposal.trackScopeId === track.trackScopeId;
			const points = groundTrackSnapshotPointsV1(track.points);
			if (prior.some((proposal) => sameTrack(proposal) && proposal.calibrationRevisionId === track.calibrationRevisionId &&
				sameGroundTrackSnapshotPointsV1(proposal.points, points))) {
				sceneSaveMessage = 'This reviewed ground-plane track is already on the scene revision.';
				return;
			}
			const proposal = {
				proposalId: crypto.randomUUID(), evidenceId: sourceEvidenceId, sourceRevision,
				analysisRevision, calibrationRevisionId: track.calibrationRevisionId,
				trackId: track.trackId, trackScopeId: track.trackScopeId,
				status: 'REVIEWED_GROUND_PLANE_PROPOSAL' as const,
				semantics: 'image_to_measured_plane_only_no_height_or_camera_motion_compensation' as const,
				points,
			};
			const evidenceBinding = { evidenceId: sourceEvidenceId, sourceRevision };
			const manifest = createSceneDocumentV1(current ? {
				...current.manifest,
				revision: current.revision + 1,
				parentManifestSha256: current.manifestSha256,
				createdAt: new Date().toISOString(),
				evidenceBindings: [...(current.manifest.evidenceBindings ?? []).filter((binding) => binding.evidenceId !== sourceEvidenceId), evidenceBinding],
				groundPlaneTrackProposals: [...prior.filter((saved) => !sameTrack(saved)), proposal]
			} : {
				schema: 'parent-atlas.scene-document.v1', sceneId, caseId, status: 'HYPOTHESIS',
				revision: 1, parentManifestSha256: null, createdAt: new Date().toISOString(), coordinateFrame: 'LOCAL_UNCALIBRATED',
				objects: [], animations: [], evidenceBindings: [evidenceBinding], groundPlaneTrackProposals: [proposal],
				evidenceSources: [], assets: [],
				quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
			});
			const receipt = await saveSceneManifestRevisionV1({ caseId, sceneId, expectedRevision: current?.revision ?? 0, commandId: crypto.randomUUID(), manifest });
			const readback = await fetchSceneRevisionV1({ caseId, sceneId, revision: receipt.revision });
			const persisted = readback?.manifest.groundPlaneTrackProposals?.some((saved) => saved.proposalId === proposal.proposalId
				&& sameTrack(saved) && saved.calibrationRevisionId === track.calibrationRevisionId
				&& sameGroundTrackSnapshotPointsV1(saved.points, points));
			if (!persisted || !readback || readback.manifestSha256 !== receipt.manifestSha256) throw new Error('Scene revision readback did not match the reviewed ground-track proposal.');
			sceneSaveMessage = `Saved reviewed 2D ground-plane track as scene revision ${readback.revision}. Height and camera movement remain unknown.`;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not add the reviewed ground track to the scene.';
		} finally {
			savingGroundTrackKey = null;
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

	async function saveApprovedEventToScene(event: VideoEvent) {
		if (!timeline || event.reviewStatus !== 'APPROVED' || event.sceneAdmission !== 'APPROVED_FOR_SCENE_PROPOSAL') return;
		savingSceneEventId = event.eventId;
		sceneSaveMessage = null;
		error = null;
		try {
			const sceneId = await evidenceSceneIdV1(timeline.caseId, evidenceId);
			const current = await fetchSceneRevisionV1({ caseId: timeline.caseId, sceneId });
			if (current?.manifest.videoEventBindings?.some((binding) => binding.evidenceId === evidenceId && binding.eventId === event.eventId)) {
				sceneSaveMessage = 'This reviewed event is already on the scene timeline.';
				return;
			}
			const evidenceBinding = { evidenceId, sourceRevision: timeline.sourceRevision };
			const eventBinding = {
				evidenceId,
				sourceRevision: timeline.sourceRevision,
				analysisRevision: timeline.analysisRevision,
				eventId: event.eventId,
				startMs: event.startMs,
				endMs: event.endMs,
				reviewState: 'APPROVED_FOR_SCENE_PROPOSAL' as const
			};
			const manifest = createSceneDocumentV1(current ? {
				...current.manifest,
				revision: current.revision + 1,
				parentManifestSha256: current.manifestSha256,
				createdAt: new Date().toISOString(),
				evidenceBindings: [...(current.manifest.evidenceBindings ?? []).filter((binding) => binding.evidenceId !== evidenceId), evidenceBinding],
				videoEventBindings: [...(current.manifest.videoEventBindings ?? []), eventBinding]
			} : {
				schema: 'parent-atlas.scene-document.v1', sceneId, caseId: timeline.caseId, status: 'HYPOTHESIS',
				revision: 1, parentManifestSha256: null, createdAt: new Date().toISOString(), coordinateFrame: 'LOCAL_UNCALIBRATED',
				objects: [], animations: [], evidenceBindings: [evidenceBinding], videoEventBindings: [eventBinding],
				evidenceSources: [], assets: [],
				quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
			});
			await saveSceneManifestRevisionV1({
				caseId: timeline.caseId,
				sceneId,
				expectedRevision: current?.revision ?? 0,
				commandId: crypto.randomUUID(),
				manifest
			});
			const readback = await fetchSceneRevisionV1({ caseId: timeline.caseId, sceneId });
			const persisted = readback?.manifest.videoEventBindings?.some((binding) =>
				binding.evidenceId === evidenceId && binding.eventId === event.eventId
					&& binding.sourceRevision === timeline.sourceRevision && binding.analysisRevision === timeline.analysisRevision
			);
			if (!persisted || !readback) throw new Error('Scene timeline save did not match an independent revision readback.');
			sceneSaveMessage = `Saved as scene revision ${readback.revision}; source time ${formatTime(event.startMs)}–${formatTime(event.endMs)}.`;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not add this event to the scene timeline.';
		} finally {
			savingSceneEventId = null;
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
	{:else if localPreview}
		<p class="timeline-empty">This is a local or synthetic preview. Save the original as case evidence before loading a source-linked event timeline.</p>
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
					{#if event.reviewStatus === 'APPROVED' && event.sceneAdmission === 'APPROVED_FOR_SCENE_PROPOSAL'}
						<div class="event-review-actions">
							<button type="button" disabled={savingSceneEventId === event.eventId} onclick={() => saveApprovedEventToScene(event)}>
								{savingSceneEventId === event.eventId ? 'Saving…' : 'Add to scene timeline'}
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
	{#if sceneSaveMessage}<p class="timeline-success" role="status">{sceneSaveMessage}</p>{/if}
	{#if reviewedGroundTracks.length}
		<section class="ground-tracks" aria-label="Reviewed ground-plane motion tracks">
			<h4>Reviewed motion tracks</h4>
			<p>Fixed-camera ground-plane proposals derived from manually reviewed contacts. No height or camera-motion correction.</p>
			{#each reviewedGroundTracks as track (track.key)}
				<div class="ground-track-row" data-testid="reviewed-ground-track">
					<span>{track.trackId} · {track.points.length} reviewed contacts · calibration {track.calibrationRevisionId}</span>
					<button type="button" disabled={savingGroundTrackKey !== null} onclick={() => void saveGroundTrackToScene(track)}>
						{savingGroundTrackKey === track.key ? 'Saving…' : 'Add reviewed track to scene'}
					</button>
				</div>
			{/each}
		</section>
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
	.timeline-success { margin: 0.8rem 0 0; color: #17603d; font-size: 0.85rem; }
	.ground-tracks { display: grid; gap: .5rem; margin-top: .9rem; border-top: 1px solid var(--dossier-hairline, #d8cbbb); padding-top: .75rem; }
	.ground-tracks h4, .ground-tracks p { margin: 0; }
	.ground-tracks p { font-size: .8rem; }
	.ground-track-row { display: flex; justify-content: space-between; align-items: center; gap: .75rem; border: 1px solid var(--dossier-hairline, #d8cbbb); border-radius: .4rem; padding: .55rem; background: #fffaf1; font-size: .75rem; }
	.ground-track-row button { cursor: pointer; border: 1px solid #35281f; border-radius: .35rem; padding: .3rem .55rem; background: #211810; color: #fffaf1; font: inherit; }
	.ground-track-row button:disabled { opacity: .6; cursor: wait; }
</style>
