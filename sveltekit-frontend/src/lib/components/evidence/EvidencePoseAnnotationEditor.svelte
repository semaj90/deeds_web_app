<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		humanCoco17PoseSchemaV1,
		type PoseObservationV1,
		parsePoseObservationV1,
	} from '$lib/shared/pose-skeleton-schema-v1.js';
	import { poseKeypointDisplayColorV1 } from '$lib/shared/pose-keypoint-render-lut-v1.js';
	import { derivePoseTrackMotionV1, type PoseTrackMotionV1 } from '$lib/shared/pose-track-motion-v1.js';
	import {
		createPlanarCameraCalibrationV1,
		planarCameraCalibrationV1Schema,
		type PlanarCameraCalibrationV1,
	} from '$lib/splat/planar-camera-calibration-v1.js';

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
		poseDraftDirty?: boolean;
		calibrationDraftDirty?: boolean;
	};
	type Point = { x: number; y: number } | null;
	type PlaneAnchorDraft = { id: string; imagePx: { x: number; y: number } | null; planeX: string; planeY: string };
	type CapturedFrameBinding = { evidenceId: string; sourceRevision: string; analysisRevision: string; frameIndex: number; timestampMs: number; frameWidth: number; frameHeight: number; artifactWidth: number; artifactHeight: number };
	const createAnchorDrafts = (prefix: string): PlaneAnchorDraft[] => Array.from({ length: 4 }, (_, index) => ({ id: `${prefix}-${index + 1}`, imagePx: null, planeX: '', planeY: '' }));

	let { evidenceId, caseId, sourceSha256, analysisRevision, frameIndex, timestampMs, trackScopeId, detections = [], videoElement, onSeekToFrame, expanded = $bindable(false), selectedTrackId = $bindable(''), poseDraftDirty = $bindable(false), calibrationDraftDirty = $bindable(false) }: Props = $props();
	let stageWidth = $state(0);
	let stageHeight = $state(0);
	let snapshotUrl = $state<string | null>(null);
	let captureController: AbortController | null = null;
	let captured = $state(false);
	let capturedFrameBinding = $state<CapturedFrameBinding | null>(null);
	let groundPlaneMode = $state(false);
	let fixedCameraConfirmed = $state(false);
	let fitAnchorDrafts = $state<PlaneAnchorDraft[]>(createAnchorDrafts('fit'));
	let validationAnchorDrafts = $state<PlaneAnchorDraft[]>(createAnchorDrafts('check'));
	let activePlaneAnchor = $state<{ group: 'fit' | 'check'; index: number }>({ group: 'fit', index: 0 });
	let calibrationProposal = $state<PlanarCameraCalibrationV1 | null>(null);
	let savedCalibration = $state<PlanarCameraCalibrationV1 | null>(null);
	let savedCalibrationRevisionId = $state('');
	let savedCalibrationDecision = $state<string | null>(null);
	let calibrationReviewEnabled = $state(false);
	let calibrationReviewNotes = $state('');
	let calibrationReadbackVerified = $state(false);
	let points = $state<Point[]>(Array.from({ length: 17 }, () => null));
	let activeJointIndex = $state(0);
	let xInput = $state('');
	let yInput = $state('');
	let busy = $state(false);
	let status = $state('');
	let savedRevision: number | null = $state(null);
	let poseReviewEnabled = $state(false);
	let savedTrackFrames = $state<Array<{ frameIndex: number; framePtsUs: number; timestampMs: number; placedJoints: number; hasGroundContact: boolean; annotationRevisionId: string; reviewDecision: string | null }>>([]);
	let savedTrackMotion = $state<PoseTrackMotionV1 | null>(null);
	let groundContactMode = $state(false);
	let groundContactDraft = $state<{ imagePx: [number, number]; footSide: 'left' | 'right' | 'unknown'; label: 'operator-marked-ground-contact-candidate' } | null>(null);
	let groundContactFootSide = $state<'left' | 'right' | 'unknown'>('unknown');
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
	const capturedFrameMatchesSelection = $derived(capturedFrameBinding !== null
		&& capturedFrameBinding.evidenceId === evidenceId
		&& capturedFrameBinding.sourceRevision === normalizedSourceSha256
		&& capturedFrameBinding.analysisRevision === analysisRevision
		&& capturedFrameBinding.frameIndex === frameIndex
		&& capturedFrameBinding.timestampMs === timestampMs);

	onDestroy(() => {
		captureController?.abort();
		if (snapshotUrl?.startsWith('blob:')) URL.revokeObjectURL(snapshotUrl);
	});

	onMount(() => {
		void loadSavedPose();
		void loadSavedCalibration();
	});

	async function loadSavedCalibration(): Promise<boolean> {
		savedCalibration = null;
		savedCalibrationRevisionId = '';
		savedCalibrationDecision = null;
		calibrationReviewEnabled = false;
		reviewByCalibration.clear();
		calibrationReadbackVerified = false;
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions?limit=200`, { cache: 'no-store' });
			if (!response.ok) return false;
			const payload = await response.json();
			if (!Array.isArray(payload?.versions)) return false;
			calibrationReviewEnabled = payload.reviewEnabled === true;
			for (const revision of payload.versions) {
				const decision = revision?.metadata;
				if (decision?.schema === 'atlas.planar-camera-calibration-review.v1'
					&& decision.evidenceId === evidenceId && decision.caseId === caseId
					&& decision.sourceSha256 === normalizedSourceSha256 && decision.analysisRevision === analysisRevision
					&& Number.isSafeInteger(decision.calibrationFramePtsUs)) {
					const key = `${decision.annotationRevisionId}:${decision.calibrationSha256}:${decision.calibrationFramePtsUs}`;
					if (!reviewByCalibration.has(key)) reviewByCalibration.set(key, String(decision.decision));
				}
			}
			for (const revision of payload.versions) {
				const candidates = revision?.metadata?.annotation?.planarCameraCalibrations;
				if (!Array.isArray(candidates)) continue;
				for (const candidate of candidates) {
					const parsed = planarCameraCalibrationV1Schema.safeParse(candidate);
					if (!parsed.success) continue;
					const calibration = parsed.data as unknown as PlanarCameraCalibrationV1;
					if (calibration.evidenceId !== evidenceId || calibration.sourceRevision !== normalizedSourceSha256
						|| calibration.analysisRevision !== analysisRevision) continue;
					savedCalibration = calibration;
					savedCalibrationRevisionId = String(revision.id ?? '');
					const digest = await calibrationDigest(calibration);
					savedCalibrationDecision = reviewByCalibration.get(`${revision.id}:${digest}:${calibration.calibrationFramePtsUs}`) ?? null;
					calibrationReadbackVerified = true;
					return true;
				}
			}
		} catch {
			return false;
		}
		return false;
	}

	const reviewByCalibration = new Map<string, string>();

	async function calibrationDigest(calibration: PlanarCameraCalibrationV1): Promise<string> {
		const bytes = new TextEncoder().encode(JSON.stringify(calibration));
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
		return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
	}

	async function reviewCalibration(decision: 'ACCEPTED_FOR_SCENE_PROPOSAL' | 'REJECTED') {
		if (!savedCalibration || !savedCalibrationRevisionId || !calibrationReviewEnabled || !calibrationReadbackVerified || busy) return;
		// Accepting needs a fixed-camera window. Default: the whole clip, read from the loaded video.
		let cameraFixedWindow: { startPtsUs: number; endPtsUs: number } | undefined;
		if (decision === 'ACCEPTED_FOR_SCENE_PROPOSAL') {
			const duration = videoElement?.duration ?? NaN;
			if (!Number.isFinite(duration) || duration <= 0) {
				status = 'Load the video before accepting: the fixed-camera window defaults to the whole clip.';
				return;
			}
			cameraFixedWindow = { startPtsUs: 0, endPtsUs: Math.ceil(duration * 1_000_000) };
		}
		busy = true;
		status = 'Recording calibration review…';
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/calibration-review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					schema: 'atlas.planar-camera-calibration-review-request.v1', caseId, parentSha256: normalizedSourceSha256,
					annotationRevisionId: savedCalibrationRevisionId, calibrationSha256: await calibrationDigest(savedCalibration),
					analysisRevision: savedCalibration.analysisRevision, calibrationFrameIndex: savedCalibration.calibrationFrameIndex,
					calibrationFramePtsUs: savedCalibration.calibrationFramePtsUs, decision, notes: calibrationReviewNotes,
					...(cameraFixedWindow ? { cameraFixedWindow } : {}),
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `Calibration review failed (${response.status}).`);
			const reloaded = await loadSavedCalibration();
			if (!reloaded || savedCalibrationDecision !== decision) throw new Error('Review was recorded, but independent revision-history readback did not match.');
			status = decision === 'ACCEPTED_FOR_SCENE_PROPOSAL'
				? 'Calibration accepted for a scene proposal. This does not create or approve scene geometry.'
				: 'Calibration rejected and excluded from scene proposals.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'Could not record calibration review.';
		} finally {
			busy = false;
		}
	}

	async function loadSavedPose(overwriteDraft = false): Promise<boolean> {
		const requestedTrackId = selectedTrackId;
		savedTrackFrames = [];
		savedTrackMotion = null;
		poseReviewEnabled = false;
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions?limit=200`, { cache: 'no-store' });
			if (!response.ok) return false;
			const payload = await response.json();
			if (!Array.isArray(payload?.versions)) return false;
			poseReviewEnabled = payload.reviewEnabled === true;
			const reviewBySample = new Map<string, string>();
			for (const revision of payload.versions) {
				const decision = revision?.metadata;
				if (decision?.schema !== 'atlas.pose-review-decision.v1' || decision.evidenceId !== evidenceId || decision.caseId !== caseId || decision.sourceSha256 !== normalizedSourceSha256 || decision.analysisRevision !== analysisRevision || decision.skeletonSchemaId !== humanCoco17PoseSchemaV1.schemaId || (decision.trackId ?? '') !== selectedTrackId || (decision.trackScopeId ?? '') !== (selectedTrackId ? trackScopeId ?? '' : '') || !Number.isSafeInteger(decision.framePtsUs)) continue;
				const key = `${decision.annotationRevisionId}:${decision.framePtsUs}:${decision.trackId ?? ''}:${decision.trackScopeId ?? ''}`;
				if (!reviewBySample.has(key)) reviewBySample.set(key, String(decision.decision));
			}
			const frameSamples = new Map<number, { frameIndex: number; framePtsUs: number; timestampMs: number; placedJoints: number; hasGroundContact: boolean; annotationRevisionId: string; reviewDecision: string | null }>();
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
							framePtsUs: parsed.framePtsUs,
							timestampMs: parsed.framePtsUs / 1000,
							placedJoints: parsed.keypoints.filter((point) => point.x !== null && point.y !== null).length,
							hasGroundContact: Boolean(parsed.groundContact),
							annotationRevisionId: String(revision.id ?? ''),
							reviewDecision: reviewBySample.get(`${revision.id}:${parsed.framePtsUs}:${parsed.trackId ?? ''}:${parsed.trackScopeId ?? ''}`) ?? null,
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
			if (!selectedPose || requestedTrackId !== selectedTrackId || (poseDraftDirty && !overwriteDraft)) return false;
			points = selectedPose.keypoints.map((point) => point.x === null || point.y === null ? null : { x: point.x, y: point.y });
			const savedContact = selectedPose.groundContact;
			groundContactDraft = savedContact ? {
				imagePx: [savedContact.imagePx[0]!, savedContact.imagePx[1]!],
				footSide: savedContact.footSide,
				label: savedContact.label,
			} : null;
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
		if (captured && (poseDraftDirty || calibrationDraftDirty) && !window.confirm('Recapturing clears unsaved contact and calibration changes. Continue?')) return;
		captureController?.abort();
		const controller = new AbortController();
		captureController = controller;
		const expectedEvidenceId = evidenceId;
		const expectedSourceRevision = normalizedSourceSha256;
		const expectedAnalysisRevision = analysisRevision;
		const expectedFrameIndex = frameIndex;
		const expectedTimestampMs = timestampMs;
		busy = true;
		status = 'Loading the authorized analyzed frame…';
		try {
			videoElement?.pause();
			onSeekToFrame?.(expectedTimestampMs);
			const response = await fetch(`/api/evidence/${encodeURIComponent(expectedEvidenceId)}/video-frame/${expectedFrameIndex}`, {
				credentials: 'same-origin',
				cache: 'no-store',
				headers: { Accept: 'image/jpeg' },
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`The authorized analyzed frame is unavailable (HTTP ${response.status}). Select an extracted frame and retry.`);
			const responseType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
			const responseMatchesSelection = responseType === 'image/jpeg'
				&& response.headers.get('X-Source-Revision') === expectedSourceRevision
				&& response.headers.get('X-Analysis-Revision') === expectedAnalysisRevision
				&& response.headers.get('X-Frame-Index') === String(expectedFrameIndex)
				&& response.headers.get('X-Frame-Timestamp-Ms') === String(expectedTimestampMs);
			if (!responseMatchesSelection) throw new Error('The authorized frame does not match this evidence, analysis run, frame index, and timestamp.');
			const readOptionalDimension = (headerName: string): number | null => {
				const value = response.headers.get(headerName);
				return value === null ? null : Number(value);
			};
			const declaredSourceWidth = readOptionalDimension('X-Source-Frame-Width');
			const declaredSourceHeight = readOptionalDimension('X-Source-Frame-Height');
			const declaredArtifactWidth = readOptionalDimension('X-Artifact-Frame-Width');
			const declaredArtifactHeight = readOptionalDimension('X-Artifact-Frame-Height');
			if ((declaredSourceWidth === null) !== (declaredSourceHeight === null)
				|| (declaredArtifactWidth === null) !== (declaredArtifactHeight === null)) {
				throw new Error('The analyzed frame has incomplete dimension metadata.');
			}
			const blob = await response.blob();
			if (blob.size <= 0 || blob.size > 16 * 1024 * 1024) throw new Error('The analyzed frame preview exceeds its size limit.');
			const bitmap = await createImageBitmap(blob);
			let sourceWidth = 0;
			let sourceHeight = 0;
			let artifactWidth = 0;
			let artifactHeight = 0;
			try {
				artifactWidth = declaredArtifactWidth ?? bitmap.width;
				artifactHeight = declaredArtifactHeight ?? bitmap.height;
				if (bitmap.width !== artifactWidth || bitmap.height !== artifactHeight) throw new Error('The analyzed frame dimensions do not match its saved artifact metadata.');
				sourceWidth = declaredSourceWidth ?? videoElement?.videoWidth ?? 0;
				sourceHeight = declaredSourceHeight ?? videoElement?.videoHeight ?? 0;
				const dimensionsAreValid = [sourceWidth, sourceHeight, artifactWidth, artifactHeight].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 32768)
					&& sourceWidth * sourceHeight <= 100_000_000
					&& artifactWidth * artifactHeight <= 100_000_000
					&& Math.abs(sourceWidth / sourceHeight - artifactWidth / artifactHeight) <= 0.02;
				if (!dimensionsAreValid) throw new Error('The analyzed frame has invalid or mismatched source dimensions.');
				if (controller.signal.aborted) return;
				if (evidenceId !== expectedEvidenceId || normalizedSourceSha256 !== expectedSourceRevision
					|| analysisRevision !== expectedAnalysisRevision || frameIndex !== expectedFrameIndex || timestampMs !== expectedTimestampMs) {
					throw new Error('The selected source or frame changed while loading. Select it again before placing landmarks.');
				}
				const nextSnapshotUrl = URL.createObjectURL(blob);
				if (snapshotUrl?.startsWith('blob:')) URL.revokeObjectURL(snapshotUrl);
				snapshotUrl = nextSnapshotUrl;
				stageWidth = sourceWidth;
				stageHeight = sourceHeight;
			} finally {
				bitmap.close();
			}
			fitAnchorDrafts = createAnchorDrafts('fit');
			validationAnchorDrafts = createAnchorDrafts('check');
			groundContactDraft = null;
			groundContactMode = false;
			calibrationProposal = null;
			calibrationDraftDirty = false;
			calibrationReadbackVerified = false;
			capturedFrameBinding = { evidenceId: expectedEvidenceId, sourceRevision: expectedSourceRevision, analysisRevision: expectedAnalysisRevision, frameIndex: expectedFrameIndex, timestampMs: expectedTimestampMs, frameWidth: sourceWidth, frameHeight: sourceHeight, artifactWidth, artifactHeight };
			captured = true;
			status = `Authorized analyzed frame loaded (${artifactWidth} × ${artifactHeight} preview; ${sourceWidth} × ${sourceHeight} source coordinates). Points remain an unreviewed manual proposal.`;
		} catch (error) {
			if (!controller.signal.aborted) status = error instanceof Error ? error.message : 'Could not load the selected analyzed frame.';
		} finally {
			if (captureController === controller) {
				captureController = null;
				busy = false;
			}
		}
	}

	function placeActiveJoint(event: MouseEvent) {
		if (busy || !capturedFrameMatchesSelection || !stageWidth || !stageHeight) return;
		const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
		if (!rect || rect.width <= 0 || rect.height <= 0) return;
		const x = Math.max(0, Math.min(stageWidth, ((event.clientX - rect.left) / rect.width) * stageWidth));
		const y = Math.max(0, Math.min(stageHeight, ((event.clientY - rect.top) / rect.height) * stageHeight));
		if (groundPlaneMode) {
			calibrationDraftDirty = true;
			const anchors = activePlaneAnchor.group === 'fit' ? fitAnchorDrafts : validationAnchorDrafts;
			anchors[activePlaneAnchor.index] = { ...anchors[activePlaneAnchor.index]!, imagePx: { x, y } };
			if (activePlaneAnchor.group === 'fit') fitAnchorDrafts = [...anchors];
			else validationAnchorDrafts = [...anchors];
			calibrationProposal = null;
			calibrationReadbackVerified = false;
			status = `Marked image point for ${activePlaneAnchor.group === 'fit' ? 'fit' : 'validation'} anchor ${activePlaneAnchor.index + 1}. Enter its measured ground-plane coordinates.`;
			return;
		}
		if (groundContactMode) {
			poseDraftDirty = true;
			groundContactDraft = { imagePx: [x, y], footSide: groundContactFootSide, label: 'operator-marked-ground-contact-candidate' };
			status = 'Marked a source-pixel ground-contact candidate. It remains unreviewed; only an accepted pose review can make it eligible for a calibrated plane proposal.';
			return;
		}
		const placedJointName = activeJointName;
		poseDraftDirty = true;
		points[activeJointIndex] = { x, y };
		points = [...points];
		xInput = x.toFixed(1);
		yInput = y.toFixed(1);
		const next = points.findIndex((point) => point === null);
		if (next >= 0) activeJointIndex = next;
		status = `Placed ${placedJointName}; ${placedCount} of 17 landmarks placed.`;
	}

	function selectPlaneAnchor(group: 'fit' | 'check', index: number) {
		activePlaneAnchor = { group, index };
		groundPlaneMode = true;
		calibrationProposal = null;
	}

	function buildCalibrationProposal() {
		if (!capturedFrameMatchesSelection || !capturedFrameBinding) {
			status = 'Capture the currently selected source frame before calibrating it.';
			return;
		}
		if (!fixedCameraConfirmed) {
			status = 'Confirm that the camera remained fixed for this video before creating a planar calibration.';
			return;
		}
		const drafts = [...fitAnchorDrafts, ...validationAnchorDrafts];
		if (drafts.some((anchor) => !anchor.imagePx
			|| String(anchor.planeX).trim() === '' || String(anchor.planeY).trim() === ''
			|| !Number.isFinite(Number(anchor.planeX)) || !Number.isFinite(Number(anchor.planeY)))) {
			status = 'Mark all eight image points and enter measured X/Y ground-plane coordinates.';
			return;
		}
		try {
			const toAnchor = (anchor: PlaneAnchorDraft) => ({
				id: anchor.id,
				imagePx: [anchor.imagePx!.x, anchor.imagePx!.y] as [number, number],
				planeM: [Number(anchor.planeX), Number(anchor.planeY)] as [number, number],
			});
			const candidate = createPlanarCameraCalibrationV1({
				evidenceId,
				sourceRevision: normalizedSourceSha256,
				analysisRevision,
				calibrationFrameIndex: capturedFrameBinding.frameIndex,
				calibrationFramePtsUs: Math.round(capturedFrameBinding.timestampMs * 1000),
				frameWidth: capturedFrameBinding.frameWidth,
				frameHeight: capturedFrameBinding.frameHeight,
				operatorConfirmedFixedCamera: true,
				fitAnchors: fitAnchorDrafts.map(toAnchor),
				validationAnchors: validationAnchorDrafts.map(toAnchor),
				toleranceMeters: 0.05,
			});
			if (candidate.validationStatus !== 'CHECKS_PASSED') throw new Error('Independent calibration checks did not pass.');
			calibrationProposal = candidate;
			calibrationReadbackVerified = false;
			status = 'Calibration checks passed. Review the residuals, then save this unreviewed proposal.';
		} catch (error) {
			calibrationProposal = null;
			status = error instanceof Error ? error.message : 'Could not create the planar calibration proposal.';
		}
	}

	async function saveCalibrationProposal() {
		if (!calibrationProposal || calibrationProposal.validationStatus !== 'CHECKS_PASSED' || !capturedFrameMatchesSelection || busy) return;
		busy = true;
		status = 'Saving the source-bound calibration proposal…';
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					schema: 'atlas.evidence-annotation-revision-request.v1',
					caseId,
					parentSha256: normalizedSourceSha256,
					revisionNotes: `Fixed-camera planar calibration proposal at ${calibrationProposal.calibrationFramePtsUs} us`,
					annotation: {
						schema: 'atlas.evidence-annotation.v1', modality: 'video', notes: 'Unreviewed fixed-camera planar calibration proposal.', annotations: [],
						planarCameraCalibrations: [calibrationProposal],
					},
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `Calibration proposal save failed (${response.status}).`);
			const reloaded = await loadSavedCalibration();
			if (!reloaded || !savedCalibration
				|| savedCalibration.evidenceId !== calibrationProposal.evidenceId
				|| savedCalibration.sourceRevision !== calibrationProposal.sourceRevision
				|| savedCalibration.analysisRevision !== calibrationProposal.analysisRevision
				|| savedCalibration.calibrationFrameIndex !== calibrationProposal.calibrationFrameIndex
				|| savedCalibration.calibrationFramePtsUs !== calibrationProposal.calibrationFramePtsUs
				|| savedCalibration.frameWidth !== calibrationProposal.frameWidth
				|| savedCalibration.frameHeight !== calibrationProposal.frameHeight
				|| JSON.stringify(savedCalibration.imageToPlaneHomography) !== JSON.stringify(calibrationProposal.imageToPlaneHomography)) {
				throw new Error('The calibration proposal saved, but independent revision-history readback did not match it.');
			}
			status = 'Unreviewed calibration proposal saved and matched from authorized evidence revision history.';
			calibrationDraftDirty = false;
		} catch (error) {
			status = error instanceof Error ? error.message : 'Could not save the calibration proposal.';
		} finally {
			busy = false;
		}
	}

	function selectJoint(index: number) {
		activeJointIndex = index;
		const point = points[index];
		xInput = point ? point.x.toFixed(1) : '';
		yInput = point ? point.y.toFixed(1) : '';
	}

	function applyTypedCoordinates() {
		if (xInput == null || yInput == null || String(xInput).trim() === '' || String(yInput).trim() === '') {
			status = 'Enter both X and Y coordinates.';
			return;
		}
		const x = Number(xInput);
		const y = Number(yInput);
		if (!capturedFrameMatchesSelection || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > stageWidth || y < 0 || y > stageHeight) {
			status = `Enter X and Y within 0–${stageWidth} × 0–${stageHeight}.`;
			return;
		}
		points[activeJointIndex] = { x, y };
		poseDraftDirty = true;
		points = [...points];
		status = `Set ${activeJointName} by source-frame coordinates.`;
	}

	function clearPoints() {
		poseDraftDirty = false;
		points = Array.from({ length: 17 }, () => null);
		groundContactDraft = null;
		activeJointIndex = 0;
		xInput = '';
		yInput = '';
		savedRevision = null;
		status = 'Pose points cleared from this local draft.';
	}

	async function savePoseProposal() {
		if (!capturedFrameMatchesSelection || !capturedFrameBinding || (placedCount === 0 && !groundContactDraft) || busy) return;
		busy = true;
		status = 'Saving the source-bound pose proposal…';
		try {
			const observation = {
				schema: 'atlas.pose-observation.v1',
				evidenceId,
				sourceSha256: normalizedSourceSha256,
				sourceRevision: normalizedSourceSha256,
				analysisRevision,
				framePtsUs: Math.round(capturedFrameBinding.timestampMs * 1000),
				frameIndex: capturedFrameBinding.frameIndex,
				frameWidth: capturedFrameBinding.frameWidth,
				frameHeight: capturedFrameBinding.frameHeight,
				skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId,
				trackId: selectedTrackId || null,
				trackScopeId: selectedTrackId ? trackScopeId ?? null : null,
				origin: 'manual',
				modelRevision: null,
				reviewState: 'UNREVIEWED',
				...(groundContactDraft ? { groundContact: groundContactDraft } : {}),
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
				revisionNotes: `Manual COCO-17 pose proposal at ${capturedFrameBinding.timestampMs} ms`,
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
			const reloaded = await loadSavedPose(true);
			if (!reloaded) throw new Error('The pose proposal was saved, but its revision could not be verified by readback.');
			poseDraftDirty = false;
			status = `Unreviewed ${groundContactDraft ? 'pose and ground-contact candidate' : 'pose'} saved as evidence revision ${savedRevision ?? 'available'} and verified from revision history.`;
		} catch (error) {
			status = error instanceof Error ? error.message : 'Could not save the pose proposal.';
		} finally {
			busy = false;
		}
	}

	async function reviewPose(sample: (typeof savedTrackFrames)[number], decision: 'ACCEPTED_FOR_SCENE_PROPOSAL' | 'REJECTED') {
		if (busy || !sample.annotationRevisionId) return;
		if (poseDraftDirty && !window.confirm('Reviewing reloads the saved pose and discards unsaved pose changes. Continue?')) return;
		busy = true;
		status = decision === 'ACCEPTED_FOR_SCENE_PROPOSAL' ? 'Recording reviewer acceptance for a scene proposal…' : 'Recording reviewer rejection…';
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/pose-review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					schema: 'atlas.pose-review-request.v1', caseId, parentSha256: normalizedSourceSha256,
					annotationRevisionId: sample.annotationRevisionId, analysisRevision,
					frameIndex: sample.frameIndex, framePtsUs: sample.framePtsUs,
					skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId,
					trackId: selectedTrackId || null, trackScopeId: selectedTrackId ? trackScopeId ?? null : null,
					decision,
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `Pose review failed (${response.status}).`);
			poseDraftDirty = false;
			await loadSavedPose();
			status = decision === 'ACCEPTED_FOR_SCENE_PROPOSAL'
				? 'Pose accepted for scene proposal; it is still not calibrated world geometry.'
				: 'Pose rejected; the source annotation remains preserved in history.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'Could not record pose review.';
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
		<div class="pose-mode-switch" role="group" aria-label="Annotation mode">
			<button type="button" aria-pressed={!groundPlaneMode && !groundContactMode} onclick={() => { groundPlaneMode = false; groundContactMode = false; }}>Pose landmarks</button>
			<button type="button" aria-pressed={groundContactMode} onclick={() => { groundPlaneMode = false; groundContactMode = true; }}>Mark ground contact</button>
			<button type="button" aria-pressed={groundPlaneMode} onclick={() => { groundContactMode = false; groundPlaneMode = true; }}>Ground-plane calibration</button>
		</div>
		<label class="pose-track-field">
			Link to detector track hypothesis (optional)
			<select aria-label="Link pose to detector track hypothesis" value={selectedTrackId} disabled={busy} onchange={async (event) => {
				const select = event.currentTarget as HTMLSelectElement;
				if (poseDraftDirty && !window.confirm('Changing tracks discards unsaved pose changes. Continue?')) { select.value = selectedTrackId; return; }
				selectedTrackId = select.value;
				poseDraftDirty = false;
				points = Array.from({ length: 17 }, () => null);
				groundContactDraft = null;
				savedRevision = null;
				await loadSavedPose();
			}}>
				<option value="">No track link</option>
				{#each trackOptions as detection, index (`${detection.trackId}-${index}`)}
					<option value={detection.trackId}>{detection.trackId} · person label · {Math.round((detection.confidence ?? 0) * 100)}% box confidence</option>
				{/each}
			</select>
			<span>Track IDs are analysis-run hypotheses. They do not identify a person.</span>
		</label>
		<button type="button" class="pose-capture" onclick={captureSelectedFrame} disabled={busy}>
			{busy ? 'Loading frame…' : captured ? 'Reload authorized frame' : 'Load authorized analyzed frame'}
		</button>
		{#if captured}
			{#if !capturedFrameMatchesSelection}<p class="pose-stale-frame" role="alert">The selected frame or source changed after capture. Recapture before placing or saving landmarks.</p>{/if}
			<div class="pose-stage" style={`aspect-ratio:${stageWidth}/${stageHeight}`}>
				{#if snapshotUrl}<img class="pose-stage-image" src={snapshotUrl} alt={`Authorized analyzed video frame ${frameIndex} at ${timestampMs} milliseconds for manual pose annotation`} />{/if}
				<svg class="pose-lines" viewBox={`0 0 ${stageWidth} ${stageHeight}`} preserveAspectRatio="none" aria-hidden="true">
					{#if groundPlaneMode}
						{#each fitAnchorDrafts as anchor, index (`fit-${anchor.id}`)}
							{#if anchor.imagePx}<circle class="calibration-fit-point" cx={anchor.imagePx.x} cy={anchor.imagePx.y} r={Math.max(5, stageWidth / 100)} /><text x={anchor.imagePx.x + 7} y={anchor.imagePx.y - 7}>F{index + 1}</text>{/if}
						{/each}
						{#each validationAnchorDrafts as anchor, index (`check-${anchor.id}`)}
							{#if anchor.imagePx}<circle class="calibration-check-point" cx={anchor.imagePx.x} cy={anchor.imagePx.y} r={Math.max(5, stageWidth / 100)} /><text x={anchor.imagePx.x + 7} y={anchor.imagePx.y - 7}>V{index + 1}</text>{/if}
						{/each}
					{:else}
						{#if groundContactDraft}<circle class="ground-contact-point" cx={groundContactDraft.imagePx[0]} cy={groundContactDraft.imagePx[1]} r={Math.max(7, stageWidth / 80)} /><text x={groundContactDraft.imagePx[0] + 8} y={groundContactDraft.imagePx[1] - 8}>CONTACT?</text>{/if}
						{#each humanCoco17PoseSchemaV1.bones as [from, to], index (`${from}-${to}-${index}`)}
							{#if points[from] && points[to]}
								<line x1={points[from]?.x} y1={points[from]?.y} x2={points[to]?.x} y2={points[to]?.y} />
							{/if}
						{/each}
						{#each points as point, index (index)}
							{#if point}<circle class="pose-keypoint" style={`--pose-keypoint-color:${poseKeypointDisplayColorV1(index)}`} cx={point.x} cy={point.y} r={Math.max(3, stageWidth / 120)} /><text class="pose-keypoint-label" style={`--pose-keypoint-color:${poseKeypointDisplayColorV1(index)}`} x={point.x + 5} y={point.y - 5}>{index}</text>{/if}
		{/each}
	{/if}
				</svg>
				<button type="button" class="pose-stage-target" onclick={placeActiveJoint} disabled={!capturedFrameMatchesSelection} aria-label={groundPlaneMode ? 'Set image point for selected ground-plane anchor' : groundContactMode ? 'Mark source-pixel ground-contact candidate' : `Place ${activeJointName} on the captured frame`}></button>
			</div>
			{#if groundPlaneMode}
				<section class="plane-calibration" aria-label="Ground-plane calibration proposal">
					<p>Choose four image points and enter their measured ground-plane coordinates. Use fixed, visible landmarks on the same flat floor. The original video is unchanged.</p>
					<label class="fixed-camera-confirmation"><input type="checkbox" bind:checked={fixedCameraConfirmed} /> I confirm the camera was fixed during this recording.</label>
					<strong>Fit anchors</strong>
					{#each fitAnchorDrafts as anchor, index (anchor.id)}
						<div class="plane-anchor-row">
							<button type="button" class:active={activePlaneAnchor.group === 'fit' && activePlaneAnchor.index === index} onclick={() => selectPlaneAnchor('fit', index)}>F{index + 1} · {anchor.imagePx ? `${anchor.imagePx.x.toFixed(1)}, ${anchor.imagePx.y.toFixed(1)} px` : 'select image point'}</button>
							<label>Ground X (m)<input type="number" step="0.001" bind:value={anchor.planeX} oninput={() => { calibrationProposal = null; calibrationDraftDirty = true; }} /></label>
							<label>Ground Y (m)<input type="number" step="0.001" bind:value={anchor.planeY} oninput={() => { calibrationProposal = null; calibrationDraftDirty = true; }} /></label>
						</div>
					{/each}
					<strong>Independent validation anchors</strong>
					{#each validationAnchorDrafts as anchor, index (anchor.id)}
						<div class="plane-anchor-row">
							<button type="button" class:active={activePlaneAnchor.group === 'check' && activePlaneAnchor.index === index} onclick={() => selectPlaneAnchor('check', index)}>V{index + 1} · {anchor.imagePx ? `${anchor.imagePx.x.toFixed(1)}, ${anchor.imagePx.y.toFixed(1)} px` : 'select image point'}</button>
							<label>Ground X (m)<input type="number" step="0.001" bind:value={anchor.planeX} oninput={() => { calibrationProposal = null; calibrationDraftDirty = true; }} /></label>
							<label>Ground Y (m)<input type="number" step="0.001" bind:value={anchor.planeY} oninput={() => { calibrationProposal = null; calibrationDraftDirty = true; }} /></label>
						</div>
					{/each}
					<div class="pose-actions">
						<button type="button" onclick={buildCalibrationProposal} disabled={busy || !capturedFrameMatchesSelection}>Check calibration</button>
						<button type="button" class="pose-save" onclick={saveCalibrationProposal} disabled={busy || !calibrationProposal || calibrationProposal.validationStatus !== 'CHECKS_PASSED' || !capturedFrameMatchesSelection}>{busy ? 'Saving…' : 'Save unreviewed calibration'}</button>
					</div>
					{#if calibrationProposal}
						<p role="status">Four validation anchors passed · max check residual {Math.max(...calibrationProposal.validationResidualsMeters.map((item) => item.residualMeters)).toFixed(4)} m · proposal only; reviewer approval is still required before scene use.</p>
					{/if}
					{#if savedCalibration && calibrationReadbackVerified}
						<p role="status">Saved calibration was reloaded from authorized annotation history. Review: {savedCalibrationDecision ?? 'pending'}. It is not applied to scene geometry.</p>
						{#if calibrationReviewEnabled && savedCalibrationDecision === null}
							<label>Review note (optional)<textarea bind:value={calibrationReviewNotes} maxlength="1000" rows="2" placeholder="Why is this calibration suitable or unsuitable for a scene proposal?"></textarea></label>
							<div class="pose-actions">
								<button type="button" onclick={() => reviewCalibration('ACCEPTED_FOR_SCENE_PROPOSAL')} disabled={busy}>Accept for scene proposal</button>
								<button type="button" onclick={() => reviewCalibration('REJECTED')} disabled={busy}>Reject calibration</button>
							</div>
						{:else if !calibrationReviewEnabled}
							<p>Review controls are disabled by the server policy.</p>
						{/if}
					{/if}
				</section>
			{:else}
				{#if groundContactMode}
					<section class="plane-calibration" aria-label="Ground-contact candidate">
						<p>Click the visible foot-to-floor contact location in this exact source frame. This is a manual candidate, not an inferred contact or a 3D point. It needs pose review and an independently accepted fixed-camera calibration before ground-plane projection.</p>
						<label>Contact side
							<select bind:value={groundContactFootSide}>
								<option value="left">Left foot</option><option value="right">Right foot</option><option value="unknown">Unclear / unknown</option>
							</select>
						</label>
						{#if groundContactDraft}<p>Candidate: {groundContactDraft.imagePx[0].toFixed(1)}, {groundContactDraft.imagePx[1].toFixed(1)} px · {groundContactDraft.footSide} · unreviewed</p>{/if}
					</section>
				{/if}
				<div class="pose-point-entry">
					<label>X px <input type="number" min="0" max={stageWidth} step="0.1" bind:value={xInput} /></label>
					<label>Y px <input type="number" min="0" max={stageHeight} step="0.1" bind:value={yInput} /></label>
					<button type="button" onclick={applyTypedCoordinates}>Set coordinates</button>
				</div>
				<div class="pose-joint-grid" aria-label="COCO-17 joint selector">
					{#each humanCoco17PoseSchemaV1.joints as joint, index (joint.name)}
						<button type="button" style={`--pose-keypoint-color:${poseKeypointDisplayColorV1(index)}`} class:active={activeJointIndex === index} class:placed={points[index] !== null} aria-pressed={activeJointIndex === index} onclick={() => selectJoint(index)}>
							{index}. {joint.name}{points[index] ? ' ✓' : ''}
						</button>
					{/each}
				</div>
				<div class="pose-actions">
					<span>{placedCount}/17 placed · current: {activeJointName}</span>
					<button type="button" onclick={clearPoints} disabled={busy}>Clear</button>
					<button type="button" class="pose-save" onclick={savePoseProposal} disabled={busy || !capturedFrameMatchesSelection || (placedCount === 0 && !groundContactDraft)}>
						{busy ? 'Saving…' : groundContactDraft ? 'Save unreviewed pose and contact' : 'Save unreviewed pose'}
					</button>
				</div>
			{/if}
			{#if selectedTrackId && savedTrackFrames.length > 0}
				<section class="pose-track-samples" aria-label="Saved pose samples for selected track">
					<strong>{savedTrackFrames.length} source-frame pose sample{savedTrackFrames.length === 1 ? '' : 's'} for {selectedTrackId}</strong>
					<p>Review decisions are appended to history. Accepting a sample with CONTACT? also reviews that manually marked contact candidate. It remains a ground-plane proposal only after matching calibration review; no height or camera-motion compensation is provided. Keypoint scores are not calibrated pixel-error bounds; displayed angles are 2D image-plane measurements, not anatomical or world-space angles.</p>
					<div>
						{#each savedTrackFrames as sample (`${sample.frameIndex}-${sample.timestampMs}`)}
							{@const motionSample = savedTrackMotion?.samples.find((item) => item.frameIndex === sample.frameIndex)}
							<article class="pose-sample-row">
								<button type="button" onclick={() => seekToPoseSample(sample.timestampMs)} aria-label={`Seek to pose sample frame ${sample.frameIndex}`}>
									Frame {sample.frameIndex} · {sample.timestampMs.toFixed(0)} ms · {sample.placedJoints}/17 joints
								</button>
								<span>{sample.reviewDecision === 'ACCEPTED_FOR_SCENE_PROPOSAL' ? `Accepted ${sample.hasGroundContact ? 'pose and contact candidate' : 'pose'} for scene proposal` : sample.reviewDecision === 'REJECTED' ? 'Rejected' : `${sample.hasGroundContact ? 'Pose and contact candidate' : 'Pose'} unreviewed`}</span>
								{#if motionSample}
									<span class="pose-sample-metrics">Visible {motionSample.visibility.visible} · occluded {motionSample.visibility.occluded} · unlabeled {motionSample.visibility.notLabeled} · mean keypoint score {motionSample.confidence.mean === null ? 'n/a' : motionSample.confidence.mean.toFixed(2)}</span>
									{#if motionSample.jointAnglesDeg.length > 0}
										<span class="pose-sample-metrics">2D image-plane angles: {motionSample.jointAnglesDeg.map((angle) => `${angle.name} ${angle.degrees.toFixed(0)}°`).join(' · ')}</span>
									{/if}
								{/if}
								{#if poseReviewEnabled}
									<button type="button" disabled={busy} onclick={() => reviewPose(sample, 'ACCEPTED_FOR_SCENE_PROPOSAL')}>{sample.hasGroundContact ? 'Accept pose and contact candidate' : 'Accept for scene proposal'}</button>
									<button type="button" disabled={busy} onclick={() => reviewPose(sample, 'REJECTED')}>Reject</button>
								{:else}
									<span>Review actions are disabled by the operator.</span>
								{/if}
							</article>
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
	.pose-mode-switch { display: flex; flex-wrap: wrap; gap: .35rem; }
	.pose-mode-switch button { min-height: 2rem; padding: .3rem .55rem; border: 1px solid var(--border, #999); border-radius: .3rem; background: var(--surface, #fff); color: inherit; }
	.pose-mode-switch button[aria-pressed="true"] { outline: 2px solid #087f72; }
	.pose-track-field { display: grid; gap: 0.25rem; font-size: 0.82rem; }
	.pose-track-field select { min-height: 2.25rem; padding: 0.35rem 0.55rem; border: 1px solid var(--border, #999); border-radius: 0.3rem; background: var(--surface, #fff); color: inherit; font: inherit; }
	.pose-track-field span { color: var(--text-muted, #666); font-size: 0.76rem; }
	.pose-track-samples { display: grid; gap: 0.3rem; padding-top: 0.45rem; border-top: 1px solid var(--border, #bbb); font-size: 0.8rem; }
	.pose-track-samples p { margin: 0; color: var(--text-muted, #666); }
	.pose-track-samples > div { display: grid; gap: 0.35rem; }
	.pose-sample-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
	.pose-track-samples button { min-height: 2rem; padding: 0.25rem 0.5rem; border: 1px solid var(--border, #999); border-radius: 0.3rem; background: var(--surface, #fff); color: inherit; font: inherit; }
	.pose-track-motion { display: grid; gap: 0.2rem; padding: 0.45rem; border-radius: 0.3rem; background: var(--surface, #fff); font-variant-numeric: tabular-nums; }
	.pose-sample-metrics { display: block; color: var(--muted-foreground, #666); font-size: 0.85em; }
	.pose-toggle, .pose-save { font-weight: 700; }
	.pose-disclaimer, .pose-status { margin: 0; font-size: 0.82rem; line-height: 1.35; }
	.pose-stale-frame { margin: 0; padding: .45rem; border: 1px solid #a65b34; background: #fff1e8; color: #702a12; font-size: .82rem; }
	.pose-stage { position: relative; width: min(100%, 42rem); overflow: hidden; background: #111; }
	.pose-stage-image, .pose-lines, .pose-stage-target { position: absolute; inset: 0; width: 100%; height: 100%; }
	.pose-stage-image { display: block; object-fit: fill; }
	.pose-lines { pointer-events: none; }
	.pose-lines line { stroke: #17e0c1; stroke-width: 3; vector-effect: non-scaling-stroke; }
	.pose-lines circle { fill: #ffc857; stroke: #111; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.pose-lines .pose-keypoint { fill: var(--pose-keypoint-color); stroke: #fff; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
	.pose-lines text { fill: white; font: 12px sans-serif; paint-order: stroke; stroke: #111; stroke-width: 3px; }
	.pose-lines .pose-keypoint-label { fill: var(--pose-keypoint-color); }
	.pose-lines .calibration-fit-point { fill: #ffd36d; stroke: #171d29; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.pose-lines .calibration-check-point { fill: #f28f62; stroke: #171d29; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.pose-lines .ground-contact-point { fill: #ff6b5e; stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.pose-stage-target { z-index: 2; border: 0; background: transparent; opacity: 0; cursor: crosshair; }
	.pose-point-entry { display: flex; flex-wrap: wrap; align-items: end; gap: 0.5rem; }
	.pose-point-entry label { display: grid; gap: 0.2rem; font-size: 0.78rem; }
	.pose-point-entry input { width: 6.5rem; min-height: 2rem; padding: 0.25rem; }
	.pose-joint-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 0.3rem; max-height: 10rem; overflow: auto; }
	.pose-joint-grid button { text-align: left; font-size: 0.72rem; border-left: 4px solid var(--pose-keypoint-color, #a89b82); }
	.pose-joint-grid button.active { outline: 2px solid #087f72; }
	.pose-joint-grid button.placed { border-color: #087f72; }
	.pose-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
	.pose-actions span { margin-right: auto; font-size: 0.78rem; }
	.pose-save { background: #d6f4e9 !important; }
	.plane-calibration { display: grid; gap: .45rem; padding: .6rem; border: 1px solid var(--border, #aaa); border-radius: .35rem; background: var(--surface-muted, #f7f4ee); }
	.plane-calibration p { margin: 0; font-size: .8rem; line-height: 1.4; }
	.fixed-camera-confirmation { display: flex; align-items: center; gap: .45rem; font-size: .82rem; }
	.plane-anchor-row { display: grid; grid-template-columns: minmax(12rem, 1fr) minmax(7rem, .6fr) minmax(7rem, .6fr); align-items: end; gap: .35rem; }
	.plane-anchor-row button, .plane-anchor-row input { min-height: 2rem; padding: .25rem .4rem; border: 1px solid var(--border, #999); border-radius: .25rem; background: var(--surface, #fff); color: inherit; font: inherit; }
	.plane-anchor-row button.active { outline: 2px solid #087f72; }
	.plane-anchor-row label { display: grid; gap: .15rem; font-size: .7rem; }
	@media (max-width: 600px) { .pose-point-entry { align-items: stretch; } .pose-actions span { width: 100%; } .plane-anchor-row { grid-template-columns: 1fr 1fr; } .plane-anchor-row > button { grid-column: 1 / -1; } }
</style>
