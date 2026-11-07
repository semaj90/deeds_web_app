<script lang="ts">
	import { onMount } from 'svelte';
	import { createSpzDecodeClient, type SpzDecodeClient } from '$lib/splat/spz-decode-client.js';
	import { workerPayloadToGaussianGeometry } from '$lib/splat/worker-three-geometry.js';
	import { createSceneDocumentV1, createSceneQualityReceiptV1, type SceneDocumentV1, type SurfaceMarkerV1 } from '$lib/splat/scene-document-v1.js';
	import { fetchSceneAssetV1, fetchSceneRevisionV1, saveSceneManifestRevisionV1, saveSceneRevisionV1 } from '$lib/splat/scene-persistence-client-v1.js';
	import { sha256Hex } from '$lib/splat/spz-loader.js';
	import { createSceneIdleAutosaveV1 } from '$lib/splat/scene-idle-autosave-v1.js';
	import { applySceneObjectTransformsV1, type SceneTransformTargetV1 } from '$lib/splat/scene-object-transform-readback-v1.js';
	import { renderImageRenderingV1, renderPixelRatioV1, renderQualityLabelV1, rgba8ColorTargetEstimateBytesV1 } from '$lib/splat/render-sampling-v1.js';
	import { SpatialBvhManagerV1 } from '$lib/splat/spatial-bvh-manager-v1.js';
	import { createSceneAssetLifecycleActorV1, isCurrentSceneAssetLoadV1 } from '$lib/splat/scene-asset-lifecycle-v1.js';
	import { interpolateTrianglePointV1, triangleBarycentricV1 } from '$lib/splat/surface-marker-v1.js';
	import { RetargetRuntime } from '$lib/courtroom/character-retarget-runtime-v1.js';
	import StreamedSogPlayCanvasViewer from '$lib/components/evidence/StreamedSogPlayCanvasViewer.svelte';
	import fixtureUrl from '$lib/splat/fixtures/niantic-official-degree0-5pt.spz?url';

	type Backend = 'webgpu' | 'webgl2';
	type DecodeMode = 'worker' | 'three-loader';
	type SamplingMode = 'native' | 'half' | 'retro';
	type MeshPreviewMode = 'source' | 'phong';
	type PrimitiveDetail = 'retro' | 'balanced' | 'detailed';
	type SurfaceMarkerDraft = Omit<SurfaceMarkerV1, 'meshAssetSha256'> & { meshAssetSha256?: string };
	const ANIMATION_PREVIEW_FPS = 24;
	let canvas = $state<HTMLCanvasElement>();
	let status = $state('Fixture not loaded');
	let error = $state('');
	let backend = $state<'webgpu' | 'webgl2' | 'unknown' | null>(null);
	let requestedBackend = $state<Backend | null>(null);
	let pointCount = $state(0);
	let showSyntheticSplatFixture = $state(true);
	let sourceDigest = $state('');
	let splatSourceBytes = $state(0);
	let transferStatus = $state('Not transferred');
	let pickStatus = $state('Click a splat to test picking');
	let samplingMode = $state<SamplingMode>('native');
	const RENDERER_ANTIALIAS_REQUESTED = true;
	let renderDiagnostics = $state({ quality: 'HIGH', mode: 'native', cssWidth: 0, cssHeight: 0, backingWidth: 0, backingHeight: 0, rgba8EstimateBytes: 0, antialiasRequested: RENDERER_ANTIALIAS_REQUESTED });
	let meshPreviewMode = $state<MeshPreviewMode>('source');
	let primitiveDetail = $state<PrimitiveDetail>('balanced');
	const LOCAL_PREVIEW_TRIANGLE_LIMIT = 100_000;
	const LOCAL_SHADER_SOURCE_LIMIT_BYTES = 64 * 1024;
	let shaderSourceName = $state('No local shader source indexed');
	let shaderSourceReceipt = $state('Shader files are treated as inert text; they are not compiled or uploaded.');
	let shaderSourceSha256 = $state('');
	const sourceMaterials = new Map<any, any[]>();
	let busy = $state(false);
	const sceneAssetLifecycle = createSceneAssetLifecycleActorV1();
	let sceneAssetLifecycleState = $state('idle');
	let showStreamedSog = $state(false);
	let renderer: any = null;
	let decodeClient: SpzDecodeClient | null = null;
	let controls: any = null;
	let geometry: any = null;
	let splat: any = null;
	let loadedModel = $state<any>(null);
	let editableRoot: any = null;
	let sceneObjects = $state<string[]>([]);
	let selectedObjectName = $state('');
	let loadedModelName = $state('No local Blender GLB loaded');
	let localAssetName = $state('No local 3D asset selected');
	let localAssetPath = $state('');
	let localAssetBytes = $state(0);
	let localAssetFormat = $state<'GLB' | 'OBJ' | 'FBX' | 'IMAGE_JPEG' | 'IMAGE_PNG' | 'IMAGE_GIF' | 'IMAGE_WEBP' | null>(null);
	let reliefResolution = $state(128);
	let reliefDepth = $state(0.35);
	let reliefInvert = $state(false);
	let currentReliefImageFile = $state<File | null>(null);
	let reliefRegenerationTimer = 0;
	let exportReceipt = $state('No edited GLB exported');
	let preCaseMode = $state(false);
	let returnCaseId = $state<string | null>(null);
	let meshDiagnostics = $state({ meshCount: 0, vertexCount: 0, triangleCount: 0, geometryBufferBytes: 0, textureGpuEstimateBytes: 0, boneCount: 0, boneNames: [] as string[], materialCount: 0, materialDetails: [] as string[], uvChannelCount: 0, textureCount: 0, textureNames: [] as string[], textureDetails: [] as string[] });
	let meshEditMode = $state<'translate' | 'rotate' | 'scale'>('translate');
	let meshEditStatus = $state('Open a local GLB, OBJ, or FBX to enable mesh transforms.');
	let meshTransformReceipt = $state('No local transform loaded');
	let animationNames = $state<string[]>([]);
	let selectedAnimation = $state('');
	let animationPreviewFrame = $state(0);
	let animationPoseSha256 = $state('');
	let animationPoseHashFrame = $state(-1);
	let animationPlaying = $state(false);
	let transformControls: any = null;
	let animationMixer: any = $state.raw(null);
	let animationRoot: any = null;
	let animationClips = $state<any[]>([]);
	let animationClock: any = null;
	let localCharacterFile = $state<File | null>(null);
	let retargetRuntime: RetargetRuntime | null = null;
	let retargetReady = $state(false);
	let retargetBoneNodes = new Map<string, any>();
	let retargetRestPose = new Map<string, any>();
	let retargetClipName = $state('');
	let retargetStatus = $state('Choose a rigged GLB first, then a separate motion GLB.');
	let retargetUpdatedBoneCount = $state(0);
	let retargetChangedBoneCount = $state(0);
	let sceneId = $state('');
	let caseId = $state<string | null>(null);
	let linkedEvidenceId = $state<string | null>(null);
	let linkedEvidenceRevision = $state<string | null>(null);
	let sceneRevision = $state(0);
	let sceneAssetDirty = $state(false);
	let savedCaseManifest = $state<SceneDocumentV1 | null>(null);
	let surfaceMarkers = $state<SurfaceMarkerDraft[]>([]);
	let markerLabel = $state('Hypothesis anchor');
	let placingSurfaceMarker = $state(false);
	let surfaceMarkerStatus = $state('Markers require a linked exhibit and a loaded static mesh.');
	let markerOverlayRoot: any = null;
	let markerOverlayAnchors: { visual: any; object: any; localPoint: any }[] = [];
	let sceneDirty = $state(false);
	let sceneAutoSaveStatus = $state('');
	const sceneAutoSave = createSceneIdleAutosaveV1(() => {
		if (!caseId || sceneRevision < 1 || !sceneDirty || !loadedModel) return;
		if (animationPlaying) {
			sceneAutoSaveStatus = 'Autosave waiting for animation preview to stop…';
			return;
		}
		if (busy) {
			sceneAutoSaveStatus = 'Autosave waiting for the current operation…';
			sceneAutoSave.schedule();
			return;
		}
		sceneAutoSaveStatus = 'Saving scene revision…';
		void downloadEditedGlb(true);
	});
	let parentManifestSha256: string | null = null;
	let sourceAssetSha256 = $state<string | null>(null);
	let sourceAssetBytes = 0;
	let coordinateFrame: 'GLTF_Y_UP_METERS' | 'LOCAL_UNCALIBRATED' = 'LOCAL_UNCALIBRATED';
	let manifestStatus = $state('No scene manifest exported');
	let scene: any = null;
	let camera: any = null;
	let generation = 0;
	let resizeObserver: ResizeObserver | null = null;
	let resizeFrame = 0;
	let lastViewportWidth = 0;
	let lastViewportHeight = 0;
	let three: any = null;
	let spatialBvh: SpatialBvhManagerV1 | null = null;
	let spatialBvhStatus = $state('CPU mesh picking index not built');
	let resizeViewport: (() => void) | null = null;

	function setSamplingMode(mode: SamplingMode) {
		samplingMode = mode;
		if (canvas) canvas.style.imageRendering = renderImageRenderingV1(mode);
		if (renderer) {
			renderer.setPixelRatio(renderPixelRatioV1(window.devicePixelRatio || 1, mode));
			resizeViewport?.();
		}
		refreshRenderDiagnostics();
	}

	function refreshRenderDiagnostics() {
		const target = renderer?.domElement ?? canvas;
		if (!target || !renderer) return;
		const rect = target.getBoundingClientRect();
		const backingWidth = target.width;
		const backingHeight = target.height;
		renderDiagnostics = {
			quality: renderQualityLabelV1(samplingMode),
			mode: samplingMode,
			cssWidth: Math.max(0, Math.round(rect.width)),
			cssHeight: Math.max(0, Math.round(rect.height)),
			backingWidth,
			backingHeight,
			rgba8EstimateBytes: backingWidth > 0 && backingHeight > 0 ? rgba8ColorTargetEstimateBytesV1(backingWidth, backingHeight) : 0,
			antialiasRequested: RENDERER_ANTIALIAS_REQUESTED
		};
	}

	function setMeshPreviewMode(mode: MeshPreviewMode) {
		meshPreviewMode = mode;
		if (!editableRoot || !three) return;
		editableRoot.traverse((object: any) => {
			if (!object.isMesh && !object.isSkinnedMesh) return;
			if (!sourceMaterials.has(object)) {
				const current = Array.isArray(object.material) ? object.material : [object.material];
				sourceMaterials.set(object, current.slice());
			}
			const originals = sourceMaterials.get(object) ?? [];
			const current = Array.isArray(object.material) ? object.material : [object.material];
			if (mode === 'source') {
				for (const material of current) if (!originals.includes(material)) material?.dispose?.();
				object.material = Array.isArray(object.material) ? originals : originals[0];
				return;
			}
			for (const material of current) if (!originals.includes(material)) material?.dispose?.();
			const preview = originals.map((material: any) => new three.MeshPhongMaterial({
				name: `${material?.name || 'Material'} · Phong preview`,
				color: material?.color?.clone?.() ?? new three.Color('#ffffff'),
				specular: new three.Color('#444444'),
				shininess: 24,
				map: material?.map ?? null,
				alphaMap: material?.alphaMap ?? null,
				transparent: material?.transparent ?? false,
				opacity: material?.opacity ?? 1,
				alphaTest: material?.alphaTest ?? 0,
				side: material?.side,
				vertexColors: material?.vertexColors ?? false
			}));
			object.material = Array.isArray(object.material) ? preview : preview[0];
		});
	}

	async function indexLocalShaderSource(file?: File) {
		if (!file) return;
		shaderSourceSha256 = '';
		try {
			if (!/\.(?:glsl|wgsl)$/i.test(file.name)) throw new Error('Choose a .glsl or .wgsl source file.');
			if (file.size < 1 || file.size > LOCAL_SHADER_SOURCE_LIMIT_BYTES) throw new Error(`Shader source must be 1 byte to ${LOCAL_SHADER_SOURCE_LIMIT_BYTES.toLocaleString()} bytes.`);
			const bytes = new Uint8Array(await file.arrayBuffer());
			const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			if (source.includes('\0')) throw new Error('Shader source contains a null byte and cannot be indexed as text.');
			shaderSourceName = file.name;
			shaderSourceSha256 = await sha256Hex(bytes);
			shaderSourceReceipt = `${bytes.byteLength.toLocaleString()} bytes · SHA-256 ${shaderSourceSha256} · local inventory only`;
		} catch (cause) {
			shaderSourceName = file.name;
			shaderSourceReceipt = cause instanceof Error ? cause.message : 'Shader source could not be indexed.';
		}
	}

	function toggleStreamedSog() {
		if (!showStreamedSog && blockIfUnsavedCaseScene('switch renderers')) return;
		if (!showStreamedSog) disposeScene();
		showStreamedSog = !showStreamedSog;
	}

	function blockIfUnsavedCaseScene(action: string): boolean {
		if (!caseId || !sceneDirty) return false;
		error = `Save or wait for the case scene autosave before you ${action}.`;
		return true;
	}

	function disposeScene() {
		generation++;
		if (reliefRegenerationTimer) window.clearTimeout(reliefRegenerationTimer);
		reliefRegenerationTimer = 0;
		currentReliefImageFile = null;
		if (meshPreviewMode !== 'source') setMeshPreviewMode('source');
		sourceMaterials.clear();
		meshPreviewMode = 'source';
		sceneAutoSave.cancel();
		sceneAutoSaveStatus = '';
		try { animationMixer?.stopAllAction(); } catch { /* mixer may already be stopped */ }
		try { if (animationRoot) animationMixer?.uncacheRoot(animationRoot); } catch { /* imported root may already be released */ }
		animationMixer = null;
		animationRoot = null;
		animationClips = [];
		animationNames = [];
		selectedAnimation = '';
		animationPlaying = false;
		animationClock = null;
		resetRetargetPreview();
		localCharacterFile = null;
		sceneId = '';
		sceneRevision = 0;
		sceneAssetDirty = false;
		savedCaseManifest = null;
		sceneDirty = false;
		surfaceMarkers = [];
		placingSurfaceMarker = false;
		disposeSurfaceMarkerOverlays();
		parentManifestSha256 = null;
		sourceAssetSha256 = null;
		sourceAssetBytes = 0;
		coordinateFrame = 'LOCAL_UNCALIBRATED';
		manifestStatus = 'No scene manifest exported';
		disposeMeshEditor();
		spatialBvh?.dispose();
		spatialBvh = null;
		spatialBvhStatus = 'CPU mesh picking index disposed';
		try { decodeClient?.dispose(); } catch { /* worker may already have failed */ }
		decodeClient = null;
		try { resizeObserver?.disconnect(); } catch { /* cleanup continues */ }
		resizeObserver = null;
		if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
		resizeFrame = 0;
		lastViewportWidth = 0;
		lastViewportHeight = 0;
		try { renderer?.setAnimationLoop(null); } catch { /* backend may already be lost */ }
		try { controls?.dispose(); } catch { /* controls may reference a lost canvas */ }
		controls = null;
		try { if (scene && splat) scene.remove(splat); } catch { /* scene is already being discarded */ }
		try { if (scene && editableRoot) scene.remove(editableRoot); } catch { /* scene is already being discarded */ }
		try {
			disposeObjectResources(editableRoot);
		} catch { /* imported material or GPU resource may already be released */ }
		loadedModel = null;
		editableRoot = null;
		sceneObjects = [];
		selectedObjectName = '';
		loadedModelName = 'No local 3D asset loaded';
		localAssetName = 'No local 3D asset selected';
		localAssetPath = '';
		localAssetBytes = 0;
		localAssetFormat = null;
		meshDiagnostics = { meshCount: 0, vertexCount: 0, triangleCount: 0, geometryBufferBytes: 0, textureGpuEstimateBytes: 0, boneCount: 0, boneNames: [], materialCount: 0, materialDetails: [], uvChannelCount: 0, textureCount: 0, textureNames: [], textureDetails: [] };
		meshTransformReceipt = 'No local transform loaded';
		try { geometry?.dispose(); } catch { /* continue to release other resources */ }
		geometry = null;
		try { splat?.material?.dispose?.(); } catch { /* backend may already be lost */ }
		splat = null;
		try { renderer?.dispose(); } catch { /* backend may already be lost */ }
		renderer = null;
		resizeViewport = null;
		if (canvas) canvas.style.imageRendering = '';
		scene = null;
		camera = null;
		three = null;
		backend = null;
		requestedBackend = null;
		pointCount = 0;
		sourceDigest = '';
		splatSourceBytes = 0;
		transferStatus = 'Not transferred';
		pickStatus = 'Click a splat to test picking';
	}

	function disposeObjectResources(root: any) {
		if (!root?.traverse) return;
		const geometries = new Set<any>();
		const materials = new Set<any>();
		const textures = new Set<any>();
		root.traverse((object: any) => {
			if (object.geometry) geometries.add(object.geometry);
			const objectMaterials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
			for (const material of objectMaterials) {
				materials.add(material);
				for (const value of Object.values(material)) if ((value as any)?.isTexture) textures.add(value);
			}
		});
		for (const geometry of geometries) geometry.dispose?.();
		for (const texture of textures) texture.dispose?.();
		for (const material of materials) material.dispose?.();
	}

	function cancelSceneAssetImport() {
		if (!sceneAssetLifecycle.getSnapshot().matches('loading')) return;
		sceneAssetLifecycle.send({ type: 'CANCEL' });
		busy = false;
		status = 'Import cancelled; the previously loaded scene is retained.';
	}

	function disposeMeshEditor() {
		if (!transformControls) return;
		try { transformControls.detach(); } catch { /* detached or stale model */ }
		try { scene?.remove(transformControls.getHelper()); } catch { /* scene may already be disposed */ }
		try { transformControls.dispose(); } catch { /* continue cleanup */ }
		transformControls = null;
	}

	function setMeshEditMode(mode: 'translate' | 'rotate' | 'scale') {
		meshEditMode = mode;
		transformControls?.setMode(mode);
	}

	function syncMeshTransformReceipt() {
		if (!loadedModel) return;
		const p = loadedModel.position;
		const q = loadedModel.quaternion;
		const scale = loadedModel.scale;
		meshTransformReceipt = `position ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)} · rotation ${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)}, ${q.w.toFixed(3)} · scale ${scale.x.toFixed(3)}, ${scale.y.toFixed(3)}, ${scale.z.toFixed(3)}`;
	}

	function scheduleSceneAutoSave() {
		// First case save remains an explicit action. Once a revision has been read back,
		// coalesce editor changes and commit one immutable revision after the user is idle.
		if (!caseId || sceneRevision < 1 || !sceneDirty || !loadedModel || animationPlaying) return;
		sceneAutoSaveStatus = 'Autosaving after edits stop…';
		sceneAutoSave.schedule();
	}

	async function downloadEditedGlb(automatic = false) {
		if (!editableRoot || !loadedModel || busy) return;
		sceneAutoSave.cancel();
		if (!automatic) sceneAutoSaveStatus = '';
		if (caseId && linkedEvidenceId && !linkedEvidenceRevision) {
			error = 'This exhibit has no canonical SHA-256 source revision; the scene cannot be saved as source-linked.';
			return;
		}
		busy = true;
		error = '';
		try {
			// Assign stable Atlas IDs before exporting so the GLB extras and manifest agree.
			const manifestObjects = collectSceneObjects();
			if (caseId && savedCaseManifest && !sceneAssetDirty) {
				const asset = savedCaseManifest.assets.find((candidate) => candidate.role === 'DERIVED' && candidate.format === 'GLB');
				if (!asset) throw new Error('The saved scene has no registered derived GLB to reuse.');
				const derivedAssetBytes = savedCaseManifest.assets.reduce((sum, candidate) => sum + (candidate.role === 'DERIVED' || candidate.role === 'LOD' ? candidate.bytes : 0), 0);
				const qualityReceipt = createSceneQualityReceiptV1({ derivedAssetBytes, triangleCount: countTriangles() });
				const manifest = createSceneDocumentV1({
					...savedCaseManifest,
					sceneClassification: 'SINGLE_IMAGE_HYPOTHESIS',
					revision: sceneRevision + 1,
					parentManifestSha256,
					createdAt: new Date().toISOString(),
					objects: manifestObjects.map((object) => ({ ...object, assetSha256: asset.sha256 })),
					surfaceMarkers: surfaceMarkers.map((marker) => ({ ...marker, anchorKind: 'MESH_SURFACE_HYPOTHESIS' as const, meshAssetSha256: asset.sha256 })),
					quality: qualityReceipt
				});
				const revision = await saveSceneManifestRevisionV1({
					caseId, sceneId, expectedRevision: sceneRevision, commandId: crypto.randomUUID(), manifest
				});
				sceneRevision = revision.revision;
				surfaceMarkers = surfaceMarkers.map((marker) => ({ ...marker, meshAssetSha256: asset.sha256 }));
				parentManifestSha256 = revision.manifestSha256;
				savedCaseManifest = revision.manifest;
				sceneDirty = false;
				sceneAutoSaveStatus = automatic ? `Autosaved revision ${sceneRevision}` : '';
				manifestStatus = `Case hypothesis revision ${sceneRevision} saved · verified manifest ${parentManifestSha256.slice(0, 16)}… · reused registered GLB`;
				meshEditStatus = `Scene revision saved without re-uploading its unchanged GLB · ${qualityReceipt.derivedAssetByteStatus}`;
				return;
			}
			const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
			const previewModeForExport = meshPreviewMode;
			if (previewModeForExport !== 'source') setMeshPreviewMode('source');
			let buffer: ArrayBuffer | object;
			try {
				buffer = await new GLTFExporter().parseAsync(editableRoot, { binary: true, animations: animationClips });
			} finally {
				if (previewModeForExport !== 'source') setMeshPreviewMode(previewModeForExport);
			}
			if (!(buffer instanceof ArrayBuffer)) throw new Error('The GLB exporter did not return a binary asset.');
			if (buffer.byteLength > 64 * 1024 * 1024) throw new Error('The derived GLB exceeds the 64 MiB local export limit.');
			const exportName = `${loadedModelName.split(' · ')[0].replace(/\.(glb|obj|fbx|jpe?g|png|gif|webp)$/i, '')}-edited.glb`;
			const outputHash = await sha256Hex(new Uint8Array(buffer));
			if (caseId) {
				if (!sceneId) sceneId = crypto.randomUUID();
				const qualityReceipt = createSceneQualityReceiptV1({ derivedAssetBytes: buffer.byteLength, triangleCount: countTriangles() });
				const saved = await saveSceneRevisionV1({
					caseId,
					sceneId,
					expectedRevision: sceneRevision,
					commandId: crypto.randomUUID(),
					glb: buffer,
					createManifest: (asset) => createSceneDocumentV1({
						schema: 'parent-atlas.scene-document.v1',
						sceneId,
						caseId,
						status: 'HYPOTHESIS',
						sceneClassification: 'SINGLE_IMAGE_HYPOTHESIS',
						revision: sceneRevision + 1,
						parentManifestSha256,
						createdAt: new Date().toISOString(),
						coordinateFrame,
						objects: manifestObjects.map((object) => ({ ...object, assetSha256: asset.sha256 })),
						animations: animationClips.map((clip) => ({ clipId: crypto.randomUUID(), name: clip.name || 'Unnamed animation', durationSeconds: Number(clip.duration) || 0, frameRate: null })),
						evidenceBindings: linkedEvidenceId && linkedEvidenceRevision ? [{ evidenceId: linkedEvidenceId, sourceRevision: linkedEvidenceRevision }] : [],
						surfaceMarkers: surfaceMarkers.map((marker) => ({ ...marker, anchorKind: 'MESH_SURFACE_HYPOTHESIS' as const, meshAssetSha256: asset.sha256 })),
						assets: [{ assetId: asset.assetId, format: 'GLB', sha256: asset.sha256, bytes: asset.bytes, role: 'DERIVED' }],
						quality: qualityReceipt
					})
				});
				sceneRevision = saved.revision.revision;
				sceneAssetDirty = false;
				savedCaseManifest = saved.revision.manifest;
				surfaceMarkers = surfaceMarkers.map((marker) => ({ ...marker, meshAssetSha256: saved.asset.sha256 }));
				parentManifestSha256 = saved.revision.manifestSha256;
				sceneDirty = false;
				sceneAutoSaveStatus = automatic ? `Autosaved revision ${sceneRevision}` : '';
				manifestStatus = `Case hypothesis revision ${sceneRevision} saved · verified manifest ${parentManifestSha256.slice(0, 16)}…`;
				meshEditStatus = `Derived GLB and hypothesis manifest saved · ${qualityReceipt.derivedAssetByteStatus} (${buffer.byteLength.toLocaleString()} / ${qualityReceipt.derivedAssetByteBudget.toLocaleString()} bytes)`;
				const currentUrl = new URL(window.location.href);
				currentUrl.searchParams.set('sceneId', sceneId);
				window.history.replaceState(window.history.state, '', currentUrl);
				return;
			}
			const imageHypothesis = localAssetFormat?.startsWith('IMAGE_') ?? false;
			const manifest = createSceneDocumentV1({
				schema: 'parent-atlas.scene-document.v1',
				sceneId: sceneId || crypto.randomUUID(), caseId: null, status: imageHypothesis ? 'HYPOTHESIS' : 'FIXTURE', sceneClassification: imageHypothesis ? 'SINGLE_IMAGE_HYPOTHESIS' : 'SYNTHETIC_FIXTURE', revision: sceneRevision + 1,
				parentManifestSha256, createdAt: new Date().toISOString(), coordinateFrame,
				objects: manifestObjects,
				animations: animationClips.map((clip) => ({ clipId: crypto.randomUUID(), name: clip.name || 'Unnamed animation', durationSeconds: Number(clip.duration) || 0, frameRate: null })),
				assets: [
					...(sourceDigest && splatSourceBytes > 0 ? [{ assetId: crypto.randomUUID(), format: 'SPZ' as const, sha256: sourceDigest, bytes: splatSourceBytes, role: 'SOURCE' as const }] : []),
					...(sourceAssetSha256 && localAssetFormat ? [{ assetId: crypto.randomUUID(), format: localAssetFormat, sha256: sourceAssetSha256, bytes: sourceAssetBytes, role: 'SOURCE' as const }] : []),
					{ assetId: crypto.randomUUID(), format: 'GLB', sha256: outputHash, bytes: buffer.byteLength, role: 'DERIVED' }
				],
				quality: createSceneQualityReceiptV1({ derivedAssetBytes: buffer.byteLength, triangleCount: countTriangles() })
			});
			const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
			parentManifestSha256 = await sha256Hex(new TextEncoder().encode(manifestText));
			exportReceipt = `${exportName} · ${buffer.byteLength.toLocaleString()} bytes · GLB SHA-256 ${outputHash.slice(0, 16)}…`;
			sceneRevision = manifest.revision;
			sceneId = manifest.sceneId;
			sceneDirty = false;
			const blob = new Blob([buffer], { type: 'model/gltf-binary' });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = exportName;
			anchor.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
			const manifestUrl = URL.createObjectURL(new Blob([manifestText], { type: 'application/json' }));
			const manifestAnchor = document.createElement('a');
			manifestAnchor.href = manifestUrl;
			manifestAnchor.download = `${loadedModelName.split(' · ')[0].replace(/\.(glb|obj|fbx|jpe?g|png|gif|webp)$/i, '')}-scene-r${sceneRevision}.json`;
			manifestAnchor.click();
			window.setTimeout(() => URL.revokeObjectURL(manifestUrl), 1000);
			manifestStatus = `${imageHypothesis ? 'Single-image hypothesis' : 'Fixture'} manifest revision ${sceneRevision} exported · ${manifest.quality.derivedAssetByteStatus} (${buffer.byteLength.toLocaleString()} / ${manifest.quality.derivedAssetByteBudget.toLocaleString()} bytes) · SHA-256 ${parentManifestSha256.slice(0, 16)}… · local downloads only`;
			meshEditStatus = 'Edited GLB and revisioned local manifest downloaded; source file and case records were not changed.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			meshEditStatus = 'Could not export the edited local GLB.';
			if (automatic) sceneAutoSaveStatus = 'Auto-save failed; edits remain unsaved. Use Save case scene revision to retry.';
		} finally {
			busy = false;
		}
	}

	function collectSceneObjects() {
		const nodes: any[] = [];
		editableRoot?.traverse?.((object: any) => {
			if (object === editableRoot || object.isBone || !(object.isMesh || object.isSkinnedMesh || object.isGroup)) return;
			if (!object.userData.atlasObjectId) object.userData.atlasObjectId = crypto.randomUUID();
			nodes.push(object);
		});
		const included = new Set(nodes);
		return nodes.map((object, index) => {
			const geometry = object.geometry;
			const indexCount = geometry?.index?.count ?? geometry?.getAttribute?.('position')?.count ?? 0;
			const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
			const textureCount = materials.reduce((sum: number, material: any) => sum + Object.values(material).filter((value: any) => value?.isTexture).length, 0);
			const position = object.position;
			const quaternion = object.quaternion;
			const scale = object.scale;
			return {
				objectId: object.userData.atlasObjectId,
				parentObjectId: included.has(object.parent) ? object.parent.userData.atlasObjectId : null,
				name: object.name || `${object.isGroup ? 'Group' : 'Mesh'} ${index + 1}`,
				kind: object.isMesh || object.isSkinnedMesh ? 'MESH' : 'GROUP', assetSha256: null,
				transform: { translation: [position.x, position.y, position.z], rotationXyzw: [quaternion.x, quaternion.y, quaternion.z, quaternion.w], scale: [scale.x, scale.y, scale.z] },
				geometry: geometry ? { meshCount: 1, vertexCount: geometry.getAttribute?.('position')?.count ?? 0, triangleCount: Math.floor(indexCount / 3), textureCount, boneCount: object.skeleton?.bones?.length ?? 0 } : null
			};
		});
	}

	function countTriangles() {
		return collectSceneObjects().reduce((sum, object) => sum + (object.geometry?.triangleCount ?? 0), 0);
	}

	function disposeSurfaceMarkerOverlays() {
		try { if (markerOverlayRoot && scene) scene.remove(markerOverlayRoot); } catch { /* renderer may already be disposed */ }
		markerOverlayRoot?.traverse?.((object: any) => {
			object.geometry?.dispose?.();
			object.material?.dispose?.();
		});
		markerOverlayRoot = null;
		markerOverlayAnchors = [];
	}

	function findMarkerMesh(objectId: string) {
		let found: any = null;
		editableRoot?.traverse?.((object: any) => {
			if (!found && (object.isMesh || object.isSkinnedMesh) && object.userData.atlasObjectId === objectId) found = object;
		});
		return found;
	}

	function readTriangle(mesh: any, triangleIndex: number) {
		const positions = mesh.geometry?.getAttribute?.('position');
		if (!positions || !Number.isInteger(triangleIndex) || triangleIndex < 0) throw new Error('Surface marker target triangle is unavailable.');
		const index = mesh.geometry.index;
		const vertexIndices = [0, 1, 2].map((corner) => index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner);
		if (vertexIndices.some((vertex) => vertex >= positions.count)) throw new Error('Surface marker triangle index is outside the mesh geometry.');
		return vertexIndices.map((vertex) => [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)] as const) as [[number, number, number], [number, number, number], [number, number, number]];
	}

	function refreshSurfaceMarkerOverlays() {
		disposeSurfaceMarkerOverlays();
		if (!scene || !three || !editableRoot || !surfaceMarkers.length) return;
		markerOverlayRoot = new three.Group();
		markerOverlayRoot.name = 'Atlas mesh-relative marker overlays';
		scene.add(markerOverlayRoot);
		for (const marker of surfaceMarkers) {
			if (marker.sourceRevision !== linkedEvidenceRevision || (marker.meshAssetSha256 && marker.meshAssetSha256 !== sourceAssetSha256)) continue;
			const object = findMarkerMesh(marker.meshObjectId);
			if (!object || object.isSkinnedMesh || object.skeleton?.bones?.length) continue;
			try {
				const [a, b, c] = readTriangle(object, marker.triangleIndex);
				const point = interpolateTrianglePointV1(a, b, c, marker.barycentric);
				const position = new three.Vector3(...point);
				const normal = new three.Vector3(...b).sub(new three.Vector3(...a)).cross(new three.Vector3(...c).sub(new three.Vector3(...a))).normalize();
				position.addScaledVector(normal, 0.006);
				const visual = new three.Mesh(new three.OctahedronGeometry(0.025, 0), new three.MeshBasicMaterial({ color: '#f4c95d', depthWrite: false, toneMapped: false }));
				visual.name = `surface-marker:${marker.markerId}`;
				markerOverlayRoot.add(visual);
				markerOverlayAnchors.push({ visual, object, localPoint: position });
			} catch {
				// Invalid/stale anchors remain in the manifest but are not projected onto a different surface.
			}
		}
		updateSurfaceMarkerOverlays();
	}

	function updateSurfaceMarkerOverlays() {
		for (const anchor of markerOverlayAnchors) {
			anchor.object.updateWorldMatrix(true, false);
			anchor.visual.position.copy(anchor.object.localToWorld(anchor.localPoint.clone()));
		}
	}

	function removeSurfaceMarker(markerId: string) {
		surfaceMarkers = surfaceMarkers.filter((marker) => marker.markerId !== markerId);
		sceneDirty = true;
		scheduleSceneAutoSave();
		refreshSurfaceMarkerOverlays();
	}

	function placeSurfaceMarker(event: MouseEvent, pointer: any, raycaster: any): boolean {
		if (!placingSurfaceMarker) return false;
		if (!caseId || !linkedEvidenceId || !linkedEvidenceRevision || !editableRoot || animationPlaying) {
			surfaceMarkerStatus = 'Placement needs a case, revision-qualified exhibit, and a stopped static mesh.';
			return true;
		}
		collectSceneObjects();
		raycaster.setFromCamera(pointer, camera);
		const intersections = spatialBvh?.raycast(raycaster) ?? raycaster.intersectObject(editableRoot, true);
		const hit = intersections.find((intersection: any) => intersection.object?.isMesh && !intersection.object?.isSkinnedMesh && !intersection.object?.skeleton?.bones?.length && Number.isInteger(intersection.faceIndex));
		if (!hit) {
			surfaceMarkerStatus = 'No static mesh triangle was hit. Skinned or non-mesh geometry cannot anchor this marker.';
			return true;
		}
		const mesh = hit.object;
		const [a, b, c] = readTriangle(mesh, hit.faceIndex);
		const localHit = mesh.worldToLocal(hit.point.clone());
		const barycentric = triangleBarycentricV1([localHit.x, localHit.y, localHit.z], a, b, c);
		const label = markerLabel.trim().slice(0, 200) || `Hypothesis anchor ${surfaceMarkers.length + 1}`;
		const marker: SurfaceMarkerDraft = {
			markerId: crypto.randomUUID(), evidenceId: linkedEvidenceId, sourceRevision: linkedEvidenceRevision,
			anchorKind: 'MESH_SURFACE_HYPOTHESIS',
			meshObjectId: mesh.userData.atlasObjectId, triangleIndex: hit.faceIndex, barycentric, label
		};
		surfaceMarkers = [...surfaceMarkers, marker];
		placingSurfaceMarker = false;
		sceneDirty = true;
		scheduleSceneAutoSave();
		surfaceMarkerStatus = `Placed “${label}” on ${mesh.name || 'mesh'} · mesh-relative hypothesis anchor; not survey-calibrated.`;
		refreshSurfaceMarkerOverlays();
		return true;
	}

	function playSelectedAnimation() {
		if (!animationMixer || !selectedAnimation) return;
		animationMixer.stopAllAction();
		const clip = animationClips.find((candidate) => candidate.name === selectedAnimation);
		if (!clip) return;
		animationMixer.clipAction(clip).reset().play();
		animationPlaying = true;
		animationPoseSha256 = '';
		animationPoseHashFrame = -1;
		meshEditStatus = `Previewing “${clip.name}” locally. Playback is illustrative and is not evidence chronology.`;
	}

	async function seekAnimationPreviewFrame(frameValue: number) {
		if (!animationMixer || !selectedAnimation) return;
		const clip = animationClips.find((candidate) => candidate.name === selectedAnimation);
		if (!clip) return;
		const maxFrame = Math.max(0, Math.ceil((Number(clip.duration) || 0) * ANIMATION_PREVIEW_FPS));
		const frame = Math.min(maxFrame, Math.max(0, Math.round(frameValue)));
		animationMixer.stopAllAction();
		const action = animationMixer.clipAction(clip).reset().play();
		animationMixer.setTime(frame / ANIMATION_PREVIEW_FPS);
		action.paused = true;
		animationPlaying = false;
		animationPreviewFrame = frame;
		editableRoot?.updateMatrixWorld(true);
		const transforms: Array<{ type: string; name: string; position: number[]; quaternion: number[]; scale: number[] }> = [];
		editableRoot?.traverse((object: any) => {
			const fixed = (values: number[]) => values.map((value) => Number(value.toFixed(6)));
			transforms.push({ type: object.type, name: object.name || '', position: fixed(object.position.toArray()), quaternion: fixed(object.quaternion.toArray()), scale: fixed(object.scale.toArray()) });
		});
		const poseBytes = new TextEncoder().encode(JSON.stringify({ clip: clip.name, fps: ANIMATION_PREVIEW_FPS, transforms }));
		const poseDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', poseBytes));
		animationPoseSha256 = Array.from(poseDigest, (value) => value.toString(16).padStart(2, '0')).join('');
		animationPoseHashFrame = frame;
		meshEditStatus = `Local pose “${clip.name}” · frame ${frame}/${maxFrame} · sampled at ${ANIMATION_PREVIEW_FPS} fps; no scene edit or save.`;
	}

	function frameEditableScene() {
		if (!editableRoot || !camera || !controls || !three) return;
		const bounds = new three.Box3().setFromObject(editableRoot);
		if (bounds.isEmpty()) return;
		const center = bounds.getCenter(new three.Vector3());
		const radius = Math.max(bounds.getBoundingSphere(new three.Sphere()).radius, 0.05);
		const direction = camera.position.clone().sub(controls.target).normalize();
		if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
		const distance = radius / Math.tan(three.MathUtils.degToRad(camera.fov / 2)) * 1.25;
		camera.position.copy(center).addScaledVector(direction, distance);
		camera.near = Math.max(0.001, distance / 1000);
		camera.far = Math.max(100, distance * 20);
		camera.updateProjectionMatrix();
		controls.target.copy(center);
		controls.update();
		meshEditStatus = 'Framed the local mesh only; camera view changed without editing scene data.';
	}

	function setSyntheticSplatFixtureVisible(visible: boolean) {
		showSyntheticSplatFixture = visible;
		if (splat) splat.visible = visible;
	}

	function stopAnimation() {
		animationMixer?.stopAllAction();
		resetRetargetPose();
		animationPlaying = false;
		animationPreviewFrame = 0;
		animationPoseSha256 = '';
		animationPoseHashFrame = -1;
		if (retargetRuntime) {
			retargetStatus = `Stopped ${retargetClipName} · character rest pose restored`;
		} else if (selectedAnimation) {
			meshEditStatus = `Stopped “${selectedAnimation}” · local preview returned to the imported rest pose.`;
		}
		scheduleSceneAutoSave();
	}

	function resetRetargetPose() {
		retargetRuntime?.stop();
		for (const [name, bone] of retargetBoneNodes) {
			const rest = retargetRestPose.get(name);
			if (rest) bone.quaternion.copy(rest);
		}
		retargetUpdatedBoneCount = 0;
		retargetChangedBoneCount = 0;
		if (editableRoot) editableRoot.updateMatrixWorld(true);
		spatialBvh?.refit();
	}

	function resetRetargetPreview() {
		resetRetargetPose();
		retargetRuntime = null;
		retargetReady = false;
		retargetBoneNodes.clear();
		retargetRestPose.clear();
		retargetClipName = '';
		retargetStatus = 'Choose a rigged GLB first, then a separate motion GLB.';
	}

	async function loadRetargetMotion(file: File | undefined) {
		if (!file) return;
		if (!preCaseMode) {
			error = 'Separate motion retargeting is available in the pre-case local test only.';
			return;
		}
		if (!localCharacterFile || localAssetFormat !== 'GLB' || !editableRoot) {
			error = 'Open a rigged GLB character before selecting a separate motion GLB.';
			return;
		}
		if (file.size < 20 || file.size > 64 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.glb')) {
			error = 'Choose a .glb motion file between 20 bytes and 64 MiB.';
			return;
		}
		busy = true;
		error = '';
		resetRetargetPreview();
		try {
			const targetFile = localCharacterFile;
			const runtime = new RetargetRuntime(async (url) => {
				const source = url === 'local-character' ? targetFile : file;
				return { ok: true, arrayBuffer: () => source.arrayBuffer() };
			});
			if (!(await runtime.init('local-character'))) throw new Error('The selected character GLB has no supported J_Bip humanoid root.');
			const result = await runtime.addClip('external-motion', 'local-motion');
			retargetBoneNodes = new Map();
			retargetRestPose = new Map();
			editableRoot.traverse((object: any) => {
				if (object.isBone && object.name && !retargetBoneNodes.has(object.name)) {
					retargetBoneNodes.set(object.name, object);
					retargetRestPose.set(object.name, object.quaternion.clone());
				}
			});
			retargetRuntime = runtime;
			retargetReady = true;
			retargetClipName = file.name;
			retargetStatus = `Loaded ${file.name} · ${result.mapped} bones mapped · local preview only`;
			meshEditStatus = `Mapped ${result.mapped} motion bones onto the local character. Playback is illustrative and not evidence chronology.`;
		} catch (cause) {
			resetRetargetPreview();
			error = cause instanceof Error ? cause.message : String(cause);
			retargetStatus = 'Motion clip was not loaded; the character pose is unchanged.';
		} finally {
			busy = false;
		}
	}

	function playRetargetMotion() {
		if (!retargetRuntime || !retargetRuntime.play('external-motion', performance.now(), true)) return;
		animationMixer?.stopAllAction();
		animationPlaying = true;
		retargetStatus = `Playing ${retargetClipName} · mapped humanoid pose`;
	}

	function applyRetargetFrame(nowMs: number) {
		const pose = retargetRuntime?.frame(nowMs);
		if (!pose) return;
		let updated = 0;
		let changed = 0;
		for (const [name, rotation] of Object.entries(pose)) {
			const bone = retargetBoneNodes.get(name);
			if (!bone) continue;
			bone.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
			const rest = retargetRestPose.get(name);
			if (rest && bone.quaternion.angleTo(rest) > 1e-4) changed++;
			updated++;
		}
		retargetUpdatedBoneCount = updated;
		retargetChangedBoneCount = changed;
		editableRoot?.updateMatrixWorld(true);
		spatialBvh?.refit();
	}

	function disposeEditableRoot() {
		resetRetargetPreview();
		localCharacterFile = null;
		if (!editableRoot) return;
		if (meshPreviewMode !== 'source') setMeshPreviewMode('source');
		spatialBvh?.dispose();
		spatialBvh = null;
		try { animationMixer?.stopAllAction(); } catch { /* no active actions */ }
		try { if (animationRoot) animationMixer?.uncacheRoot(animationRoot); } catch { /* old asset may be detached */ }
		animationMixer = null;
		animationRoot = null;
		animationClips = [];
		animationNames = [];
		selectedAnimation = '';
		animationPlaying = false;
		transformControls?.detach();
		scene?.remove(editableRoot);
		disposeObjectResources(editableRoot);
		sourceMaterials.clear();
		editableRoot = null;
		loadedModel = null;
		sceneObjects = [];
		selectedObjectName = '';
	}

	function ensureEditableRoot(name = 'Atlas editable scene') {
		if (!editableRoot) {
			editableRoot = new three.Group();
			editableRoot.name = name;
			sceneId = crypto.randomUUID();
			scene.add(editableRoot);
		}
		return editableRoot;
	}

	function attachTransformControls(object: any) {
		if (!transformControls) {
			const { TransformControls } = transformControlsModule;
			transformControls = new TransformControls(camera, renderer.domElement);
			transformControls.addEventListener('dragging-changed', (event: { value: boolean }) => {
				if (controls) controls.enabled = !event.value;
				if (!event.value && sceneId) {
					sceneDirty = true;
					manifestStatus = `Unsaved local scene edit · next export revision ${sceneRevision + 1}`;
					scheduleSceneAutoSave();
				}
			});
			transformControls.addEventListener('objectChange', () => {
				syncMeshTransformReceipt();
				spatialBvh?.refit();
			});
			scene.add(transformControls.getHelper());
		}
		transformControls.setMode(meshEditMode);
		transformControls.attach(object);
		loadedModel = object;
		selectedObjectName = object.name;
		syncMeshTransformReceipt();
	}

	let transformControlsModule: any = null;

	function refreshSceneObjects(preferredName?: string) {
		const objects: any[] = [];
		const names = new Set<string>();
		editableRoot?.traverse?.((object: any) => {
			if (object !== editableRoot && (object.isMesh || object.isSkinnedMesh)) {
				const base = object.name || `Mesh ${objects.length + 1}`;
				let unique = base;
				let suffix = 2;
				while (names.has(unique)) unique = `${base} (${suffix++})`;
				object.name = unique;
			if (!object.userData.atlasObjectId) object.userData.atlasObjectId = crypto.randomUUID();
				names.add(unique);
				objects.push(object);
			}
		});
		sceneObjects = objects.map((object) => object.name);
		const textureSet = new Set<any>();
		const materialSet = new Set<any>();
		const uvChannels = new Set<string>();
		let vertexCount = 0;
		let triangleCount = 0;
		let geometryBufferBytes = 0;
		const skeletons = new Set<any>();
		const boneNames = new Set<string>();
		for (const object of objects) {
			const geometry = object.geometry;
			const positions = geometry?.getAttribute?.('position');
			vertexCount += positions?.count ?? 0;
			triangleCount += Math.floor((geometry?.index?.count ?? positions?.count ?? 0) / 3);
			for (const attribute of Object.values(geometry?.attributes ?? {}) as any[]) geometryBufferBytes += attribute?.array?.byteLength ?? 0;
			geometryBufferBytes += geometry?.index?.array?.byteLength ?? 0;
			const bones = object.skeleton?.bones ?? [];
			if (object.skeleton) skeletons.add(object.skeleton);
			for (const bone of bones) boneNames.add(bone.name || '(unnamed bone)');
			for (const attributeName of Object.keys(geometry?.attributes ?? {})) {
				if (/^uv\d*$/.test(attributeName)) uvChannels.add(`${object.userData.atlasObjectId}:${attributeName}`);
			}
			const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
			for (const material of materials) {
				materialSet.add(material);
				for (const value of Object.values(material)) if ((value as any)?.isTexture) textureSet.add(value);
			}
		}
		const boneCount = [...skeletons].reduce((sum, skeleton) => sum + (skeleton.bones?.length ?? 0), 0);
		const materialDetails = [...materialSet].map((material: any) => {
			const color = material.color?.isColor && typeof material.color.getHexString === 'function' ? `#${material.color.getHexString()}` : 'n/a';
			const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'n/a';
			const mapNames = Object.entries(material).filter(([, value]) => (value as any)?.isTexture).map(([key]) => key);
			return `${material.name || '(unnamed material)'} · ${material.type || 'unknown material type'} · base ${color} · metalness ${numeric(material.metalness)} · roughness ${numeric(material.roughness)} · maps ${mapNames.length ? mapNames.join(', ') : 'none'}`;
		});
		const textureDetails = [...textureSet].map((texture: any, index) => {
			const image = texture.image ?? texture.source?.data;
			const name = texture.name || image?.name || `Texture ${index + 1}`;
			const width = Number(image?.width ?? image?.videoWidth ?? image?.naturalWidth);
			const height = Number(image?.height ?? image?.videoHeight ?? image?.naturalHeight);
			const uri = typeof image?.currentSrc === 'string' ? image.currentSrc : typeof image?.src === 'string' ? image.src : '';
			// Browser object URLs do not expose the original file path. Only show a
			// safe relative URI; never put a machine-specific absolute path in UI.
			const safeRelativePath = uri && !/^(?:data:|blob:|https?:|file:|\/|[a-z]:[\\/])/i.test(uri) && !uri.split(/[\\/]/).includes('..')
				? uri.split(/[?#]/, 1)[0]
				: '';
			const filePath = safeRelativePath || image?.dataset?.filePath || (uri.startsWith('data:') || uri.startsWith('blob:') ? '(embedded in source asset)' : '(embedded or in memory)');
			return `${name}${width > 0 && height > 0 ? ` · ${width}×${height}` : ''} · file_path: ${filePath}`;
		});
		const textureGpuEstimateBytes = [...textureSet].reduce((sum, texture: any) => {
			const image = texture.image ?? texture.source?.data;
			const width = Number(image?.width ?? image?.videoWidth ?? image?.naturalWidth);
			const height = Number(image?.height ?? image?.videoHeight ?? image?.naturalHeight);
			return width > 0 && height > 0 ? sum + Math.ceil(width * height * 4 * (texture.generateMipmaps === false ? 1 : 4 / 3)) : sum;
		}, 0);
		meshDiagnostics = {
			meshCount: objects.length,
			vertexCount,
			triangleCount,
			geometryBufferBytes,
			textureGpuEstimateBytes,
			boneCount,
			boneNames: [...boneNames],
			materialCount: materialSet.size,
			materialDetails,
			uvChannelCount: uvChannels.size,
			textureCount: textureSet.size,
			textureNames: [...textureSet].map((texture: any, index) => texture.name || texture.image?.name || `Texture ${index + 1}`),
			textureDetails
		};
		spatialBvh?.dispose();
		spatialBvh = editableRoot ? new SpatialBvhManagerV1() : null;
		const bvhInventory = editableRoot && spatialBvh ? spatialBvh.build(editableRoot) : null;
		spatialBvhStatus = bvhInventory
			? `CPU BVH picking · ${bvhInventory.staticMeshCount} static · ${bvhInventory.skinnedMeshCount} skinned · ${bvhInventory.indexedTriangleCount.toLocaleString()} triangles · TLAS ${bvhInventory.tlasBuilt ? 'ready' : 'unavailable'}`
			: 'CPU mesh picking index not built';
		const chosen = objects.find((object) => object.name === preferredName) ?? objects[0];
		if (meshPreviewMode !== 'source') setMeshPreviewMode(meshPreviewMode);
		if (chosen) attachTransformControls(chosen);
	}

	function selectSceneObject(name: string) {
		let selected: any = null;
		editableRoot?.traverse?.((object: any) => { if (!selected && object.name === name) selected = object; });
		if (selected) attachTransformControls(selected);
	}

	async function addPrimitive(kind: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus') {
		if (!scene && !busy) await loadFixture('webgpu', 'worker');
		if (!scene || !three || busy) return;
		const used = sceneObjects.filter((name) => name.startsWith(`Evidence ${kind}`)).length;
		const name = `Evidence ${kind} ${used + 1}`;
		const detail = primitiveDetail === 'retro' ? { radial: 8, height: 6, tube: 6 } : primitiveDetail === 'detailed' ? { radial: 32, height: 20, tube: 12 } : { radial: 16, height: 10, tube: 10 };
		const geometries: Record<string, any> = {
			box: () => new three.BoxGeometry(0.5, 0.5, 0.5),
			sphere: () => new three.SphereGeometry(0.3, detail.radial, detail.height),
			cylinder: () => new three.CylinderGeometry(0.25, 0.25, 0.6, detail.radial),
			cone: () => new three.ConeGeometry(0.3, 0.65, detail.radial),
			torus: () => new three.TorusGeometry(0.3, 0.08, detail.tube, detail.radial * 2)
		};
		const primitiveGeometry = geometries[kind]();
		const primitiveTriangles = Math.floor((primitiveGeometry.index?.count ?? primitiveGeometry.getAttribute('position')?.count ?? 0) / 3);
		if (countTriangles() + primitiveTriangles > LOCAL_PREVIEW_TRIANGLE_LIMIT) {
			primitiveGeometry.dispose();
			error = `Local preview is limited to ${LOCAL_PREVIEW_TRIANGLE_LIMIT.toLocaleString()} triangles. Reduce or remove geometry before adding another primitive.`;
			return;
		}
		const object = new three.Mesh(primitiveGeometry, new three.MeshStandardMaterial({ color: '#d8b14d', metalness: 0.25, roughness: 0.55 }));
		object.name = name;
		object.position.set((used % 4) * 0.8 - 1.2, Math.floor(used / 4) * 0.7, 0);
		ensureEditableRoot('Synthetic evidence scene').add(object);
		refreshSceneObjects(name);
		loadedModelName = 'synthetic-playground · local only';
		meshEditStatus = `${sceneObjects.length} editable object(s); transforms are local and export creates a new GLB copy.`;
		sceneAssetDirty = true;
		sceneDirty = true;
		scheduleSceneAutoSave();
		status = 'Synthetic mesh playground. No case assets or records are loaded.';
	}

	async function loadFixture(requestedMode: Backend, decodeMode: DecodeMode = 'worker') {
		if (!canvas || busy) return;
		if (blockIfUnsavedCaseScene('replace the scene')) return;
		busy = true;
		error = '';
		status = requestedMode === 'webgpu' ? 'Starting WebGPU renderer…' : 'Starting WebGL2 fallback…';
		disposeScene();
		requestedBackend = requestedMode;
		const thisGeneration = generation;
		try {
			const THREE = await import('three/webgpu');
			three = THREE;
		const [{ GaussianSplat }, { OrbitControls }, transformModule] = await Promise.all([
				import('three/addons/objects/GaussianSplat.js'),
				import('three/addons/controls/OrbitControls.js'),
				import('three/addons/controls/TransformControls.js')
			]);
			transformControlsModule = transformModule;
			if (thisGeneration !== generation) return;

			renderer = new THREE.WebGPURenderer({ canvas, antialias: RENDERER_ANTIALIAS_REQUESTED, forceWebGL: requestedMode === 'webgl2' });
			await renderer.init();
			if (thisGeneration !== generation) { renderer.dispose(); renderer = null; return; }
			renderer.setPixelRatio(renderPixelRatioV1(window.devicePixelRatio || 1, samplingMode));
			scene = new THREE.Scene();
			scene.background = new THREE.Color('#0b101b');
			scene.add(new THREE.HemisphereLight('#fff3d8', '#293348', 1.8));
			const sceneKeyLight = new THREE.DirectionalLight('#fff8e8', 2.2);
			sceneKeyLight.position.set(3, 4, 6);
			scene.add(sceneKeyLight);
			camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
			const bytes = await fetch(fixtureUrl).then(async (response) => {
				if (!response.ok) throw new Error(`Fixture request failed (${response.status})`);
				return response.arrayBuffer();
			});
			if (thisGeneration !== generation) return;
			splatSourceBytes = bytes.byteLength;
			if (decodeMode === 'worker') {
				decodeClient = createSpzDecodeClient();
				const decodeJob = decodeClient.decode(bytes);
				transferStatus = bytes.byteLength === 0 ? 'Input ArrayBuffer transferred and detached' : 'Input transfer did not detach';
				const decoded = await decodeJob.result;
				if (thisGeneration !== generation) return;
				sourceDigest = decoded.sourceSha256;
				geometry = workerPayloadToGaussianGeometry(decoded);
				decodeClient.dispose();
				decodeClient = null;
			} else {
				const { SPZLoader } = await import('three/addons/loaders/SPZLoader.js');
				geometry = await new SPZLoader().parse(bytes);
				sourceDigest = await sha256Hex(new Uint8Array(bytes));
				transferStatus = 'Three.js loader path; no worker transfer';
			}
			if (thisGeneration !== generation) { geometry.dispose(); geometry = null; return; }
			splat = new GaussianSplat(geometry, { autoSort: true });
			splat.name = 'Synthetic SPZ fixture';
			scene.add(splat);
			geometry.computeBoundingSphere();
			const bounds = geometry.boundingSphere;
			const center = bounds?.center ?? new THREE.Vector3();
			const radius = Math.max(bounds?.radius ?? 1, 0.1);
			camera.position.set(center.x + radius * 0.15, center.y + radius * 0.1, center.z + radius * 6);
			camera.lookAt(center);
			controls = new OrbitControls(camera, renderer.domElement);
			controls.target.copy(center);
			controls.enableDamping = true;
			controls.update();
			animationClock = new THREE.Clock();
			resizeViewport = () => {
				if (!renderer || !camera || !canvas) return;
				const rect = canvas.getBoundingClientRect();
				const width = Math.max(1, Math.floor(rect.width));
				const height = Math.max(1, Math.floor(rect.height));
				if (width === lastViewportWidth && height === lastViewportHeight) { refreshRenderDiagnostics(); return; }
				lastViewportWidth = width;
				lastViewportHeight = height;
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
				renderer.setSize(width, height, false);
				refreshRenderDiagnostics();
			};
			if (canvas) canvas.style.imageRendering = samplingMode === 'retro' ? 'pixelated' : '';
			resizeObserver = new ResizeObserver(() => {
				if (resizeFrame) return;
				resizeFrame = window.requestAnimationFrame(() => {
					resizeFrame = 0;
					resizeViewport?.();
				});
			});
			resizeObserver.observe(canvas.parentElement ?? canvas);
			resizeViewport();
			renderer.setAnimationLoop(() => {
				controls?.update();
				if (animationPlaying && animationMixer && animationClock) {
					animationMixer.update(animationClock.getDelta());
					spatialBvh?.refit();
				}
				if (animationPlaying && retargetRuntime) applyRetargetFrame(performance.now());
				updateSurfaceMarkerOverlays();
				renderer?.render(scene, camera);
			});
			pointCount = geometry.getAttribute('position')?.count ?? 0;
			backend = renderer.backend?.isWebGLBackend ? 'webgl2' : renderer.backend?.isWebGPUBackend ? 'webgpu' : 'unknown';
			status = `Synthetic SPZ v4 loaded · ${decodeMode === 'worker' ? 'worker decode' : 'Three.js loader'} · automatic sort enabled · ${backend} backend`;
			pickStatus = 'Click a splat to test picking';
		} catch (cause) {
			if (thisGeneration === generation) {
				error = cause instanceof Error ? cause.message : String(cause);
				status = 'Renderer or fixture unavailable';
				disposeScene();
			}
		} finally {
			busy = false;
		}
	}

	async function loadLocalBlenderGlb(file: File | undefined) {
		if (!file) return;
		if (blockIfUnsavedCaseScene('replace the scene')) return;
		const extension = file.name.split('.').pop()?.toLowerCase();
		if (!['glb', 'obj', 'fbx'].includes(extension ?? '') || file.size < 20 || file.size > 64 * 1024 * 1024) {
			error = 'Choose a .glb, .obj, or .fbx file between 20 bytes and 64 MiB.';
			return;
		}
		if (caseId && extension !== 'glb') {
			error = 'Case scene saving currently accepts GLB only. Use pre-case local test for OBJ or FBX conversion.';
			return;
		}
		if (!renderer && !busy) await loadFixture('webgpu', 'worker');
		if (!renderer || !scene || !camera || busy) {
			error = 'The Three.js viewer is not ready; load the synthetic fixture first.';
			return;
		}
		sceneAssetLifecycle.send({ type: 'LOAD', assetName: file.name });
		const loadGeneration = sceneAssetLifecycle.getSnapshot().context.generation;
		const isCurrent = () => isCurrentSceneAssetLoadV1(sceneAssetLifecycle, loadGeneration);
		busy = true;
		error = '';
		let importedRoot: any = null;
		let attachedToScene = false;
		try {
			transformControlsModule = await import('three/addons/controls/TransformControls.js');
			if (!isCurrent()) return;
			const buffer = await file.arrayBuffer();
			if (!isCurrent()) return;
			let importedAnimations: any[] = [];
			if (extension === 'glb') {
				const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
				if (!isCurrent()) return;
				const gltf = await new Promise<any>((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
				importedRoot = gltf.scene;
				importedAnimations = Array.isArray(gltf.animations) ? gltf.animations : [];
			} else if (extension === 'obj') {
				const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
				importedRoot = new OBJLoader().parse(new TextDecoder().decode(buffer));
			} else {
				const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
				const fbx = new FBXLoader().parse(buffer, '');
				importedRoot = fbx;
				importedAnimations = Array.isArray(fbx.animations) ? fbx.animations : [];
			}
			if (!isCurrent()) {
				disposeObjectResources(importedRoot);
				importedRoot = null;
				return;
			}
			const bounds = new three.Box3().setFromObject(importedRoot);
			if (bounds.isEmpty()) throw new Error(`The ${extension.toUpperCase()} contains no visible mesh bounds.`);
			const digest = await sha256Hex(new Uint8Array(buffer));
			if (!isCurrent()) {
				disposeObjectResources(importedRoot);
				importedRoot = null;
				return;
			}
			disposeEditableRoot();
			localCharacterFile = extension === 'glb' ? file : null;
			resetRetargetPreview();
			editableRoot = new three.Group();
			editableRoot.name = file.name.replace(/\.(glb|obj|fbx)$/i, '') || 'Imported local scene';
			sceneId = crypto.randomUUID();
			sceneRevision = 0;
			sceneAssetDirty = true;
			savedCaseManifest = null;
			parentManifestSha256 = null;
			sourceAssetSha256 = digest;
			sourceAssetBytes = buffer.byteLength;
			coordinateFrame = extension === 'glb' ? 'GLTF_Y_UP_METERS' : 'LOCAL_UNCALIBRATED';
			sceneDirty = false;
			surfaceMarkers = [];
			refreshSurfaceMarkerOverlays();
			editableRoot.add(importedRoot);
			scene.add(editableRoot);
			attachedToScene = true;
			const fullSceneBounds = bounds.clone();
			if (splat?.geometry) {
				if (!splat.geometry.boundingBox) splat.geometry.computeBoundingBox();
				const splatBounds = new three.Box3().setFromObject(splat);
				if (!splatBounds.isEmpty()) fullSceneBounds.union(splatBounds);
			}
			animationClips = importedAnimations;
			animationNames = animationClips.map((clip) => clip.name || `Animation ${animationClips.indexOf(clip) + 1}`);
			selectedAnimation = animationNames[0] ?? '';
			animationRoot = importedRoot;
			animationMixer = animationClips.length ? new three.AnimationMixer(importedRoot) : null;
			animationClock?.start();
			refreshSceneObjects();
			const center = fullSceneBounds.getCenter(new three.Vector3());
			const radius = Math.max(fullSceneBounds.getBoundingSphere(new three.Sphere()).radius, 0.1);
			camera.position.set(center.x + radius * 0.2, center.y + radius * 0.2, center.z + radius * 3.2);
			camera.lookAt(center);
			controls.target.copy(center);
			controls.update();
			loadedModelName = `${file.name} · local preview only`;
			localAssetName = file.name;
			localAssetPath = file.webkitRelativePath || file.name;
			localAssetBytes = file.size;
			localAssetFormat = extension.toUpperCase() as 'GLB' | 'OBJ' | 'FBX';
			currentReliefImageFile = null;
			if (splat) splat.visible = showSyntheticSplatFixture;
			syncMeshTransformReceipt();
			meshEditStatus = `Imported ${extension.toUpperCase()} with ${sceneObjects.length} editable mesh object(s); select a mesh or use the gizmo. Export creates a new local GLB copy.`;
			status = `${extension.toUpperCase()} loaded into the local Three.js editor; transforms are local and not linked to case evidence.`;
			exportReceipt = 'No edited GLB exported';
			manifestStatus = 'No scene manifest exported';
			sceneAssetLifecycle.send({ type: 'READY', generation: loadGeneration });
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			if (importedRoot && !attachedToScene) disposeObjectResources(importedRoot);
			if (isCurrent()) {
				sceneAssetLifecycle.send({ type: 'FAIL', generation: loadGeneration, error: message });
				error = message;
			}
		} finally {
			if (sceneAssetLifecycle.getSnapshot().context.generation === loadGeneration) busy = false;
		}
	}

	async function loadLocalImageRelief(file: File | undefined) {
		if (!file) return;
		if (!preCaseMode) {
			error = 'Image-to-relief conversion is available in the pre-case local test only.';
			return;
		}
		if (blockIfUnsavedCaseScene('replace the scene')) return;
		const mime = file.type.toLowerCase();
		const extension = file.name.split('.').pop()?.toLowerCase();
		const format = ({ 'image/jpeg': 'IMAGE_JPEG', 'image/png': 'IMAGE_PNG', 'image/gif': 'IMAGE_GIF', 'image/webp': 'IMAGE_WEBP' } as const)[mime]
			?? ({ jpg: 'IMAGE_JPEG', jpeg: 'IMAGE_JPEG', png: 'IMAGE_PNG', gif: 'IMAGE_GIF', webp: 'IMAGE_WEBP' } as const)[extension ?? ''];
		if (!format || file.size < 1 || file.size > 20 * 1024 * 1024) {
			error = 'Choose a JPEG, PNG, GIF, or WebP image up to 20 MiB.';
			return;
		}
		if (!renderer && !busy) await loadFixture('webgpu', 'worker');
		if (!renderer || !scene || !three || busy) {
			error = 'The Three.js viewer is not ready; load the synthetic fixture first.';
			return;
		}
		busy = true;
		error = '';
		let bitmap: ImageBitmap | null = null;
		try {
			bitmap = await createImageBitmap(file);
			if (bitmap.width < 2 || bitmap.height < 2 || bitmap.width * bitmap.height > 64_000_000) {
				throw new Error('The image dimensions are outside the local preview limit (64 megapixels).');
			}
			const maxDimension = Math.min(224, Math.max(32, Number(reliefResolution)));
			const aspect = bitmap.width / bitmap.height;
			const width = aspect >= 1 ? maxDimension : Math.max(2, Math.round(maxDimension * aspect));
			const height = aspect >= 1 ? Math.max(2, Math.round(maxDimension / aspect)) : maxDimension;
			const sourceCanvas = document.createElement('canvas');
			sourceCanvas.width = width;
			sourceCanvas.height = height;
			const context = sourceCanvas.getContext('2d', { willReadFrequently: true });
			if (!context) throw new Error('Could not create the local image sampling canvas.');
			context.drawImage(bitmap, 0, 0, width, height);
			const pixels = context.getImageData(0, 0, width, height).data;
			const positions = new Float32Array(width * height * 3);
			const uvs = new Float32Array(width * height * 2);
			const visiblePixels = new Uint8Array(width * height);
			const indices: number[] = [];
			const worldScale = 2 / Math.max(width - 1, height - 1);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const vertex = y * width + x;
					const pixel = vertex * 4;
					visiblePixels[vertex] = pixels[pixel + 3] >= 25 ? 1 : 0;
					const luminance = (0.299 * pixels[pixel] + 0.587 * pixels[pixel + 1] + 0.114 * pixels[pixel + 2]) / 255;
					positions[vertex * 3] = (x / (width - 1) - 0.5) * (width - 1) * worldScale;
					positions[vertex * 3 + 1] = (0.5 - y / (height - 1)) * (height - 1) * worldScale;
					positions[vertex * 3 + 2] = (reliefInvert ? 1 - luminance : luminance) * Number(reliefDepth);
					uvs[vertex * 2] = x / (width - 1);
					uvs[vertex * 2 + 1] = 1 - y / (height - 1);
				}
			}
			for (let y = 0; y < height - 1; y++) {
				for (let x = 0; x < width - 1; x++) {
					const topLeft = y * width + x;
					const topRight = topLeft + 1;
					const bottomLeft = topLeft + width;
					const bottomRight = bottomLeft + 1;
					if (visiblePixels[topLeft] && visiblePixels[topRight] && visiblePixels[bottomLeft]) indices.push(topLeft, bottomLeft, topRight);
					if (visiblePixels[topRight] && visiblePixels[bottomLeft] && visiblePixels[bottomRight]) indices.push(topRight, bottomLeft, bottomRight);
				}
			}
			const imageGeometry = new three.BufferGeometry();
			imageGeometry.setAttribute('position', new three.BufferAttribute(positions, 3));
			imageGeometry.setAttribute('uv', new three.BufferAttribute(uvs, 2));
			imageGeometry.setIndex(indices);
			imageGeometry.computeVertexNormals();
			const texture = new three.CanvasTexture(sourceCanvas);
			texture.name = `Original image texture · ${file.name}`;
			sourceCanvas.dataset.filePath = file.webkitRelativePath || file.name;
			texture.colorSpace = three.SRGBColorSpace;
			const material = new three.MeshStandardMaterial({ map: texture, side: three.DoubleSide, roughness: 0.8, transparent: true, alphaTest: 0.02 });
			disposeEditableRoot();
			if (splat) {
				scene.remove(splat);
				splat.material?.dispose?.();
				splat = null;
			}
			geometry?.dispose?.();
			geometry = null;
			pointCount = 0;
			sourceDigest = '';
			splatSourceBytes = 0;
			transferStatus = 'Not applicable to local image preview';
			editableRoot = new three.Group();
			editableRoot.name = `${file.name} · image-derived relief hypothesis`;
			const reliefMesh = new three.Mesh(imageGeometry, material);
			reliefMesh.name = 'Image-derived relief proxy';
			reliefMesh.userData.atlasObjectId = crypto.randomUUID();
			editableRoot.add(reliefMesh);
			scene.add(editableRoot);
			sceneId = crypto.randomUUID();
			sceneRevision = 0;
			sceneAssetDirty = true;
			savedCaseManifest = null;
			parentManifestSha256 = null;
			sourceAssetSha256 = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
			localAssetName = file.name;
			localAssetPath = file.webkitRelativePath || file.name;
			localAssetBytes = file.size;
			localAssetFormat = format;
			currentReliefImageFile = file;
			sourceAssetBytes = file.size;
			coordinateFrame = 'LOCAL_UNCALIBRATED';
			surfaceMarkers = [];
			refreshSceneObjects(reliefMesh.name);
			const bounds = new three.Box3().setFromObject(editableRoot);
			const center = bounds.getCenter(new three.Vector3());
			const radius = Math.max(bounds.getBoundingSphere(new three.Sphere()).radius, 0.1);
			camera.position.set(center.x, center.y - radius * 0.3, center.z + radius * 3.5);
			camera.lookAt(center);
			controls.target.copy(center);
			controls.update();
			loadedModelName = `${file.name} · local 2.5D hypothesis preview`;
			syncMeshTransformReceipt();
			meshEditStatus = `Generated a ${width}×${height} image-derived relief proxy · ${imageGeometry.getAttribute('position').count.toLocaleString()} vertices · ${Math.floor(imageGeometry.index.count / 3).toLocaleString()} triangles · 1 original-image texture. Depth comes from pixel luminance; geometry is not measured.`;
			status = 'Local image relief preview ready · original image remains unchanged · nothing uploaded.';
			exportReceipt = 'No edited GLB exported';
			manifestStatus = 'No scene manifest exported';
			pickStatus = 'Image-derived mesh is a demonstrative proxy; case evidence anchors are disabled in pre-case mode.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			bitmap?.close();
			busy = false;
		}
	}

	function scheduleImageReliefRegeneration() {
		if (!currentReliefImageFile || busy) return;
		if (reliefRegenerationTimer) window.clearTimeout(reliefRegenerationTimer);
		reliefRegenerationTimer = window.setTimeout(() => {
			reliefRegenerationTimer = 0;
			void loadLocalImageRelief(currentReliefImageFile ?? undefined);
		}, 220);
	}

	function pick(event: MouseEvent) {
		if (!renderer || !camera || (!splat && !editableRoot)) return;
		const THREE = three;
		if (!THREE) return;
		const rect = canvas.getBoundingClientRect();
		const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
		const raycaster = new THREE.Raycaster();
		if (placeSurfaceMarker(event, pointer, raycaster)) return;
		raycaster.setFromCamera(pointer, camera);
		const meshHit = spatialBvh?.raycast(raycaster)[0];
		if (meshHit) {
			pickStatus = `Picked ${meshHit.object.name || 'mesh'} triangle ${meshHit.faceIndex ?? 'unknown'} at ${meshHit.distance.toFixed(3)} scene units`;
			return;
		}
		const hit = splat ? raycaster.intersectObject(splat, false)[0] : null;
		pickStatus = hit ? `Picked splat ${hit.index ?? 'surface'} at ${hit.distance.toFixed(3)} scene units` : 'No splat intersected at this point';
	}

	function disposeForUser() {
		if (blockIfUnsavedCaseScene('dispose this scene')) return;
		disposeScene();
		status = 'Scene disposed; the fixture can be loaded again.';
	}

	function caseApiJson<T>(value: unknown): T {
		if (!value || typeof value !== 'object') throw new Error('Saved scene manifest is invalid.');
		return value as T;
	}

	async function loadSavedCaseScene() {
		if (!caseId || !sceneId || busy) return;
		if (blockIfUnsavedCaseScene('reload the saved scene')) return;
		busy = true;
		error = '';
		try {
			const saved = await fetchSceneRevisionV1({ caseId, sceneId });
			if (!saved) throw new Error('This case scene has no saved revision yet.');
			const manifest = caseApiJson<any>(saved.manifest);
			if (manifest.caseId !== caseId || manifest.sceneId !== sceneId || manifest.status !== 'HYPOTHESIS') throw new Error('Saved scene scope or status does not match this case.');
			if (linkedEvidenceId) {
				const sourceBinding = manifest.evidenceBindings?.find((binding: any) => binding.evidenceId === linkedEvidenceId);
				if (!sourceBinding) throw new Error('Saved scene is not bound to the selected exhibit.');
				if (linkedEvidenceRevision && sourceBinding.sourceRevision !== linkedEvidenceRevision) throw new Error('The selected exhibit revision differs from the saved scene source.');
			}
			const asset = manifest.assets.find((candidate: any) => candidate.role === 'DERIVED' && candidate.format === 'GLB');
			if (!asset) throw new Error('Saved scene has no derived GLB asset.');
			const savedMarkers = Array.isArray(manifest.surfaceMarkers) ? manifest.surfaceMarkers as SurfaceMarkerV1[] : [];
			if (savedMarkers.some((marker) => marker.meshAssetSha256 !== asset.sha256 || !manifest.objects.some((object: any) => object.objectId === marker.meshObjectId && object.kind === 'MESH' && object.geometry && marker.triangleIndex < object.geometry.triangleCount))) {
				throw new Error('A saved marker does not match a mesh and GLB asset in this scene revision.');
			}
			const glb = await fetchSceneAssetV1({ caseId, sceneId, assetId: asset.assetId, expectedSha256: asset.sha256, expectedBytes: asset.bytes });
			busy = false;
			await loadLocalBlenderGlb(new File([glb], `case-scene-${saved.revision}.glb`, { type: 'model/gltf-binary' }));
			if (!loadedModel) throw new Error('Saved GLB could not be loaded into the scene editor.');
			const runtimeObjects = new Map<string, SceneTransformTargetV1>();
			editableRoot?.traverse?.((object: any) => {
				const objectId = object.userData?.atlasObjectId;
				if (typeof objectId === 'string') {
					if (runtimeObjects.has(objectId)) throw new Error(`SCENE_OBJECT_READBACK_DUPLICATE:${objectId}`);
					runtimeObjects.set(objectId, object);
				}
			});
			applySceneObjectTransformsV1(manifest.objects, runtimeObjects);
			editableRoot?.updateMatrixWorld(true);
			sceneId = manifest.sceneId;
			sceneRevision = saved.revision;
			parentManifestSha256 = saved.manifestSha256;
			coordinateFrame = manifest.coordinateFrame;
			surfaceMarkers = savedMarkers;
			sceneAssetDirty = false;
			savedCaseManifest = saved.manifest;
			refreshSurfaceMarkerOverlays();
			sceneDirty = false;
			manifestStatus = `Case hypothesis revision ${sceneRevision} loaded · SHA-256 verified`;
			meshEditStatus = 'Saved case scene loaded with its editable GLB revision.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			manifestStatus = 'Case scene load failed; inspect the message before continuing.';
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		const lifecycleSubscription = sceneAssetLifecycle.subscribe((snapshot) => {
			sceneAssetLifecycleState = String(snapshot.value);
		});
		sceneAssetLifecycle.start();
		const guardUnsavedCaseScene = (event: BeforeUnloadEvent) => {
			if (!caseId || !sceneDirty) return;
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', guardUnsavedCaseScene);
		const params = new URLSearchParams(window.location.search);
		const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		preCaseMode = params.get('mode') === 'preflight';
		if (preCaseMode) {
			const requestedReturnCaseId = params.get('returnCaseId');
			if (requestedReturnCaseId && uuidPattern.test(requestedReturnCaseId)) returnCaseId = requestedReturnCaseId;
		} else {
			const requestedCaseId = params.get('caseId');
			const requestedSceneId = params.get('sceneId');
			if (requestedCaseId && uuidPattern.test(requestedCaseId)) caseId = requestedCaseId;
			if (requestedSceneId && uuidPattern.test(requestedSceneId)) sceneId = requestedSceneId;
			const requestedEvidenceId = params.get('evidenceId');
			const requestedEvidenceRevision = params.get('sourceRevision');
			if (requestedEvidenceId && uuidPattern.test(requestedEvidenceId)) {
				linkedEvidenceId = requestedEvidenceId;
				if (requestedEvidenceRevision && /^sha256:[a-f0-9]{64}$/.test(requestedEvidenceRevision)) linkedEvidenceRevision = requestedEvidenceRevision;
			}
		}
		return () => {
			window.removeEventListener('beforeunload', guardUnsavedCaseScene);
			sceneAssetLifecycle.send({ type: 'DISPOSE' });
			lifecycleSubscription.unsubscribe();
			sceneAssetLifecycle.stop();
			disposeScene();
		};
	});
</script>

<svelte:head>
	<title>SPZ renderer fixture · Detective Mode</title>
	<meta name="description" content="Read-only synthetic SPZ v4 renderer qualification fixture." />
</svelte:head>

<main class="spz-page" class:pre-case={preCaseMode}>
	<header>
		<div>
			<p class="eyebrow">PARENT ATLAS · DETECTIVE MODE · {preCaseMode ? 'PRE-CASE LOCAL TEST' : caseId ? 'CASE SCENE HYPOTHESIS' : 'FIXTURE ONLY'}</p>
			<p class="scene-classification" data-testid="scene-classification">Scene classification: {savedCaseManifest?.sceneClassification ?? (caseId || localAssetFormat?.startsWith('IMAGE_') ? 'SINGLE_IMAGE_HYPOTHESIS' : 'SYNTHETIC_FIXTURE')}{savedCaseManifest && !savedCaseManifest.sceneClassification ? ' · legacy label inferred from viewer context' : ''}</p>
			<h1>SPZ renderer qualification</h1>
			<p class="intro">{preCaseMode ? 'Test local GLB, OBJ, FBX, JPEG, PNG, GIF, or WebP files, simulate mesh edits, review geometry and export a separate GLB copy. No case or exhibit is changed.' : caseId ? 'Case-linked scene editor. Saved assets and manifests are explicitly labeled reconstruction hypotheses; originals remain evidence.' : 'Synthetic Niantic SPZ v4 fixture. This page does not load a case, write evidence, or represent a measured reconstruction.'}</p>
			{#if preCaseMode && returnCaseId}<a class="return-link" href={`/cases/${encodeURIComponent(returnCaseId)}/board`}>Return to Evidence Board</a>{/if}
			{#if caseId && linkedEvidenceId}<a class="return-link" data-testid="return-to-evidence-board" href={`/cases/${encodeURIComponent(caseId)}/board?sceneId=${encodeURIComponent(sceneId)}&evidenceId=${encodeURIComponent(linkedEvidenceId)}`}>Return to Evidence Board</a>{/if}
			{#if linkedEvidenceId}<p class="intro" data-testid="scene-evidence-binding">Linked exhibit {linkedEvidenceId}{linkedEvidenceRevision ? ` · source revision ${linkedEvidenceRevision.slice(0, 23)}…` : ' · canonical source hash unavailable; linked save disabled'}</p>{/if}
		</div>
		<div class="actions">
			<button onclick={toggleStreamedSog} aria-pressed={showStreamedSog} data-testid="streamed-sog-toggle">{showStreamedSog ? 'Return to Three.js editor' : 'Compare Streamed SOG (PlayCanvas)'}</button>
			<button onclick={() => loadFixture('webgpu', 'worker')} disabled={busy} aria-pressed={requestedBackend === 'webgpu'}>Worker decode + WebGPU</button>
			<button onclick={() => loadFixture('webgpu', 'three-loader')} disabled={busy}>Three.js loader + WebGPU</button>
			<button onclick={() => loadFixture('webgl2')} disabled={busy} aria-pressed={requestedBackend === 'webgl2'}>Force WebGL2</button>
			<label class="file-action">Open local 3D asset<input data-testid="local-asset-file-input" type="file" accept=".glb,.obj,.fbx,model/gltf-binary,text/plain,application/vnd.autodesk.fbx" disabled={busy} onchange={(event) => loadLocalBlenderGlb((event.currentTarget as HTMLInputElement).files?.[0])} /></label>
			{#if sceneAssetLifecycleState === 'loading'}<button type="button" data-testid="cancel-asset-import" onclick={cancelSceneAssetImport}>Cancel import</button>{/if}
			<span class="lifecycle-state" data-testid="asset-import-state">Import: {sceneAssetLifecycleState}</span>
			{#if preCaseMode}
				<label class="file-action">Preview 2D image as relief<input data-testid="local-image-file-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp" disabled={busy} onchange={(event) => loadLocalImageRelief((event.currentTarget as HTMLInputElement).files?.[0])} /></label>
				<label class="object-select">Relief grid: {reliefResolution}px<input data-testid="relief-resolution" type="range" min="32" max="224" step="16" bind:value={reliefResolution} disabled={busy || !currentReliefImageFile} oninput={scheduleImageReliefRegeneration} /></label>
				<label class="object-select">Relief depth: {reliefDepth.toFixed(2)}<input data-testid="relief-depth" type="range" min="0.05" max="1.5" step="0.05" bind:value={reliefDepth} disabled={busy || !currentReliefImageFile} oninput={scheduleImageReliefRegeneration} /></label>
				<label class="object-select"><input data-testid="relief-invert" type="checkbox" bind:checked={reliefInvert} disabled={busy || !currentReliefImageFile} oninput={scheduleImageReliefRegeneration} /> Invert luminance depth</label>
			{/if}
			<button onclick={() => setMeshEditMode('translate')} disabled={!loadedModel} aria-pressed={meshEditMode === 'translate'}>Move mesh</button>
			<button onclick={() => setMeshEditMode('rotate')} disabled={!loadedModel} aria-pressed={meshEditMode === 'rotate'}>Rotate mesh</button>
			<button onclick={() => setMeshEditMode('scale')} disabled={!loadedModel} aria-pressed={meshEditMode === 'scale'}>Scale mesh</button>
			<label class="object-select">Select object<select aria-label="Select scene object" value={selectedObjectName} disabled={!sceneObjects.length} onchange={(event) => selectSceneObject((event.currentTarget as HTMLSelectElement).value)}>{#each sceneObjects as objectName}<option value={objectName}>{objectName}</option>{/each}</select></label>
			{#if loadedModel}<button data-testid="frame-editable-scene" onclick={frameEditableScene}>Frame mesh</button>{/if}
			{#if pointCount > 0}<label class="object-select"><input data-testid="synthetic-splat-visibility" type="checkbox" checked={showSyntheticSplatFixture} onchange={(event) => setSyntheticSplatFixtureVisible((event.currentTarget as HTMLInputElement).checked)} /> Show synthetic SPZ fixture</label>{/if}
			<label class="object-select">Animation<select aria-label="Select animation clip" value={selectedAnimation} disabled={!animationNames.length} onchange={(event) => { selectedAnimation = (event.currentTarget as HTMLSelectElement).value; animationPreviewFrame = 0; }}>{#each animationNames as animationName}<option value={animationName}>{animationName}</option>{/each}</select></label>
			<button onclick={playSelectedAnimation} disabled={!animationMixer || !selectedAnimation || animationPlaying}>Play animation</button>
			<button onclick={stopAnimation} disabled={!animationPlaying}>Stop animation</button>
			{#if animationMixer && selectedAnimation}<label class="object-select">Pose frame ({ANIMATION_PREVIEW_FPS} fps)<input data-testid="animation-frame-scrubber" type="range" min="0" max={Math.max(1, Math.ceil((animationClips.find((clip) => clip.name === selectedAnimation)?.duration ?? 0) * ANIMATION_PREVIEW_FPS))} step="1" value={animationPreviewFrame} disabled={animationPlaying} oninput={(event) => { void seekAnimationPreviewFrame(Number((event.currentTarget as HTMLInputElement).value)); }} /></label><output data-testid="animation-pose-readback" data-frame={animationPreviewFrame} data-hash-frame={animationPoseHashFrame} data-sha256={animationPoseSha256}>Local pose fingerprint · preview only · {animationPoseSha256 || 'scrub to sample'}</output>{/if}
			{#if preCaseMode}
				<label class="file-action">Open separate motion GLB<input data-testid="retarget-motion-input" type="file" accept=".glb,model/gltf-binary" disabled={!localCharacterFile || localAssetFormat !== 'GLB' || busy} onchange={(event) => loadRetargetMotion((event.currentTarget as HTMLInputElement).files?.[0])} /></label>
				<button data-testid="retarget-play" onclick={playRetargetMotion} disabled={!retargetReady || animationPlaying}>Play retargeted motion</button>
				<button data-testid="retarget-stop" onclick={stopAnimation} disabled={!animationPlaying || !retargetReady}>Stop retargeted motion</button>
			{/if}
			{#each ['box', 'sphere', 'cylinder', 'cone', 'torus'] as kind}
				<button onclick={() => addPrimitive(kind as 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus')} disabled={busy} aria-label={`Add ${kind}`}>+ {kind}</button>
			{/each}
			<label class="object-select">Primitive detail<select data-testid="primitive-detail" bind:value={primitiveDetail} disabled={busy}><option value="retro">Retro · low polygons</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label>
			{#if caseId}<button onclick={() => downloadEditedGlb()} disabled={!loadedModel || busy}>Save case scene revision</button>{#if sceneId}<button onclick={loadSavedCaseScene} disabled={busy}>Reload saved scene</button>{/if}{:else}<button onclick={() => downloadEditedGlb()} disabled={!loadedModel || busy}>Download edited GLB</button>{/if}
			<button onclick={disposeForUser} disabled={!backend || busy}>Dispose</button>
		</div>
	</header>
	{#if !preCaseMode}<section class="marker-tools" aria-label="Case scene hypothesis anchors">
		<label for="surface-marker-label">Mesh-relative hypothesis anchor</label>
		<input id="surface-marker-label" bind:value={markerLabel} maxlength="200" disabled={!caseId || !linkedEvidenceId || busy} />
		<button onclick={() => { placingSurfaceMarker = !placingSurfaceMarker; surfaceMarkerStatus = placingSurfaceMarker ? 'Click a static mesh triangle to place an asset-local anchor.' : 'Marker placement cancelled.'; }} disabled={!caseId || !linkedEvidenceId || !linkedEvidenceRevision || !loadedModel || busy || animationPlaying} aria-pressed={placingSurfaceMarker}>
			{placingSurfaceMarker ? 'Cancel placement' : 'Place hypothesis anchor'}
		</button>
		<span role="status" data-testid="surface-marker-status">{surfaceMarkerStatus}</span>
		{#if surfaceMarkers.length}
			<ul aria-label="Scene hypothesis markers">
				{#each surfaceMarkers as marker (marker.markerId)}
					<li><span>{marker.label}</span><small>hypothesis · triangle {marker.triangleIndex} · mesh-relative</small><button type="button" aria-label={`Remove ${marker.label}`} onclick={() => removeSurfaceMarker(marker.markerId)}>Remove</button></li>
				{/each}
			</ul>
		{/if}
		<p>These annotations are analyst hypotheses attached by mesh object, triangle, and barycentric coordinates. They are not source observations or survey-calibrated measurements.</p>
	</section>{/if}
	<nav class="sampling" aria-label="Render sampling preview">
		<span class="label">Render sampling</span>
		<button onclick={() => setSamplingMode('native')} aria-pressed={samplingMode === 'native'}>Native</button>
		<button onclick={() => setSamplingMode('half')} aria-pressed={samplingMode === 'half'}>Half resolution</button>
		<button onclick={() => setSamplingMode('retro')} aria-pressed={samplingMode === 'retro'}>Retro pixels</button>
		<span class="sampling-note">Display sampling preview only · no DLSS or quality claim</span>
		<output class="sampling-diagnostics" data-testid="render-sampling-diagnostics">
			{renderDiagnostics.quality} · {renderDiagnostics.mode} · CSS {renderDiagnostics.cssWidth}×{renderDiagnostics.cssHeight}px · measured drawing buffer {renderDiagnostics.backingWidth}×{renderDiagnostics.backingHeight}px · RGBA8 target estimate {(renderDiagnostics.rgba8EstimateBytes / 1_048_576).toFixed(2)} MiB (excludes depth, MSAA and driver overhead) · antialias requested {renderDiagnostics.antialiasRequested ? 'ON' : 'OFF'}; actual sample count unmeasured
		</output>
	</nav>
	<nav class="sampling material-preview" aria-label="Mesh material preview">
		<span class="label">Mesh lighting preview</span>
		<button data-testid="material-mode-source" onclick={() => setMeshPreviewMode('source')} aria-pressed={meshPreviewMode === 'source'} disabled={!loadedModel || busy}>Source PBR</button>
		<button data-testid="material-mode-phong" onclick={() => setMeshPreviewMode('phong')} aria-pressed={meshPreviewMode === 'phong'} disabled={!loadedModel || busy}>Three.js Phong</button>
		<span class="sampling-note">Preview only · export restores source materials · no path tracing</span>
	</nav>
	{#if preCaseMode}
		<section class="shader-drop" aria-label="Local shader source inventory" ondragover={(event) => event.preventDefault()} ondrop={(event) => { event.preventDefault(); void indexLocalShaderSource(event.dataTransfer?.files?.[0]); }}>
			<div><span class="label">Shader source inventory · local only</span><strong data-testid="shader-source-name">{shaderSourceName}</strong><small data-testid="shader-source-receipt">{shaderSourceReceipt}</small></div>
			<label class="file-action">Choose or drop GLSL/WGSL<input data-testid="shader-source-file-input" type="file" accept=".glsl,.wgsl,text/plain" onchange={(event) => void indexLocalShaderSource((event.currentTarget as HTMLInputElement).files?.[0])} /></label>
			{#if shaderSourceSha256}<output data-testid="shader-source-hash">{shaderSourceSha256}</output>{/if}
		</section>
	{/if}
	<section class="viewer" aria-label="Synthetic Gaussian splat fixture">
		{#if showStreamedSog}
			<StreamedSogPlayCanvasViewer />
		{:else}
			<canvas bind:this={canvas} onclick={pick} data-testid="spz-fixture-canvas" aria-label="Interactive synthetic SPZ scene; drag to orbit, scroll to zoom, click to test splat picking"></canvas>
			<div class="controls-hint" aria-hidden="true">Drag to orbit · scroll to zoom · {placingSurfaceMarker ? 'click a static mesh triangle to add a hypothesis anchor' : 'click a mesh or splat to inspect'}</div>
			{#if !backend && !busy}<div class="empty">Load the synthetic fixture to begin the renderer check.</div>{/if}
			{#if busy}<div class="overlay-status" role="status">{status}</div>{/if}
		{/if}
	</section>
	<footer>
		{#if preCaseMode}
			<section class="preflight-report" aria-label="Local asset preflight report" data-testid="preflight-report">
				<div><span class="label">Local file</span><span data-testid="preflight-file">{localAssetName}{localAssetBytes ? ` · ${localAssetBytes.toLocaleString()} bytes` : ''}</span><small data-testid="preflight-file-path">{localAssetPath || 'Full disk path hidden by browser security; file name shown above.'}</small><small data-testid="preflight-source-hash">Source SHA-256: {sourceAssetSha256 || 'not computed'}</small></div>
				<div><span class="label">Geometry &amp; memory estimate</span><span data-testid="preflight-geometry">{meshDiagnostics.meshCount} meshes · {meshDiagnostics.vertexCount.toLocaleString()} vertices · {meshDiagnostics.triangleCount.toLocaleString()} triangles</span><small>{(meshDiagnostics.geometryBufferBytes / (1024 * 1024)).toFixed(2)} MiB geometry buffers · {(meshDiagnostics.textureGpuEstimateBytes / (1024 * 1024)).toFixed(2)} MiB decoded RGBA texture estimate</small><small data-testid="preflight-spatial-bvh">{spatialBvhStatus}</small></div>
				<div><span class="label">PBR materials</span><span data-testid="preflight-material-count">{meshDiagnostics.materialCount} materials · glTF metallic-roughness subset</span>
					{#if meshDiagnostics.materialDetails.length}<details class="inventory-details"><summary>Inspect material values</summary><small data-testid="preflight-material-list">{meshDiagnostics.materialDetails.join(' | ')}</small></details>{:else}<small data-testid="preflight-material-list">No mesh materials detected.</small>{/if}
				</div>
				<div><span class="label">Skeleton</span><span data-testid="preflight-skeleton">{meshDiagnostics.boneCount} bones detected</span><small data-testid="preflight-skeleton-file-path">file_path: {localAssetPath || '(no source file selected)'}</small>{#if meshDiagnostics.boneNames.length}<details class="inventory-details" data-testid="preflight-bone-details"><summary>Inspect {meshDiagnostics.boneNames.length} unique bone names</summary><small data-testid="preflight-bone-list">{meshDiagnostics.boneNames.join(' · ')}</small></details>{/if}</div>
				<div><span class="label">UV &amp; textures</span><span data-testid="preflight-uv-textures">{#if localAssetFormat?.startsWith('IMAGE_')}{meshDiagnostics.uvChannelCount} generated UV channel · {meshDiagnostics.textureCount} original-image texture attached · not atlas-baked{:else}{meshDiagnostics.uvChannelCount} UV channels · {meshDiagnostics.textureCount} textures · baked-map status unverified{/if}</span>
					{#if meshDiagnostics.textureDetails.length}<details class="inventory-details"><summary>Inspect texture inventory</summary><small data-testid="preflight-texture-list">{meshDiagnostics.textureDetails.join(' | ')}</small></details>{:else}<small data-testid="preflight-texture-list">No material textures detected in this asset.</small>{/if}
				</div>
				<div><span class="label">Edited export</span><span data-testid="preflight-export">{exportReceipt}</span></div>
				<div><span class="label">Parent Atlas recommendations</span><ul class="recommendations">
					{#if !loadedModel}<li>Open a local 3D asset or image to inspect geometry, skeleton, UVs and textures.</li>{/if}
					{#if loadedModel && localAssetFormat?.startsWith('IMAGE_')}<li>Single-image relief is a 2.5D demonstrative hypothesis: pixel luminance drives surface height. It does not infer hidden geometry, provide calibrated depth, or support evidence-grounded surface markers.</li>{/if}
					{#if loadedModel && localAssetFormat?.startsWith('IMAGE_')}<li>The original color image is attached through generated UVs; this is not a newly baked texture atlas.</li>{:else if loadedModel && meshDiagnostics.uvChannelCount === 0}<li>No UV channels found. Add or verify UVs before relying on texture maps.</li>{:else if loadedModel}<li>UV coordinates are present. Confirm baking in Blender; UV presence alone does not prove a baked texture.</li>{/if}
					{#if loadedModel && meshDiagnostics.triangleCount > LOCAL_PREVIEW_TRIANGLE_LIMIT}<li>High triangle count. Local primitive creation stops at {LOCAL_PREVIEW_TRIANGLE_LIMIT.toLocaleString()} triangles; create and visually review a lower-detail proxy before case admission.</li>{/if}
					{#if loadedModel && localAssetBytes > 8 * 1024 * 1024}<li>Source exceeds the 8 MiB derived-asset target. Measure a derived LOD export before admission.</li>{/if}
					{#if loadedModel && meshDiagnostics.textureCount === 0}<li>No material textures found. For OBJ, companion MTL and external texture files are not loaded here.</li>{/if}
					{#if loadedModel && meshDiagnostics.triangleCount <= 100000 && localAssetBytes <= 8 * 1024 * 1024}<li>Within this local size/count review gate; visual quality and case provenance need separate review.</li>{/if}
				</ul></div>
				<p>Browser security hides the absolute disk path, and the browser controls the download destination. The selected filename or browser-provided relative path, source byte count and hash, polygon/UV/skeleton/PBR material/texture inventory, and texture file_path labels are shown. Geometry-buffer bytes and decoded RGBA texture allocation are estimates; actual driver/GPU allocation and per-texture compressed sizes are not measured. Image relief maps the original image directly; it does not create a baked texture atlas. This pre-case tool exports an edited GLB so supported glTF materials and textures travel with the mesh. Nothing is uploaded, attached, or saved to PostgreSQL or SeaweedFS.</p>
			</section>
		{/if}
		<div><span class="label">Local mesh editor</span><span data-testid="spz-mesh-edit-status" role="status">{meshEditStatus}</span></div>
		<div><span class="label">Status</span><span data-testid="spz-status" role="status">{status}</span></div>
		<div><span class="label">Points</span><span data-testid="spz-point-count">{pointCount}</span></div>
		<div><span class="label">Source digest</span><span data-testid="spz-source-digest">{sourceDigest ? `${sourceDigest.slice(0, 16)}…` : 'not computed'}</span></div>
		<div><span class="label">Worker transfer</span><span data-testid="spz-transfer-status">{transferStatus}</span></div>
		<div><span class="label">Local mesh</span><span data-testid="spz-glb-status">{loadedModelName}</span></div>
		<div><span class="label">Scene composition</span><span data-testid="scene-composition-status">{pointCount > 0 ? `SPZ source · ${pointCount} Gaussians · ${splatSourceBytes.toLocaleString()} bytes` : 'No SPZ source'} · {loadedModel ? `GLB mesh · ${sceneObjects.length} editable objects` : 'No GLB mesh'}{pointCount > 0 && loadedModel ? ' · mixed scene framed' : ''}</span></div>
		<div><span class="label">Animation clips</span><span data-testid="spz-animation-status">{animationNames.length ? `${animationNames.length} local clip(s) available` : 'No clips in this asset'}</span></div>
				{#if preCaseMode}<div><span class="label">Separate motion retarget</span><span data-testid="retarget-status">{retargetStatus}</span><small data-testid="retarget-bone-updates">{retargetUpdatedBoneCount} target bone rotations applied</small><small data-testid="retarget-bone-changes">{retargetChangedBoneCount} target bones differ from rest pose</small></div>{/if}
			<div><span class="label">Scene manifest</span><span data-testid="spz-scene-manifest-status" role="status">{sceneDirty ? `Unsaved local edits · next export revision ${sceneRevision + 1}${sceneAutoSaveStatus ? ` · ${sceneAutoSaveStatus}` : ''}` : (sceneAutoSaveStatus || manifestStatus)}</span></div>
		<div><span class="label">Local transform readout</span><span data-testid="spz-mesh-transform">{meshTransformReceipt}</span></div>
		<div><span class="label">Backend</span><span data-testid="spz-backend">{backend ?? 'not initialized'}</span></div>
		<div><span class="label">Interaction</span><span data-testid="spz-pick-status">{pickStatus}</span></div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</footer>
	<aside>{preCaseMode ? 'Local preflight only: 2D images produce luminance-based 2.5D hypotheses; geometry and export details are preview-only. Nothing is added to a case and no GPU performance claim is made.' : 'Format fixture proof only: decode, actual GaussianSplat object, auto-sort path, pointer raycast, resize, and disposal can be inspected here. No GPU performance claim is made.'}</aside>
</main>

<style>
	.spz-page { min-height: calc(100vh - 3.5rem); display: grid; grid-template-rows: auto auto minmax(24rem, 1fr) auto auto; gap: 1rem; padding: 1.25rem; color: #eee7d8; background: #0b101b; }
	.spz-page.pre-case { height: calc(100dvh - 3.5rem); min-height: 36rem; grid-template-rows: auto auto minmax(12rem, 1fr) auto auto; gap: .65rem; padding: .75rem; overflow: hidden; }
	.spz-page.pre-case header { min-height: 0; padding: .65rem .8rem; }
	.spz-page.pre-case .actions { max-height: 9rem; overflow: auto; align-content: flex-start; padding: .1rem; }
	.spz-page.pre-case .viewer,.spz-page.pre-case canvas { min-height: 12rem; }
	.spz-page.pre-case footer { max-height: 9rem; overflow: auto; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border: 1px solid #9b7535; border-radius: .75rem; padding: 1rem 1.25rem; background: linear-gradient(120deg,#101725,#17131a); }
	h1 { margin: .15rem 0; color: #f0d084; font: 600 1.35rem Georgia,serif; }
	.eyebrow,.label { color: #d9b65e; font: 600 .65rem ui-monospace,monospace; letter-spacing: .13em; text-transform: uppercase; }
	.scene-classification { display:inline-flex; width:fit-content; margin:.35rem 0 0; border:1px solid #66532d; border-radius:999px; padding:.2rem .55rem; color:#f0d084; background:#211b11; font:600 .65rem ui-monospace,monospace; letter-spacing:.04em; }
	.intro { margin: .35rem 0 0; color: #b6b5b3; font-size: .85rem; }
	.actions { display:flex; gap:.5rem; flex-wrap:wrap; }
	.return-link { display:inline-flex; margin-top:.55rem; color:#f0d084; font-size:.82rem; }
	.preflight-report { display:grid; grid-template-columns:repeat(auto-fit,minmax(14rem,1fr)); gap:.7rem; padding:.85rem; border:1px solid #48634a; border-radius:.65rem; background:#101a18; }
	.preflight-report > div { display:flex; flex-direction:column; gap:.25rem; min-width:0; color:#eee7d8; font-size:.78rem; overflow-wrap:anywhere; }
	.preflight-report small { color:#b6b5b3; }
	.inventory-details { margin-top:.2rem; }
	.inventory-details summary { color:#d8bd79; cursor:pointer; font-size:.72rem; }
	.inventory-details small { display:block; max-height:8rem; overflow:auto; margin-top:.25rem; line-height:1.45; }
	.preflight-report > p { grid-column:1/-1; margin:0; color:#b6b5b3; font-size:.75rem; }
	.recommendations { margin:.1rem 0 0; padding-left:1.1rem; color:#d6d3c8; }
	.recommendations li + li { margin-top:.25rem; }
	.sampling { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; border:1px solid #403724; border-radius:.65rem; padding:.6rem .8rem; background:#11141b; }
	.material-preview { border-color:#66532d; background:linear-gradient(90deg,#171813,#11141b); }
	.shader-drop { display:flex; align-items:center; justify-content:space-between; gap:.75rem; flex-wrap:wrap; border:1px dashed #806a39; border-radius:.65rem; padding:.55rem .75rem; background:#121714; }
	.shader-drop > div { display:grid; gap:.2rem; min-width:12rem; overflow-wrap:anywhere; }
	.shader-drop strong { color:#eee7d8; font-size:.78rem; }
	.shader-drop small,.shader-drop output { color:#b6b5b3; font-size:.7rem; }
	.marker-tools { display:flex; align-items:center; gap:.55rem; flex-wrap:wrap; border:1px solid #665126; border-radius:.65rem; padding:.65rem .8rem; background:#141720; }
	.marker-tools > label { color:#e7c978; font-size:.78rem; font-weight:600; }
	.marker-tools input { min-width:12rem; border:1px solid #594a2f; border-radius:.4rem; padding:.5rem .65rem; background:#0b101b; color:#eee7d8; }
	.marker-tools input:focus-visible { outline:2px solid #70dbef; outline-offset:2px; }
	.marker-tools span { color:#c8c2b5; font-size:.76rem; }
	.marker-tools p { flex-basis:100%; margin:0; color:#a7a198; font-size:.72rem; }
	.marker-tools ul { display:flex; flex-basis:100%; flex-wrap:wrap; gap:.45rem; margin:0; padding:0; list-style:none; }
	.marker-tools li { display:flex; align-items:center; gap:.45rem; border:1px solid #403724; border-radius:.45rem; padding:.3rem .45rem; }
	.marker-tools small { color:#aaa49a; }
	.marker-tools li button { padding:.3rem .45rem; }
	.sampling-note { color:#aaa49a; font-size:.72rem; margin-left:auto; }
	.sampling-diagnostics { flex-basis:100%; color:#9ca8b9; font-size:.7rem; line-height:1.4; }
	button { border:1px solid #9b7535; border-radius:.45rem; padding:.55rem .8rem; background:#171d29; color:#f3d27f; cursor:pointer; }
	button[aria-pressed="true"] { background:#453719; box-shadow:0 0 14px #d7a84255; }
	button:disabled { opacity:.5; cursor:not-allowed; }
	button:focus-visible { outline:2px solid #70dbef; outline-offset:2px; }
	.file-action { position:relative; overflow:hidden; border:1px solid #9b7535; border-radius:.45rem; padding:.55rem .8rem; color:#f3d27f; background:#171d29; cursor:pointer; font-size:.85rem; }
	.lifecycle-state { color:#9aa7b9; font-size:.72rem; align-self:center; }
	.file-action:focus-within { outline:2px solid #70dbef; outline-offset:2px; }
	.object-select { display:flex; align-items:center; gap:.35rem; border:1px solid #9b7535; border-radius:.45rem; padding:.35rem .55rem; color:#f3d27f; background:#171d29; font-size:.8rem; }
	.object-select select { max-width:12rem; border:0; background:#171d29; color:#f3d27f; }
	.file-action input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
	.viewer { position:relative; min-height:24rem; overflow:hidden; border:1px solid #37556b; border-radius:.75rem; background:#0b101b; box-shadow:0 0 24px #42d9f122; }
	canvas { display:block; width:100%; height:100%; min-height:24rem; touch-action:none; cursor:grab; }
	canvas:active { cursor:grabbing; }
	.empty,.overlay-status { position:absolute; inset:0; display:grid; place-items:center; color:#c8c2b5; pointer-events:none; }
	.controls-hint { position:absolute; right:.75rem; bottom:.75rem; padding:.35rem .55rem; border:1px solid #52606b; border-radius:.35rem; background:#0a0d13cc; color:#c8c2b5; font-size:.7rem; pointer-events:none; }
	.overlay-status { inset:auto 1rem 1rem; padding:.65rem; border-radius:.4rem; background:#0a0d13dd; }
	footer { display:flex; gap:1.25rem; flex-wrap:wrap; border:1px solid #403724; border-radius:.65rem; padding:.8rem 1rem; background:#11141b; }
	footer div { display:grid; gap:.25rem; font-size:.8rem; }
	.error { width:100%; margin:0; color:#ff8e8e; }
	.spz-page aside { color:#aaa49a; font-size:.75rem; }
	@media(max-width:700px) { header { align-items:flex-start; flex-direction:column; } .viewer,canvas { min-height:55vh; } footer { display:grid; grid-template-columns:1fr 1fr; } .spz-page.pre-case { height:auto; min-height:calc(100vh - 3.5rem); overflow:visible; } .spz-page.pre-case .actions,.spz-page.pre-case footer { max-height:none; overflow:visible; } }
	@media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; transition-duration:.01ms!important; } }
</style>
