<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
	import type { SceneEvidenceAnalysisScopeV1, SceneVideoEventBindingV1, ReadbackVideoTimelineV1, ScenePoseObservationReadbackV1 } from '$lib/splat/scene-video-event-readback-v1.js';
	import { GROUND_PLANE_TRACK_TIME_PALETTE_V1, joinSceneVideoEventReadbackV1, layoutGroundPlaneTrackPlotV1, parseReadbackVideoTimelineV1, parseScenePoseReadbackV1, poseHipImageTrajectoryV1 } from '$lib/splat/scene-video-event-readback-v1.js';
	import { humanCoco17PoseSchemaV1 } from '$lib/shared/pose-skeleton-schema-v1.js';
	import { deriveReviewedGroundPlaneTrackFromHistoryV1, verifyReviewedGroundTrackSnapshotV1 } from '$lib/splat/reviewed-ground-plane-track-v1.js';

	let { caseId, bindings, groundPlaneTrackProposals = [] }: { caseId: string; bindings: SceneVideoEventBindingV1[]; groundPlaneTrackProposals?: NonNullable<SceneDocumentV1['groundPlaneTrackProposals']> } = $props();
	let rows = $state<ReturnType<typeof joinSceneVideoEventReadbackV1>>([]);
	let loading = $state(false);
	let error = $state('');
	let poseObservations = $state<ScenePoseObservationReadbackV1[]>([]);
	let verifiedGroundTrackIds = $state<string[]>([]);
	let selectedGroundTrackIndexById = $state<Record<string, number>>({});
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
		const currentGroundTracks = groundPlaneTrackProposals;
		const scopes: SceneEvidenceAnalysisScopeV1[] = [
			...currentBindings.map(({ evidenceId, sourceRevision, analysisRevision }) => ({ evidenceId, sourceRevision, analysisRevision })),
			...currentGroundTracks.map(({ evidenceId, sourceRevision, analysisRevision }) => ({ evidenceId, sourceRevision, analysisRevision }))
		];
		const uniqueScopes = [...new Map(scopes.map((scope) => [`${scope.evidenceId}:${scope.sourceRevision}:${scope.analysisRevision}`, scope])).values()];
		const signature = JSON.stringify({ currentBindings, currentGroundTracks });
		controller?.abort();
		const request = new AbortController();
		controller = request;
		rows = [];
		poseObservations = [];
		verifiedGroundTrackIds = [];
		releasePoseFramePreviews();
		poseReadbackUnavailable = false;
		error = '';
		if (!uniqueScopes.length) {
			loading = false;
			return;
		}
		loading = true;
		void (async () => {
			try {
				const evidenceIds = [...new Set(uniqueScopes.map((scope) => scope.evidenceId))];
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
				if (request.signal.aborted || JSON.stringify({ currentBindings: bindings, currentGroundTracks: groundPlaneTrackProposals }) !== signature || caseId !== currentCaseId) return;
				const timelines = new Map<string, ReadbackVideoTimelineV1>(responses.flatMap(([evidenceId, timeline]) => timeline ? [[evidenceId, timeline] as const] : []));
				rows = joinSceneVideoEventReadbackV1(currentBindings, timelines);
				const poseRows: ScenePoseObservationReadbackV1[] = [];
				const histories = new Map(responses.map(([evidenceId, , versions]) => [evidenceId, versions]));
				for (const [evidenceId, , versions] of responses) {
					const scopedBindings = uniqueScopes.filter((binding) => binding.evidenceId === evidenceId);
					if (!versions) { poseReadbackUnavailable = true; continue; }
					const readback = parseScenePoseReadbackV1(versions, scopedBindings);
					const projected: Array<Awaited<ReturnType<typeof deriveReviewedGroundPlaneTrackFromHistoryV1>>[number]> = [];
					const seenRuns = new Set<string>();
					for (const binding of scopedBindings) {
						const runKey = `${binding.evidenceId}:${binding.sourceRevision}:${binding.analysisRevision}`;
						if (seenRuns.has(runKey)) continue;
						seenRuns.add(runKey);
						try {
							projected.push(...await deriveReviewedGroundPlaneTrackFromHistoryV1({
								history: versions, evidenceId, caseId: currentCaseId,
								sourceRevision: binding.sourceRevision, analysisRevision: binding.analysisRevision,
							}));
						} catch (cause) {
							if (!(cause instanceof RangeError)) throw cause;
						}
					}
					poseRows.push(...readback.map((pose) => {
						const projection = projected.find((point) => point.frameIndex === pose.frameIndex && point.framePtsUs === pose.framePtsUs
							&& point.trackId === pose.trackId && point.trackScopeId === pose.trackScopeId);
						return projection ? { ...pose, groundPlanePoint: projection.planeM, groundPlaneCalibrationRevisionId: projection.calibrationRevisionId } : pose;
					}));
				}
				const verifiedIds = [];
				for (const proposal of currentGroundTracks) {
					if (request.signal.aborted) return;
					const timeline = timelines.get(proposal.evidenceId);
					if (timeline?.caseId !== currentCaseId || timeline.sourceRevision !== proposal.sourceRevision ||
						timeline.analysisRevision !== proposal.analysisRevision) continue;
					if (await verifyReviewedGroundTrackSnapshotV1({ history: histories.get(proposal.evidenceId), caseId: currentCaseId, proposal })) {
						verifiedIds.push(proposal.proposalId);
					}
				}
				if (request.signal.aborted) return;
				poseObservations = poseRows;
				verifiedGroundTrackIds = verifiedIds;
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

	function poseTrail(pose: ScenePoseObservationReadbackV1) {
		const windows = [
			...rows.filter(({ binding, event }) => event && binding.evidenceId === pose.evidenceId
				&& binding.sourceRevision === pose.sourceRevision && binding.analysisRevision === pose.analysisRevision)
				.map(({ binding }) => ({ startUs: binding.startMs * 1000, endUs: binding.endMs * 1000 })),
			...groundPlaneTrackProposals.filter((proposal) => verifiedGroundTrackIds.includes(proposal.proposalId)
				&& proposal.evidenceId === pose.evidenceId && proposal.sourceRevision === pose.sourceRevision
				&& proposal.analysisRevision === pose.analysisRevision && proposal.trackId === pose.trackId
				&& proposal.trackScopeId === pose.trackScopeId && proposal.points.length >= 2)
				.map((proposal) => ({ startUs: Math.min(...proposal.points.map((point) => point.framePtsUs)), endUs: Math.max(...proposal.points.map((point) => point.framePtsUs)) }))
		].filter((window) => pose.framePtsUs >= window.startUs && pose.framePtsUs <= window.endUs)
			.sort((a, b) => (a.endUs - a.startUs) - (b.endUs - b.startUs));
		return poseHipImageTrajectoryV1(poseObservations, pose, 24, windows[0]);
	}

	function selectGroundTrackSample(proposalId: string, value: string) {
		const index = Number(value);
		if (!Number.isInteger(index) || index < 0) return;
		selectedGroundTrackIndexById = { ...selectedGroundTrackIndexById, [proposalId]: index };
	}
</script>

<section class="scene-event-links" aria-label="Source-linked video event timeline" data-testid="scene-video-event-bindings">
	<h3>Source-linked video events</h3>
	<p>These reviewed events are attached to this scene revision by source time. They do not define 3D positions or prove a reconstruction.</p>
	{#if loading}
		<p role="status">Checking authorized event readback…</p>
	{:else if error}
		<p role="alert">{error}</p>
	{:else}
		{#if rows.length}
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
		{/if}
		{#if groundPlaneTrackProposals.length}
			<section aria-label="Saved ground-plane motion proposals" data-testid="scene-ground-plane-tracks">
				<h4>Saved motion proposals</h4>
				<p>These remain 2D ground-plane tracks. Their coordinates are shown only after exact authorized annotation-history readback matches the saved scene revision.</p>
				<ul>
					{#each groundPlaneTrackProposals as proposal (proposal.proposalId)}
						<li>
							{#if verifiedGroundTrackIds.includes(proposal.proposalId)}
								<strong>Verified proposal readback · {proposal.trackId}</strong>
								<span>{proposal.points.length} points · calibration revision {proposal.calibrationRevisionId}</span>
										{@const plotPoints = layoutGroundPlaneTrackPlotV1(proposal.points.map((point) => ({
											frameIndex: point.frameIndex,
											framePtsUs: point.framePtsUs,
											planeM: [point.planeM[0], point.planeM[1]] as readonly [number, number],
										})))}
								{#if plotPoints.length}
									{@const activeIndex = Math.min(plotPoints.length - 1, selectedGroundTrackIndexById[proposal.proposalId] ?? 0)}
									{@const activePoint = plotPoints[activeIndex]!}
									<figure class="ground-track-figure">
										<svg viewBox="0 0 240 150" role="img" aria-label={`Top-down measured ground-plane path for ${proposal.trackId}`}>
											<line class="ground-track-axis" x1="18" y1="132" x2="222" y2="132" />
											<line class="ground-track-axis" x1="18" y1="18" x2="18" y2="132" />
											<text x="222" y="146">X m</text><text x="3" y="14">Y m</text>
											<polyline class="ground-track-path" points={plotPoints.map((point) => `${point.x},${point.y}`).join(' ')} />
											{#each plotPoints as point (`${point.frameIndex}:${point.framePtsUs}`)}
												<a class:active={point.index === activeIndex} href={`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(proposal.evidenceId)}?timeMs=${Math.round(point.framePtsUs / 1000)}`} aria-label={`Open track point ${point.index + 1} at ${formatTime(Math.round(point.framePtsUs / 1000))}`}>
													<circle cx={point.x} cy={point.y} r={point.index === activeIndex ? 6 : 4.5} fill={GROUND_PLANE_TRACK_TIME_PALETTE_V1[point.paletteSlot] ?? '#c9593e'} />
													<title>{`Point ${point.index + 1}: ${point.planeM[0].toFixed(3)} m, ${point.planeM[1].toFixed(3)} m at ${formatTime(Math.round(point.framePtsUs / 1000))}`}</title>
												</a>
											{/each}
										</svg>
										<label class="ground-track-scrubber">Reviewed sample {activeIndex + 1} of {plotPoints.length}
											<input type="range" min="0" max={plotPoints.length - 1} step="1" value={activeIndex} aria-label={`Scrub reviewed samples for ${proposal.trackId}`} oninput={(event) => selectGroundTrackSample(proposal.proposalId, (event.currentTarget as HTMLInputElement).value)} />
										</label>
										<p class="ground-track-selected">Frame {activePoint.frameIndex + 1} · {formatTime(Math.round(activePoint.framePtsUs / 1000))} · X {activePoint.planeM[0].toFixed(3)} m, Y {activePoint.planeM[1].toFixed(3)} m · discrete reviewed sample; no interpolated positions</p>
										<a class="ground-track-open" href={`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(proposal.evidenceId)}?timeMs=${Math.round(activePoint.framePtsUs / 1000)}`}>Open selected source frame at {formatTime(Math.round(activePoint.framePtsUs / 1000))}</a>
										<figcaption><span>Earlier</span><span class="ground-track-time-ramp" aria-hidden="true"></span><span>Later</span> · points link to source time</figcaption>
									</figure>
								{/if}
								<ol class="ground-track-points">
									{#each proposal.points as point (`${point.frameIndex}:${point.framePtsUs}`)}
										<li><a href={`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(proposal.evidenceId)}?timeMs=${Math.round(point.framePtsUs / 1000)}`}>Frame {point.frameIndex + 1} · {formatTime(Math.round(point.framePtsUs / 1000))}</a> · X {point.planeM[0].toFixed(3)} m, Y {point.planeM[1].toFixed(3)} m</li>
									{/each}
								</ol>
							{:else}
								<strong>Saved motion proposal is stale or unverified</strong>
								<span>The source revision, calibration, annotation history, or reviewed points no longer match.</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if poseReadbackUnavailable}
			<p role="status">Pose revision history is unavailable. Event links remain visible; no pose data was inferred.</p>
		{/if}
		{#if poseObservations.length}
			<section aria-label="Source-frame pose annotations" data-testid="scene-pose-observations">
				<h4>Source-frame pose annotations</h4>
				<p>These are image-space landmark annotations, not calibrated 3D joints or actor identity.</p>
				<ul>
					{#each poseObservations as pose (`${pose.evidenceId}:${pose.analysisRevision}:${pose.framePtsUs}:${pose.trackId ?? 'manual'}:${pose.trackScopeId ?? ''}`)}
						{@const hipTrail = poseTrail(pose)}
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
					{#if pose.groundContact}<circle class:ground-contact-reviewed={pose.groundContactReviewed && pose.groundContactDecision === 'ACCEPTED_FOR_SCENE_PROPOSAL'} class="ground-contact-marker" cx={pose.groundContact.imagePx[0]} cy={pose.groundContact.imagePx[1]} r={Math.max(5, Math.min(pose.frameWidth, pose.frameHeight) * 0.018)} />{/if}
								</svg>
								</div>
								<div>
									<span>Frame {pose.frameIndex + 1} · {pose.placedKeypoints}/{pose.totalKeypoints} landmarks · {pose.reviewDecision === 'ACCEPTED_FOR_SCENE_PROPOSAL' ? 'accepted proposal' : pose.reviewDecision === 'REJECTED' ? 'rejected proposal' : pose.reviewState.replaceAll('_', ' ').toLowerCase()} · revision {pose.annotationRevision}{pose.trackId ? ` · track hypothesis ${pose.trackId}` : ''}</span>
									{#if hipTrail.length > 1}<small>Hip-center image trail · camera motion not corrected · no world scale</small>{/if}
									{#if pose.groundContact}<small>{pose.groundContactReviewed && pose.groundContactDecision === 'ACCEPTED_FOR_SCENE_PROPOSAL' ? 'Reviewed ground-contact candidate' : 'Unreviewed ground-contact candidate'} · {pose.groundContact.footSide} foot · source pixels{pose.groundContactReviewed && pose.groundContactDecision === 'ACCEPTED_FOR_SCENE_PROPOSAL' ? ' · plane projection still requires accepted calibration' : ''}</small>{/if}
										{#if pose.groundPlanePoint}<small>Reviewed ground-plane proposal: X {pose.groundPlanePoint[0].toFixed(3)} m, Y {pose.groundPlanePoint[1].toFixed(3)} m · calibration revision {pose.groundPlaneCalibrationRevisionId} · no height/camera-motion correction; not canonical scene geometry</small>{/if}
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
	.scene-event-links .ground-track-points { display: grid; width: 100%; padding-left: 1.25rem; }
	.ground-track-figure { width: min(100%, 24rem); margin: .55rem 0; padding: .35rem; border: 1px solid #403724; border-radius: .4rem; background: #0c111a; }
	.ground-track-figure svg { display: block; width: 100%; height: auto; overflow: visible; }
	.ground-track-figure .ground-track-axis { stroke: #655f52; stroke-width: .7; }
	.ground-track-figure text { fill: #c8c2b5; font-size: 7px; }
	.ground-track-figure .ground-track-path { fill: none; stroke: #eee7d8; stroke-width: 1.3; stroke-dasharray: 3 2; opacity: .8; }
	.ground-track-figure a { cursor: pointer; }
	.ground-track-figure a:focus-visible circle { stroke: #fff; stroke-width: 2; }
	.ground-track-figure figcaption { display: flex; align-items: center; gap: .35rem; color: #c8c2b5; font-size: .65rem; }
	.ground-track-figure a.active circle { stroke: #fff4ad; stroke-width: 2; }
	.ground-track-scrubber { display: grid; gap: .2rem; margin-top: .35rem; color: #eee7d8; font-size: .7rem; }
	.ground-track-scrubber input { width: 100%; accent-color: #e5a93c; }
	.ground-track-selected { margin: .2rem 0; color: #eee7d8; font-size: .68rem; }
	.scene-event-links .ground-track-open { display: inline-block; margin-top: .15rem; }
	.ground-track-time-ramp { width: 3.5rem; height: .45rem; background: linear-gradient(90deg, #183b56, #27827f, #98c875, #e5c557, #f2a444, #c9593e); }
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
	.pose-preview-row circle.ground-contact-marker { fill: #ff6b5e; stroke: #fff; stroke-width: 2; }
	.pose-preview-row circle.ground-contact-marker.ground-contact-reviewed { fill: #14b89a; }
	.pose-preview-row small { color: #f1c293; font-size: .68rem; }
	.pose-preview-row > div { display: grid; gap: .25rem; }
</style>
