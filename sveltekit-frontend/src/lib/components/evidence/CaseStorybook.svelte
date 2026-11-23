<script lang="ts">
	import { goto } from '$app/navigation';
	import { z } from 'zod';
	import EvidenceVideoEventTimeline from './EvidenceVideoEventTimeline.svelte';
	import StorybookRegionReview from './StorybookRegionReview.svelte';
	import { reviewableImageObservationsV1 } from '$lib/shared/storybook-region-review-v1.js';
	import { STORYBOOK_REGION_GRID_SIZE } from '$lib/shared/storybook-region-review-v1.js';
	import { storybookImageDecisionV1Schema, storybookImageObservationsV1Schema } from '$lib/shared/storybook-image-observations-v1.js';
	import { buildReviewedImageStorybookChapterV1, savedImageChapterHrefV1, storybookRelativeDepthV1Schema, type ReviewedMaskPolygonsV1, type StorybookImageSceneCellV1 } from '$lib/shared/storybook-image-chapter-v1.js';
	import { compileMaskContoursV1 } from '$lib/splat/mask-contour-compiler-v1.js';
	import { createSceneDocumentV1, createSceneQualityReceiptV1, stableStringifySceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
	import { caseStorybookSceneIdV1, fetchSceneRevisionV1, saveSceneManifestRevisionV1 } from '$lib/splat/scene-persistence-client-v1.js';
	import type { VideoStorybookCoverageV1 } from '$lib/server/features/evidence/video/video-storybook-coverage-v1.js';

	type Chapter = { id: string; title: string };
	type Video = Omit<VideoStorybookCoverageV1, 'frames'> & {
		frame: VideoStorybookCoverageV1['frames'][number] | null;
		frames: Array<{ frameIndex: number; timestampMs: number }>;
	};
	let { caseId, chapters, chapter, video, unavailable }: {
		caseId: string; chapters: Chapter[]; chapter: (Chapter & { kind: 'image' | 'video' }) | null;
		video: Video | null; unavailable: boolean;
	} = $props();

	const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
	const pixelBox = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]);
	const imageResponse = z.object({
		status: z.enum(['CURRENT', 'NOT_ANALYZED', 'STALE', 'STORE_UNAVAILABLE', 'ERROR']),
		evidenceId: z.uuid(), caseId: z.uuid().nullable(), sourceRevision: digest.nullable(),
		analysisRevision: z.string().min(1).max(512).nullable(),
		storybook: storybookImageObservationsV1Schema.nullish(),
		relativeDepth: storybookRelativeDepthV1Schema.optional(),
		sourceDimensions: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).nullable(),
		analysis: z.object({
			sourceRevision: digest,
			objectDetections: z.array(z.object({ class: z.string(), confidence: z.number().min(0).max(1), bbox: pixelBox })).max(500),
			visionSummary: z.string().max(5000).nullable(),
			stageErrors: z.array(z.string().max(300)).max(30),
			depthMap: z.object({ artifactSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional() }).nullable(),
		}).nullable(),
	});
	let image = $state<z.infer<typeof imageResponse> | null>(null);
	let imageState = $state<'loading' | 'ready' | 'unavailable' | 'not-analyzed'>('loading');
	let showReview = $state(false);
	let showSegmentation = $state(false);
	let showSceneContext = $state(false);
	let showOcr = $state(false);
	let reviewSelection = $state<{ revision: string; id: string } | null>(null);
	let reviewEdits = $state(0);
	let loadedMask = $state<string | null>(null);
	let selection = $state<{ key: string | null; index: number } | null>(null);
	let maskSelection = $state<{ revision: string; id: string } | null>(null);
	let failedMask = $state<string | null>(null);
	let compiledMask = $state<{ observationId: string; artifactSha256: string; reviewVersionId: string; polygons: ReviewedMaskPolygonsV1['polygons']; width: number; height: number } | null>(null);
	let compilingMask = $state(false);
	let maskCompileError = $state<string | null>(null);
	let acceptMaskPolygons = $state(false);
	let region = $state<{ key: string | null; column: number; row: number } | null>(null);
	let loadedPreview = $state<string | null>(null);
	let failedPreview = $state<string | null>(null);
	const draftResponse = z.object({ ok: z.literal(true), prefillSha256: digest,
		spatialReviews: z.array(storybookImageDecisionV1Schema.extend({ decision: z.literal('ACCEPTED') })).max(8).optional(),
		sceneIntent: z.object({ title: z.string(), events: z.array(z.object({ id: z.string(), time_s: z.number(), what: z.string(),
			how: z.string().optional(),
			citations: z.array(z.object({ observation_id: digest })).min(1),
		})) }) });
	const maskReviewHistory = z.object({ evidenceId: z.uuid(), versions: z.array(z.object({
		id: z.uuid(),
		metadata: z.object({ caseId: z.uuid(), evidenceId: z.uuid(), parentSha256: digest,
			annotation: z.object({ storybookRegionReview: z.object({ observationId: digest, analysisRevision: z.string(),
				observationRevision: digest, decision: z.enum(['ACCEPTED', 'REJECTED', 'UNCERTAIN']) }).passthrough() }).passthrough(),
		}).passthrough(),
	})).max(200) });
	type Draft = z.infer<typeof draftResponse>['sceneIntent'] & {
		sourceKey: string; prefillSha256: string; chapterId: string; spatialReviews: z.infer<typeof draftResponse>['spatialReviews'];
		includeRelativeDepth: boolean;
		cells: Array<Pick<StorybookImageSceneCellV1, 'observationId' | 'placedCell'> & { label: string; included: boolean }>;
	};
	let draft = $state<Draft | null>(null);
	const gridPositions = Array.from({ length: STORYBOOK_REGION_GRID_SIZE }, (_, index) => index);
	let drafting = $state(false);
	let draftError = $state<{ sourceKey: string; message: string } | null>(null);
	let savingChapter = $state(false);
	let chapterSave = $state<{ chapterId: string; href?: string; error?: string } | null>(null);

	const basePath = $derived(`/cases/${encodeURIComponent(caseId)}/crime-scene`);
	const frame = $derived(video?.frame ?? null);
	const frameUrl = $derived(video && frame ? `/api/evidence/${encodeURIComponent(video.evidenceId)}/video-frame/${frame.frameIndex}?${new URLSearchParams({
		sourceRevision: video.sourceRevision, analysisRevision: video.analysisRevision, artifactSha256: frame.artifactSha256,
	})}` : null);
	const imageUrl = $derived(chapter?.kind === 'image' && image?.sourceRevision ?
		`/api/evidence/${encodeURIComponent(chapter.id)}/download?${new URLSearchParams({ caseId, inline: '1', sourceRevision: image.sourceRevision })}` : null);
	const dimensions = $derived(frame ?? image?.sourceDimensions ?? null);
	const imageObservations = $derived(chapter?.kind === 'image' && image?.caseId === caseId && image.storybook &&
		image.storybook.evidenceId === chapter.id && image.storybook.sourceRevision === image.sourceRevision &&
		image.storybook.analysisRevision === image.analysisRevision && image.storybook.width === image.sourceDimensions?.width &&
		image.storybook.height === image.sourceDimensions?.height ? image.storybook : null);
	const selectionKey = $derived(frameUrl ?? imageObservations?.observationRevision ?? image?.analysisRevision ?? null);
	const reviewable = $derived(imageObservations ? reviewableImageObservationsV1(imageObservations) : []);
	const reviewObservation = $derived(reviewSelection?.revision === imageObservations?.observationRevision
		? reviewable.find((item) => item.observationId === reviewSelection?.id) : undefined);
	const draftKey = $derived(frameUrl || imageObservations ? `${caseId}:${frameUrl ?? imageObservations?.observationRevision}:${reviewEdits}` : null);
	const canDraft = $derived(Boolean(frame?.detections.length ||
		(imageObservations?.detectionCoverage === 'RECORDED' && imageObservations.detections.length) ||
		(imageObservations?.sceneContextCoverage === 'RECORDED' && imageObservations.sceneContext) ||
		(imageObservations?.ocrCoverage === 'COMPLETED' && imageObservations.ocrSpan)));
	const selectedObservation = $derived(selection && selection.key === selectionKey ? selection.index : null);
	const selectedMask = $derived(imageObservations && maskSelection?.revision === imageObservations.observationRevision ?
		imageObservations.masks.find((mask) => mask.observationId === maskSelection?.id) : undefined);
	const maskUrl = $derived(imageObservations && selectedMask ?
		`/api/evidence/${encodeURIComponent(imageObservations.evidenceId)}/multimodal-analysis?${new URLSearchParams({
			maskObservation: selectedMask.observationId, sourceRevision: imageObservations.sourceRevision,
			analysisRevision: imageObservations.analysisRevision, observationRevision: imageObservations.observationRevision,
		})}` : null);
	const previewUrl = $derived(frameUrl ?? imageUrl);
	const previewReady = $derived(Boolean(previewUrl && loadedPreview === previewUrl && failedPreview !== previewUrl));
	const selectedRegion = $derived(region && region.key === selectionKey ? region : null);
	const boxes = $derived(frame?.detections.map(({ label, confidence, bbox }) => ({ label, confidence, bbox })) ??
		image?.analysis?.objectDetections.map((row) => ({ label: row.class, confidence: row.confidence, bbox: row.bbox })) ?? []);

	$effect(() => {
		const source = chapter;
		const scopedCase = caseId;
		image = null;
		imageState = 'loading';
		if (source?.kind !== 'image') return;
		const controller = new AbortController();
		void (async () => {
			try {
				const response = await fetch(`/api/evidence/${encodeURIComponent(source.id)}/multimodal-analysis`, { signal: controller.signal, cache: 'no-store' });
				const parsed = imageResponse.safeParse(await response.json());
				if (controller.signal.aborted) return;
				if (!response.ok || !parsed.success || parsed.data.caseId !== scopedCase || parsed.data.evidenceId !== source.id) {
					imageState = 'unavailable';
					return;
				}
				const data = parsed.data;
				if (data.status === 'NOT_ANALYZED') imageState = 'not-analyzed';
				else if (data.status === 'CURRENT' && data.sourceRevision && data.analysisRevision && data.sourceDimensions &&
					data.analysis?.sourceRevision === data.sourceRevision) {
					image = data;
					imageState = 'ready';
				} else imageState = 'unavailable';
			} catch {
				if (!controller.signal.aborted) imageState = 'unavailable';
			}
		})();
		return () => controller.abort();
	});

	function labelTime(ms: number) {
		return `${(ms / 1000).toFixed(3)} s`;
	}

	function cellLabel(bbox: z.infer<typeof pixelBox>, size: { width: number; height: number }) {
		const column = Math.min(STORYBOOK_REGION_GRID_SIZE - 1, Math.floor((bbox[0] + bbox[2]) * STORYBOOK_REGION_GRID_SIZE / (2 * size.width)));
		const row = Math.min(STORYBOOK_REGION_GRID_SIZE - 1, Math.floor((bbox[1] + bbox[3]) * STORYBOOK_REGION_GRID_SIZE / (2 * size.height)));
		return `${String.fromCharCode(65 + column)}${row + 1}`;
	}

	function showDetection(index: number, toggle = false) {
		region = null;
		maskSelection = null;
		selection = toggle && selectedObservation === index ? null : { key: selectionKey, index };
	}

	function showMask(id: string, detectionId: string, toggle = true) {
		const detection = imageObservations?.detections.find((entry) => entry.observationId === detectionId);
		if (!imageObservations || !detection) return;
		const wasSelected = toggle && selectedMask?.observationId === id;
		showDetection(detection.ordinal, wasSelected);
		failedMask = null;
		compiledMask = null;
		acceptMaskPolygons = false;
		maskCompileError = null;
		if (!wasSelected) maskSelection = { revision: imageObservations.observationRevision, id };
	}

	async function compileSelectedMask() {
		if (!maskUrl || !selectedMask || !imageObservations) return;
		const selected = selectedMask;
		const source = imageObservations;
		compilingMask = true;
		maskCompileError = null;
		compiledMask = null;
		acceptMaskPolygons = false;
		try {
			const reviewQuery = new URLSearchParams({ regionImage: source.observationRevision,
				analysisRevision: source.analysisRevision, sourceRevision: source.sourceRevision,
				observationId: selected.observationId, limit: '25' });
			const reviewResponse = await fetch(`/api/evidence/${encodeURIComponent(source.evidenceId)}/versions?${reviewQuery}`, { cache: 'no-store' });
			const reviewBody = maskReviewHistory.safeParse(await reviewResponse.json());
			const latestReview = reviewResponse.ok && reviewBody.success && reviewBody.data.evidenceId === source.evidenceId
				? reviewBody.data.versions.find(({ metadata }) => metadata.caseId === caseId && metadata.evidenceId === source.evidenceId &&
					metadata.parentSha256 === source.sourceRevision && metadata.annotation.storybookRegionReview.observationId === selected.observationId &&
					metadata.annotation.storybookRegionReview.analysisRevision === source.analysisRevision &&
					metadata.annotation.storybookRegionReview.observationRevision === source.observationRevision) : undefined;
			if (!latestReview || latestReview.metadata.annotation.storybookRegionReview.decision !== 'ACCEPTED') {
				throw new Error('Record an accepted review for this exact mask revision before polygonizing it.');
			}
			const response = await fetch(maskUrl, { cache: 'no-store', credentials: 'same-origin' });
			if (!response.ok) throw new Error('The authorized mask artifact could not be read.');
			const declaredLength = Number(response.headers.get('content-length') ?? 0);
			if (declaredLength > 32 * 1024 * 1024) throw new Error('Mask artifact exceeds the decode limit.');
			if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/')) throw new Error('Mask response is not an image artifact.');
			const bytes = await response.arrayBuffer();
			if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('Mask artifact exceeds the decode limit.');
			const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
			const actualDigest = [...digestBytes].map((value) => value.toString(16).padStart(2, '0')).join('');
			if (actualDigest !== selected.artifactSha256.replace(/^sha256:/, '')) throw new Error('Mask checksum does not match the reviewed observation.');
			const bitmap = await createImageBitmap(new Blob([bytes], { type: response.headers.get('content-type') ?? 'image/png' }));
			try {
				if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 4_000_000) throw new Error('Mask dimensions exceed the compiler limit.');
				const canvas = document.createElement('canvas');
				canvas.width = bitmap.width;
				canvas.height = bitmap.height;
				const context = canvas.getContext('2d', { willReadFrequently: true });
				if (!context) throw new Error('Mask pixels could not be decoded.');
				context.drawImage(bitmap, 0, 0);
				const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
				const plane = new Uint8Array(bitmap.width * bitmap.height);
				let hasTransparency = false;
				for (let pixel = 0; pixel < plane.length; pixel++) if (rgba[pixel * 4 + 3] !== 255) { hasTransparency = true; break; }
				for (let pixel = 0; pixel < plane.length; pixel++) {
					const offset = pixel * 4;
					plane[pixel] = hasTransparency ? rgba[offset + 3]! : Math.round((rgba[offset]! * 0.2126 + rgba[offset + 1]! * 0.7152 + rgba[offset + 2]! * 0.0722));
				}
				const result = compileMaskContoursV1({ values: plane, width: bitmap.width, height: bitmap.height });
				const sx = source.width / bitmap.width;
				const sy = source.height / bitmap.height;
				const polygons = result.polygons.map((polygon) => ({
					outer: polygon.outer.map(([x, y]) => [x * sx, y * sy] as [number, number]),
					holes: polygon.holes.map((ring) => ring.map(([x, y]) => [x * sx, y * sy] as [number, number])),
				}));
				if (!polygons.length) throw new Error('The mask contains no foreground region to polygonize.');
				if (selectedMask?.observationId !== selected.observationId || imageObservations?.observationRevision !== source.observationRevision) return;
				compiledMask = { observationId: selected.observationId, artifactSha256: `sha256:${actualDigest}`, reviewVersionId: latestReview.id,
					polygons, width: bitmap.width, height: bitmap.height };
			} finally { bitmap.close(); }
		} catch (cause) {
			maskCompileError = cause instanceof Error ? cause.message : 'Mask polygon compilation failed.';
		} finally { compilingMask = false; }
	}

	function selectReviewObservation(id: string) {
		if (!imageObservations) return;
		const observation = reviewable.find((item) => item.observationId === id);
		reviewSelection = observation ? { revision: imageObservations.observationRevision, id } : null;
		if (observation?.kind === 'detection') showDetection(observation.ordinal);
		else if (observation?.kind === 'segmentation_mask') {
			showSegmentation = true;
			showMask(observation.observationId, observation.detectionObservationId, false);
		} else if (observation?.kind === 'scene_context') showSceneContext = true;
		else if (observation?.kind === 'image_ocr_span') showOcr = true;
	}

	function chapterHref(id: string, index?: number) {
		const query = new URLSearchParams({ chapter: id });
		if (index !== undefined) query.set('frame', String(index));
		return `${basePath}?${query}#case-storybook`;
	}

	function seekSample(timestampMs: number) {
		if (!video?.frames.length) return;
		const nearest = video.frames.reduce((best, sample) => Math.abs(sample.timestampMs - timestampMs) < Math.abs(best.timestampMs - timestampMs) ? sample : best);
		void goto(chapterHref(video.evidenceId, nearest.frameIndex), { noScroll: true, keepFocus: true });
	}

	async function draftStoryboard() {
		if (!draftKey || drafting) return;
		const requestedKey = draftKey;
		const locator = video && frame ? { storybookFrame: { evidenceId: video.evidenceId,
			sourceRevision: video.sourceRevision, analysisRevision: video.analysisRevision,
			frameIndex: frame.frameIndex, artifactSha256: frame.artifactSha256 } }
			: imageObservations ? { storybookImage: { evidenceId: imageObservations.evidenceId,
				sourceRevision: imageObservations.sourceRevision, analysisRevision: imageObservations.analysisRevision,
				observationRevision: imageObservations.observationRevision } } : null;
		if (!locator) return;
		drafting = true;
		draft = null;
		draftError = null;
		try {
			const response = await fetch('/api/reconstruction/scene-intent', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					caseId,
					narrative: 'Draft a visual review storyboard.',
					...locator,
				}),
			});
			const body: unknown = await response.json();
			const result = draftResponse.safeParse(body);
			if (!response.ok || !result.success) {
				const problem = z.object({ diagnostics: z.object({ parseError: z.string().max(200) }) }).safeParse(body);
				throw new Error(problem.success ? problem.data.diagnostics.parseError : 'The draft could not be prepared.');
			}
			if (requestedKey !== draftKey) return;
			const { sceneIntent, prefillSha256, spatialReviews } = result.data;
			const chapterId = crypto.randomUUID();
			const accepted = new Set(spatialReviews?.map(({ observationId }) => observationId));
			const chapter = imageObservations && buildReviewedImageStorybookChapterV1(imageObservations, {
				chapterId, prefillSha256, title: sceneIntent.title,
				beats: sceneIntent.events.map((beat) => ({ what: beat.what, how: beat.how ?? '', observationIds: beat.citations.map(({ observation_id }) => observation_id) })),
			});
			const cells = chapter ? chapter.citations.flatMap((citation) =>
				'imageCell' in citation && accepted.has(citation.observationId)
					? [{ observationId: citation.observationId, placedCell: { ...citation.imageCell },
						label: `${citation.kind === 'detection' ? 'Detection' : 'Mask'} · ${citation.label}`, included: true }] : []) : [];
			draft = { sourceKey: requestedKey, prefillSha256, chapterId, spatialReviews, cells, includeRelativeDepth: false, ...sceneIntent };
		} catch (cause) {
			draftError = { sourceKey: requestedKey, message: cause instanceof Error ? cause.message : 'The draft could not be prepared.' };
		} finally {
			drafting = false;
		}
	}

	async function saveReviewedImageChapter() {
		if (savingChapter || !draft || draft.sourceKey !== draftKey || !imageObservations) return;
		const { chapterId, prefillSha256, title, events, cells, spatialReviews, includeRelativeDepth } = draft;
		const placements = cells.filter((cell) => cell.included);
		const scopedCase = caseId;
		const acceptedMask = acceptMaskPolygons && compiledMask
			? [{ maskObservationId: compiledMask.observationId, artifactSha256: compiledMask.artifactSha256,
				coordinateSpace: 'ORIGINAL_IMAGE_PIXELS' as const, reviewState: 'HUMAN_ACCEPTED_2D' as const, polygons: compiledMask.polygons }]
			: [];
		const effectiveReviews = compiledMask && acceptMaskPolygons
			? [...(spatialReviews ?? []).filter((review) => review.observationId !== compiledMask.observationId),
				{ observationId: compiledMask.observationId, versionId: compiledMask.reviewVersionId, decision: 'ACCEPTED' as const }]
			: spatialReviews;
		const reviewed = buildReviewedImageStorybookChapterV1({ ...imageObservations, reviews: effectiveReviews }, { chapterId, prefillSha256, title,
			beats: events.map((beat) => ({ what: beat.what, how: beat.how ?? '', observationIds: beat.citations.map((citation) => citation.observation_id) })) },
			placements, includeRelativeDepth && placements.length ? image?.relativeDepth : undefined, acceptedMask);
		chapterSave = null;
		if (!reviewed) {
			chapterSave = { chapterId, error: 'The draft citations could not be resolved. Reload the chapter and draft again.' };
			return;
		}
		savingChapter = true;
		try {
			const sceneId = await caseStorybookSceneIdV1(scopedCase);
			const current = await fetchSceneRevisionV1({ caseId: scopedCase, sceneId });
			const sameChapter = (value: unknown) => value != null && stableStringifySceneDocumentV1(value) === stableStringifySceneDocumentV1(reviewed);
			const existingChapters = [
				...(current?.manifest.imageStorybookChapter ? [current.manifest.imageStorybookChapter] : []),
				...(current?.manifest.imageStorybookChapters ?? [])
			];
			if (current && existingChapters.some((candidate) => sameChapter(candidate))) {
				chapterSave = { chapterId, href: savedImageChapterHrefV1({ caseId: scopedCase, sceneId, revision: current.revision, chapterId }) };
				return;
			}
			const expectedRevision = current?.revision ?? 0;
			const { imageStorybookChapter: _legacyChapter, ...baseManifest } = current?.manifest ?? {
				schema: 'parent-atlas.scene-document.v1' as const, caseId: scopedCase, sceneId, status: 'HYPOTHESIS' as const,
				coordinateFrame: 'LOCAL_UNCALIBRATED' as const, objects: [], animations: [], evidenceSources: [], assets: [],
				quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
			};
		const imageStorybookChapters = [...new Map(existingChapters.filter((candidate) => candidate.chapterId !== reviewed.chapterId)
			.map((candidate) => [candidate.chapterId, candidate] as const)).values(), reviewed];
		const evidenceBindings = new Map((current?.manifest.evidenceBindings ?? []).map((binding) => [binding.evidenceId, binding] as const));
		for (const imageChapter of imageStorybookChapters) evidenceBindings.set(imageChapter.evidenceId, { evidenceId: imageChapter.evidenceId, sourceRevision: imageChapter.sourceRevision });
			const manifest = createSceneDocumentV1({
				...baseManifest,
				revision: expectedRevision + 1, parentManifestSha256: current?.manifestSha256 ?? null, createdAt: new Date().toISOString(),
				evidenceBindings: [...evidenceBindings.values()],
				imageStorybookChapters,
			});
			const receipt = await saveSceneManifestRevisionV1({ caseId: scopedCase, sceneId, manifest, expectedRevision, commandId: chapterId });
			const readback = await fetchSceneRevisionV1({ caseId: scopedCase, sceneId, revision: receipt.revision });
			if (!readback || readback.manifestSha256 !== receipt.manifestSha256 ||
				!readback.manifest.imageStorybookChapters?.some((candidate) => sameChapter(candidate))) {
				throw new Error('The saved scene revision could not be verified. Check the chapter history before retrying.');
			}
			chapterSave = { chapterId, href: savedImageChapterHrefV1({ caseId: scopedCase, sceneId, revision: readback.revision, chapterId }) };
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'Could not save the reviewed chapter.';
			chapterSave = { chapterId, error: message.includes('SCENE_REVISION_IMAGE_CHAPTER_CHANGED') ?
				'The source analysis or review decisions changed. Draft again before saving.' : message };
		} finally {
			savingChapter = false;
		}
	}
</script>

<section id="case-storybook" aria-labelledby="storybook-heading">
	<header>
		<h2 id="storybook-heading">Case storybook</h2>
		<p>Browse exhibits and review observations in source order.</p>
	</header>
	{#if !chapter}
		<p>{unavailable ? 'Chapter list is temporarily unavailable.' : 'Upload an image or video to open a chapter.'}</p>
	{:else}
		<div class="storybook-layout">
			<nav aria-label="Storybook exhibits">
				{#each chapters as item (item.id)}
					<a href={chapterHref(item.id)} aria-current={chapter.id === item.id ? 'page' : undefined}>{item.title}</a>
				{/each}
			</nav>
			<article>
				<div class="chapter-heading">
					<h3>{chapter.title}</h3>
					<a href={`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(chapter.id)}`}>Open exhibit</a>
				</div>
				{#if chapter.kind === 'video'}
					{#if video}
						<p>{video.frames.length} sampled frames · {video.reviewedEventCount} reviewed events · Transcript: {video.transcriptionStatus.toLowerCase().replaceAll('_', ' ')}</p>
						{#if video.omittedFrameCount}<p>{video.omittedFrameCount} frame records could not be verified.</p>{/if}
						<label class="sample-picker">Sampled frame
							<select value={frame?.frameIndex} onchange={(event) => void goto(chapterHref(chapter!.id, Number((event.currentTarget as HTMLSelectElement).value)),{ noScroll: true, keepFocus: true })} disabled={!video.frames.length}>
								{#each video.frames as sample (sample.frameIndex)}<option value={sample.frameIndex}>{labelTime(sample.timestampMs)}</option>{/each}
							</select>
						</label>
						{#if frame}
							<p>Object detection: {frame.detectionStatus.toLowerCase().replaceAll('_', ' ')} · OCR: {frame.ocr?.status.toLowerCase() ?? 'not recorded'}</p>
							{#if frame.omittedDetectionCount}<p>{frame.omittedDetectionCount} detections could not be verified.</p>{/if}
							{#if frame.ocr?.text}<details><summary>Unreviewed OCR</summary><p>{frame.ocr.text}</p></details>{/if}
						{/if}
					{:else}
						<p>{unavailable ? 'The analysis could not be matched to the current source.' : 'No video analysis is available yet.'}</p>
					{/if}
				{:else if imageState !== 'ready'}
					<p role="status">{imageState === 'loading' ? 'Loading image analysis…' : imageState === 'not-analyzed' ? 'No image analysis is available yet.' : 'Current image analysis could not be verified.'}</p>
				{:else if image?.analysis}
					{#if imageUrl}<a href={imageUrl} target="_blank" rel="noreferrer">View original image</a>{/if}
					{#if imageObservations?.sceneContext || (!imageObservations?.sceneContextCoverage && image.analysis.visionSummary)}
						<details bind:open={showSceneContext}><summary>Unreviewed scene description</summary>
							<p>{imageObservations?.sceneContext?.description ?? image.analysis.visionSummary}</p>
						</details>
					{:else if imageObservations?.sceneContextCoverage === 'FAILED_OR_UNAVAILABLE'}
						<p>Scene description was unavailable for this run.</p>
					{:else if imageObservations?.sceneContextCoverage === 'NOT_RECORDED'}
						<p>Scene description coverage was not recorded.</p>
					{/if}
					{#if imageObservations?.ocrCoverage === 'COMPLETED' && imageObservations.ocrSpan}
						<details bind:open={showOcr}><summary>Unreviewed OCR text</summary>
							<p class="ocr-text">{imageObservations.ocrSpan.text}</p>
							{#if imageObservations.ocrSpan.truncated}<p>Only the beginning of the extracted text is shown.</p>{/if}
						</details>
					{:else if imageObservations?.ocrCoverage === 'EMPTY'}
						<p>OCR ran and returned no text.</p>
					{:else if imageObservations?.ocrCoverage === 'FAILED'}
						<p>OCR could not be completed for this run.</p>
					{:else}
						<p>OCR coverage was not recorded for this run.</p>
					{/if}
					<p>{image.relativeDepth ? 'Relative 2.5D estimate available to include when saving.' :
						image.analysis.depthMap?.artifactSha256 ? 'A depth estimate exists, but its provenance or pixel alignment could not be verified for this chapter.' : 'Relative depth unavailable'}</p>
					{#if imageObservations}
						{#if imageObservations.detectionCoverage === 'FAILED_OR_UNAVAILABLE'}<p>Object detection was unavailable for this run.</p>
						{:else if imageObservations.detectionCoverage === 'NOT_RECORDED'}<p>Object detection coverage was not recorded.</p>{/if}
						<details bind:open={showSegmentation}>
							<summary>Segmentation masks ({imageObservations.masks.length})</summary>
							{#if imageObservations.maskCoverage === 'FAILED_OR_UNAVAILABLE'}<p>Segmentation was unavailable for this run.</p>
							{:else if imageObservations.maskCoverage === 'NOT_RUN'}<p>Segmentation did not run for this image.</p>
							{:else if imageObservations.maskCoverage === 'NOT_RECORDED'}<p>Segmentation coverage was not recorded.</p>
							{:else if !imageObservations.masks.length}<p>No linked masks are available for this run.</p>{/if}
							{#if imageObservations.unresolvedMaskCount}<p>Unlinked mask records: {imageObservations.unresolvedMaskCount}.</p>{/if}
							{#if imageObservations.masks.length}
								<ul class="detections">
									{#each imageObservations.masks as mask (mask.observationId)}
											{@const detection = imageObservations.detections.find((entry) => entry.observationId === mask.detectionObservationId)}
											{#if detection}<li><button type="button" aria-pressed={selectedMask?.observationId === mask.observationId}
												onclick={() => showMask(mask.observationId, detection.observationId)}>{mask.label} · box {detection.ordinal + 1}</button></li>{/if}
									{/each}
								</ul>
							{/if}
							{#if maskUrl && selectedMask}
								{#if failedMask === maskUrl}<p role="status">This mask is unavailable for the current revision.</p>
								{:else}
									{@const url = maskUrl}
									{#key url}<img class="mask-preview" src={url} alt={`Segmentation mask for ${selectedMask.label}`}
										onload={() => { loadedMask = url; }} onerror={() => { failedMask = url; }} />{/key}
					{#if loadedMask === url && failedMask !== url}
						<button type="button" onclick={compileSelectedMask} disabled={compilingMask}>{compilingMask ? 'Compiling contours…' : 'Compile editable 2D polygons'}</button>
					{/if}
								{/if}
				{#if maskCompileError}<p role="status">{maskCompileError}</p>{/if}
				{#if compiledMask && compiledMask.observationId === selectedMask?.observationId}
					<p>Polygon preview · {compiledMask.polygons.length} component(s), {compiledMask.polygons.reduce((sum, polygon) => sum + polygon.holes.length, 0)} hole(s) · source-image pixels · 2D only.</p>
					<label><input type="checkbox" bind:checked={acceptMaskPolygons} /> I reviewed these contours as an editable 2D hypothesis.</label>
				{/if}
							{/if}
						</details>
					{:else}
						<p>Detection and segmentation coverage unavailable.</p>
					{/if}
					{#if image.analysis.stageErrors.length}<p>Stages with reported problems: {Array.from(new Set(image.analysis.stageErrors.map((failure) => failure.split(':')[0]))).join(', ')}.</p>{/if}
				{/if}

				{#if dimensions}
					{@const activeBox = selectedObservation === null ? null : boxes[selectedObservation]}
					<div class="observation-layout">
						<div>
							<div class="image-plane" style:aspect-ratio={`${dimensions.width} / ${dimensions.height}`}>
							{#if previewUrl}
								{#key previewUrl}<img src={previewUrl} alt={frame ? `Evidence frame at ${labelTime(frame.timestampMs)}` : 'Original evidence image'}
									onload={(event) => {
									const preview = event.currentTarget as HTMLImageElement;
										const url = preview.getAttribute('src');
										if (preview.naturalWidth === dimensions.width && preview.naturalHeight === dimensions.height) loadedPreview = url;
										else failedPreview = url;
									}}
										onerror={(event) => failedPreview = event.currentTarget.getAttribute('src')} />{/key}
								{/if}
								{#if selectedRegion && previewReady}
									<div class="selected-box" aria-hidden="true" style:left={`${selectedRegion.column * 100 / STORYBOOK_REGION_GRID_SIZE}%`}
										style:top={`${selectedRegion.row * 100 / STORYBOOK_REGION_GRID_SIZE}%`} style:width={`${100 / STORYBOOK_REGION_GRID_SIZE}%`}
										style:height={`${100 / STORYBOOK_REGION_GRID_SIZE}%`}></div>
							{:else if activeBox && previewReady}
									<div class="selected-box" aria-hidden="true" style:left={`${activeBox.bbox[0] * 100 / dimensions.width}%`} style:top={`${activeBox.bbox[1] * 100 / dimensions.height}%`}
										style:width={`${(activeBox.bbox[2] - activeBox.bbox[0]) * 100 / dimensions.width}%`} style:height={`${(activeBox.bbox[3] - activeBox.bbox[1]) * 100 / dimensions.height}%`}></div>
								{/if}
								{#if compiledMask && compiledMask.observationId === selectedMask?.observationId && imageObservations}
									<svg class="polygon-overlay" viewBox={`0 0 ${imageObservations.width} ${imageObservations.height}`} preserveAspectRatio="none" aria-label="Compiled mask polygon preview">
										{#each compiledMask.polygons as polygon, index (index)}
											<path d={`${polygon.outer.map(([x, y], point) => `${point ? 'L' : 'M'}${x} ${y}`).join(' ')} Z ${polygon.holes.map((ring) => `${ring.map(([x, y], point) => `${point ? 'L' : 'M'}${x} ${y}`).join(' ')} Z`).join(' ')}`} fill="#ffd34e66" fill-rule="evenodd" stroke="#ffc928" stroke-width="2" vector-effect="non-scaling-stroke" />
										{/each}
									</svg>
								{/if}
							</div>
						<p>{previewUrl && failedPreview === previewUrl ? 'This source preview is unavailable. Reload the chapter to check for a newer run.' : 'Source image coordinates · unsampled or unclassified areas are unknown.'}</p>
							{#if activeBox}<p>Image cell {cellLabel(activeBox.bbox, dimensions)} · center of selected box</p>{/if}
						</div>
						<div>
							<h4>Unreviewed detections</h4>
							{#if boxes.length}
								<ol class="detections">
									{#each boxes as box, index (index)}
									<li><button type="button" aria-pressed={selectedObservation === index} onclick={() => showDetection(index, true)}>{box.label} · {Math.round(box.confidence * 100)}%</button></li>
									{/each}
								</ol>
							{:else}<p>No detections recorded for this view.</p>{/if}
						</div>
					</div>
				{/if}
				{#if chapter.kind === 'video'}
					{#if video && frame && frameUrl}
						{#key frameUrl}
							{@const reviewFrame = { analysisRevision: video.analysisRevision, frameIndex: frame.frameIndex, artifactSha256: frame.artifactSha256,
								timestampMs: frame.timestampMs, width: frame.width, height: frame.height }}
							<StorybookRegionReview {caseId} evidenceId={video.evidenceId} sourceRevision={video.sourceRevision}
								target={reviewFrame} {previewReady} onCellChange={(cell) => { selection = null; region = { key: frameUrl, ...cell }; }} />
						{/key}
					{/if}
					<button type="button" aria-expanded={showReview} onclick={() => showReview = !showReview}>{showReview ? 'Hide event review' : 'Review and save events'}</button>
					{#if showReview}<EvidenceVideoEventTimeline evidenceId={chapter.id} onSeek={seekSample} />{/if}
			{:else if imageObservations && imageUrl}
				{#key imageObservations.observationRevision}
					{@const { evidenceId, sourceRevision, analysisRevision, observationRevision, width, height } = imageObservations}
					{#if reviewable.length}
						<label>Observation to review
						<select value={reviewObservation?.observationId ?? ''} onchange={(event) => selectReviewObservation((event.currentTarget as HTMLSelectElement).value)}>
								<option value="">Choose an observation</option>
								{#each reviewable as item (item.observationId)}
									<option value={item.observationId}>{item.kind === 'detection' ? `Detection ${item.ordinal + 1} · ${item.label}`
										: item.kind === 'segmentation_mask' ? `Mask · ${item.label} · detection ${imageObservations.detections.findIndex((entry) => entry.observationId === item.detectionObservationId) + 1}`
										: item.kind === 'scene_context' ? 'Scene description' : 'OCR excerpt'}</option>
								{/each}
							</select>
						</label>
					{/if}
					{#if reviewObservation}
						{#key reviewObservation.observationId}
							<StorybookRegionReview {caseId} {evidenceId} {sourceRevision}
								target={{ analysisRevision, observationRevision, width, height, observationId: reviewObservation.observationId }}
								onReviewSaved={() => { reviewEdits += 1; }}
								{previewReady} acceptEnabled={reviewObservation.kind !== 'segmentation_mask' ||
									(Boolean(maskUrl) && loadedMask === maskUrl && failedMask !== maskUrl && selectedMask?.observationId === reviewObservation.observationId)} />
						{/key}
					{/if}
					<StorybookRegionReview {caseId} {evidenceId} {sourceRevision}
						target={{ analysisRevision, observationRevision, width, height }} {previewReady}
						onCellChange={(cell) => {
							selection = null;
							maskSelection = null;
							region = { key: observationRevision, ...cell };
						}} />
				{/key}
				{/if}
				{#if canDraft}
					<button type="button" onclick={draftStoryboard} disabled={drafting}>{drafting ? 'Drafting…' : chapter.kind === 'image' ? 'Draft storyboard from this image' : 'Draft storyboard from this frame'}</button>
				{/if}
				{#if draftError && draftError.sourceKey === draftKey}<p role="status">{draftError.message}</p>{/if}
				{#if draft && draft.sourceKey === draftKey}
						<h4>{draft.title}</h4><p>Unreviewed storyboard proposal</p>
						{#if chapter.kind === 'image'}<p>Storyboard times describe the draft sequence.</p>{/if}
						<ol>
							{#each draft.events as beat}
								<li>
									{beat.time_s} s · {beat.what}
									{#if chapter.kind === 'image' && beat.how}<p>{beat.how}</p>{/if}
									{#each beat.citations as citation}
										{@const index = frame?.detections.findIndex((detection) => detection.observationId === citation.observation_id) ??
											imageObservations?.detections.find((detection) => detection.observationId === citation.observation_id)?.ordinal ?? -1}
										{@const mask = imageObservations?.masks.find((item) => item.observationId === citation.observation_id)}
										{#if index >= 0}
											<button type="button" onclick={() => showDetection(index)}>View source box {index + 1}</button>
										{:else if mask}
											<button type="button" onclick={() => { showSegmentation = true; showMask(mask.observationId, mask.detectionObservationId, false); }}>View {mask.label} mask</button>
										{:else if imageObservations?.sceneContext?.observationId === citation.observation_id}
											<button type="button" onclick={() => { showSceneContext = true; }}>View scene description</button>
									{:else if imageObservations?.ocrSpan?.observationId === citation.observation_id}
										<button type="button" onclick={() => { showOcr = true; }}>View cited OCR text</button>
										{/if}
									{/each}
								</li>
							{/each}
						</ol>
						{#if chapter.kind === 'image'}
							{#if chapterSave?.chapterId === draft.chapterId && chapterSave.href}
								<p role="status"><a href={chapterSave.href}>Open saved 2D chapter</a></p>
							{:else}
								{#if draft.cells.length}
									<fieldset class="scene-cell-controls" disabled={savingChapter}>
										<legend>Image-space scene cells</legend>
										<p>Adjust marker placement on the image grid. The cited source cell stays fixed.</p>
										{#each draft.cells as cell (cell.observationId)}
											<div>
												<label><input type="checkbox" bind:checked={cell.included} /> {cell.label}</label>
												<label>Column <select bind:value={cell.placedCell.column} disabled={!cell.included}>
													{#each gridPositions as index (index)}<option value={index}>{String.fromCharCode(65 + index)}</option>{/each}
												</select></label>
												<label>Row <select bind:value={cell.placedCell.row} disabled={!cell.included}>
													{#each gridPositions as index (index)}<option value={index}>{index + 1}</option>{/each}
												</select></label>
											</div>
										{/each}
										{#if image?.relativeDepth}
											<label><input type="checkbox" bind:checked={draft.includeRelativeDepth}
												disabled={!draft.cells.some((cell) => cell.included)} /> Include relative 2.5D preview</label>
										{/if}
									</fieldset>
								{:else}
									<p>There are no accepted spatial observations cited in this draft.</p>
								{/if}
								<button type="button" onclick={saveReviewedImageChapter} disabled={savingChapter}>{savingChapter ? 'Saving…' : 'Save reviewed 2D chapter'}</button>
								{#if chapterSave?.chapterId === draft.chapterId && chapterSave.error}<p role="status">{chapterSave.error}</p>{/if}
							{/if}
						{/if}
				{/if}
			</article>
		</div>
	{/if}
</section>

<style>
	section { padding: 1rem; border: 1px solid var(--dossier-hairline, #dacdb9); border-radius: .75rem; background: var(--dossier-bg-card, #faf6ee); color: var(--dossier-text-main, #282019); }
	header p, article p { margin: .4rem 0 .7rem; }
	h2, h3, h4 { margin: 0; }
	.storybook-layout, .observation-layout { display: grid; grid-template-columns: minmax(9rem, 1fr) minmax(0, 3fr); gap: 1rem; }
	.observation-layout { grid-template-columns: minmax(0, 2fr) minmax(9rem, 1fr); margin-top: .8rem; }
	nav { display: grid; align-content: start; gap: .35rem; max-height: 30rem; overflow: auto; }
	nav a, button, select { padding: .4rem .6rem; border: 1px solid var(--dossier-hairline, #dacdb9); border-radius: .35rem; background: transparent; color: inherit; font: inherit; }
	nav a { overflow-wrap: anywhere; text-decoration: none; }
	nav a[aria-current], button[aria-pressed='true'] { border-color: #997022; background: #f6e6bb; color: #302313; }
	.chapter-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .5rem; }
	.chapter-heading a { color: inherit; }
	.image-plane { position: relative; max-width: 100%; overflow: hidden; border-radius: .3rem; background-color: #ede4d1; background-image: linear-gradient(to right, #baa98b 1px, transparent 1px), linear-gradient(to bottom, #baa98b 1px, transparent 1px); background-size: 12.5% 12.5%; }
	.polygon-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	.image-plane img { display: block; width: 100%; height: 100%; object-fit: fill; }
	.mask-preview { display: block; max-width: 100%; max-height: 18rem; object-fit: contain; margin: .5rem 0; }
	.ocr-text { white-space: pre-wrap; overflow-wrap: anywhere; }
	.scene-cell-controls { margin: 1rem 0; border: 1px solid var(--dossier-hairline, #dacdb9); }
	.scene-cell-controls > div { display: flex; flex-wrap: wrap; gap: .75rem; margin-block: .35rem; align-items: center; }
	.selected-box { position: absolute; box-sizing: border-box; border: 2px solid #ffdb67; outline: 1px solid #352313; background: #ffdb6722; pointer-events: none; }
	.detections { max-height: 17rem; overflow: auto; margin: .4rem 0; padding-left: 1.5rem; }
	.detections li { margin-bottom: .3rem; }
	button { cursor: pointer; }
	@media (max-width: 42rem) { .storybook-layout, .observation-layout { grid-template-columns: 1fr; } nav { max-height: 10rem; } }
</style>
