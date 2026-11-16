<script lang="ts">
	import { onMount } from 'svelte';
	import {
		humanCoco17PoseSchemaV1,
		type PoseObservationV1,
		parsePoseObservationV1,
	} from '$lib/shared/pose-skeleton-schema-v1.js';
	import { derivePoseTrackMotionV1, type PoseTrackMotionV1 } from '$lib/shared/pose-track-motion-v1.js';

	type Props = {
		evidenceId: string;
		caseId: string;
		sourceSha256: string;
		analysisRevision: string;
		frameIndex: number;
		timestampMs: number;
		trackScopeId?: string;
		detections?: Array<{ label: string; confidence?: number; trackId?: string }>;
		videoElement?: HTMLVideoElement | null;
		onSeekToFrame?: (timestampMs: number) => void;
		expanded?: boolean;
		selectedTrackId?: string;
	};
	type Point = { x: number; y: number } | null;

	let { evidenceId, caseId, sourceSha256, analysisRevision, frameIndex, timestampMs, trackScopeId, detections = [], videoElement, onSeekToFrame, expanded = $bindable(false), selectedTrackId = $bindable('') }: Props = $props();
	let snapshotCanvas: HTMLCanvasElement;
	let stageWidth = $state(0);
	let stageHeight = $state(0);
	let snapshotUrl = $state<string | null>(null);
	let captured = $state(false);
	let points = $state<Point[]>(Array.from({ length: 17 }, () => null));
	let activeJointIndex = $state(0);
	let xInput = $state('');
	let yInput = $state('');
	let busy = $state(false);
	let status = $state('');
	let savedRevision: number | null = $state(null);
	let savedTrackFrames = $state<Array<{ frameIndex: number; timestampMs: number; placedJoints: number }>>([]);
	let savedTrackMotion = $state<PoseTrackMotionV1 | null>(null);
	const trackOptions = $derived(detections.filter((detection) =>
		detection.label.trim().toLowerCase() === 'person' &&
		typeof detection.trackId === 'string' && detection.trackId.length > 0 &&
		typeof trackScopeId === 'string' && trackScopeId.length > 0
	));

	const normalizedSourceSha256 = $derived(
		sourceSha256.startsWith('sha256:') ? sourceSha256.toLowerCase() : `sha256:${sourceSha256.toLowerCase()}`
	);
	const activeJointName = $derived(humanCoco17PoseSchemaV1.joints[activeJointIndex]?.name ?? 'nose');
	const placedCount = $derived(points.filter((point) => point !== null).length);

	onMount(() => {
		void loadSavedPose();
	});

	async function loadSavedPose(): Promise<boolean> {
		savedTrackFrames = [];
		savedTrackMotion = null;
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions?limit=200`, { cache: 'no-store' });
			if (!response.ok) return false;
			const payload = await response.json();
			if (!Array.isArray(payload?.versions)) return false;
			const frameSamples = new Map<number, { frameIndex: number; timestampMs: number; placedJoints: number }>();
			const trackObservations = new Map<number, PoseObservationV1>();
			let selectedPose: PoseObservationV1 | null = null;
			let selectedRevision: number | null = null;
			for (const revision of payload.versions) {
				const annotation = revision?.metadata?.annotation;
				if (!Array.isArray(annotation?.poseObservations)) continue;
				for (const row of annotation.poseObservations) {
					if (typeof row !== 'object' || row === null) continue;
					const candidate = row as Record<string, unknown>;
					if (candidate.evidenceId !== evidenceId || candidate.sourceSha256 !== normalizedSourceSha256 || candidate.sourceRevision !== normalizedSourceSha256 || candidate.analysisRevision !== analysisRevision || (candidate.trackId ?? '') !== selectedTrackId || (candidate.trackScopeId ?? '') !== (selectedTrackId ? trackScopeId ?? '' : '') || candidate.skeletonSchemaId !== humanCoco17PoseSchemaV1.schemaId) continue;
					let parsed: PoseObservationV1;
					try { parsed = parsePoseObservationV1(candidate, humanCoco17PoseSchemaV1); } catch { continue; }
					if (!frameSamples.has(parsed.framePtsUs)) {
						frameSamples.set(parsed.framePtsUs, {
							frameIndex: parsed.frameIndex,
							timestampMs: parsed.framePtsUs / 1000,
							placedJoints: parsed.keypoints.filter((point) => point.x !== null && point.y !== null).length,
						});
					}
					if (selectedTrackId && !trackObservations.has(parsed.framePtsUs)) trackObservations.set(parsed.framePtsUs, parsed);
					if (parsed.frameIndex === frameIndex && parsed.framePtsUs === Math.round(timestampMs * 1000)) {
						selectedPose ??= parsed;
						selectedRevision ??= Number.isInteger(revision.version) ? revision.version : null;
					}
				}
			}
			savedTrackFrames = [...frameSamples.values()].sort((a, b) => a.timestampMs - b.timestampMs);
			if (trackObservations.size >= 2) {
				try { savedTrackMotion = derivePoseTrackMotionV1([...trackObservations.values()], humanCoco17PoseSchemaV1); } catch { savedTrackMotion = null; }
			}
			if (!selectedPose) return false;
			points = selectedPose.keypoints.map((point) => point.x === null || point.y === null ? null : { x: point.x, y: point.y });
			savedRevision = selectedRevision;
			status = 'Loaded this frame’s saved, unreviewed pose proposal.';
			return true;
		} catch {
			status = 'Saved pose history is unavailable; you can still create a new proposal.';
			return false;
		}
	}

	function seekToPoseSample(sampleTimestampMs: number) {
		if (!videoElement || !Number.isFinite(sampleTimestampMs) || sampleTimestampMs < 0) return;
		if (onSeekToFrame) onSeekToFrame(sampleTimestampMs);
		else videoElement.currentTime = sampleTimestampMs / 1000;
	}

	async function captureSelectedFrame() {
		if (!videoElement) {
			status = 'The evidence video player is not ready.';
			return;
		}
		busy = true;
		status = 'Seeking to the selected evidence timestamp…';
		try {
			videoElement.pause();
			const targetSeconds = timestampMs / 1000;
			if (Math.abs(videoElement.currentTime - targetSeconds) > 0.01) {
				await new Promise<void>((resolve, reject) => {
					const timeout = window.setTimeout(() => reject(new Error('Frame seek timed out.')), 8000);
					const onSeeked = () => { window.clearTimeout(timeout); resolve(); };
					const onError = () => { window.clearTimeout(timeout); reject(new Error('Could not seek to the selected frame.')); };
					videoElement.addEventListener('seeked', onSeeked, { once: true });
					videoElement.addEventListener('error', onError, { once: true });
					videoElement.currentTime = targetSeconds;
				});
			}
			const width = videoElement.videoWidth;
			const height = videoElement.videoHeight;
			if (!width || !height) throw new Error('The selected video frame has no decoded dimensions yet.');
			snapshotCanvas.width = width;
			snapshotCanvas.height = height;
			const context = snapshotCanvas.getContext('2d', { alpha: false });
			if (!context) throw new Error('The browser could not create a frame preview.');
			context.drawImage(videoElement, 0, 0, width, height);
			stageWidth = width;
			stageHeight = height;
			snapshotUrl = snapshotCanvas.toDataURL('image/png');
			captured = true;
			status = `Frame captured at ${width} × ${height}; points remain an unreviewed manual proposal.`;
		} catch (error) {
			status = error instanceof Error ? error.message : 'Could not capture the selected video frame.';
		} finally {
			busy = false;
		}
	}

	function placeActiveJoint(event: MouseEvent) {
		if (!captured || !stageWidth || !stageHeight) return;
		const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
		if (!rect || rect.width <= 0 || rect.height <= 0) return;
		const x = Math.max(0, Math.min(stageWidth, ((event.clientX - rect.left) / rect.width) * stageWidth));
		const y = Math.max(0, Math.min(stageHeight, ((event.clientY - rect.top) / rect.height) * stageHeight));
		const placedJointName = activeJointName;
		points[activeJointIndex] = { x, y };
		points = [...points];
		xInput = x.toFixed(1);
		yInput = y.toFixed(1);
		const next = points.findIndex((point) => point === null);
		if (next >= 0) activeJointIndex = next;
		status = `Placed ${placedJointName}; ${placedCount} of 17 landmarks placed.`;
	}

	function selectJoint(index: number) {
		activeJointIndex = index;
		const point = points[index];
		xInput = point ? point.x.toFixed(1) : '';
		yInput = point ? point.y.toFixed(1) : '';
	}

	function applyTypedCoordinates() {
		const x = Number(xInput);
		const y = Number(yInput);
		if (!captured || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > stageWidth || y < 0 || y > stageHeight) {
			status = `Enter X and Y within 0–${stageWidth} × 0–${stageHeight}.`;
			return;
		}
		points[activeJointIndex] = { x, y };
		points = [...points];
		status = `Set ${activeJointName} by source-frame coordinates.`;
	}

	function clearPoints() {
		points = Array.from({ length: 17 }, () => null);
		activeJointIndex = 0;
		xInput = '';
		yInput = '';
		savedRevision = null;
		status = 'Pose points cleared from this local draft.';
	}

	async function savePoseProposal() {
		if (!captured || placedCount === 0 || busy) return;
		busy = true;
		status = 'Saving the source-bound pose proposal…';
		try {
			const observation = {
				schema: 'atlas.pose-observation.v1',
				evidenceId,
				sourceSha256: normalizedSourceSha256,
				sourceRevision: normalizedSourceSha256,
				analysisRevision,
				framePtsUs: Math.round(timestampMs * 1000),
				frameIndex,
				frameWidth: stageWidth,
				frameHeight: stageHeight,
				skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId,
				trackId: selectedTrackId || null,
				trackScopeId: selectedTrackId ? trackScopeId ?? null : null,
				origin: 'manual',
				modelRevision: null,
				reviewState: 'UNREVIEWED',
				keypoints: points.map((point, index) => ({
					index,
					x: point?.x ?? null,
					y: point?.y ?? null,
					confidence: point ? 1 : 0,
					visibility: point ? 'visible' : 'not_labeled',
				})),
			};
			parsePoseObservationV1(observation, humanCoco17PoseSchemaV1);
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					schema: 'atlas.evidence-annotation-revision-request.v1',
					caseId,
					parentSha256: normalizedSourceSha256,
					revisionNotes: `Manual COCO-17 pose proposal at ${timestampMs} ms`,
					annotation: {
						schema: 'atlas.evidence-annotation.v1',
						modality: 'video',
						notes: 'Manual pose proposal; not reviewed or identity-confirmed.',
						annotations: [],
						poseSchemas: [humanCoco17PoseSchemaV1],
						poseObservations: [observation],
					},
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? `Pose proposal save failed (${response.status}).`);
			savedRevision = Number.isInteger(payload.version) ? payload.version : null;
			const reloaded = await loadSavedPose();
			if (!reloaded) throw new Error('The pose proposal was saved, but its revision could not be verified by readback.');
			status = `Unreviewed pose proposal saved as evidence revision ${savedRevision ?? 'available'} and verified from revision history.`;
		} catch (error) {
			status = error instanceof Error ? error.message : 'Could not save the pose proposal.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="pose-editor" aria-label="Manual human pose annotation">
	<button type="button" class="pose-toggle" aria-expanded={expanded} onclick={() => { expanded = !expanded; }}>
		{expanded ? 'Close pose tools' : 'Add manual human pose'}
	</button>
	{#if expanded}
		<p class="pose-disclaimer">COCO-17 landmarks are a manual, unreviewed proposal tied to this exact video frame. They do not identify a person or establish an event.</p>
		<label class="pose-track-field">
			Link to detector track hypothesis (optional)
			<select aria-label="Link pose to detector track hypothesis" bind:value={selectedTrackId} disabled={busy} onchange={async (event) => {
				selectedTrackId = event.currentTarget.value;
				await loadSavedPose();
			}}>
				<option value="">No track link</option>
				{#each trackOptions as detection, index (`${detection.trackId}-${index}`)}
					<option value={detection.trackId}>{detection.trackId} · person label · {Math.round((detection.confidence ?? 0) * 100)}% box confidence</option>
				{/each}
			</select>
			<span>Track IDs are analysis-run hypotheses. They do not identify a person.</span>
		</label>
		<button type="button" class="pose-capture" onclick={captureSelectedFrame} disabled={busy || !videoElement}>
			{busy ? 'Working…' : captured ? 'Recapture selected frame' : 'Capture selected video frame'}
		</button>
		<canvas bind:this={snapshotCanvas} class="pose-snapshot-buffer" aria-hidden="true"></canvas>
		{#if captured}
			<div class="pose-stage" style={`aspect-ratio:${stageWidth}/${stageHeight}`}>
				{#if snapshotUrl}<img class="pose-stage-image" src={snapshotUrl} alt="Captured source video frame for manual pose annotation" />{/if}
				<svg class="pose-lines" viewBox={`0 0 ${stageWidth} ${stageHeight}`} preserveAspectRatio="none" aria-hidden="true">
					{#each humanCoco17PoseSchemaV1.bones as [from, to], index (`${from}-${to}-${index}`)}
						{#if points[from] && points[to]}
							<line x1={points[from]?.x} y1={points[from]?.y} x2={points[to]?.x} y2={points[to]?.y} />
						{/if}
					{/each}
					{#each points as point, index (index)}
						{#if point}<circle cx={point.x} cy={point.y} r={Math.max(3, stageWidth / 120)} /><text x={point.x + 5} y={point.y - 5}>{index}</text>{/if}
					{/each}
				</svg>
				<button type="button" class="pose-stage-target" onclick={placeActiveJoint} aria-label={`Place ${activeJointName} on the captured frame`}></button>
			</div>
			<div class="pose-point-entry">
				<label>X px <input type="number" min="0" max={stageWidth} step="0.1" bind:value={xInput} /></label>
				<label>Y px <input type="number" min="0" max={stageHeight} step="0.1" bind:value={yInput} /></label>
				<button type="button" onclick={applyTypedCoordinates}>Set coordinates</button>
			</div>
			<div class="pose-joint-grid" aria-label="COCO-17 joint selector">
				{#each humanCoco17PoseSchemaV1.joints as joint, index (joint.name)}
					<button type="button" class:active={activeJointIndex === index} class:placed={points[index] !== null} aria-pressed={activeJointIndex === index} onclick={() => selectJoint(index)}>
						{index}. {joint.name}{points[index] ? ' ✓' : ''}
					</button>
				{/each}
			</div>
			<div class="pose-actions">
				<span>{placedCount}/17 placed · current: {activeJointName}</span>
				<button type="button" onclick={clearPoints} disabled={busy}>Clear</button>
				<button type="button" class="pose-save" onclick={savePoseProposal} disabled={busy || placedCount === 0}>
					{busy ? 'Saving…' : 'Save unreviewed pose'}
				</button>
			</div>
			{#if selectedTrackId && savedTrackFrames.length > 0}
				<section class="pose-track-samples" aria-label="Saved pose samples for selected track">
					<strong>{savedTrackFrames.length} source-frame pose sample{savedTrackFrames.length === 1 ? '' : 's'} for {selectedTrackId}</strong>
					<p>Unreviewed source-pixel observations. Camera movement is included; these are not calibrated 3D positions.</p>
					<div>
						{#each savedTrackFrames as sample (`${sample.frameIndex}-${sample.timestampMs}`)}
							<button type="button" onclick={() => seekToPoseSample(sample.timestampMs)} aria-label={`Seek to pose sample frame ${sample.frameIndex}`}>
								Frame {sample.frameIndex} · {sample.timestampMs.toFixed(0)} ms · {sample.placedJoints}/17 joints
							</button>
						{/each}
					</div>
					{#if savedTrackMotion}
						<div class="pose-track-motion" role="region" aria-label="Adjacent pose sample motion in source pixels" data-measurement-semantics="source_frame_pixel_delta_includes_camera_motion" data-world-calibrated="false">
							{#each savedTrackMotion.intervals as interval (`${interval.startFrameIndex}-${interval.endFrameIndex}`)}
								<strong>Frame {interval.startFrameIndex} → {interval.endFrameIndex} · {interval.durationMs.toFixed(0)} ms</strong>
								{#if interval.jointDeltas.length > 0}
									{#each interval.jointDeltas as delta (delta.jointIndex)}
										<span>{humanCoco17PoseSchemaV1.joints[delta.jointIndex]?.name ?? `Joint ${delta.jointIndex}`}: Δx {delta.deltaPx[0] > 0 ? '+' : ''}{delta.deltaPx[0].toFixed(1)} px, Δy {delta.deltaPx[1] > 0 ? '+' : ''}{delta.deltaPx[1].toFixed(1)} px · {delta.velocityPxPerSecond[0].toFixed(1)}, {delta.velocityPxPerSecond[1].toFixed(1)} px/s</span>
									{/each}
								{:else}
									<span>No joints were labeled in both frames.</span>
								{/if}
							{/each}
						</div>
					{/if}
				</section>
			{/if}
		{/if}
		{#if status}<p class="pose-status" role="status">{status}</p>{/if}
	{/if}
</section>

<style>
	.pose-editor { display: grid; gap: 0.55rem; margin-top: 0.65rem; padding: 0.65rem; border: 1px solid var(--border, #bbb); border-radius: 0.45rem; background: var(--surface-muted, #f7f4ee); color: var(--text, #202020); }
	.pose-toggle, .pose-capture, .pose-point-entry button, .pose-joint-grid button, .pose-actions button { min-height: 2.25rem; padding: 0.35rem 0.6rem; border: 1px solid var(--border, #999); border-radius: 0.3rem; background: var(--surface, #fff); color: inherit; }
	.pose-track-field { display: grid; gap: 0.25rem; font-size: 0.82rem; }
	.pose-track-field select { min-height: 2.25rem; padding: 0.35rem 0.55rem; border: 1px solid var(--border, #999); border-radius: 0.3rem; background: var(--surface, #fff); color: inherit; font: inherit; }
	.pose-track-field span { color: var(--text-muted, #666); font-size: 0.76rem; }
	.pose-track-samples { display: grid; gap: 0.3rem; padding-top: 0.45rem; border-top: 1px solid var(--border, #bbb); font-size: 0.8rem; }
	.pose-track-samples p { margin: 0; color: var(--text-muted, #666); }
	.pose-track-samples > div { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.pose-track-samples button { min-height: 2rem; padding: 0.25rem 0.5rem; border: 1px solid var(--border, #999); border-radius: 0.3rem; background: var(--surface, #fff); color: inherit; font: inherit; }
	.pose-track-motion { display: grid; gap: 0.2rem; padding: 0.45rem; border-radius: 0.3rem; background: var(--surface, #fff); font-variant-numeric: tabular-nums; }
	.pose-toggle, .pose-save { font-weight: 700; }
	.pose-disclaimer, .pose-status { margin: 0; font-size: 0.82rem; line-height: 1.35; }
	.pose-stage { position: relative; width: min(100%, 42rem); overflow: hidden; background: #111; }
	.pose-stage-image, .pose-lines, .pose-stage-target { position: absolute; inset: 0; width: 100%; height: 100%; }
	.pose-stage-image { display: block; object-fit: contain; }
	.pose-lines { pointer-events: none; }
	.pose-lines line { stroke: #17e0c1; stroke-width: 3; vector-effect: non-scaling-stroke; }
	.pose-lines circle { fill: #ffc857; stroke: #111; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.pose-lines text { fill: white; font: 12px sans-serif; paint-order: stroke; stroke: #111; stroke-width: 3px; }
	.pose-stage-target { z-index: 2; border: 0; background: transparent; opacity: 0; cursor: crosshair; }
	.pose-point-entry { display: flex; flex-wrap: wrap; align-items: end; gap: 0.5rem; }
	.pose-point-entry label { display: grid; gap: 0.2rem; font-size: 0.78rem; }
	.pose-point-entry input { width: 6.5rem; min-height: 2rem; padding: 0.25rem; }
	.pose-joint-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 0.3rem; max-height: 10rem; overflow: auto; }
	.pose-joint-grid button { text-align: left; font-size: 0.72rem; }
	.pose-joint-grid button.active { outline: 2px solid #087f72; }
	.pose-joint-grid button.placed { border-color: #087f72; }
	.pose-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
	.pose-actions span { margin-right: auto; font-size: 0.78rem; }
	.pose-save { background: #d6f4e9 !important; }
	.pose-snapshot-buffer { display: none; }
	@media (max-width: 600px) { .pose-point-entry { align-items: stretch; } .pose-actions span { width: 100%; } }
</style>
