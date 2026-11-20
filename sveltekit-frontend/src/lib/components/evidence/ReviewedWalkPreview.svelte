<script lang="ts">
	import CrimeSceneViewer3D, { type ReviewedWalkJointSample } from './CrimeSceneViewer3D.svelte';
	import { buildTimedWalkPath } from '$lib/courtroom/walk-path-v1.js';
	import { createSceneDocumentV1, createSceneQualityReceiptV1, stableStringifySceneDocumentV1, type SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
	import { fetchSceneAssetV1, fetchSceneRevisionV1, saveSceneRevisionV1 } from '$lib/splat/scene-persistence-client-v1.js';

	type Track = NonNullable<SceneDocumentV1['groundPlaneTrackProposals']>[number];
	let { proposal, sceneRevision, savedAnimations = [], eventBindings = [] }: {
		proposal: Track;
		sceneRevision?: { caseId: string; sceneId: string; revision: number };
		savedAnimations?: NonNullable<SceneDocumentV1['sceneAnimationBindings']>;
		eventBindings?: NonNullable<SceneDocumentV1['videoEventBindings']>;
	} = $props();
	let viewer = $state<{
		sampleReviewedWalkJoints(times: readonly number[]): { assetSha256: string; clipName: 'Walk'; frames: ReviewedWalkJointSample[] } | null;
		exportReviewedWalkGlb(times: readonly number[], provenance: Record<string, unknown>): Promise<ArrayBuffer | null>;
		loadRegisteredReviewedWalkGlb(bytes: ArrayBuffer, startUs: number): Promise<boolean>;
	} | null>(null);
	const points = $derived([...proposal.points].sort((a, b) => a.framePtsUs - b.framePtsUs));
	const path = $derived.by(() => {
		if (points.length < 3 || points.some((point, index) => index > 0 && point.framePtsUs <= points[index - 1].framePtsUs)) return null;
		const [originX, originZ] = points[0].planeM;
		return buildTimedWalkPath(points.map((point) => ({
			framePtsUs: point.framePtsUs, x: point.planeM[0] - originX, y: 0, z: point.planeM[1] - originZ,
		})));
	});
	const markers = $derived(path ? points.map((point, index) => ({
		id: `${proposal.proposalId}:${point.framePtsUs}`,
		posX: point.planeM[0] - points[0].planeM[0],
		posY: 0,
		posZ: point.planeM[1] - points[0].planeM[1],
		index,
	})) : []);
	const layers = { evidence: false, markers: true, measurements: false, reconstruction: false, environment: true };
	let requestedTime = $state<number | null>(null);
	const sample = $derived(path?.atSourceTime(requestedTime ?? path.startUs));
	const canExport = $derived(Boolean(sceneRevision && path && path.endUs - path.startUs >= 8_000_000 && path.endUs - path.startUs <= 20_000_000));
	let exportError = $state('');
	let exporting = $state(false);
	let savingScene = $state(false);
	let sceneSaveMessage = $state('');
	let localSavedAnimation = $state<NonNullable<SceneDocumentV1['sceneAnimationBindings']>[number] | null>(null);
	const savedAnimation = $derived(localSavedAnimation ?? savedAnimations.find((binding) => binding.proposalId === proposal.proposalId));
	let savedAnimationBytes = $state<ArrayBuffer | null>(null);
	let loadedAssetKey = $state('');
	let loadingSavedAnimation = $state(false);
	let savedAnimationLoadError = $state(false);
	let selectedEventId = $state('');
	const compatibleEvents = $derived(eventBindings.filter((event) => event.evidenceId === proposal.evidenceId
		&& event.sourceRevision === proposal.sourceRevision && event.analysisRevision === proposal.analysisRevision
		&& event.reviewState === 'APPROVED_FOR_SCENE_PROPOSAL'
		&& path && path.endUs / 1_000 > event.startMs && path.startUs / 1_000 < event.endMs));

	function selectWalkAnchor(markerId: string) {
		const marker = markers.find((candidate) => candidate.id === markerId);
		if (marker) requestedTime = points[marker.index].framePtsUs;
	}

	$effect(() => {
		const binding = savedAnimation;
		const scope = sceneRevision;
		if (!binding || !scope) {
			savedAnimationBytes = null;
			loadedAssetKey = '';
			savedAnimationLoadError = false;
			return;
		}
		let current = true;
		loadingSavedAnimation = true;
		savedAnimationLoadError = false;
		void fetchSceneAssetV1({ caseId: scope.caseId, sceneId: scope.sceneId, assetId: binding.assetId, expectedSha256: binding.assetSha256, expectedBytes: binding.assetBytes })
			.then((bytes) => { if (current) savedAnimationBytes = bytes; })
			.catch(() => { if (current) savedAnimationLoadError = true; })
			.finally(() => { if (current) loadingSavedAnimation = false; });
		return () => { current = false; };
	});

	$effect(() => {
		const binding = savedAnimation;
		const bytes = savedAnimationBytes;
		const activeViewer = viewer;
		if (!binding || !bytes || !activeViewer) return;
		const key = `${binding.assetId}:${binding.assetSha256}:${binding.startPtsUs}`;
		if (loadedAssetKey === key) return;
		let current = true;
		void activeViewer.loadRegisteredReviewedWalkGlb(bytes, binding.startPtsUs).then((loaded) => {
			if (!current) return;
			if (loaded) loadedAssetKey = key;
			else savedAnimationLoadError = true;
		}).catch(() => { if (current) savedAnimationLoadError = true; });
		return () => { current = false; };
	});

	function createWalkSamples() {
		if (!path) throw new Error('WALK_PATH_NOT_READY');
		const rate = 24;
		const timestamps = new Set(points.map(({ framePtsUs }) => framePtsUs));
		const count = Math.floor((path.endUs - path.startUs) * rate / 1_000_000);
		for (let index = 0; index <= count; index++) timestamps.add(path.startUs + Math.round(index * 1_000_000 / rate));
		if (timestamps.size > 1_000) throw new Error('WALK_SAMPLE_LIMIT');
		return [...timestamps].sort((a, b) => a - b);
	}

	function walkProvenance() {
		if (!path) throw new Error('WALK_PATH_NOT_READY');
		return {
			provenance: 'SYNTHESIZED_ANIMATION', coordinateSpace: 'PREVIEW_LOCAL_Y_UP_METERS',
			groundPlaneOriginM: points[0].planeM, nominalFramesPerSecond: 24,
			sceneRevision: sceneRevision ? { caseId: sceneRevision.caseId, sceneId: sceneRevision.sceneId, revision: sceneRevision.revision } : null,
			proposalId: proposal.proposalId, evidenceId: proposal.evidenceId,
			sourceRevision: proposal.sourceRevision, analysisRevision: proposal.analysisRevision,
			calibrationRevisionId: proposal.calibrationRevisionId,
			sourceStartUs: path.startUs, sourceEndUs: path.endUs,
		};
	}

	async function downloadWalk(format: 'json' | 'glb') {
		if (!path || !sceneRevision || !canExport || exporting) return;
		exportError = '';
		let samples: number[];
		try { samples = createWalkSamples(); } catch { exportError = 'This walk could not be sampled for export.'; return; }
		const provenance = walkProvenance();
		exporting = true;
		try {
			let file: Blob;
			if (format === 'glb') {
				const result = await viewer?.exportReviewedWalkGlb(samples, provenance);
				if (!result) throw new Error('RIG_NOT_READY');
				file = new Blob([result], { type: 'model/gltf-binary' });
			} else {
				const result = viewer?.sampleReviewedWalkJoints(samples);
				if (!result) throw new Error('RIG_NOT_READY');
				file = new Blob([JSON.stringify({ schema: 'atlas.storybook-synthesized-walk-keypoints.v1', ...provenance, ...result })],
					{ type: 'application/json' });
			}
			const url = URL.createObjectURL(file);
			const link = document.createElement('a');
			link.href = url;
			link.download = format === 'glb' ? 'detective-walk.glb' : 'detective-walk-keypoints.json';
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1_000);
		} catch (error) {
			exportError = error instanceof Error && error.message === 'RIG_NOT_READY'
				? 'Wait for the rigged detective to load before exporting.' : 'The walk could not be exported.';
		} finally {
			exporting = false;
		}
	}

	async function saveWalkToScene() {
		if (!path || !sceneRevision || !canExport || !selectedEventId || exporting || savingScene || savedAnimation) return;
		exportError = '';
		sceneSaveMessage = '';
		savingScene = true;
		try {
			const samples = createWalkSamples();
			const glb = await viewer?.exportReviewedWalkGlb(samples, walkProvenance());
			if (!glb) throw new Error('RIG_NOT_READY');
			if (glb.byteLength > 64 * 1024 * 1024) throw new Error('ANIMATION_ASSET_TOO_LARGE');
			const latest = await fetchSceneRevisionV1({ caseId: sceneRevision.caseId, sceneId: sceneRevision.sceneId });
			const reviewedTrack = latest?.manifest.groundPlaneTrackProposals?.find((candidate) => candidate.proposalId === proposal.proposalId);
			if (!latest || !reviewedTrack || stableStringifySceneDocumentV1(reviewedTrack) !== stableStringifySceneDocumentV1(proposal)) {
				throw new Error('REVIEWED_TRACK_CHANGED');
			}
			const reviewedEvent = latest.manifest.videoEventBindings?.find((event) => event.eventId === selectedEventId
				&& event.evidenceId === proposal.evidenceId && event.sourceRevision === proposal.sourceRevision
				&& event.analysisRevision === proposal.analysisRevision && event.reviewState === 'APPROVED_FOR_SCENE_PROPOSAL'
				&& path.endUs / 1_000 > event.startMs && path.startUs / 1_000 < event.endMs);
			if (!reviewedEvent) throw new Error('REVIEWED_EVENT_CHANGED');
			if (latest.manifest.sceneAnimationBindings?.some((binding) => binding.proposalId === proposal.proposalId)) {
				throw new Error('ANIMATION_ALREADY_REGISTERED');
			}
			const clipId = crypto.randomUUID();
			const saved = await saveSceneRevisionV1({
				caseId: sceneRevision.caseId,
				sceneId: sceneRevision.sceneId,
				expectedRevision: latest.revision,
				commandId: crypto.randomUUID(),
				glb,
				createManifest: (asset) => {
					const assets = [...latest.manifest.assets, { assetId: asset.assetId, format: 'GLB' as const, sha256: asset.sha256, bytes: asset.bytes, role: 'DERIVED' as const }];
					const binding = {
						clipId, assetId: asset.assetId, assetSha256: asset.sha256, assetBytes: asset.bytes,
						claimKind: 'SYNTHESIZED_ANIMATION' as const, reviewStatus: 'UNREVIEWED_ILLUSTRATION' as const,
						pathAlgorithm: 'atlas.timed-walk-path.v1' as const, coordinateSpace: 'PREVIEW_LOCAL_Y_UP_METERS' as const,
						eventId: reviewedEvent.eventId,
						proposalId: proposal.proposalId, evidenceId: proposal.evidenceId,
						sourceRevision: proposal.sourceRevision, analysisRevision: proposal.analysisRevision,
						calibrationRevisionId: proposal.calibrationRevisionId,
						startPtsUs: path.startUs, endPtsUs: path.endUs, frameRate: 24
					};
					return createSceneDocumentV1({
						...latest.manifest,
						revision: latest.revision + 1,
						parentManifestSha256: latest.manifestSha256,
						createdAt: new Date().toISOString(),
						assets,
						animations: [...latest.manifest.animations, { clipId, name: 'Reviewed Detective Walk · synthesized', durationSeconds: (path.endUs - path.startUs) / 1_000_000, frameRate: 24 }],
						sceneAnimationBindings: [...(latest.manifest.sceneAnimationBindings ?? []), binding],
						quality: createSceneQualityReceiptV1({
							derivedAssetBytes: assets.reduce((sum, entry) => sum + (entry.role === 'DERIVED' || entry.role === 'LOD' ? entry.bytes : 0), 0),
							triangleCount: latest.manifest.quality.triangleCount,
							textureBytes: latest.manifest.quality.textureBytes
						})
					});
				}
			});
			const readback = await fetchSceneRevisionV1({ caseId: sceneRevision.caseId, sceneId: sceneRevision.sceneId, revision: saved.revision.revision });
			const binding = readback?.manifest.sceneAnimationBindings?.find((entry) => entry.clipId === clipId);
			if (!readback || readback.manifestSha256 !== saved.revision.manifestSha256 || !binding || binding.assetSha256 !== saved.asset.sha256) {
				throw new Error('ANIMATION_REVISION_READBACK_MISMATCH');
			}
			await fetchSceneAssetV1({ caseId: sceneRevision.caseId, sceneId: sceneRevision.sceneId, assetId: binding.assetId, expectedSha256: binding.assetSha256, expectedBytes: binding.assetBytes });
			localSavedAnimation = binding;
			sceneSaveMessage = `Saved and verified the synthesized walk at scene revision ${readback.revision}.`;
		} catch (cause) {
			const code = cause instanceof Error ? cause.message : '';
			exportError = code === 'REVIEWED_TRACK_CHANGED'
				? 'The reviewed track changed; reload the scene revision before saving this animation.'
				: code === 'ANIMATION_ALREADY_REGISTERED'
					? 'This reviewed track already has a registered animation.'
					: code === 'REVIEWED_EVENT_CHANGED'
						? 'The selected reviewed event changed or no longer overlaps this track. Reload the scene revision.'
					: code === 'RIG_NOT_READY'
						? 'Wait for the rigged detective to load before saving.'
						: 'The animation was not saved or did not pass artifact readback.';
		} finally {
			savingScene = false;
		}
	}

	async function downloadSavedAnimation() {
		if (!savedAnimation || !sceneRevision || exporting) return;
		exporting = true;
		exportError = '';
		try {
			const bytes = await fetchSceneAssetV1({ caseId: sceneRevision.caseId, sceneId: sceneRevision.sceneId, assetId: savedAnimation.assetId, expectedSha256: savedAnimation.assetSha256, expectedBytes: savedAnimation.assetBytes });
			const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
			const link = document.createElement('a');
			link.href = url; link.download = `detective-walk-${savedAnimation.assetSha256.slice(0, 12)}.glb`; link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1_000);
		} catch { exportError = 'The saved animation could not be reopened from its registered scene asset.'; }
		finally { exporting = false; }
	}
</script>

{#if path && sample}
	<p>Illustrative detective walk. The reviewed ground-plane path supplies the timing and root position. The actor’s limb motion is synthesized.</p>
	<div class="walk-view">
		<CrimeSceneViewer3D bind:this={viewer} caseMarkers={markers} sceneLayers={layers} guideAction="Walk"
			reviewedWalkPath={path} reviewedWalkPtsUs={sample.framePtsUs} onCaseMarkerSelect={selectWalkAnchor} />
	</div>
	<p>Click a scene marker or timestamp below to seek the animation to that reviewed source frame.</p>
	{#if compatibleEvents.length}
		<label>Reviewed event this animation illustrates
			<select bind:value={selectedEventId}>
				<option value="">Choose an approved event</option>
				{#each compatibleEvents as event (event.eventId)}
					<option value={event.eventId}>{event.chapter?.title ?? `Event ${event.eventId.slice(0, 8)}`} · {event.startMs}–{event.endMs} ms</option>
				{/each}
			</select>
		</label>
	{:else}
		<p>No approved event with matching evidence revisions and overlapping time is linked to this track yet.</p>
	{/if}
	<ol aria-label="Reviewed motion anchors">
		{#each points as point, index (`${point.frameIndex}:${point.framePtsUs}`)}
			<li><button type="button" aria-pressed={sample.framePtsUs === point.framePtsUs}
				onclick={() => { requestedTime = point.framePtsUs; }}>
					Anchor {index + 1} · {point.framePtsUs / 1_000_000}s
			</button></li>
		{/each}
	</ol>
	<label>
		Source time · {sample.framePtsUs / 1_000_000} s
		<input type="range" min={path.startUs} max={path.endUs} step="1" value={sample.framePtsUs}
			oninput={(event) => { requestedTime = (event.currentTarget as HTMLInputElement).valueAsNumber; }} />
	</label>
	{#if canExport}
		{#if savedAnimation}
			<p role="status">Registered synthesized animation · scene asset SHA-256 {savedAnimation.assetSha256.slice(0, 12)}…</p>
			{#if loadingSavedAnimation}<p role="status">Loading the registered animation from the scene asset store…</p>{/if}
			{#if savedAnimationLoadError}<p role="alert">The registered animation could not be loaded into this scene. Verify its scene asset and reload the revision.</p>{/if}
			<button type="button" disabled={exporting || loadingSavedAnimation} onclick={() => void downloadSavedAnimation()}>Download registered animated GLB</button>
		{:else}
			<button type="button" disabled={!selectedEventId || savingScene || exporting} onclick={() => void saveWalkToScene()}>{savingScene ? 'Saving and verifying…' : 'Save animation to scene revision'}</button>
		{/if}
		<button type="button" disabled={exporting} onclick={() => void downloadWalk('glb')}>Download animated GLB</button>
		<button type="button" disabled={exporting} onclick={() => void downloadWalk('json')}>Download synthesized keypoints</button>
	{/if}
	{#if sceneSaveMessage}<p role="status">{sceneSaveMessage}</p>{/if}
	{#if exportError}<p role="alert">{exportError}</p>{/if}
{:else}
	<p>The walk preview needs three reviewed points with distinct source times.</p>
{/if}

<style>
	.walk-view { height: 22rem; min-width: 0; }
	label { display: grid; gap: .3rem; }
</style>
