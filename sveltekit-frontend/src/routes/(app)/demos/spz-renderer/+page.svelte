<script lang="ts">
	import { onMount } from 'svelte';
	import { createSpzDecodeClient, type SpzDecodeClient } from '$lib/splat/spz-decode-client.js';
	import { workerPayloadToGaussianGeometry } from '$lib/splat/worker-three-geometry.js';
	import { createSceneDocumentV1, createSceneQualityReceiptV1, type SurfaceMarkerV1 } from '$lib/splat/scene-document-v1.js';
	import { fetchSceneAssetV1, fetchSceneRevisionV1, saveSceneRevisionV1 } from '$lib/splat/scene-persistence-client-v1.js';
	import { sha256Hex } from '$lib/splat/spz-loader.js';
	import { interpolateTrianglePointV1, triangleBarycentricV1 } from '$lib/splat/surface-marker-v1.js';
	import StreamedSogPlayCanvasViewer from '$lib/components/evidence/StreamedSogPlayCanvasViewer.svelte';
	import fixtureUrl from '$lib/splat/fixtures/niantic-official-degree0-5pt.spz?url';

	type Backend = 'webgpu' | 'webgl2';
	type DecodeMode = 'worker' | 'three-loader';
	type SamplingMode = 'native' | 'half' | 'retro';
	type SurfaceMarkerDraft = Omit<SurfaceMarkerV1, 'meshAssetSha256'> & { meshAssetSha256?: string };
	let canvas: HTMLCanvasElement;
	let status = $state('Fixture not loaded');
	let error = $state('');
	let backend = $state<'webgpu' | 'webgl2' | 'unknown' | null>(null);
	let requestedBackend = $state<Backend | null>(null);
	let pointCount = $state(0);
	let sourceDigest = $state('');
	let transferStatus = $state('Not transferred');
	let pickStatus = $state('Click a splat to test picking');
	let samplingMode = $state<SamplingMode>('native');
	let busy = $state(false);
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
	let meshEditMode = $state<'translate' | 'rotate' | 'scale'>('translate');
	let meshEditStatus = $state('Open a local Blender GLB to enable mesh transforms.');
	let meshTransformReceipt = $state('No local transform loaded');
	let animationNames = $state<string[]>([]);
	let selectedAnimation = $state('');
	let animationPlaying = $state(false);
	let transformControls: any = null;
	let animationMixer: any = $state.raw(null);
	let animationRoot: any = null;
	let animationClips: any[] = [];
	let animationClock: any = null;
	let sceneId = $state('');
	let caseId = $state<string | null>(null);
	let linkedEvidenceId = $state<string | null>(null);
	let linkedEvidenceRevision = $state<string | null>(null);
	let sceneRevision = $state(0);
	let surfaceMarkers = $state<SurfaceMarkerDraft[]>([]);
	let markerLabel = $state('Evidence anchor');
	let placingSurfaceMarker = $state(false);
	let surfaceMarkerStatus = $state('Markers require a linked exhibit and a loaded static mesh.');
	let markerOverlayRoot: any = null;
	let markerOverlayAnchors: { visual: any; object: any; localPoint: any }[] = [];
	let sceneDirty = $state(false);
	let parentManifestSha256: string | null = null;
	let sourceAssetSha256: string | null = null;
	let sourceAssetBytes = 0;
	let coordinateFrame: 'GLTF_Y_UP_METERS' | 'LOCAL_UNCALIBRATED' = 'LOCAL_UNCALIBRATED';
	let manifestStatus = $state('No scene manifest exported');
	let scene: any = null;
	let camera: any = null;
	let generation = 0;
	let resizeObserver: ResizeObserver | null = null;
	let three: any = null;
	let resizeViewport: (() => void) | null = null;

	function setSamplingMode(mode: SamplingMode) {
		samplingMode = mode;
		if (canvas) canvas.style.imageRendering = mode === 'retro' ? 'pixelated' : '';
		if (renderer) {
			const scale = mode === 'native' ? 1 : 0.5;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * scale);
			resizeViewport?.();
		}
	}

	function toggleStreamedSog() {
		if (!showStreamedSog) disposeScene();
		showStreamedSog = !showStreamedSog;
	}

	function disposeScene() {
		generation++;
		try { animationMixer?.stopAllAction(); } catch { /* mixer may already be stopped */ }
		try { if (animationRoot) animationMixer?.uncacheRoot(animationRoot); } catch { /* imported root may already be released */ }
		animationMixer = null;
		animationRoot = null;
		animationClips = [];
		animationNames = [];
		selectedAnimation = '';
		animationPlaying = false;
		animationClock = null;
		sceneId = '';
		sceneRevision = 0;
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
		try { decodeClient?.dispose(); } catch { /* worker may already have failed */ }
		decodeClient = null;
		try { resizeObserver?.disconnect(); } catch { /* cleanup continues */ }
		resizeObserver = null;
		try { renderer?.setAnimationLoop(null); } catch { /* backend may already be lost */ }
		try { controls?.dispose(); } catch { /* controls may reference a lost canvas */ }
		controls = null;
		try { if (scene && splat) scene.remove(splat); } catch { /* scene is already being discarded */ }
		try { if (scene && editableRoot) scene.remove(editableRoot); } catch { /* scene is already being discarded */ }
		try {
			editableRoot?.traverse?.((object: any) => {
				object.geometry?.dispose?.();
				const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
				for (const material of materials) {
					for (const value of Object.values(material)) if ((value as any)?.isTexture) (value as any).dispose();
					material.dispose?.();
				}
			});
		} catch { /* imported material or GPU resource may already be released */ }
		loadedModel = null;
		editableRoot = null;
		sceneObjects = [];
		selectedObjectName = '';
		loadedModelName = 'No local Blender GLB loaded';
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
		transferStatus = 'Not transferred';
		pickStatus = 'Click a splat to test picking';
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

	async function downloadEditedGlb() {
		if (!editableRoot || !loadedModel || busy) return;
		if (caseId && linkedEvidenceId && !linkedEvidenceRevision) {
			error = 'This exhibit has no canonical SHA-256 source revision; the scene cannot be saved as source-linked.';
			return;
		}
		busy = true;
		error = '';
		try {
			const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
			// Assign stable Atlas IDs before exporting so the GLB extras and manifest agree.
			const manifestObjects = collectSceneObjects();
			const buffer = await new GLTFExporter().parseAsync(editableRoot, { binary: true, animations: animationClips });
			if (!(buffer instanceof ArrayBuffer)) throw new Error('The GLB exporter did not return a binary asset.');
			if (buffer.byteLength > 64 * 1024 * 1024) throw new Error('The derived GLB exceeds the 64 MiB local export limit.');
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
						revision: sceneRevision + 1,
						parentManifestSha256,
						createdAt: new Date().toISOString(),
						coordinateFrame,
						objects: manifestObjects.map((object) => ({ ...object, assetSha256: asset.sha256 })),
						animations: animationClips.map((clip) => ({ clipId: crypto.randomUUID(), name: clip.name || 'Unnamed animation', durationSeconds: Number(clip.duration) || 0, frameRate: null })),
						evidenceBindings: linkedEvidenceId && linkedEvidenceRevision ? [{ evidenceId: linkedEvidenceId, sourceRevision: linkedEvidenceRevision }] : [],
						surfaceMarkers: surfaceMarkers.map((marker) => ({ ...marker, meshAssetSha256: asset.sha256 })),
						assets: [{ assetId: asset.assetId, format: 'GLB', sha256: asset.sha256, bytes: asset.bytes, role: 'DERIVED' }],
						quality: qualityReceipt
					})
				});
				sceneRevision = saved.revision.revision;
				surfaceMarkers = surfaceMarkers.map((marker) => ({ ...marker, meshAssetSha256: saved.asset.sha256 }));
				parentManifestSha256 = saved.revision.manifestSha256;
				sceneDirty = false;
				manifestStatus = `Case hypothesis revision ${sceneRevision} saved · verified manifest ${parentManifestSha256.slice(0, 16)}…`;
				meshEditStatus = `Derived GLB and hypothesis manifest saved · ${qualityReceipt.derivedAssetByteStatus} (${buffer.byteLength.toLocaleString()} / ${qualityReceipt.derivedAssetByteBudget.toLocaleString()} bytes)`;
				const currentUrl = new URL(window.location.href);
				currentUrl.searchParams.set('sceneId', sceneId);
				window.history.replaceState(window.history.state, '', currentUrl);
				return;
			}
			const manifest = createSceneDocumentV1({
				schema: 'parent-atlas.scene-document.v1',
				sceneId: sceneId || crypto.randomUUID(), caseId: null, status: 'FIXTURE', revision: sceneRevision + 1,
				parentManifestSha256, createdAt: new Date().toISOString(), coordinateFrame,
				objects: manifestObjects,
				animations: animationClips.map((clip) => ({ clipId: crypto.randomUUID(), name: clip.name || 'Unnamed animation', durationSeconds: Number(clip.duration) || 0, frameRate: null })),
				assets: [
					...(sourceAssetSha256 ? [{ assetId: crypto.randomUUID(), format: 'GLB', sha256: sourceAssetSha256, bytes: sourceAssetBytes, role: 'SOURCE' }] : []),
					{ assetId: crypto.randomUUID(), format: 'GLB', sha256: outputHash, bytes: buffer.byteLength, role: 'DERIVED' }
				],
				quality: createSceneQualityReceiptV1({ derivedAssetBytes: buffer.byteLength, triangleCount: countTriangles() })
			});
			const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
			parentManifestSha256 = await sha256Hex(new TextEncoder().encode(manifestText));
			sceneRevision = manifest.revision;
			sceneId = manifest.sceneId;
			sceneDirty = false;
			const blob = new Blob([buffer], { type: 'model/gltf-binary' });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `${loadedModelName.split(' · ')[0].replace(/\.glb$/i, '')}-edited.glb`;
			anchor.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
			const manifestUrl = URL.createObjectURL(new Blob([manifestText], { type: 'application/json' }));
			const manifestAnchor = document.createElement('a');
			manifestAnchor.href = manifestUrl;
			manifestAnchor.download = `${loadedModelName.split(' · ')[0].replace(/\.glb$/i, '')}-scene-r${sceneRevision}.json`;
			manifestAnchor.click();
			window.setTimeout(() => URL.revokeObjectURL(manifestUrl), 1000);
			manifestStatus = `Fixture manifest revision ${sceneRevision} exported · ${manifest.quality.derivedAssetByteStatus} (${buffer.byteLength.toLocaleString()} / ${manifest.quality.derivedAssetByteBudget.toLocaleString()} bytes) · SHA-256 ${parentManifestSha256.slice(0, 16)}… · local downloads only`;
			meshEditStatus = 'Edited GLB and revisioned fixture manifest downloaded; source file and case records were not changed.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			meshEditStatus = 'Could not export the edited local GLB.';
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
		const intersections = raycaster.intersectObject(editableRoot, true);
		const hit = intersections.find((intersection: any) => intersection.object?.isMesh && !intersection.object?.isSkinnedMesh && !intersection.object?.skeleton?.bones?.length && Number.isInteger(intersection.faceIndex));
		if (!hit) {
			surfaceMarkerStatus = 'No static mesh triangle was hit. Skinned or non-mesh geometry cannot anchor this marker.';
			return true;
		}
		const mesh = hit.object;
		const [a, b, c] = readTriangle(mesh, hit.faceIndex);
		const localHit = mesh.worldToLocal(hit.point.clone());
		const barycentric = triangleBarycentricV1([localHit.x, localHit.y, localHit.z], a, b, c);
		const label = markerLabel.trim().slice(0, 200) || `Evidence anchor ${surfaceMarkers.length + 1}`;
		const marker: SurfaceMarkerDraft = {
			markerId: crypto.randomUUID(), evidenceId: linkedEvidenceId, sourceRevision: linkedEvidenceRevision,
			meshObjectId: mesh.userData.atlasObjectId, triangleIndex: hit.faceIndex, barycentric, label
		};
		surfaceMarkers = [...surfaceMarkers, marker];
		placingSurfaceMarker = false;
		sceneDirty = true;
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
		meshEditStatus = `Previewing “${clip.name}” locally. Playback is illustrative and is not evidence chronology.`;
	}

	function stopAnimation() {
		animationMixer?.stopAllAction();
		animationPlaying = false;
	}

	function disposeEditableRoot() {
		if (!editableRoot) return;
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
		editableRoot.traverse?.((object: any) => {
			object.geometry?.dispose?.();
			const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
			for (const material of materials) {
				for (const value of Object.values(material)) if ((value as any)?.isTexture) (value as any).dispose();
				material.dispose?.();
			}
		});
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
				}
			});
			transformControls.addEventListener('objectChange', syncMeshTransformReceipt);
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
		const chosen = objects.find((object) => object.name === preferredName) ?? objects[0];
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
		const geometries: Record<string, any> = {
			box: () => new three.BoxGeometry(0.5, 0.5, 0.5),
			sphere: () => new three.SphereGeometry(0.3, 20, 12),
			cylinder: () => new three.CylinderGeometry(0.25, 0.25, 0.6, 20),
			cone: () => new three.ConeGeometry(0.3, 0.65, 20),
			torus: () => new three.TorusGeometry(0.3, 0.08, 10, 24)
		};
		const object = new three.Mesh(geometries[kind](), new three.MeshStandardMaterial({ color: '#d8b14d', metalness: 0.25, roughness: 0.55 }));
		object.name = name;
		object.position.set((used % 4) * 0.8 - 1.2, Math.floor(used / 4) * 0.7, 0);
		ensureEditableRoot('Synthetic evidence scene').add(object);
		refreshSceneObjects(name);
		loadedModelName = 'synthetic-playground · local only';
		meshEditStatus = `${sceneObjects.length} editable object(s); transforms are local and export creates a new GLB copy.`;
		sceneDirty = true;
		status = 'Synthetic mesh playground. No case assets or records are loaded.';
	}

	async function loadFixture(requestedMode: Backend, decodeMode: DecodeMode = 'worker') {
		if (!canvas || busy) return;
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

			renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: requestedMode === 'webgl2' });
			await renderer.init();
			if (thisGeneration !== generation) { renderer.dispose(); renderer = null; return; }
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * (samplingMode === 'native' ? 1 : 0.5));
			scene = new THREE.Scene();
			scene.background = new THREE.Color('#0b101b');
			camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
			const bytes = await fetch(fixtureUrl).then(async (response) => {
				if (!response.ok) throw new Error(`Fixture request failed (${response.status})`);
				return response.arrayBuffer();
			});
			if (thisGeneration !== generation) return;
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
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
				renderer.setSize(width, height, false);
			};
			if (canvas) canvas.style.imageRendering = samplingMode === 'retro' ? 'pixelated' : '';
			resizeObserver = new ResizeObserver(() => resizeViewport?.());
			resizeObserver.observe(canvas);
			resizeViewport();
			renderer.setAnimationLoop(() => {
				controls?.update();
				if (animationPlaying && animationMixer && animationClock) animationMixer.update(animationClock.getDelta());
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
		if (!file.name.toLowerCase().endsWith('.glb') || file.size < 20 || file.size > 64 * 1024 * 1024) {
			error = 'Choose a binary .glb file between 20 bytes and 64 MiB.';
			return;
		}
		if (!renderer && !busy) await loadFixture('webgpu', 'worker');
		if (!renderer || !scene || !camera || busy) {
			error = 'The Three.js viewer is not ready; load the synthetic fixture first.';
			return;
		}
		busy = true;
		error = '';
		try {
			const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
			transformControlsModule = await import('three/addons/controls/TransformControls.js');
			const buffer = await file.arrayBuffer();
			const gltf = await new Promise<any>((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
			const bounds = new three.Box3().setFromObject(gltf.scene);
			if (bounds.isEmpty()) throw new Error('The GLB contains no visible mesh bounds.');
			disposeEditableRoot();
			transformControlsModule = await import('three/addons/controls/TransformControls.js');
			editableRoot = new three.Group();
			editableRoot.name = file.name.replace(/\.glb$/i, '') || 'Imported GLB scene';
			sceneId = crypto.randomUUID();
			sceneRevision = 0;
			parentManifestSha256 = null;
			sourceAssetSha256 = await sha256Hex(new Uint8Array(buffer));
			sourceAssetBytes = buffer.byteLength;
			coordinateFrame = 'GLTF_Y_UP_METERS';
			sceneDirty = false;
			surfaceMarkers = [];
			refreshSurfaceMarkerOverlays();
			editableRoot.add(gltf.scene);
			scene.add(editableRoot);
			animationClips = Array.isArray(gltf.animations) ? gltf.animations : [];
			animationNames = animationClips.map((clip) => clip.name || `Animation ${animationClips.indexOf(clip) + 1}`);
			selectedAnimation = animationNames[0] ?? '';
			animationRoot = gltf.scene;
			animationMixer = animationClips.length ? new three.AnimationMixer(gltf.scene) : null;
			animationClock?.start();
			refreshSceneObjects();
			const center = bounds.getCenter(new three.Vector3());
			const radius = Math.max(bounds.getBoundingSphere(new three.Sphere()).radius, 0.1);
			camera.position.set(center.x + radius * 0.2, center.y + radius * 0.2, center.z + radius * 3.2);
			camera.lookAt(center);
			controls.target.copy(center);
			controls.update();
			loadedModelName = `${file.name} · local preview only`;
			syncMeshTransformReceipt();
			meshEditStatus = `Imported GLB with ${sceneObjects.length} editable mesh object(s); select a mesh or use the gizmo. Export creates a new local copy.`;
			status = 'Blender-authored GLB loaded into the Three.js fixture viewer; transforms are local and not linked to case evidence.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
		}
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
		const hit = splat ? raycaster.intersectObject(splat, false)[0] : null;
		pickStatus = hit ? `Picked splat ${hit.index ?? 'surface'} at ${hit.distance.toFixed(3)} scene units` : 'No splat intersected at this point';
	}

	function disposeForUser() {
		disposeScene();
		status = 'Scene disposed; the fixture can be loaded again.';
	}

	function caseApiJson<T>(value: unknown): T {
		if (!value || typeof value !== 'object') throw new Error('Saved scene manifest is invalid.');
		return value as T;
	}

	async function loadSavedCaseScene() {
		if (!caseId || !sceneId || busy) return;
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
			sceneId = manifest.sceneId;
			sceneRevision = saved.revision;
			parentManifestSha256 = saved.manifestSha256;
			coordinateFrame = manifest.coordinateFrame;
			surfaceMarkers = savedMarkers;
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
		const params = new URLSearchParams(window.location.search);
		const requestedCaseId = params.get('caseId');
		const requestedSceneId = params.get('sceneId');
		const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (requestedCaseId && uuidPattern.test(requestedCaseId)) caseId = requestedCaseId;
		if (requestedSceneId && uuidPattern.test(requestedSceneId)) sceneId = requestedSceneId;
		const requestedEvidenceId = params.get('evidenceId');
		const requestedEvidenceRevision = params.get('sourceRevision');
		if (requestedEvidenceId && uuidPattern.test(requestedEvidenceId)) {
			linkedEvidenceId = requestedEvidenceId;
			if (requestedEvidenceRevision && /^sha256:[a-f0-9]{64}$/.test(requestedEvidenceRevision)) linkedEvidenceRevision = requestedEvidenceRevision;
		}
		return () => disposeScene();
	});
</script>

<svelte:head>
	<title>SPZ renderer fixture · Detective Mode</title>
	<meta name="description" content="Read-only synthetic SPZ v4 renderer qualification fixture." />
</svelte:head>

<main class="spz-page">
	<header>
		<div>
			<p class="eyebrow">PARENT ATLAS · DETECTIVE MODE · {caseId ? 'CASE SCENE HYPOTHESIS' : 'FIXTURE ONLY'}</p>
			<h1>SPZ renderer qualification</h1>
			<p class="intro">{caseId ? 'Case-linked scene editor. Saved assets and manifests are explicitly labeled reconstruction hypotheses; originals remain evidence.' : 'Synthetic Niantic SPZ v4 fixture. This page does not load a case, write evidence, or represent a measured reconstruction.'}</p>
			{#if linkedEvidenceId}<p class="intro" data-testid="scene-evidence-binding">Linked exhibit {linkedEvidenceId}{linkedEvidenceRevision ? ` · source revision ${linkedEvidenceRevision.slice(0, 23)}…` : ' · canonical source hash unavailable; linked save disabled'}</p>{/if}
		</div>
		<div class="actions">
			<button onclick={toggleStreamedSog} aria-pressed={showStreamedSog} data-testid="streamed-sog-toggle">{showStreamedSog ? 'Return to Three.js editor' : 'Compare Streamed SOG (PlayCanvas)'}</button>
			<button onclick={() => loadFixture('webgpu', 'worker')} disabled={busy} aria-pressed={requestedBackend === 'webgpu'}>Worker decode + WebGPU</button>
			<button onclick={() => loadFixture('webgpu', 'three-loader')} disabled={busy}>Three.js loader + WebGPU</button>
			<button onclick={() => loadFixture('webgl2')} disabled={busy} aria-pressed={requestedBackend === 'webgl2'}>Force WebGL2</button>
			<label class="file-action">Open Blender GLB<input type="file" accept=".glb,model/gltf-binary" disabled={busy} onchange={(event) => loadLocalBlenderGlb(event.currentTarget.files?.[0])} /></label>
			<button onclick={() => setMeshEditMode('translate')} disabled={!loadedModel} aria-pressed={meshEditMode === 'translate'}>Move mesh</button>
			<button onclick={() => setMeshEditMode('rotate')} disabled={!loadedModel} aria-pressed={meshEditMode === 'rotate'}>Rotate mesh</button>
			<button onclick={() => setMeshEditMode('scale')} disabled={!loadedModel} aria-pressed={meshEditMode === 'scale'}>Scale mesh</button>
			<label class="object-select">Select object<select aria-label="Select scene object" value={selectedObjectName} disabled={!sceneObjects.length} onchange={(event) => selectSceneObject(event.currentTarget.value)}>{#each sceneObjects as objectName}<option value={objectName}>{objectName}</option>{/each}</select></label>
			<label class="object-select">Animation<select aria-label="Select animation clip" value={selectedAnimation} disabled={!animationNames.length} onchange={(event) => selectedAnimation = event.currentTarget.value}>{#each animationNames as animationName}<option value={animationName}>{animationName}</option>{/each}</select></label>
			<button onclick={playSelectedAnimation} disabled={!animationMixer || !selectedAnimation || animationPlaying}>Play animation</button>
			<button onclick={stopAnimation} disabled={!animationPlaying}>Stop animation</button>
			{#each ['box', 'sphere', 'cylinder', 'cone', 'torus'] as kind}
				<button onclick={() => addPrimitive(kind as 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus')} disabled={busy} aria-label={`Add ${kind}`}>+ {kind}</button>
			{/each}
			{#if caseId}<button onclick={downloadEditedGlb} disabled={!loadedModel || busy}>Save case scene revision</button>{#if sceneId}<button onclick={loadSavedCaseScene} disabled={busy}>Reload saved scene</button>{/if}{:else}<button onclick={downloadEditedGlb} disabled={!loadedModel || busy}>Download edited GLB</button>{/if}
			<button onclick={disposeForUser} disabled={!backend || busy}>Dispose</button>
		</div>
	</header>
	<section class="marker-tools" aria-label="Case scene mesh anchors">
		<label for="surface-marker-label">Mesh-relative evidence marker</label>
		<input id="surface-marker-label" bind:value={markerLabel} maxlength="200" disabled={!caseId || !linkedEvidenceId || busy} />
		<button onclick={() => { placingSurfaceMarker = !placingSurfaceMarker; surfaceMarkerStatus = placingSurfaceMarker ? 'Click a static mesh triangle to place an asset-local anchor.' : 'Marker placement cancelled.'; }} disabled={!caseId || !linkedEvidenceId || !linkedEvidenceRevision || !loadedModel || busy || animationPlaying} aria-pressed={placingSurfaceMarker}>
			{placingSurfaceMarker ? 'Cancel placement' : 'Place marker on mesh'}
		</button>
		<span role="status" data-testid="surface-marker-status">{surfaceMarkerStatus}</span>
		{#if surfaceMarkers.length}
			<ul aria-label="Scene hypothesis markers">
				{#each surfaceMarkers as marker (marker.markerId)}
					<li><span>{marker.label}</span><small>triangle {marker.triangleIndex} · mesh-relative</small><button type="button" aria-label={`Remove ${marker.label}`} onclick={() => removeSurfaceMarker(marker.markerId)}>Remove</button></li>
				{/each}
			</ul>
		{/if}
		<p>Markers are attached by mesh object, triangle, and barycentric coordinates. They remain reconstruction hypotheses and are not survey-calibrated.</p>
	</section>
	<nav class="sampling" aria-label="Render sampling preview">
		<span class="label">Render sampling</span>
		<button onclick={() => setSamplingMode('native')} aria-pressed={samplingMode === 'native'}>Native</button>
		<button onclick={() => setSamplingMode('half')} aria-pressed={samplingMode === 'half'}>Half resolution</button>
		<button onclick={() => setSamplingMode('retro')} aria-pressed={samplingMode === 'retro'}>Retro pixels</button>
		<span class="sampling-note">Display sampling preview only · no DLSS or quality claim</span>
	</nav>
	<section class="viewer" aria-label="Synthetic Gaussian splat fixture">
		{#if showStreamedSog}
			<StreamedSogPlayCanvasViewer />
		{:else}
			<canvas bind:this={canvas} onclick={pick} data-testid="spz-fixture-canvas" aria-label="Interactive synthetic SPZ scene; drag to orbit, scroll to zoom, click to test splat picking"></canvas>
			<div class="controls-hint" aria-hidden="true">Drag to orbit · scroll to zoom · {placingSurfaceMarker ? 'click a mesh triangle to anchor evidence' : 'click a splat to inspect'}</div>
			{#if !backend && !busy}<div class="empty">Load the synthetic fixture to begin the renderer check.</div>{/if}
			{#if busy}<div class="overlay-status" role="status">{status}</div>{/if}
		{/if}
	</section>
	<footer>
		<div><span class="label">Local mesh editor</span><span data-testid="spz-mesh-edit-status" role="status">{meshEditStatus}</span></div>
		<div><span class="label">Status</span><span data-testid="spz-status" role="status">{status}</span></div>
		<div><span class="label">Points</span><span data-testid="spz-point-count">{pointCount}</span></div>
		<div><span class="label">Source digest</span><span data-testid="spz-source-digest">{sourceDigest ? `${sourceDigest.slice(0, 16)}…` : 'not computed'}</span></div>
		<div><span class="label">Worker transfer</span><span data-testid="spz-transfer-status">{transferStatus}</span></div>
		<div><span class="label">Blender mesh</span><span data-testid="spz-glb-status">{loadedModelName}</span></div>
		<div><span class="label">Animation clips</span><span data-testid="spz-animation-status">{animationNames.length ? `${animationNames.length} local clip(s) available` : 'No clips in this GLB'}</span></div>
		<div><span class="label">Scene manifest</span><span data-testid="spz-scene-manifest-status" role="status">{sceneDirty ? `Unsaved local edits · next export revision ${sceneRevision + 1}` : manifestStatus}</span></div>
		<div><span class="label">Local transform readout</span><span data-testid="spz-mesh-transform">{meshTransformReceipt}</span></div>
		<div><span class="label">Backend</span><span data-testid="spz-backend">{backend ?? 'not initialized'}</span></div>
		<div><span class="label">Interaction</span><span data-testid="spz-pick-status">{pickStatus}</span></div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</footer>
	<aside>Format fixture proof only: decode, actual GaussianSplat object, auto-sort path, pointer raycast, resize, and disposal can be inspected here. No GPU performance claim is made.</aside>
</main>

<style>
	.spz-page { min-height: calc(100vh - 3.5rem); display: grid; grid-template-rows: auto auto minmax(24rem, 1fr) auto auto; gap: 1rem; padding: 1.25rem; color: #eee7d8; background: #0b101b; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border: 1px solid #9b7535; border-radius: .75rem; padding: 1rem 1.25rem; background: linear-gradient(120deg,#101725,#17131a); }
	h1 { margin: .15rem 0; color: #f0d084; font: 600 1.35rem Georgia,serif; }
	.eyebrow,.label { color: #d9b65e; font: 600 .65rem ui-monospace,monospace; letter-spacing: .13em; text-transform: uppercase; }
	.intro { margin: .35rem 0 0; color: #b6b5b3; font-size: .85rem; }
	.actions { display:flex; gap:.5rem; flex-wrap:wrap; }
	.sampling { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; border:1px solid #403724; border-radius:.65rem; padding:.6rem .8rem; background:#11141b; }
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
	button { border:1px solid #9b7535; border-radius:.45rem; padding:.55rem .8rem; background:#171d29; color:#f3d27f; cursor:pointer; }
	button[aria-pressed="true"] { background:#453719; box-shadow:0 0 14px #d7a84255; }
	button:disabled { opacity:.5; cursor:not-allowed; }
	button:focus-visible { outline:2px solid #70dbef; outline-offset:2px; }
	.file-action { position:relative; overflow:hidden; border:1px solid #9b7535; border-radius:.45rem; padding:.55rem .8rem; color:#f3d27f; background:#171d29; cursor:pointer; font-size:.85rem; }
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
	@media(max-width:700px) { header { align-items:flex-start; flex-direction:column; } .viewer,canvas { min-height:55vh; } footer { display:grid; grid-template-columns:1fr 1fr; } }
	@media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; transition-duration:.01ms!important; } }
</style>
