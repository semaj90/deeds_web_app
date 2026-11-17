<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { SceneVideoEventBindingV1, ReadbackVideoTimelineV1, ScenePoseObservationReadbackV1 } from '$lib/splat/scene-video-event-readback-v1.js';
	import { joinSceneVideoEventReadbackV1, parseReadbackVideoTimelineV1, parseScenePoseReadbackV1, poseHipImageTrajectoryV1 } from '$lib/splat/scene-video-event-readback-v1.js';
	import { humanCoco17PoseSchemaV1 } from '$lib/shared/pose-skeleton-schema-v1.js';

	let { caseId, bindings }: { caseId: string; bindings: SceneVideoEventBindingV1[] } = $props();
	let rows = $state<ReturnType<typeof joinSceneVideoEventReadbackV1>>([]);
	let loading = $state(false);
	let error = $state('');
	let poseObservations = $state<ScenePoseObservationReadbackV1[]>([]);
	let poseReadbackUnavailable = $state(false);
	let poseFramePreviews = $state<Record<string, { url?: string; error?: string }>>({});
	let controller: AbortController | null = null;
	const MAX_SCENE_POSE_FRAME_PREVIEWS = 4;
	const MAX_SCENE_POSE_FRAME_PREVIEW_BYTES = 4 * 1024 * 1024;

	function poseFrameKey(pose: ScenePoseObservationReadbackV1): string {
		return `${pose.evidenceId}:${pose.sourceRevision}:${pose.analysisRevision}:${pose.frameIndex}`;
	}

	function releasePoseFramePreviews() {
		for (const preview of Object.values(untrack(() => poseFramePreviews))) {
			if (preview.url) URL.revokeObjectURL(preview.url);
		}
		poseFramePreviews = {};
	}

	function setPoseFramePreview(key: string, preview: { url?: string; error?: string }) {
		poseFramePreviews = { ...untrack(() => poseFramePreviews), [key]: preview };
	}

	$effect(() => {
		const currentCaseId = caseId;
		const currentBindings = bindings;
		const signature = JSON.stringify(currentBindings);
		controller?.abort();
		const request = new AbortController();
		controller = request;
		rows = [];
		poseObservations = [];
		releasePoseFramePreviews();
		poseReadbackUnavailable = false;
		error = '';
		if (!currentBindings.length) {
			loading = false;
			return;
		}
		loading = true;
		void (async () => {
			try {
				const evidenceIds = [...new Set(currentBindings.map((binding) => binding.evidenceId))];
				const responses = await Promise.all(evidenceIds.map(async (evidenceId) => {
					const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/video-events`, {
						cache: 'no-store', signal: request.signal
					});
					const payload: unknown = await response.json().catch(() => null);
					if (!response.ok || !payload || typeof payload !== 'object' || (payload as { success?: unknown }).success !== true) {
						throw new Error(`Could not read authorized video events (${response.status}).`);
					}
					let versionsPayload: unknown = null;
					try {
						const versionsResponse = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions?limit=200`, { cache: 'no-store', signal: request.signal });
						versionsPayload = versionsResponse.ok ? await versionsResponse.json().catch(() => null) : null;
					} catch { /* preserve event timeline even if pose history is temporarily unavailable */ }
					return [evidenceId, parseReadbackVideoTimelineV1((payload as { eventTimeline?: unknown }).eventTimeline, evidenceId), versionsPayload] as const;
				}));
				if (request.signal.aborted || JSON.stringify(bindings) !== signature || caseId !== currentCaseId) return;
				const timelines = new Map<string, ReadbackVideoTimelineV1>(responses.flatMap(([evidenceId, timeline]) => timeline ? [[evidenceId, timeline] as const] : []));
				rows = joinSceneVideoEventReadbackV1(currentBindings, timelines);
				const poseRows: ScenePoseObservationReadbackV1[] = [];
				for (const [evidenceId, , versions] of responses) {
					const scopedBindings = currentBindings.filter((binding) => binding.evidenceId === evidenceId);
					if (!versions) { poseReadbackUnavailable = true; continue; }
					poseRows.push(...parseScenePoseReadbackV1(versions, scopedBindings));
				}
				poseObservations = poseRows;
				// Event and pose metadata stay visible while bounded frame bytes load separately.
				loading = false;
				// Full source-frame previews are bounded separately from the small SVG skeleton list.
				for (const pose of poseRows.slice(-MAX_SCENE_POSE_FRAME_PREVIEWS)) {
					const key = poseFrameKey(pose);
					setPoseFramePreview(key, {});
					try {
						const response = await fetch(`/api/evidence/${encodeURIComponent(pose.evidenceId)}/video-frame/${pose.frameIndex}`, {
							cache: 'no-store', signal: request.signal
						});
						if (!response.ok) throw new Error(`Frame preview unavailable (${response.status}).`);
						const timestampMs = Number(response.headers.get('X-Frame-Timestamp-Ms'));
						if (response.headers.get('X-Source-Revision') !== pose.sourceRevision
							|| response.headers.get('X-Analysis-Revision') !== pose.analysisRevision
							|| response.headers.get('X-Frame-Index') !== String(pose.frameIndex)
							|| !Number.isSafeInteger(timestampMs)
							|| Math.abs(timestampMs - pose.framePtsUs / 1000) > 1) {
							throw new Error('Frame preview does not match this pose revision and timestamp.');
						}
						const blob = await response.blob();
						if (blob.size <= 0 || blob.size > MAX_SCENE_POSE_FRAME_PREVIEW_BYTES) throw new Error('Frame preview exceeds the scene-view size limit.');
						const bitmap = await createImageBitmap(blob);
						const expectedRatio = pose.frameWidth / pose.frameHeight;
					const actualRatio = bitmap.width / bitmap.height;
					bitmap.close();
					if (!Number.isFinite(actualRatio) || Math.abs(actualRatio - expectedRatio) > expectedRatio * 0.002) {
						throw new Error('Frame preview dimensions do not match this pose.');
					}
					if (request.signal.aborted) continue;
					setPoseFramePreview(key, { url: URL.createObjectURL(blob) });
				} catch (cause) {
					if (!request.signal.aborted) setPoseFramePreview(key, { error: cause instanceof Error ? cause.message : 'Frame preview unavailable.' });
				}
				}
			} catch (cause) {
				if (!request.signal.aborted) error = cause instanceof Error ? cause.message : 'Could not load scene event sources.';
			} finally {
				if (!request.signal.aborted) loading = false;
			}
		})();
	});

	onDestroy(() => {
		controller?.abort();
		releasePoseFramePreviews();
	});

	function formatTime(ms: number): string {
		const total = Math.floor(ms / 1000);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	}

	function poseTimeMs(pose: ScenePoseObservationReadbackV1): number {
		return Math.round(pose.framePtsUs / 1000);
	}
</script>

<section class="scene-event-links" aria-label="Source-linked video event timeline" data-testid="scene-video-event-bindings">
	<h3>Source-linked video events</h3>
	<p>These reviewed events are attached to this scene revision by source time. They do not define 3D positions or prove a reconstruction.</p>
	{#if loading}
		<p role="status">Checking authorized event readback…</p>
	{:else if error}
		<p role="alert">{error}</p>
	{:else if rows.length}
		<ol>
			{#each rows as row (`${row.binding.evidenceId}:${row.binding.eventId}`)}
				<li>
					{#if row.event}
						<strong>{row.event.label}</strong>
						<p>{row.event.summary}</p>
						<a href={`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(row.binding.evidenceId)}?timeMs=${row.binding.startMs}`}>
							Open source at {formatTime(row.binding.startMs)}–{formatTime(row.binding.endMs)}
						</a>
					{:else}
						<strong>Linked event is stale or no longer approved</strong>
						<p>The source revision, analysis revision, interval, or approval no longer matches. Reload the scene revision before relying on this link.</p>
					{/if}
				</li>
			{/each}
		</ol>
		{#if poseReadbackUnavailable}
			<p role="status">Pose revision history is unavailable. Event links remain visible; no pose data was inferred.</p>
		{/if}
		{#if poseObservations.length}
			<section aria-label="Source-frame pose annotations" data-testid="scene-pose-observations">
				<h4>Source-frame pose annotations</h4>
				<p>These are image-space landmark annotations, not calibrated 3D joints or actor identity.</p>
				<ul>
					{#each poseObservations as pose (`${pose.evidenceId}:${pose.analysisRevision}:${pose.framePtsUs}:${pose.trackId ?? 'manual'}:${pose.trackScopeId ?? ''}`)}
						{@const hipTrail = poseHipImageTrajectoryV1(poseObservations, pose)}
						<li>
							<div class="pose-preview-row">
								<div class="pose-source-preview" style={`aspect-ratio:${pose.frameWidth}/${pose.frameHeight}`}>
									{#if poseFramePreviews[poseFrameKey(pose)]?.url}
										<img src={poseFramePreviews[poseFrameKey(pose)].url} alt="" aria-hidden="true" />
									{:else if poseFramePreviews[poseFrameKey(pose)]?.error}
										<p role="status">{poseFramePreviews[poseFrameKey(pose)].error}</p>
									{:else if poseObservations.slice(-MAX_SCENE_POSE_FRAME_PREVIEWS).some((candidate) => poseFrameKey(candidate) === poseFrameKey(pose))}
										<p role="status">Loading source frame…</p>
									{/if}
										<svg viewBox={`0 0 ${pose.frameWidth} ${pose.frameHeight}`} preserveAspectRatio="none" role="img" aria-label={`Source-frame skeleton preview, frame ${pose.frameIndex + 1}`}>
											{#if hipTrail.length > 1}
												<polyline class="hip-trail" points={hipTrail.map((point) => `${point.x},${point.y}`).join(' ')} />
												{#each hipTrail as point (`${point.frameIndex}:${point.framePtsUs}`)}
													<circle class:hip-current={point.current} class="hip-trail-point" cx={point.x} cy={point.y} r={Math.max(3, Math.min(pose.frameWidth, pose.frameHeight) * 0.014)} />
												{/each}
											{/if}
									{#each humanCoco17PoseSchemaV1.bones as [from, to] (`${from}-${to}`)}
										{@const start = pose.keypoints[from]}
										{@const end = pose.keypoints[to]}
										{#if start?.x !== null && start?.x !== undefined && start.y !== null && end?.x !== null && end?.x !== undefined && end.y !== null}
											<line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
										{/if}
									{/each}
									{#each pose.keypoints as point (point.index)}
										{#if point.x !== null && point.y !== null}<circle cx={point.x} cy={point.y} r={Math.max(2, Math.min(pose.frameWidth, pose.frameHeight) * 0.012)} />{/if}
									{/each}
								</svg>
								</div>
								<div>
									<span>Frame {pose.frameIndex + 1} · {pose.placedKeypoints}/{pose.totalKeypoints} landmarks · {pose.reviewDecision === 'ACCEPTED_FOR_SCENE_PROPOSAL' ? 'accepted proposal' : pose.reviewDecision === 'REJECTED' ? 'rejected proposal' : pose.reviewState.replaceAll('_', ' ').toLowerCase()} · revision {pose.annotationRevision}{pose.trackId ? ` · track hypothesis ${pose.trackId}` : ''}</span>
										{#if hipTrail.length > 1}<small>Hip-center image trail · camera motion not corrected · no world scale</small>{/if}
									<a href={`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(pose.evidenceId)}?timeMs=${poseTimeMs(pose)}`}>Open source at {formatTime(poseTimeMs(pose))}</a>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</section>

<style>
	.scene-event-links { margin-top: 1rem; border: 1px solid #665126; border-radius: .65rem; padding: .75rem; background: #141720; color: #eee7d8; }
	.scene-event-links h3 { margin: 0; color: #f0d084; font: 600 .95rem Georgia, serif; }
	.scene-event-links > p { margin: .35rem 0; color: #b6b5b3; font-size: .75rem; }
	.scene-event-links ol { display: grid; gap: .5rem; margin: .6rem 0 0; padding-left: 1.2rem; }
	.scene-event-links li { padding: .5rem; border: 1px solid #403724; border-radius: .45rem; }
	.scene-event-links li p { margin: .25rem 0; color: #c8c2b5; font-size: .76rem; }
	.scene-event-links a { color: #f0d084; font-size: .76rem; text-decoration: underline; }
	.scene-event-links h4 { margin: .8rem 0 .25rem; color: #e7c978; font-size: .82rem; }
	.scene-event-links section > p { margin: .25rem 0; color: #b6b5b3; font-size: .72rem; }
	.scene-event-links section ul { display: grid; gap: .35rem; margin: .45rem 0 0; padding: 0; list-style: none; }
	.scene-event-links section li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .4rem; border-bottom: 1px solid #403724; padding: .35rem 0; color: #c8c2b5; font-size: .72rem; }
	.pose-preview-row { display: flex; align-items: center; gap: .65rem; width: 100%; }
	.pose-source-preview { position: relative; flex: 0 1 20rem; width: min(100%, 20rem); min-width: 9rem; overflow: hidden; border: 1px solid #51483d; background: #090d15; }
	.pose-source-preview img, .pose-source-preview svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
	.pose-source-preview img { object-fit: fill; }
	.pose-source-preview svg { overflow: hidden; pointer-events: none; }
	.pose-source-preview p { position: absolute; z-index: 1; inset: auto 0 0; margin: 0; padding: .2rem .35rem; background: #090d15dd; color: #f0e8d8; font-size: .65rem; }
	.pose-preview-row line { stroke: #6fe4d4; stroke-width: 3; stroke-linecap: round; }
	.pose-preview-row circle { fill: #ffd36d; stroke: #171d29; stroke-width: 1.5; }
	.pose-preview-row .hip-trail { fill: none; stroke: #f28f62; stroke-width: 2.25; stroke-dasharray: 4 3; opacity: .9; }
	.pose-preview-row .hip-trail-point { fill: #f28f62; stroke: #251d29; stroke-width: 1.25; }
	.pose-preview-row .hip-trail-point.hip-current { fill: #fff4ad; stroke: #b34532; stroke-width: 2; }
	.pose-preview-row small { color: #f1c293; font-size: .68rem; }
	.pose-preview-row > div { display: grid; gap: .25rem; }
</style>
