<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolveSceneCameraCueV1, sceneCameraPresetLabelsV1, type SceneCameraPresetV1 } from '$lib/reconstruction/scene-camera-cue-v1.js';
	import { activeSceneLaneCaptionsV1, sceneCaptionRequestWindowV1, sceneCaptionResponseV1Schema, sceneCaptionScopeKeyV1,
		SCENE_CAPTION_EVENT_LIMIT_V1, type SceneCaptionResponseV1, type SceneCaptionScopeV1 } from '$lib/reconstruction/scene-captions-v1.js';
	import type { SceneGenerationPlanV1 } from '$lib/reconstruction/scene-generation-plan-v1.js';
	import type { SceneRuntimeRecipeV1 } from '$lib/reconstruction/scene-runtime-recipe-v1.js';
	import { RETRO_DEMONSTRATIVE_LABEL_V1 } from '$lib/splat/retro-framebuffer-config-v1.js';
	import { sceneDocumentV1Schema, createSceneQualityReceiptV1, type SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
	import type { ScenePreviewAnnotationV1 } from '$lib/reconstruction/scene-preview-draft-v1.js';
	import SceneSourceVideo from './SceneSourceVideo.svelte';
	import TimelineEngine from './TimelineEngine.svelte';
	import type { TimelineTrackItemV1 } from '$lib/reconstruction/dual-clock-timeline-v1.js';
	import { countSceneGeometryBufferBytesV1, createScenePreviewSamplesV1 } from '$lib/reconstruction/scene-preview-metrics-v1.js';
	import { SceneControllerV1 } from '$lib/scene/scene-controller-v1.js';
	import { collectSceneReviewedPolygonsV1, createSceneReviewedPolygonEditDraftsV1, editSceneReviewedPolygonVertexV1, serializeScenePolygonEditsV1, stepSceneReviewedPolygonEditHistoryV1, type SceneContourNoteV1, type SceneReviewedPolygonEditDraftV1 } from '$lib/reconstruction/scene-reviewed-polygons-v1.js';
	import { compileReviewedPolygonMeshV1 } from '$lib/splat/reviewed-polygon-mesh-v1.js';
	import { buildSceneObjectInspectorV1 } from '$lib/reconstruction/scene-object-inspector-v1.js';
	import { SceneDeformationBrushV1, type DeformationRevisionReceiptV1 } from '$lib/scene/scene-deformation-brush-v1.js';
	import { planGoapWhatIfV1, type GoapSimulationPlanV1 } from '$lib/splat/scene-goap-planner-v1.js';
	import {
		CREATOR_SWATCHES,
		DEFAULT_MATERIAL_EDITOR,
		ApplyMaterialPreviewCommand,
		nextMaterial,
		parseCreatorShortcut,
		isEditorShortcutTarget,
		type CreatorCommand,
		type MaterialEditorState,
		type ShaderFamily,
		type TextureTier,
		type CharacterCatalog,
		type MotionDescriptor
	} from '$lib/characters/character-runtime-v2.js';

	let { plan, recipe, evidenceItems, revision = null, annotations = $bindable([]), saving = $bindable(false), preparing = false, sourceNavigationEnabled = true,
		persistenceEnabled = false, onSaved, onObjectSelected, onSaveRequested, onSaveFailed, onPreviewReady, onPreviewFailed, onPolygonEditsChanged }: {
		plan: SceneGenerationPlanV1;
		recipe: SceneRuntimeRecipeV1;
		evidenceItems: readonly { id: string; title: string; mimeType?: string | null }[];
		revision?: { manifest: SceneDocumentV1; manifestSha256: string } | null;
		annotations?: ScenePreviewAnnotationV1[];
		saving?: boolean;
		preparing?: boolean;
		persistenceEnabled?: boolean;
		sourceNavigationEnabled?: boolean;
		onSaved?: (receipt: { manifest: SceneDocumentV1; manifestSha256: string }) => void;
		onObjectSelected?: (objectId: string) => void;
		onSaveRequested?: () => void;
		onSaveFailed?: (message: string) => void;
		onPreviewReady?: () => void;
		onPreviewFailed?: (message: string) => void;
		onPolygonEditsChanged?: (dirty: boolean) => void;
	} = $props();
	type HouseObject = { id: string; label: string; room: string; sourceEvidenceId?: string; sourceRevision?: string; reviewRevision?: string };
	let houseObject = $state<HouseObject | null>(null);
	let houseObjects = $state.raw<HouseObject[]>([]);
	let polygonEditDrafts = $state.raw<SceneReviewedPolygonEditDraftV1[]>([]);
	let polygonDraftsReady = $state(false);
	let saved = $state.raw(untrack(() => revision));
	let contourNotes = $state.raw<SceneContourNoteV1[]>(untrack(() => revision?.manifest.proceduralPreviewDraft?.contourNotes ?? []));
	let contourNoteText = $state('');
	let polygonEditError = $state('');
	let polygonMeshes = new Map<string, import('three').Mesh<import('three').ShapeGeometry, import('three').Material>>();
	const selectedPolygonDraft = $derived(polygonEditDrafts.find((draft) => draft.objectId === houseObject?.id) ?? null);
	const selectedContourNotes = $derived(contourNotes.filter((note) => note.objectId === selectedPolygonDraft?.objectId));
	const selectedObjectInspector = $derived(houseObject ? buildSceneObjectInspectorV1(plan, houseObject) : null);
	const selectedPolygonImageUrl = $derived(selectedPolygonDraft ? `/api/evidence/${encodeURIComponent(selectedPolygonDraft.recipe.evidenceId)}/download?${new URLSearchParams({
		caseId: plan.caseId, inline: '1', sourceRevision: selectedPolygonDraft.recipe.sourceRevision
	})}` : null);
	const polygonEdits = $derived(serializeScenePolygonEditsV1(polygonEditDrafts));
	const hasUnsavedPolygonEdits = $derived(polygonDraftsReady && JSON.stringify(polygonEdits) !== JSON.stringify(saved?.manifest.proceduralPreviewDraft?.polygonEdits ?? []));
	const hasUnsavedContourNotes = $derived(JSON.stringify(contourNotes) !== JSON.stringify(saved?.manifest.proceduralPreviewDraft?.contourNotes ?? []));
	let polygonSourceImageError = $state(false);
	let activePolygonDrag: { ring: 'outer' | 'hole'; vertexIndex: number; holeIndex?: number } | null = null;
	$effect(() => { onPolygonEditsChanged?.(hasUnsavedPolygonEdits || hasUnsavedContourNotes); });
	let saveError = $state('');
	let reportStatus = $state('');
	let deformationReceipt = $state.raw<DeformationRevisionReceiptV1 | null>(null);
	let deformationError = $state('');
	let goapSimulationPlan = $state.raw<GoapSimulationPlanV1 | null>(null);

	async function runSoftDeformationPreview() {
		deformationError = '';
		try {
			const THREE = await import('three');
			const brush = new SceneDeformationBrushV1();
			const targetMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
			targetMesh.userData.mutable = true;
			targetMesh.userData.evidenceImmutable = false;
			brush.applyStrokeStep(targetMesh, { center: [0, 0, 0], radius: 1.5, delta: [0, 0.12, 0] });
			const committed = brush.commitStroke();
			deformationReceipt = committed.receipt;
		} catch (err) {
			deformationError = err instanceof Error ? err.message : String(err);
		}
	}

	function runGoapWhatIfPreview() {
		goapSimulationPlan = planGoapWhatIfV1({
			schema: 'atlas.goap-simulation-input.v1',
			sceneRevisionId: revision?.manifestSha256 ?? `preview:${plan.sceneId}`,
			stateHash: '0000000000000000000000000000000000000000000000000000000000000000',
			sourceId: activeClock || 'scene-time',
			startMs: Math.max(0, Math.round(sourceTimeMs)),
			baseline: [],
			initialFacts: { doorOpen: false, lineOfSightClear: false },
			goalFacts: { doorOpen: true, lineOfSightClear: true },
			operators: [
				{
					id: 'open_door',
					label: 'Open entry door',
					cost: 1,
					durationMs: 400,
					preconditions: { doorOpen: false },
					effects: { doorOpen: true },
					sceneEffects: [],
				},
				{
					id: 'verify_sightline',
					label: 'Verify sightline',
					cost: 1,
					durationMs: 300,
					preconditions: { doorOpen: true },
					effects: { lineOfSightClear: true },
					sceneEffects: [],
				},
			],
			budget: { maxExpansions: 32, maxDepth: 4 },
		});
	}
	let reportController: AbortController | null = null;
	$effect(() => {
		const scope = `${plan.caseId}:${plan.sceneId}`;
		return () => {
			void scope;
			reportController?.abort();
			reportController = null;
		};
	});
	let pendingSave: { key: string; payload: string } | null = null;
	const reopenHref = $derived(saved ? `/cases/${plan.caseId}/crime-scene?${new URLSearchParams({
		previewScene: plan.sceneId, previewRevision: String(saved.manifest.revision)
	})}#scene-builder-title` : '');
	let annotationText = $state('');
	const selectedAnnotations = $derived(annotations.filter((note) => note.eventId === selectedEventId));
	let canvas: HTMLCanvasElement;
	let status = $state('Starting browser renderer…');
	let activeClock = $state('');
	let selectedEventId = $state('');
	let sourceTimeMs = $state(0);
	let playing = $state(false);
	let playbackMode = $state<'event' | 'lane'>('event');
	let error = $state<string | null>(null);
	let playbackStartedAt = 0;
	const lane = $derived(recipe.eventLanes.find((item) => item.clockId === activeClock) ?? null);
	const videoUrl = $derived.by(() => {
		const id = lane?.evidenceId;
		const source = plan.sources.find((item) => item.evidenceId === id);
		if (!source || !evidenceItems.some((item) => item.id === id && item.mimeType?.startsWith('video/'))) return null;
		const query = new URLSearchParams({ caseId: plan.caseId, inline: '1', sourceRevision: source.sourceRevision });
		return `/api/evidence/${encodeURIComponent(source.evidenceId)}/download?${query}`;
	});
	let followingVideo = $state(false);
	let videoPending = $state(false);
	let videoPlaying = $state(false);
	let presentedTime = $state(false);
	let videoSeek = $state.raw({ timeMs: 0 });
	let seekStartedAt: number | null = null;
	let memoryDialog: HTMLDialogElement;
	let applyCameraPreset = $state<(preset: SceneCameraPresetV1) => void>(() => {});
	let followsCameraCues = $state(false);
	const hasCameraCues = $derived(recipe.eventLanes.some((lane) => lane.events.some((event) => event.cameraPreset)));
	// Timeline items come from the same active event lane the canvas already plays; no second event source.
	const timelineItems = $derived<TimelineTrackItemV1[]>((lane?.events ?? []).map((event) => ({
		id: event.eventId, track: 'EventTrack' as const, label: event.label,
		startSeconds: event.startMs / 1000, endSeconds: event.endMs / 1000
	})));
	const timelineDurationSeconds = $derived(Math.max(1, ...recipe.eventLanes.flatMap((item) => item.events.map((event) => event.endMs / 1000))));
	const cameraCue = $derived(followsCameraCues ? resolveSceneCameraCueV1(lane?.events ?? [], Math.floor(sourceTimeMs)) : null);
	function chooseManualCamera(preset: SceneCameraPresetV1) {
		followsCameraCues = false;
		applyCameraPreset(preset);
	}
	let inspecting = $state(false);
	const frameSamples = createScenePreviewSamplesV1();
	const seekSamples = createScenePreviewSamplesV1(32);
	type RenderMetrics = {
		calls: number; triangles: number; geometries: number; textures: number; geometryBytes: number;
		residency: { loadedCells: number; queuedCells: number; residentLimit: number; mode: string };
	};
	let readRenderMetrics: (() => RenderMetrics | null) | undefined;
	let metrics = $state.raw<{ render: RenderMetrics | null; frameP95: number | null; seekP95: number | null } | null>(null);
	let planBytes = $state<number | null>(null);
	let previewFocus = $derived(followingVideo ? (videoPending ? 'Video seek' : 'Video review') :
		houseObject ? 'Object selection' : playing ? 'Scene playback' : 'Scene navigation');

	function formatMetric(value: number | null | undefined, unit: string) {
		return value == null ? 'Unavailable' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`.trim();
	}

	function sampleMetrics() {
		metrics = { render: readRenderMetrics?.() ?? null, frameP95: frameSamples.p95(), seekP95: seekSamples.p95() };
	}

	$effect(() => {
		if (!inspecting) return;
		sampleMetrics();
		const interval = window.setInterval(sampleMetrics, 750);
		return () => window.clearInterval(interval);
	});
	const selectedEvent = $derived(lane?.events.find((item) => item.eventId === selectedEventId) ?? null);
	let showCaptions = $state(false);
	let captionResults = $state.raw<SceneCaptionResponseV1[]>([]);
	let captionStatus = $state('');
	const laneCaptionScopes = $derived.by((): SceneCaptionScopeV1[] => {
		if (!sourceNavigationEnabled || !lane?.evidenceId) return [];
		const source = plan.sources.find(({ evidenceId }) => evidenceId === lane?.evidenceId);
		if (!source || lane.clockId !== `evidence:${source.evidenceId}`) return [];
		const scopes = plan.events.flatMap((event) => {
			const binding = event.sourceEvent;
			if (event.reviewStatus !== 'accepted' || !binding || binding.sourceEvidenceId !== source.evidenceId ||
				event.clock.clockId !== lane?.clockId) return [];
			return [{ caseId: plan.caseId, evidenceId: source.evidenceId, eventId: binding.sourceEventId, sourceRevision: source.sourceRevision,
				analysisRevision: binding.analysisRevision, startMs: binding.startMs, endMs: binding.endMs }];
		});
		return [...new Map(scopes.map((scope) => [sceneCaptionScopeKeyV1(scope), scope])).values()];
	});
	const captionRequestWindow = $derived(showCaptions ? sceneCaptionRequestWindowV1(laneCaptionScopes, Math.floor(sourceTimeMs)) : []);
	const captionRequestKey = $derived(JSON.stringify(captionRequestWindow));
	const activeCaptions = $derived.by(() => {
		const keys = new Set(captionRequestWindow.map(sceneCaptionScopeKeyV1));
		return activeSceneLaneCaptionsV1(captionResults.filter(({ scope }) => keys.has(sceneCaptionScopeKeyV1(scope))), Math.floor(sourceTimeMs));
	});
	const activeCaptionEventCount = $derived(laneCaptionScopes.filter(({ startMs, endMs }) => sourceTimeMs >= startMs && sourceTimeMs < endMs).length);

	$effect(() => {
		// Observe the stable window key instead of reissuing requests on every playhead update.
		const key = captionRequestKey;
		const scopes = untrack(() => captionRequestWindow);
		const scopeKeys = new Set(scopes.map(sceneCaptionScopeKeyV1));
		const retained = untrack(() => captionResults.filter(({ scope }) => scopeKeys.has(sceneCaptionScopeKeyV1(scope))));
		captionResults = retained;
		captionStatus = '';
		if (!scopes.length) return;
		const controller = new AbortController();
		const loaded = new Set(retained.map(({ scope }) => sceneCaptionScopeKeyV1(scope)));
		const pending = scopes.filter((scope) => !loaded.has(sceneCaptionScopeKeyV1(scope)));
		if (pending.length) captionStatus = 'Loading source transcript excerpts…';
		const timer = setTimeout(() => {
			void Promise.allSettled(pending.map(async (scope) => {
				const query = new URLSearchParams({ caseId: scope.caseId, captionEvent: scope.eventId, sourceRevision: scope.sourceRevision,
					analysisRevision: scope.analysisRevision, startMs: String(scope.startMs), endMs: String(scope.endMs) });
				const response = await fetch(`/api/evidence/${encodeURIComponent(scope.evidenceId)}/video-events?${query}`, {
					signal: controller.signal, cache: 'no-store'
				});
				if (!response.ok) throw new Error('Caption source unavailable or changed.');
				const result = sceneCaptionResponseV1Schema.parse(await response.json());
				if (sceneCaptionScopeKeyV1(scope) !== sceneCaptionScopeKeyV1(result.scope)) throw new Error('Caption scope changed.');
				return result;
			})).then((outcomes) => {
				if (controller.signal.aborted || captionRequestKey !== key) return;
				captionResults = [...retained, ...outcomes.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])];
				const unavailable = captionResults.reduce((count, result) => count + result.unavailableCount, 0);
				captionStatus = outcomes.some((outcome) => outcome.status === 'rejected') ? 'Some caption sources are unavailable or changed.'
					: unavailable ? `${unavailable} referenced transcript excerpt(s) unavailable.`
						: captionResults.every((result) => result.captions.length === 0) ? 'No transcript excerpts were cited in this window.' : '';
			});
		}, pending.length ? 120 : 0);
		return () => { clearTimeout(timer); controller.abort(); };
	});
	const lanePlaybackRange = $derived.by(() => {
		const events = lane?.events;
		if (!events?.length) return null;
		return { startMs: Math.min(...events.map((event) => event.startMs)), endMs: Math.max(...events.map((event) => event.endMs)) };
	});
	const activeEventIds = $derived.by(() => {
		const time = Math.floor(sourceTimeMs);
		return new Set((lane?.events ?? []).filter((event) => time >= event.startMs && time < event.endMs).map((event) => event.eventId));
	});
	let seekRange = $derived.by(() => {
		const events = lane?.events ?? [];
		return { min: Math.min(0, ...events.map((event) => event.startMs)), max: Math.max(1, ...events.map((event) => event.endMs)) };
	});

	function seekTo(timeMs: number) {
		playing = false;
		if (followingVideo) {
			videoPending = true;
			seekStartedAt = performance.now();
			videoSeek = { timeMs };
		} else sourceTimeMs = timeMs;
	}

	function toggleVideo() {
		playing = false;
		videoPlaying = false;
		videoPending = !followingVideo;
		presentedTime = false;
		seekStartedAt = null;
		videoSeek = { timeMs: sourceTimeMs };
		followingVideo = !followingVideo;
	}

	function followVideoTime(time: number, presented: boolean) {
		if (!followingVideo) return;
		sourceTimeMs = time;
		presentedTime = presented;
		if (seekStartedAt !== null) {
			if (presented) seekSamples.add(performance.now() - seekStartedAt);
			seekStartedAt = null;
		}
	}

	function selectEvent(eventId: string) {
		const event = lane?.events.find((item) => item.eventId === eventId);
		if (!event) return;
		selectedEventId = eventId;
		seekTo(event.startMs);
		annotationText = '';
	}

	function selectHouseObject(object: HouseObject | null) {
		if (object?.id !== houseObject?.id) contourNoteText = '';
		houseObject = object;
		if (object && activeRuntime) {
			const mesh = activeRuntime.findObjectMesh(object.id);
			if (mesh) {
				materialState = activeRuntime.materialPreview.getState(mesh);
			} else {
				materialState = { ...DEFAULT_MATERIAL_EDITOR };
			}
		}
		if (object) onObjectSelected?.(object.id);
	}

	const sceneController = new SceneControllerV1();
	let activeRuntime: ReturnType<typeof import('$lib/reconstruction/scene-runtime-three-v1.js').createSceneRuntimeThreeV1> | null = null;
	let demoCatalog: CharacterCatalog | null = null;
	let demoMotionClips: MotionDescriptor[] = [];
	let actorLodTier = $state<TextureTier>('retro');
	let actorCharacterStatus = $state('Procedural avatar fallback active');
	let materialState = $state<MaterialEditorState>({ ...DEFAULT_MATERIAL_EDITOR });
	let materialStatus = $state('');
	let canUndoMaterial = $state(false);
	let canRedoMaterial = $state(false);

	function syncUndoRedoFlags() {
		canUndoMaterial = sceneController.history.canUndo();
		canRedoMaterial = sceneController.history.canRedo();
	}

	async function loadSyntheticCharacters(tier: TextureTier = actorLodTier) {
		if (!activeRuntime || recipe.actors.length === 0) return;
		actorLodTier = tier;
		try {
			if (!demoCatalog) {
				const [catRes, motRes] = await Promise.all([
					fetch('/parent-atlas/catalog.json', { cache: 'no-store' }),
					fetch('/parent-atlas/motion-catalog.json', { cache: 'no-store' })
				]);
				if (!catRes.ok) throw new Error(`Catalog HTTP ${catRes.status}`);
				demoCatalog = (await catRes.json()) as CharacterCatalog;
				if (motRes.ok) {
					const motJson = (await motRes.json()) as {
						clips?: Array<{
							name: string;
							rig_signature: string;
							sha256: string;
							object_key: string;
							encoded_bytes: number;
							duration_seconds: number;
							taxonomy_id: string;
							scope_kind: string;
							source_format: 'glb-node-animation' | 'glb-skin-animation';
						}>;
					};
					demoMotionClips = (motJson.clips ?? []).map((c) => ({
						clipId: c.name,
						name: c.name,
						rigSignature: c.rig_signature,
						sha256: c.sha256,
						objectKey: c.object_key,
						encodedBytes: c.encoded_bytes,
						durationSeconds: c.duration_seconds,
						taxonomyId: c.taxonomy_id,
						scope: { scopeKind: 'public-procedural' as const },
						format: c.source_format
					}));
				}
			}
			for (const actor of recipe.actors) {
				await activeRuntime.loadCharacterActor(
					actor.actorId,
					demoCatalog,
					tier,
					{ scopeKind: 'public-procedural' },
					demoMotionClips
				);
			}
			actorCharacterStatus = `Loaded ${tier} GLB (${demoCatalog.lods[tier].triangles} tris) · Walk/Idle synced`;
		} catch (err) {
			actorCharacterStatus =
				err instanceof Error
					? `Procedural fallback (${err.message})`
					: 'Procedural fallback active';
		}
	}

	function applySelectedMaterial(next: MaterialEditorState) {
		if (!houseObject || !activeRuntime) return;
		const mesh = activeRuntime.findObjectMesh(houseObject.id);
		if (!mesh) {
			materialStatus = 'No editable mesh on selected object';
			return;
		}
		const prev = activeRuntime.materialPreview.getState(mesh);
		try {
			const cmd = new ApplyMaterialPreviewCommand(
				houseObject.id,
				mesh,
				activeRuntime.materialPreview,
				prev,
				next,
				{ isAtlasPage: false },
				(updated) => {
					materialState = updated;
				}
			);
			sceneController.history.execute(cmd, sceneController.getContext());
			syncUndoRedoFlags();
			materialStatus = `Material preview: ${next.shader}, ${next.tiling}× UV, ${next.uvMode}`;
		} catch (err) {
			materialStatus = err instanceof Error ? err.message : 'Material preview failed';
		}
	}

	function applyMaterialCommand(cmd: CreatorCommand) {
		applySelectedMaterial(nextMaterial(materialState, cmd));
	}

	function undoSelectedMaterial() {
		if (!sceneController.undo()) return;
		syncUndoRedoFlags();
		materialStatus = `Undid material edit (${materialState.shader}, ${materialState.tiling}× UV, ${materialState.uvMode})`;
	}

	function redoSelectedMaterial() {
		if (!sceneController.redo()) return;
		syncUndoRedoFlags();
		materialStatus = `Redid material edit (${materialState.shader}, ${materialState.tiling}× UV, ${materialState.uvMode})`;
	}

	function handleInspectorKeydown(event: KeyboardEvent) {
		const el = event.target as HTMLElement;
		if (!isEditorShortcutTarget(el.tagName, el.isContentEditable)) return;
		const cmd = parseCreatorShortcut(event);
		if (!cmd) return;
		if (['swatch', 'shader-next', 'tile', 'uv-next'].includes(cmd.type)) {
			if (!houseObject) return;
			event.preventDefault();
			applyMaterialCommand(cmd);
		} else if (cmd.type === 'play-toggle') {
			if (!selectedEvent) return;
			event.preventDefault();
			togglePlayback();
		} else if (cmd.type === 'keyframe') {
			event.preventDefault();
			const stepMs = cmd.direction * 250;
			const nextMs = Math.max(seekRange.min, Math.min(seekRange.max, Math.round(sourceTimeMs + stepMs)));
			seekTo(nextMs);
		} else if (cmd.type === 'keyframe-insert') {
			if (!selectedEvent) return;
			event.preventDefault();
			annotationText = annotationText.trim() || `Keyframe cue @ ${Math.round(sourceTimeMs)} ms`;
			addAnnotation();
		}
	}

	function selectLane(clockId: string) {
		if (activeClock !== clockId && followingVideo) toggleVideo();
		activeClock = clockId;
		const next = recipe.eventLanes.find((item) => item.clockId === clockId)?.events[0];
		if (next) selectEvent(next.eventId);
	}

	function togglePlayback(mode: 'event' | 'lane' = 'event') {
		const interval = mode === 'lane' ? lanePlaybackRange : selectedEvent;
		if (!interval) return;
		if (playing && playbackMode === mode) {
			playing = false;
			return;
		}
		if (sourceTimeMs < interval.startMs || sourceTimeMs >= interval.endMs) {
			sourceTimeMs = interval.startMs;
		}
		playbackMode = mode;
		playbackStartedAt = performance.now();
		playing = true;
	}

	function addAnnotation() {
		const text = annotationText.trim();
		if (!selectedEvent || !lane || !text || text.length > 1000 || annotations.length >= 500 ||
			(followingVideo && (videoPending || videoPlaying))) return;
		const time = Math.floor(sourceTimeMs);
		if (time < selectedEvent.startMs || time >= selectedEvent.endMs) return;
		annotations.push({
			id: crypto.randomUUID(), eventId: selectedEvent.eventId, sourceTimeMs: time, text,
			...(houseObject ? { objectId: houseObject.id } : {})
		});
		annotationText = '';
		playing = false;
	}

	function replacePolygonPreviewGeometry(draft: SceneReviewedPolygonEditDraftV1) {
		const mesh = polygonMeshes.get(draft.objectId);
		if (!mesh) return;
		const unitsPerPixel = Number(mesh.userData.unitsPerPixel);
		const replacement = compileReviewedPolygonMeshV1(draft.recipe, { unitsPerPixel, material: mesh.material });
		const previousGeometry = mesh.geometry;
		mesh.geometry = replacement.geometry;
		mesh.userData = { ...mesh.userData, ...replacement.userData, objectId: draft.objectId, label: draft.label, sourcePlane: true };
		previousGeometry.dispose();
	}

	function movePolygonVertex(ring: 'outer' | 'hole', vertexIndex: number, positionPx: [number, number], holeIndex?: number) {
		const draft = selectedPolygonDraft;
		if (!draft) return;
		polygonEditError = '';
		try {
			const next = editSceneReviewedPolygonVertexV1({ draft, ring, vertexIndex, positionPx, ...(holeIndex === undefined ? {} : { holeIndex }) });
			replacePolygonPreviewGeometry(next);
			polygonEditDrafts = polygonEditDrafts.map((item) => item.objectId === next.objectId ? next : item);
		} catch (cause) {
			polygonEditError = cause instanceof Error ? cause.message : 'Contour edit was rejected.';
		}
	}

	function beginPolygonVertexDrag(event: PointerEvent) {
		const target = event.target instanceof Element ? event.target.closest<SVGCircleElement>('[data-polygon-vertex]') : null;
		const ring = target?.dataset.ring;
		const vertexIndex = Number(target?.dataset.vertexIndex);
		const holeIndex = target?.dataset.holeIndex === undefined ? undefined : Number(target.dataset.holeIndex);
		if (!target || (ring !== 'outer' && ring !== 'hole') || !Number.isInteger(vertexIndex) ||
			(holeIndex !== undefined && !Number.isInteger(holeIndex))) return;
		activePolygonDrag = { ring, vertexIndex, ...(holeIndex === undefined ? {} : { holeIndex }) };
		(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function movePolygonVertexDrag(event: PointerEvent) {
		if (!activePolygonDrag || !selectedPolygonDraft) return;
		const svg = event.currentTarget as SVGSVGElement;
		const bounds = svg.getBoundingClientRect();
		if (!bounds.width || !bounds.height) return;
		const { width, height } = selectedPolygonDraft.recipe;
		const x = Math.min(width, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * width));
		const y = Math.min(height, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * height));
		movePolygonVertex(activePolygonDrag.ring, activePolygonDrag.vertexIndex, [x, y], activePolygonDrag.holeIndex);
		event.preventDefault();
	}

	function endPolygonVertexDrag(event: PointerEvent) {
		activePolygonDrag = null;
		const svg = event.currentTarget as SVGSVGElement;
		if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
	}

	function nudgePolygonVertex(event: KeyboardEvent) {
		const target = event.currentTarget as SVGCircleElement;
		const ring = target.dataset.ring;
		const vertexIndex = Number(target.dataset.vertexIndex);
		const holeIndex = target.dataset.holeIndex === undefined ? undefined : Number(target.dataset.holeIndex);
		if (!selectedPolygonDraft || (ring !== 'outer' && ring !== 'hole') || !Number.isInteger(vertexIndex)) return;
		const step = event.shiftKey ? 10 : 1;
		const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
		const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
		if (!dx && !dy) return;
		event.preventDefault();
		const point = ring === 'outer' ? selectedPolygonDraft.recipe.polygon.outer[vertexIndex] : selectedPolygonDraft.recipe.polygon.holes[holeIndex ?? -1]?.[vertexIndex];
		if (point) movePolygonVertex(ring, vertexIndex, [point[0] + dx, point[1] + dy], holeIndex);
	}

	function stepPolygonHistory(direction: 'undo' | 'redo') {
		const draft = selectedPolygonDraft;
		if (!draft) return;
		try {
			const next = stepSceneReviewedPolygonEditHistoryV1(draft, direction);
			if (next === draft) return;
			replacePolygonPreviewGeometry(next);
			polygonEditDrafts = polygonEditDrafts.map((item) => item.objectId === next.objectId ? next : item);
			polygonEditError = '';
		} catch (cause) {
			polygonEditError = cause instanceof Error ? cause.message : 'Contour history could not be restored.';
		}
	}

	function addContourNote() {
		const contour = selectedPolygonDraft;
		const text = contourNoteText.trim();
		if (!contour || !text || text.length > 1000 || contourNotes.length >= 100 || saving || preparing) return;
		const { evidenceId, sourceRevision, reviewRevision, geometryRevision } = contour.originalRecipe;
		contourNotes = [...contourNotes, { id: crypto.randomUUID(), text, objectId: contour.objectId,
			evidenceId, sourceRevision, reviewRevision, baseGeometryRevision: geometryRevision }];
		contourNoteText = '';
	}

	function exportPreview() {
		const report = {
			schema: 'parent-atlas.scene-preview-report/v1',
			label: RETRO_DEMONSTRATIVE_LABEL_V1,
			status: 'UNSAVED_PREVIEW',
			plan,
			annotations: $state.snapshot(annotations),
			...(contourNotes.length ? { contourNotes } : {}),
			imagePolygonDrafts: polygonEdits.map((edit) => ({ ...edit, coordinateSpace: 'SOURCE_IMAGE_PIXELS' }))
		};
		const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `scene-${plan.sceneId}-preview.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function exportSavedReport() {
		if (!saved || !persistenceEnabled) return;
		reportController?.abort();
		const controller = new AbortController();
		reportController = controller;
		const expected = { caseId: plan.caseId, sceneId: plan.sceneId, revision: saved.manifest.revision, sha256: saved.manifestSha256 };
		reportStatus = 'Preparing saved revision report…';
		try {
			const query = new URLSearchParams({ revision: String(expected.revision) });
			const response = await fetch(`/api/cases/${expected.caseId}/scenes/${expected.sceneId}/report?${query}`, { signal: controller.signal, cache: 'no-store' });
			const body = await response.json();
			if (!response.ok || body?.success !== true || body.data?.caseId !== expected.caseId || body.data?.sceneId !== expected.sceneId ||
				body.data?.revision !== expected.revision || body.data?.manifestSha256 !== expected.sha256) {
				throw new Error(body?.message ?? 'The saved report did not match this scene revision.');
			}
			const blobUrl = URL.createObjectURL(new Blob([`${JSON.stringify(body.data, null, 2)}\n`], { type: 'application/json' }));
			const link = document.createElement('a');
			link.href = blobUrl;
			link.download = `scene-${expected.sceneId}-revision-${expected.revision}-report.json`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
			reportStatus = `Downloaded report for saved revision ${expected.revision}.`;
		} catch (cause) {
			if (controller.signal.aborted) return;
			reportStatus = cause instanceof Error ? cause.message : 'Saved scene report could not be exported.';
		} finally {
			if (reportController === controller) reportController = null;
		}
	}

	async function savePreview() {
		if (saving || preparing || !persistenceEnabled || !polygonDraftsReady) return;
		onSaveRequested?.();
		saving = true;
		saveError = '';
		try {
			const expectedRevision = saved?.manifest.revision ?? 0;
			const draft = { schema: 'parent-atlas.scene-preview-draft/v1' as const, plan, annotations: $state.snapshot(annotations),
				...(polygonEdits.length ? { polygonEdits } : {}), ...(contourNotes.length ? { contourNotes } : {}) };
			const key = JSON.stringify({ expectedRevision, draft });
			if (pendingSave?.key !== key) {
				const evidenceBindings = new Map((saved?.manifest.evidenceBindings ?? []).map((binding) => [binding.evidenceId, binding]));
				for (const { evidenceId, sourceRevision } of plan.sources) evidenceBindings.set(evidenceId, { evidenceId, sourceRevision });
				const manifest = sceneDocumentV1Schema.parse({
					...(saved?.manifest ?? {
						schema: 'parent-atlas.scene-document.v1', sceneId: plan.sceneId, caseId: plan.caseId,
						status: 'HYPOTHESIS', coordinateFrame: 'LOCAL_UNCALIBRATED', objects: [], animations: [], assets: [],
						quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
					}),
					revision: expectedRevision + 1, createdAt: new Date().toISOString(),
					parentManifestSha256: saved?.manifestSha256 ?? null,
					evidenceBindings: [...evidenceBindings.values()],
					proceduralPreviewDraft: draft
				});
				pendingSave = { key, payload: JSON.stringify({ commandId: crypto.randomUUID(), expectedRevision, manifest }) };
			}
			const response = await fetch(`/api/cases/${plan.caseId}/scenes/${plan.sceneId}/revisions`, {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: pendingSave.payload
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.message ?? 'Scene save failed');
			const manifest = sceneDocumentV1Schema.parse(body.data?.manifest);
			if (manifest.proceduralPreviewDraft?.plan.planHash !== plan.planHash ||
				manifest.revision !== expectedRevision + 1 || !/^[0-9a-f]{64}$/.test(body.data?.manifestSha256 ?? '')) {
				throw new Error('The saved scene response did not match this preview');
			}
			saved = { manifest, manifestSha256: body.data.manifestSha256 };
			onSaved?.(saved);
			pendingSave = null;
		} catch (cause) {
			saveError = cause instanceof Error ? cause.message : 'Scene save failed';
			onSaveFailed?.(saveError);
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		selectLane(recipe.eventLanes[0]?.clockId ?? '');
		planBytes = new TextEncoder().encode(JSON.stringify(plan)).byteLength;
		let disposed = false;
		let renderer: import('three').WebGLRenderer | null = null;
		let runtime: Awaited<ReturnType<typeof import('$lib/reconstruction/scene-runtime-three-v1.js').createSceneRuntimeThreeV1>> | null = null;
		let controls: import('three/addons/controls/OrbitControls.js').OrbitControls | null = null;
		let frame = 0;
		let clearPicking: (() => void) | undefined;
		let previous = performance.now();
		let lastVisibleFrame: number | null = null;
		const resetFrameWindow = () => { lastVisibleFrame = null; };
		document.addEventListener('visibilitychange', resetFrameWindow);
		async function start() {
			try {
				const [THREE, orbit, runtimeModule] = await Promise.all([
					import('three'), import('three/addons/controls/OrbitControls.js'), import('$lib/reconstruction/scene-runtime-three-v1.js')
				]);
				if (disposed) return;
				runtime = runtimeModule.createSceneRuntimeThreeV1(recipe);
				activeRuntime = runtime;
				void loadSyntheticCharacters('retro');
				const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
				const scene = new THREE.Scene(); scene.background = new THREE.Color('#172630'); scene.add(runtime.root);
				const imageChapters = [...(saved?.manifest.imageStorybookChapter ? [saved.manifest.imageStorybookChapter] : []), ...(saved?.manifest.imageStorybookChapters ?? [])];
				const reviewedPolygons = collectSceneReviewedPolygonsV1(imageChapters, plan.sources);
				polygonEditDrafts = createSceneReviewedPolygonEditDraftsV1(reviewedPolygons, saved?.manifest.proceduralPreviewDraft?.polygonEdits);
				polygonMeshes.clear();
				const chapterIndex = new Map<string, number>();
				const chapterMaskCounts = new Map<string, number>();
				for (const item of polygonEditDrafts) {
					const groupKey = item.objectId.split('-').slice(1, 6).join('-');
					const index = chapterIndex.get(groupKey) ?? chapterIndex.size;
					chapterIndex.set(groupKey, index);
					const maskIndex = chapterMaskCounts.get(groupKey) ?? 0;
					chapterMaskCounts.set(groupKey, maskIndex + 1);
					const displayScale = Math.min(8 / item.recipe.width, 5 / item.recipe.height);
					const mesh = compileReviewedPolygonMeshV1(item.recipe, {
						unitsPerPixel: displayScale,
						material: new THREE.MeshBasicMaterial({ color: 0x62c4dd, side: THREE.DoubleSide, transparent: true, opacity: 0.42, depthWrite: false })
					});
					mesh.position.set(-12 + index * 12, 4.5, -8 + maskIndex * 0.004);
					mesh.userData = { ...mesh.userData, objectId: item.objectId, label: item.label, sourcePlane: true };
					runtime.root.add(mesh);
					polygonMeshes.set(item.objectId, mesh);
				}
				polygonDraftsReady = true;
				const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 2000);
				if (recipe.environment.kind === 'four-bedroom-house') camera.position.set(14, 21, 17);
				else camera.position.set(34, 25, 38);
				renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
				readRenderMetrics = () => renderer && renderer.info.render.frame > 0 ? {
					calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
					geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
					geometryBytes: countSceneGeometryBufferBytesV1(runtime!.root), residency: runtime!.getResidencyMetrics()
				} : null;
				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(width, height, false);
				controls = new orbit.OrbitControls(camera, renderer.domElement); controls.target.set(0, 0, 0); controls.update();
				function setCameraPreset(preset: SceneCameraPresetV1) {
					const distance = recipe.environment.kind === 'four-bedroom-house' ? 28 : 70;
					camera.up.set(0, preset === 'top-down' ? 0 : 1, preset === 'top-down' ? -1 : 0);
					if (preset === 'top-down') camera.position.set(0, distance, 0.01);
					else if (preset === 'isometric') camera.position.set(distance * 0.68, distance * 0.68, distance * 0.68);
					else camera.position.set(distance * 0.25, distance * 0.38, distance);
					controls!.target.set(0, 0, 0); controls!.update();
				};
				const orbitControls = controls;
				let restoreManualView: (() => void) | null = null;
				let appliedCuePreset: SceneCameraPresetV1 | null = null;
				function updateCameraCue(preset: SceneCameraPresetV1 | null) {
					if (preset === appliedCuePreset) return;
					appliedCuePreset = preset;
					if (!preset) {
						restoreManualView?.();
						restoreManualView = null;
						return;
					}
					if (!restoreManualView) {
						const position = camera.position.clone();
						const up = camera.up.clone();
						const target = orbitControls.target.clone();
						const enabled = orbitControls.enabled;
						restoreManualView = () => {
							camera.position.copy(position);
							camera.up.copy(up);
							orbitControls.target.copy(target);
							orbitControls.enabled = enabled;
							orbitControls.update();
						};
					}
					setCameraPreset(preset);
					orbitControls.enabled = false;
				}
				applyCameraPreset = (preset) => {
					updateCameraCue(null);
					setCameraPreset(preset);
				};
				{
					const objects: HouseObject[] = [];
					runtime.root.traverse((node) => {
						const candidate = node.userData.houseObject as HouseObject | undefined;
						const objectId = [node.userData.objectId, node.userData.actorId, node.userData.assetId].find((value) => typeof value === 'string') as string | undefined;
						if (candidate) objects.push(candidate);
						else if (objectId) objects.push({ id: objectId, label: typeof node.userData.label === 'string' ? node.userData.label : objectId, room: node.userData.sourcePlane ? 'Source image plane' : node.userData.actorId ? 'Actor' : node.userData.assetId ? 'Asset' : 'Prop',
							...(typeof node.userData.evidenceId === 'string' ? { sourceEvidenceId: node.userData.evidenceId } : {}),
							...(typeof node.userData.sourceRevision === 'string' ? { sourceRevision: node.userData.sourceRevision } : {}),
							...(typeof node.userData.reviewRevision === 'string' ? { reviewRevision: node.userData.reviewRevision } : {}) });
					});
					houseObjects = [...new Map(objects.map((item) => [item.id, item])).values()];
					const raycaster = new THREE.Raycaster();
					const cursor = new THREE.Vector2();
					let pointerStart: { id: number; x: number; y: number } | null = null;
					const down = (event: PointerEvent) => {
						pointerStart = event.button === 0 && event.isPrimary
							? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
					};
					const up = (event: PointerEvent) => {
						const start = pointerStart;
						pointerStart = null;
						if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
						const rect = canvas.getBoundingClientRect();
						cursor.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
						raycaster.setFromCamera(cursor, camera);
						let hit: import('three').Object3D | undefined = raycaster.intersectObject(runtime!.root, true)[0]?.object;
						while (hit && hit !== runtime!.root && !hit.userData.houseObject &&
							typeof hit.userData.objectId !== 'string' && typeof hit.userData.actorId !== 'string' && typeof hit.userData.assetId !== 'string') hit = hit.parent ?? undefined;
						const hitId = [hit?.userData.objectId, hit?.userData.actorId, hit?.userData.assetId].find((value) => typeof value === 'string') as string | undefined;
						selectHouseObject((hit?.userData.houseObject as HouseObject | undefined) ?? (hitId ? houseObjects.find((item) => item.id === hitId) ?? null : null));
					};
					canvas.addEventListener('pointerdown', down);
					canvas.addEventListener('pointerup', up);
					clearPicking = () => {
						canvas.removeEventListener('pointerdown', down);
						canvas.removeEventListener('pointerup', up);
					};
				}
				scene.add(new THREE.HemisphereLight(0xd9e7ec, 0x28352c, 2.1));
				const sun = new THREE.DirectionalLight(0xffe0a4, 2.2); sun.position.set(-20, 35, 15); scene.add(sun);
				const resize = () => { if (!renderer) return; const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };
				const observer = new ResizeObserver(resize); observer.observe(canvas);
				if (activeClock) runtime.setSourceTime(activeClock, sourceTimeMs);
				if (selectedEventId) runtime.selectEvent(selectedEventId);
				status = `Illustrative preview · ${runtime.environmentInstanceCount} repeated environment instances · 8 MiB authored-data target`;
				onPreviewReady?.();
				const draw = (now: number) => {
					if (disposed || !renderer) return;
					if (document.visibilityState === 'visible') {
						if (lastVisibleFrame !== null) frameSamples.add(now - lastVisibleFrame);
						lastVisibleFrame = now;
					}
					const dt = Math.min(0.05, (now - previous) / 1000); previous = now;
					const playbackInterval = playbackMode === 'lane' ? lanePlaybackRange : selectedEvent;
					if (playing && playbackInterval) {
						const elapsed = now - playbackStartedAt; playbackStartedAt = now;
						const { startMs, endMs } = playbackInterval;
						if (playbackMode === 'lane') {
							sourceTimeMs = Math.min(endMs, sourceTimeMs + elapsed);
							if (sourceTimeMs === endMs) playing = false;
						} else {
							sourceTimeMs = startMs + ((sourceTimeMs - startMs + elapsed) % (endMs - startMs));
						}
					}
					const time = Math.floor(sourceTimeMs);
					const last = runtime?.activeSourceTime;
					if (runtime && activeClock && (last?.clockId !== activeClock || last.sourceTimeMs !== time)) runtime.setSourceTime(activeClock, time);
					updateCameraCue(cameraCue?.preset ?? null);
					if (!cameraCue?.preset) controls?.update(dt);
					if (runtime) {
						const mode = followingVideo ? 'video-scrub' : houseObject ? 'editing' : 'navigation';
						const eventFocus = followingVideo && selectedEventId ? runtime.getEventFocusPosition(selectedEventId) : null;
						const objectFocus = houseObject ? runtime.getObjectFocusPosition(houseObject.id) : null;
						const focus = eventFocus ?? objectFocus ?? [controls?.target.x ?? 0, controls?.target.y ?? 0, controls?.target.z ?? 0] as [number, number, number];
						runtime.updateEnvironmentFocus(focus, mode, now);
						runtime.drainEnvironmentCellQueue(1);
						const residency = runtime.getResidencyMetrics();
						const nextStatus = `Illustrative preview · ${runtime.environmentInstanceCount} repeated instances · ${residency.loadedCells} cells${residency.queuedCells ? ` · ${residency.queuedCells} loading` : ''} · 8 MiB authored-data target`;
						if (status !== nextStatus) status = nextStatus;
					}
					renderer.render(scene, camera); frame = requestAnimationFrame(draw);
				};
				frame = requestAnimationFrame(draw);
				return () => observer.disconnect();
			} catch (cause) {
				error = cause instanceof Error ? cause.message : 'Scene preview failed to initialize.';
				status = 'Preview unavailable';
				onPreviewFailed?.(error);
			}
		}
		let stopObserver: (() => void) | undefined;
		void start().then((cleanup) => { stopObserver = cleanup; });
		return () => {
			disposed = true;
			activeRuntime = null;
			document.removeEventListener('visibilitychange', resetFrameWindow);
			readRenderMetrics = undefined;
			cancelAnimationFrame(frame);
			stopObserver?.(); clearPicking?.(); controls?.dispose(); runtime?.dispose(); renderer?.dispose(); polygonMeshes.clear();
		};
	});

</script>

<section class="runtime" aria-label="Scene preview and event timeline">
	<div class="viewport"><canvas bind:this={canvas} aria-label="Illustrative 3D scene preview"></canvas><span class="status">{status}</span>
		<div class="camera-presets" aria-label="Scene camera"><button type="button" onclick={() => chooseManualCamera('top-down')}>Top down</button><button type="button" onclick={() => chooseManualCamera('isometric')}>Isometric</button><button type="button" onclick={() => chooseManualCamera('perspective')}>Perspective</button></div>
		{#if hasCameraCues}
			<label><input type="checkbox" bind:checked={followsCameraCues} /> Follow camera cues</label>
			{#if cameraCue?.conflict}<p role="status">Conflicting camera cues. Using your manual view.</p>
			{:else if cameraCue?.preset}<p role="status">Camera cue: {sceneCameraPresetLabelsV1[cameraCue.preset]}</p>{/if}
		{/if}
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="timeline">
		<button type="button" onclick={() => { memoryDialog.showModal(); inspecting = true; }}>Performance and memory</button>
		<TimelineEngine durationSeconds={timelineDurationSeconds} currentTimeSeconds={sourceTimeMs / 1000} items={timelineItems}
			onSeek={(seconds) => { sourceTimeMs = Math.round(seconds * 1000); }} />
		<dialog bind:this={memoryDialog} aria-label="Scene performance and memory" onclose={() => { inspecting = false; }}>
			<h3>Scene performance and memory</h3>
			<dl>
				<dt>Focus</dt><dd>{previewFocus}</dd>
				<dt>Frame interval p95</dt><dd>{formatMetric(metrics?.frameP95, 'ms')}</dd>
				<dt>Timeline seek to presented frame p95</dt><dd>{formatMetric(metrics?.seekP95, 'ms')}</dd>
				<dt>Draw calls / last frame</dt><dd>{formatMetric(metrics?.render?.calls, '')}</dd>
				<dt>Triangles / last frame</dt><dd>{formatMetric(metrics?.render?.triangles, '')}</dd>
				<dt>Renderer geometry / texture counts</dt><dd>{formatMetric(metrics?.render?.geometries, '')} / {formatMetric(metrics?.render?.textures, '')}</dd>
				<dt>CPU geometry backing buffers</dt><dd>{formatMetric(metrics?.render?.geometryBytes, 'bytes')}</dd>
				<dt>Procedural cells loaded / queued</dt><dd>{formatMetric(metrics?.render?.residency.loadedCells, '')} / {formatMetric(metrics?.render?.residency.queuedCells, '')} · cap {formatMetric(metrics?.render?.residency.residentLimit, '')}</dd>
				<dt>Cell priority</dt><dd>{metrics?.render?.residency.mode ?? 'Unavailable'}</dd>
				<dt>Serialized plan</dt><dd>{formatMetric(planBytes, 'bytes')}</dd>
				<dt>Authored scene target</dt><dd>8 MiB</dd>
				<dt>GPU bytes, media bytes, tile cache</dt><dd>Unavailable</dd>
			</dl>
			<p>Frame intervals include display scheduling. Geometry bytes exclude textures, video, engine overhead, and GPU allocations.</p>
			<form method="dialog"><button type="submit">Close</button></form>
		</dialog>
		{#if houseObjects.length}
			<label>Scene object
				<select value={houseObject?.id ?? ''} onchange={(event) => {
					const id = (event.currentTarget as HTMLSelectElement).value;
					 selectHouseObject(houseObjects.find((object) => object.id === id) ?? null);
				}}>
					<option value="">Select a room, actor, prop or furnishing</option>
					{#each houseObjects as object (object.id)}
						<option value={object.id}>{object.label === object.room ? object.label : `${object.room} · ${object.label}`}</option>
					{/each}
				</select>
			</label>
			{#if selectedObjectInspector}
				<aside class="object-inspector" aria-label="Selected scene object inspector" data-testid="scene-object-inspector">
					<strong>{selectedObjectInspector.object.label}</strong>
					<p>{selectedObjectInspector.object.id} · {selectedObjectInspector.object.kind} · {selectedObjectInspector.object.room ?? 'scene object'}</p>
					{#if selectedObjectInspector.object.description}<p>{selectedObjectInspector.object.description}</p>{/if}
					{#if selectedObjectInspector.object.placement}<p>Scene position {selectedObjectInspector.object.placement.positionMeters.join(', ')} m · {selectedObjectInspector.coordinateStatus.replaceAll('_', ' ')}.</p>{/if}
					{#if selectedObjectInspector.object.sourceEvidenceId}<p>Mask source revision {selectedObjectInspector.object.sourceRevision} · review token {selectedObjectInspector.object.reviewRevision} · image-pixel plane, not scene-calibrated.</p>{/if}
					<h4>Related event cues</h4>
					{#if selectedObjectInspector.events.length}
						<ul>{#each selectedObjectInspector.events as event (event.eventId)}<li>{event.eventId} · {event.label} · {event.status}/{event.reviewStatus} · {event.clockId}: {event.startMs}–{event.endMs} ms ±{event.uncertaintyMs} ms</li>{/each}</ul>
					{:else}<p>No event cue is bound to this object in the current proposal.</p>{/if}
					{#if selectedObjectInspector.conflicts.length}<div class="cue-conflicts" role="alert"><strong>Conflicting timeline proposals</strong><ul>{#each selectedObjectInspector.conflicts as conflict (`${conflict.clockId}:${conflict.targetId}:${conflict.eventIds.join(':')}`)}<li>{conflict.reason.replaceAll('_', ' ')} · {conflict.eventIds.join(' / ')} · {conflict.clockId}</li>{/each}</ul><span>Playback leaves this object's transform unchanged while incompatible cues overlap.</span></div>{/if}
					<h4>Source evidence</h4>
					{#if selectedObjectInspector.sources.length}
						<ul>{#each selectedObjectInspector.sources as source (source.evidenceId)}<li>{#if sourceNavigationEnabled && evidenceItems.some((item) => item.id === source.evidenceId)}<a href={`/cases/${encodeURIComponent(plan.caseId)}/evidence/${encodeURIComponent(source.evidenceId)}`}>Open {evidenceItems.find((item) => item.id === source.evidenceId)?.title || source.evidenceId}</a>{:else}Source {evidenceItems.find((item) => item.id === source.evidenceId)?.title || source.evidenceId} · navigation unavailable{/if} · {source.sourceRevision}</li>{/each}</ul>
					{:else}<p>No evidence source is attached in this plan.</p>{/if}
					{#each selectedObjectInspector.unresolvedEvidenceIds as evidenceId (evidenceId)}<p role="note">Source {evidenceId} is not present in the resolved plan; no source link was created.</p>{/each}
				</aside>
			{/if}
		{/if}
		{#if selectedPolygonDraft}
			<section class="polygon-editor" aria-label="Image-space polygon editor">
				<strong>Edit reviewed contour · source pixels</strong>
				<p>Contour edits are illustrative and stay in source pixels. Saving records them as unreviewed geometry alongside the reviewed source mask.</p>
				<label>Note on this contour<textarea bind:value={contourNoteText} rows={2} maxlength={1000}></textarea></label>
				<button type="button" onclick={addContourNote} disabled={saving || preparing || !contourNoteText.trim() || contourNotes.length >= 100}>Add contour note</button>
				{#if selectedContourNotes.length}
					<ul aria-label="Notes on this contour">
						{#each selectedContourNotes as note (note.id)}
							<li>{note.text} <button type="button" aria-label={`Remove contour note: ${note.text}`} disabled={saving || preparing}
								onclick={() => { contourNotes = contourNotes.filter((item) => item.id !== note.id); }}>Remove</button></li>
						{/each}
					</ul>
				{/if}
				{#if selectedPolygonImageUrl}
					<div class="polygon-source-preview" style={`aspect-ratio: ${selectedPolygonDraft.recipe.width} / ${selectedPolygonDraft.recipe.height}`}>
						<img src={selectedPolygonImageUrl} alt="Original evidence with selected mask contour overlay" loading="lazy" onerror={() => (polygonSourceImageError = true)} onload={() => (polygonSourceImageError = false)} />
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<svg viewBox={`0 0 ${selectedPolygonDraft.recipe.width} ${selectedPolygonDraft.recipe.height}`} preserveAspectRatio="none" role="group" aria-label="Drag contour vertices to edit in original source pixels" onpointerdown={beginPolygonVertexDrag} onpointermove={movePolygonVertexDrag} onpointerup={endPolygonVertexDrag} onpointercancel={endPolygonVertexDrag}>
							<polygon points={selectedPolygonDraft.recipe.polygon.outer.map((point) => point.join(',')).join(' ')} fill="rgba(98,196,221,.12)" stroke="#45d2f0" stroke-width={Math.max(1, Math.max(selectedPolygonDraft.recipe.width, selectedPolygonDraft.recipe.height) / 320)} />
							{#each selectedPolygonDraft.recipe.polygon.holes as hole, holeIndex (`hole-outline-${holeIndex}`)}
								<polygon points={hole.map((point) => point.join(',')).join(' ')} fill="rgba(231,112,87,.14)" stroke="#ff9c80" stroke-width={Math.max(1, Math.max(selectedPolygonDraft.recipe.width, selectedPolygonDraft.recipe.height) / 320)} />
							{/each}
							{#each selectedPolygonDraft.recipe.polygon.outer as point, vertexIndex (`outer-handle-${vertexIndex}`)}
								<circle data-polygon-vertex data-ring="outer" data-vertex-index={vertexIndex} cx={point[0]} cy={point[1]} r={Math.max(4, Math.max(selectedPolygonDraft.recipe.width, selectedPolygonDraft.recipe.height) / 90)} fill="#fff" stroke="#087f9c" stroke-width={Math.max(1, Math.max(selectedPolygonDraft.recipe.width, selectedPolygonDraft.recipe.height) / 420)} role="button" tabindex="0" aria-label={`Move outer contour point ${vertexIndex + 1}`} onkeydown={nudgePolygonVertex} />
							{/each}
							{#each selectedPolygonDraft.recipe.polygon.holes as hole, holeIndex (`hole-handles-${holeIndex}`)}
								{#each hole as point, vertexIndex (`hole-${holeIndex}-handle-${vertexIndex}`)}
									<circle data-polygon-vertex data-ring="hole" data-hole-index={holeIndex} data-vertex-index={vertexIndex} cx={point[0]} cy={point[1]} r={Math.max(4, Math.max(selectedPolygonDraft.recipe.width, selectedPolygonDraft.recipe.height) / 90)} fill="#fff" stroke="#b34b37" stroke-width={Math.max(1, Math.max(selectedPolygonDraft.recipe.width, selectedPolygonDraft.recipe.height) / 420)} role="button" tabindex="0" aria-label={`Move hole ${holeIndex + 1} point ${vertexIndex + 1}`} onkeydown={nudgePolygonVertex} />
								{/each}
							{/each}
						</svg>
					</div>
					{#if polygonSourceImageError}<p role="status">The authorized source image is unavailable. You can still edit its pixel coordinates below.</p>{/if}
				{/if}
				<div class="actions"><button type="button" onclick={() => stepPolygonHistory('undo')} disabled={selectedPolygonDraft.historyIndex <= 0}>Undo vertex edit</button><button type="button" onclick={() => stepPolygonHistory('redo')} disabled={selectedPolygonDraft.historyIndex >= selectedPolygonDraft.history.length - 1}>Redo vertex edit</button><span>{selectedPolygonDraft.recipe.geometryRevision}</span></div>
				<h4>Outer contour</h4>
				{#each selectedPolygonDraft.recipe.polygon.outer as point, vertexIndex (`outer-${vertexIndex}`)}
					<div class="vertex-row"><span>Point {vertexIndex + 1}</span><label>X px<input type="number" step="0.1" min="0" max={selectedPolygonDraft.recipe.width} value={point[0]} onchange={(event) => movePolygonVertex('outer', vertexIndex, [Number((event.currentTarget as HTMLInputElement).value), selectedPolygonDraft!.recipe.polygon.outer[vertexIndex]![1]])} /></label><label>Y px<input type="number" step="0.1" min="0" max={selectedPolygonDraft.recipe.height} value={point[1]} onchange={(event) => movePolygonVertex('outer', vertexIndex, [selectedPolygonDraft!.recipe.polygon.outer[vertexIndex]![0], Number((event.currentTarget as HTMLInputElement).value)])} /></label></div>
				{/each}
				{#each selectedPolygonDraft.recipe.polygon.holes as hole, holeIndex (`hole-${holeIndex}`)}
					<h4>Hole {holeIndex + 1}</h4>
					{#each hole as point, vertexIndex (`hole-${holeIndex}-${vertexIndex}`)}
						<div class="vertex-row"><span>Point {vertexIndex + 1}</span><label>X px<input type="number" step="0.1" min="0" max={selectedPolygonDraft.recipe.width} value={point[0]} onchange={(event) => movePolygonVertex('hole', vertexIndex, [Number((event.currentTarget as HTMLInputElement).value), selectedPolygonDraft!.recipe.polygon.holes[holeIndex]![vertexIndex]![1]], holeIndex)} /></label><label>Y px<input type="number" step="0.1" min="0" max={selectedPolygonDraft.recipe.height} value={point[1]} onchange={(event) => movePolygonVertex('hole', vertexIndex, [selectedPolygonDraft!.recipe.polygon.holes[holeIndex]![vertexIndex]![0], Number((event.currentTarget as HTMLInputElement).value)], holeIndex)} /></label></div>
					{/each}
				{/each}
				{#if polygonEditError}<p class="error" role="alert">{polygonEditError}</p>{/if}
			</section>
		{/if}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<aside
			class="synopsis"
			data-testid="pa-v2-material-inspector"
			aria-label="Material, UV, and character motion inspector"
			tabindex="0"
			onkeydown={handleInspectorKeydown}
		>
			<strong>Character LOD &amp; Material/UV Inspector</strong>
			{#if recipe.actors.length > 0}
				<div class="controls">
					<label>Actor LOD
						<select
							aria-label="Actor geometry quality tier"
							value={actorLodTier}
							onchange={(event) => void loadSyntheticCharacters((event.currentTarget as HTMLSelectElement).value as TextureTier)}
						>
							<option value="retro">Retro · 8 MiB (368 tris)</option>
							<option value="balanced">Balanced · 32 MiB (768 tris)</option>
							<option value="detailed">Detailed · 128 MiB (2048 tris)</option>
						</select>
					</label>
					<small role="status">{actorCharacterStatus}</small>
				</div>
			{/if}
			{#if houseObject}
				<div class="controls">
					<div role="group" aria-label="Color swatches (1–5)" style="display:flex;gap:.35rem;flex-wrap:wrap">
						{#each CREATOR_SWATCHES as color, idx (color)}
							<button
								type="button"
								aria-label={`Color ${idx + 1}: ${color}`}
								aria-pressed={materialState.swatchIndex === idx}
								style={`background:${color};min-width:1.9rem;min-height:1.7rem;border:${materialState.swatchIndex === idx ? '2px solid #1d2830' : '1px solid #809196'}`}
								onclick={() => applyMaterialCommand({ type: 'swatch', index: idx })}
							>
								{idx + 1}
							</button>
						{/each}
					</div>
					<label>Shader (M)
						<select
							aria-label="Shader family"
							value={materialState.shader}
							onchange={(event) => applySelectedMaterial({ ...materialState, shader: (event.currentTarget as HTMLSelectElement).value as ShaderFamily })}
						>
							<option value="unlit">Unlit</option>
							<option value="lambert">Lambert</option>
							<option value="standard">PBR Standard</option>
						</select>
					</label>
					<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap">
						<button type="button" aria-label="Decrease UV tiling" onclick={() => applyMaterialCommand({ type: 'tile', multiplier: 0.5 })}>[ −</button>
						<output aria-label="Current UV tiling">{materialState.tiling}×</output>
						<button type="button" aria-label="Increase UV tiling" onclick={() => applyMaterialCommand({ type: 'tile', multiplier: 2 })}>+ ]</button>
						<button type="button" aria-label="Cycle UV projection" onclick={() => applyMaterialCommand({ type: 'uv-next' })}>UV: {materialState.uvMode} (U)</button>
						<button type="button" disabled={!canUndoMaterial} onclick={undoSelectedMaterial}>Undo</button>
						<button type="button" disabled={!canRedoMaterial} onclick={redoSelectedMaterial}>Redo</button>
					</div>
					{#if materialStatus}<small role="status">{materialStatus}</small>{/if}
				</div>
			{:else}
				<small>Select a scene object to enable focus-scoped material/UV hotkeys (1–5, M, [, ], U) and K / J / L / Shift+K motion cues.</small>
			{/if}
			<div class="controls" data-testid="scene-deformation-goap-panel" style="margin-top:.65rem;padding-top:.5rem;border-top:1px solid #cfc9bb">
				<div style="display:flex;gap:.4rem;flex-wrap:wrap">
					<button type="button" data-testid="eng04-brush-preview-btn" onclick={() => void runSoftDeformationPreview()}>Soft Brush Preview (PADF)</button>
					<button type="button" data-testid="goap-whatif-preview-btn" onclick={runGoapWhatIfPreview}>GOAP What-If (Hypothesis)</button>
				</div>
				{#if deformationReceipt}
					<small role="status" data-testid="eng04-brush-receipt">PADF {deformationReceipt.affectedVertexCount} verts · {deformationReceipt.byteLength} B · {deformationReceipt.storageKey}</small>
				{/if}
				{#if deformationError}
					<small class="error" role="alert">{deformationError}</small>
				{/if}
				{#if goapSimulationPlan}
					<small role="status" data-testid="goap-whatif-receipt">{goapSimulationPlan.authorityLabel} · {goapSimulationPlan.status} · cost {goapSimulationPlan.totalCost} · [{goapSimulationPlan.operatorIds.join(' -> ')}]</small>
				{/if}
			</div>
		</aside>
		<div class="controls">
			<label>Source clock lane
				<select value={activeClock} onchange={(event) => selectLane((event.currentTarget as HTMLSelectElement).value)} disabled={recipe.eventLanes.length === 0}>
					{#each recipe.eventLanes as item (item.clockId)}
						<option value={item.clockId}>{item.evidenceId ? evidenceItems.find((source) => source.id === item.evidenceId)?.title || item.evidenceId : 'Scene time (illustrative)'}</option>
					{/each}
				</select>
			</label>
			{#if videoUrl}
				<button type="button" onclick={toggleVideo}>{followingVideo ? 'Close source video' : 'Follow source video'}</button>
			{/if}
			{#if followingVideo && videoUrl}
				{#key videoUrl}
					<SceneSourceVideo src={videoUrl} seek={videoSeek}
						onTime={followVideoTime}
						onPending={(pending) => { videoPending = pending; }}
						onPlaying={(active) => { videoPlaying = active; }} />
				{/key}
			{:else}
				<button type="button" onclick={() => togglePlayback()} disabled={!selectedEvent}>{playing && playbackMode === 'event' ? 'Pause selected event' : 'Play selected event'}</button>
				<button type="button" onclick={() => togglePlayback('lane')} disabled={!lanePlaybackRange}>{playing && playbackMode === 'lane' ? 'Pause source lane' : 'Play source lane'}</button>
			{/if}
			<label class="scrub">
				{followingVideo ? (videoPending ? 'Seeking source video' : presentedTime ? 'Presented frame' : 'Media time estimate') : 'Source time'}
				· {Math.round(sourceTimeMs)} ms
				<input aria-label="Source time in milliseconds" type="range" min={seekRange.min} max={Math.max(seekRange.max, sourceTimeMs)} value={sourceTimeMs}
					oninput={(event) => seekTo(Number((event.currentTarget as HTMLInputElement).value))} />
			</label>
		</div>
		{#if lane?.events.length}
			<div class="event-list" aria-label="Events in this source clock lane">
				{#each lane.events as event (event.eventId)}
					<button class:active={event.eventId === selectedEventId} type="button" onclick={() => selectEvent(event.eventId)}>
						<strong>{event.label}</strong><span>{event.startMs}–{event.endMs} ms · ±{event.uncertaintyMs} ms</span>
						<small>{event.reviewStatus === 'accepted' ? 'Reviewed source · illustrative cue' : `${event.status} · ${event.reviewStatus}`} · {event.cueType}{activeEventIds.has(event.eventId) ? ' · At playhead' : ''}</small>
					</button>
				{/each}
			</div>
			{#if selectedEvent}
				<aside class="synopsis">
					<strong>Event synopsis</strong>
					<p>{selectedEvent.label}</p>
					{#if laneCaptionScopes.length > 0}
						<label><input type="checkbox" bind:checked={showCaptions} /> Show cited transcript captions</label>
						{#if showCaptions && captionStatus}<p role="status">{captionStatus}</p>{/if}
						{#if activeCaptions.length}
							<ul aria-label="Transcript captions at playhead">
								{#each activeCaptions as caption (caption.referenceId)}
									<li><p>{caption.text}</p><small>{caption.startMs}–{caption.endMs} ms · {caption.reviewed ? 'Reviewed transcript' : 'Unreviewed transcript excerpt'}</small></li>
								{/each}
							</ul>
						{/if}
					{/if}
					<ul>
						{#each selectedEvent.evidenceIds as evidenceId (evidenceId)}
							<li><a href={`/cases/${encodeURIComponent(plan.caseId)}/evidence/${encodeURIComponent(evidenceId)}`}>
								{evidenceItems.find((source) => source.id === evidenceId)?.title || evidenceId}
							</a></li>
						{/each}
					</ul>
					<p>Bound targets: {selectedEvent.targetRefs.map((item) => `${item.kind}:${item.targetId}`).join(', ') || 'none'}</p>
					<label>Draft note at the current {lane.evidenceId ? 'source' : 'scene'} time
						<textarea bind:value={annotationText} maxlength={1000} rows={2}></textarea>
					</label>
					<button type="button" onclick={addAnnotation} disabled={playing || (followingVideo && (videoPending || videoPlaying)) || !annotationText.trim() || annotations.length >= 500 ||
						sourceTimeMs < selectedEvent.startMs || sourceTimeMs >= selectedEvent.endMs}>Add draft note</button>
					{#if selectedAnnotations.length}
						<ul>
							{#each selectedAnnotations as note (note.id)}
								<li>
									<button type="button" onclick={() => seekTo(note.sourceTimeMs)}>{note.sourceTimeMs} ms</button>
									{note.text}{note.objectId ? ` · ${note.objectId}` : ''}
									<button type="button" aria-label={`Remove note at ${note.sourceTimeMs} ms`} onclick={() => { annotations = annotations.filter((item) => item.id !== note.id); }}>Remove</button>
								</li>
							{/each}
						</ul>
					{/if}
				</aside>
			{/if}
		{:else}<p>No timed events in this preview.</p>{/if}
		<p>Save or export draft notes before leaving the preview.</p>
		<button type="button" onclick={savePreview} disabled={!persistenceEnabled || saving || preparing || !polygonDraftsReady}>{saving ? 'Saving…' : 'Save scene draft'}</button>
		{#if !persistenceEnabled}<p role="status">Saving is disabled because the scene persistence feature gate is off. Export the preview report to keep a local review copy.</p>{/if}
		{#if hasUnsavedPolygonEdits}<p role="status">Contour edits are unsaved. Save the scene draft or export the preview report to keep a copy.</p>{/if}
		{#if hasUnsavedContourNotes}<p role="status">Contour notes are unsaved.</p>{/if}
		{#if saved}<a href={reopenHref} data-sveltekit-reload>Reopen saved revision {saved.manifest.revision}</a>{/if}
		{#if saveError}<p role="alert">{saveError}</p>{/if}
		<button type="button" onclick={exportPreview}>Export preview report (JSON)</button>
		<button type="button" onclick={exportSavedReport} disabled={!saved || !persistenceEnabled || saving || preparing}>
			Export saved revision report (JSON)
		</button>
		{#if !persistenceEnabled && saved}<p role="status">Saved revision export is unavailable while scene persistence is disabled.</p>{/if}
		{#if reportStatus}<p role="status">{reportStatus}</p>{/if}
	</div>
</section>

<style>
	.object-inspector{margin:.65rem 0;padding:.75rem;background:#f4f7fa;border:1px solid #c5d1dc;border-left:4px solid #547da0;border-radius:.3rem}.object-inspector p{margin:.3rem 0;font-size:.78rem}.object-inspector h4{margin:.55rem 0 .2rem;font-size:.82rem}.object-inspector ul{margin:.25rem 0;padding-left:1.2rem;font-size:.76rem}.object-inspector li{margin:.25rem 0;overflow-wrap:anywhere}.object-inspector a{color:#245884;text-decoration:underline}
	.cue-conflicts{padding:.55rem;background:#fff2e4;border:1px solid #d78b4b;border-left:3px solid #ba522c;font-size:.76rem}.cue-conflicts ul{margin:.25rem 0;padding-left:1.2rem}.cue-conflicts span{display:block;margin-top:.35rem}
	.polygon-editor{margin:.7rem 0;padding:.7rem;background:#fff9e9;border:1px solid #d8bd7e;border-radius:.35rem}.polygon-editor>p{font-size:.78rem;color:#536068}.polygon-editor h4{margin:.55rem 0 .25rem}.polygon-source-preview{position:relative;width:min(100%,34rem);max-height:28rem;margin:.65rem auto;overflow:hidden;background:#202a31;border:1px solid #78848a;border-radius:.25rem;touch-action:none}.polygon-source-preview img,.polygon-source-preview svg{position:absolute;inset:0;width:100%;height:100%}.polygon-source-preview img{object-fit:fill}.polygon-source-preview svg{touch-action:none}.polygon-source-preview circle{cursor:grab}.polygon-source-preview circle:active{cursor:grabbing}.polygon-source-preview circle:focus{outline:none;filter:drop-shadow(0 0 3px #ffe27a)}.vertex-row{display:grid;grid-template-columns:5rem 1fr 1fr;gap:.4rem;align-items:center;padding:.25rem 0;border-bottom:1px solid #eee6d4}.vertex-row label{display:grid;gap:.15rem;font-size:.72rem}.vertex-row input{min-width:0;width:100%;box-sizing:border-box}.polygon-editor .actions{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}.polygon-editor .actions span{font-size:.7rem;overflow-wrap:anywhere}
	dialog { width: min(36rem, 90vw); max-height: 85vh; overflow: auto; padding: 1rem 1.25rem; border: 1px solid #cfc9bb; border-radius: .5rem; color: #1d2830; background: #f7f5ef; }
	dialog::backdrop { background: #17263099; }
	dialog dl { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: .4rem .85rem; }
	dialog dd { margin: 0; font-variant-numeric: tabular-nums; }
	.camera-presets{position:absolute;top:.6rem;left:.6rem;display:flex;gap:.3rem}.camera-presets button{padding:.35rem .5rem;background:#0b131bcc;color:#eef4f4;border:1px solid #809196;border-radius:.25rem}
	.runtime{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(18rem,1fr);gap:1rem}.viewport{position:relative;min-height:34rem;background:#172630;border:1px solid #43545b;border-radius:.45rem;overflow:hidden}.viewport canvas{display:block;width:100%;height:34rem}.status{position:absolute;left:.6rem;bottom:.6rem;padding:.35rem .55rem;color:#eef4f4;background:#0b131bcc;border-radius:.25rem;font-size:.76rem}.timeline{padding:1rem;background:#f7f5ef;color:#1d2830;border:1px solid #cfc9bb;border-radius:.45rem}.controls{display:grid;gap:.6rem}.controls label{display:grid;gap:.25rem;font-size:.8rem}.controls select,.controls button{min-height:2.4rem;padding:.45rem}.scrub input{width:100%}.event-list{display:grid;gap:.4rem;margin-top:.8rem}.event-list button{display:grid;gap:.25rem;text-align:left;padding:.6rem;background:#fff;border:1px solid #c9c6bd;border-radius:.35rem}.event-list button.active{border-color:#a26a16;box-shadow:0 0 0 1px #a26a16}.event-list span,.event-list small{font-size:.74rem;color:#49565d}.synopsis{margin-top:.8rem;padding:.7rem;background:#fff;border-left:3px solid #c88e2e}.synopsis p{font-size:.82rem;margin:.4rem 0}.error{color:#8d1723}@media(max-width:850px){.runtime{grid-template-columns:1fr}.viewport,.viewport canvas{min-height:23rem;height:23rem}}
</style>
