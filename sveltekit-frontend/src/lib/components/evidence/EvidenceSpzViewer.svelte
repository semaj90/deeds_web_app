<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createSpzDecodeClient, type SpzDecodeClient } from '$lib/splat/spz-decode-client.js';
	import { workerPayloadToGaussianGeometry } from '$lib/splat/worker-three-geometry.js';
	import { renderImageRenderingV1, renderPixelRatioV1 } from '$lib/splat/render-sampling-v1.js';
	import { calibrationForEvidenceV1, createSceneCalibrationV1, createSceneQualityReceiptV1, SPZ_DECODER_REVISION_V1, SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 } from '$lib/splat/scene-document-v1.js';
	import { evidenceSceneIdV1, fetchSceneRevisionV1, saveSceneManifestRevisionV1 } from '$lib/splat/scene-persistence-client-v1.js';
	import { createCalibratedGroup } from '$lib/splat/three-calibrated-markers.js';
	import type { CalibrationAnchor } from '$lib/splat/calibration.js';

	let { caseId, evidenceId }: { caseId: string; evidenceId: string } = $props();
	let canvas: HTMLCanvasElement;
	let status = $state('SPZ source has not been checked.');
	let error = $state('');
	let sourceDigest = $state('');
	let pointCount = $state(0);
	let samplingMode = $state<'native' | 'half' | 'retro'>('native');
	let placeMarkerMode = $state(false);
	let savedMarkers = $state<Array<{ markerId: string; evidenceId: string; label: string | null; revision: number; position: { x: number; y: number; z: number } }>>([]);
	let selectedMarkerId = $state<string | null>(null);
	let markerStatus = $state('');
	let calibrationStatus = $state('No admitted calibration loaded; showing source-frame coordinates.');
	let calibrationAnchors = $state<CalibrationAnchor[]>([]);
	let calibrationCapturePending = $state(false);
	let calibrationWorldDraft = $state({ x: '0', y: '0', z: '0' });
	let calibrationToleranceM = $state('0.02');
	let busy = $state(false);
	let renderer = $state.raw<any>(null);
	let scene: any = null;
	let camera: any = null;
	let controls: any = null;
	let geometry: any = null;
	let splat: any = null;
	let THREERef: any = null;
	let resizeObserver: ResizeObserver | null = null;
	let decodeClient: SpzDecodeClient | null = null;
	let raycaster: any = null;
	let markerRoot: any = null;
	let calibratedFrame: any = null;
	let markerWorldRadius = 0.02;
	let markerDrag: { markerId: string; revision: number; original: { x: number; y: number; z: number } } | null = null;
	let placePointerStart: { pointerId: number; x: number; y: number } | null = null;
	let removeMarkerListeners: (() => void) | null = null;
	let removeMarkerKeyListener: (() => void) | null = null;
	let generation = 0;

	function markerUrl() {
		return `/api/evidence/${encodeURIComponent(evidenceId)}/spz-markers?caseId=${encodeURIComponent(caseId)}`;
	}

	function updateMarkerVisual(marker: { markerId: string; position: { x: number; y: number; z: number } }) {
		const group = markerRoot?.children.find((child: any) => child.userData.markerId === marker.markerId);
		if (group) group.position.set(marker.position.x, marker.position.y, marker.position.z);
	}

	function addMarkerVisual(marker: { markerId: string; label: string | null; position: { x: number; y: number; z: number } }, THREE: any) {
		if (!markerRoot || markerRoot.children.some((child: any) => child.userData.markerId === marker.markerId)) return;
		const group = new THREE.Group();
		group.name = `evidence-anchor-${marker.markerId}`;
		group.userData.markerId = marker.markerId;
		group.position.set(marker.position.x, marker.position.y, marker.position.z);
		const gold = new THREE.MeshBasicMaterial({ color: 0xffd56a, depthTest: false });
		const glow = new THREE.MeshBasicMaterial({ color: 0x35e6e2, transparent: true, opacity: 0.5, depthTest: false });
		const ring = new THREE.Mesh(new THREE.TorusGeometry(markerWorldRadius * 1.45, markerWorldRadius * 0.16, 6, 16), gold);
		ring.name = 'evidence-anchor-ring';
		ring.renderOrder = 1001;
		ring.userData.markerId = marker.markerId;
		const center = new THREE.Mesh(new THREE.SphereGeometry(markerWorldRadius * 0.46, 10, 8), glow);
		center.name = 'evidence-anchor-core';
		center.renderOrder = 1002;
		center.userData.markerId = marker.markerId;
		group.add(ring, center);
		markerRoot.add(group);
	}

	function disposeMarkerVisuals() {
		if (!markerRoot) return;
		for (const group of [...markerRoot.children]) {
			group.traverse((object: any) => {
				object.geometry?.dispose?.();
				const materials = Array.isArray(object.material) ? object.material : [object.material];
				for (const material of materials) material?.dispose?.();
			});
			markerRoot.remove(group);
		}
	}

	function pointerRay(event: PointerEvent) {
		if (!canvas || !camera || !raycaster) return false;
		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return false;
		const pointer = new THREERef.Vector2();
		pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
		raycaster.setFromCamera(pointer, camera);
		return true;
	}

	function markerGroupFromHit(object: any) {
		let current = object;
		while (current && current !== markerRoot) {
			if (current.userData?.markerId) return current;
			current = current.parent;
		}
		return null;
	}

	function hitPoint(event: PointerEvent) {
		if (!pointerRay(event) || !splat) return null;
		return raycaster.intersectObject(splat, false)[0]?.point ?? null;
	}

	function toSourceFramePoint(worldPoint: any) {
		const point = worldPoint.clone();
		if (calibratedFrame) calibratedFrame.worldToLocal(point);
		return point;
	}

	async function loadCalibrationForSource(sourceRevision: string) {
		try {
			const sceneId = await evidenceSceneIdV1(caseId, evidenceId);
			const saved = await fetchSceneRevisionV1({ caseId, sceneId });
			if (!saved) {
				calibrationStatus = 'No saved scene calibration; coordinates are source-frame hypotheses, not GPS.';
				return null;
			}
			const calibration = calibrationForEvidenceV1(saved.manifest, evidenceId, sourceRevision);
			if (!calibration) {
				calibrationStatus = saved.manifest.calibration
					? 'Saved calibration does not match this SPZ source revision; showing source-frame coordinates.'
					: 'No saved scene calibration; coordinates are source-frame hypotheses, not GPS.';
				return null;
			}
			calibrationStatus = `Saved local frame applied · max anchor residual ${calibration.maxResidualM.toFixed(4)} m · not GPS`;
			return calibration;
		} catch {
			calibrationStatus = 'Saved calibration unavailable; showing source-frame coordinates.';
			return null;
		}
	}

	function armCalibrationAnchor() {
		if (!renderer || calibrationCapturePending || placeMarkerMode) return;
		const worldM = [calibrationWorldDraft.x, calibrationWorldDraft.y, calibrationWorldDraft.z].map(Number);
		if (worldM.some((value) => !Number.isFinite(value))) {
			calibrationStatus = 'Enter finite local-meter coordinates before capturing this control point.';
			return;
		}
		calibrationCapturePending = true;
		calibrationStatus = `Click the scene to capture control point ${calibrationAnchors.length + 1}; entered target is local meters.`;
	}

	function captureCalibrationAnchor(worldPoint: any) {
		const worldM = [calibrationWorldDraft.x, calibrationWorldDraft.y, calibrationWorldDraft.z].map(Number);
		if (worldM.some((value) => !Number.isFinite(value))) throw new Error('CALIBRATION_TARGET_COORDINATES_MUST_BE_FINITE');
		const point = toSourceFramePoint(worldPoint);
		calibrationAnchors = [...calibrationAnchors, {
			id: `control-${calibrationAnchors.length + 1}`,
			splat: [point.x, point.y, point.z],
			worldM: [worldM[0], worldM[1], worldM[2]]
		}];
		calibrationStatus = `${calibrationAnchors.length} source-to-local control point(s) captured. Add at least three, including an independent check point.`;
	}

	function applyCalibrationToViewer(calibration: NonNullable<ReturnType<typeof calibrationForEvidenceV1>>) {
		if (!calibratedFrame || !camera || !controls) return;
		const cameraInSourceFrame = calibratedFrame.worldToLocal(camera.position.clone());
		const targetInSourceFrame = calibratedFrame.worldToLocal(controls.target.clone());
		calibratedFrame.scale.setScalar(calibration.transform.scale);
		calibratedFrame.rotation.set(0, calibration.transform.yawRad, 0);
		calibratedFrame.position.set(...calibration.transform.translation);
		calibratedFrame.updateMatrixWorld(true);
		camera.position.copy(calibratedFrame.localToWorld(cameraInSourceFrame));
		controls.target.copy(calibratedFrame.localToWorld(targetInSourceFrame));
		camera.lookAt(controls.target);
		controls.update();
	}

	async function saveLocalCalibration() {
		if (!caseId || !evidenceId || !sourceDigest || calibrationAnchors.length < 3 || busy) return;
		busy = true;
		try {
			const toleranceM = Number(calibrationToleranceM);
			const calibration = createSceneCalibrationV1({ sourceSha256: sourceDigest.replace(/^sha256:/, ''), anchors: calibrationAnchors, toleranceM });
			const sceneId = await evidenceSceneIdV1(caseId, evidenceId);
			const saved = await fetchSceneRevisionV1({ caseId, sceneId });
			const source = {
				evidenceId,
				sourceRevision: sourceDigest,
				format: 'SPZ' as const,
				coordinateSystem: 'RUB' as const,
				decoderRevision: SPZ_DECODER_REVISION_V1,
				representationRevision: SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1
			};
			const prior = saved?.manifest;
			const sourceBindings = [...(prior?.evidenceSources ?? []).filter((item) => item.evidenceId !== evidenceId), source];
			const otherBindings = (prior?.evidenceBindings ?? []).filter((item) => item.evidenceId !== evidenceId);
			const manifest = {
				schema: 'parent-atlas.scene-document.v1' as const,
				sceneId,
				caseId,
				status: 'HYPOTHESIS' as const,
				revision: (saved?.revision ?? 0) + 1,
				parentManifestSha256: saved?.manifestSha256 ?? null,
				createdAt: new Date().toISOString(),
				coordinateFrame: 'GLTF_Y_UP_METERS' as const,
				objects: prior?.objects ?? [],
				animations: prior?.animations ?? [],
				...(otherBindings.length ? { evidenceBindings: otherBindings } : {}),
				evidenceSources: sourceBindings,
				surfaceMarkers: prior?.surfaceMarkers,
				assets: prior?.assets ?? [],
				calibration,
				quality: prior?.quality ?? createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
			};
			const revision = await saveSceneManifestRevisionV1({
				caseId, sceneId, expectedRevision: saved?.revision ?? 0, commandId: crypto.randomUUID(), manifest
			});
			applyCalibrationToViewer(calibration);
			calibrationAnchors = [];
			calibrationStatus = `Saved scene revision ${revision.revision} · local Y-up meters · residual ${calibration.maxResidualM.toFixed(4)} m · not GPS`;
		} catch (cause) {
			calibrationStatus = cause instanceof Error ? cause.message : 'Calibration could not be saved.';
		} finally {
			busy = false;
		}
	}

	async function loadSceneMarkers(expectedHash: string, THREE: any, requestGeneration: number) {
		const response = await fetch(markerUrl(), { cache: 'no-store' });
		const body = await response.json();
		if (!response.ok || !body.success || body.data?.sourceSha256 !== expectedHash || requestGeneration !== generation) {
			throw new Error(body.error ?? 'Saved scene markers do not match the verified SPZ source.');
		}
		savedMarkers = body.data.markers;
		for (const marker of savedMarkers) addMarkerVisual(marker, THREE);
		markerStatus = `${savedMarkers.length} scene ${savedMarkers.length === 1 ? 'marker' : 'markers'} loaded from this source revision.`;
	}

	async function createSceneMarker(point: any) {
		if (!sourceDigest || !renderer || !window.crypto?.randomUUID) return;
		const markerId = crypto.randomUUID();
		const sourcePoint = toSourceFramePoint(point);
		const position = { x: sourcePoint.x, y: sourcePoint.y, z: sourcePoint.z };
		const response = await fetch(markerUrl(), {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ markerId, commandId: crypto.randomUUID(), expectedSourceSha256: sourceDigest, label: 'Scene evidence marker', position }),
		});
		const body = await response.json();
		if (!response.ok || !body.success || body.data?.sourceSha256 !== sourceDigest) throw new Error(body.error ?? 'Could not save this scene marker.');
		const marker = { markerId: body.data.markerId, evidenceId, label: 'Scene evidence marker', revision: body.data.revision, position };
		savedMarkers = [...savedMarkers, marker];
		addMarkerVisual(marker, THREERef);
		markerStatus = `Scene marker saved at revision ${marker.revision}.`;
	}

	function onMarkerPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !pointerRay(event)) return;
		if (calibrationCapturePending) {
			placePointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
			if (controls) controls.enabled = false;
			canvas.setPointerCapture(event.pointerId);
			return;
		}
		if (!markerRoot) return;
		const hit = raycaster.intersectObjects(markerRoot.children, true)[0];
		const group = hit ? markerGroupFromHit(hit.object) : null;
		if (!group) {
			placePointerStart = placeMarkerMode ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY } : null;
			return;
		}
		const marker = savedMarkers.find((candidate) => candidate.markerId === group.userData.markerId);
		if (!marker) return;
		selectedMarkerId = marker.markerId;
		markerDrag = { markerId: marker.markerId, revision: marker.revision, original: { ...marker.position } };
		if (controls) controls.enabled = false;
		canvas.setPointerCapture(event.pointerId);
		placePointerStart = null;
	}

	function onMarkerPointerMove(event: PointerEvent) {
		if (!markerDrag) return;
		const point = hitPoint(event);
		if (!point) return;
		const sourcePoint = toSourceFramePoint(point);
		const position = { x: sourcePoint.x, y: sourcePoint.y, z: sourcePoint.z };
		updateMarkerVisual({ markerId: markerDrag.markerId, position });
		savedMarkers = savedMarkers.map((marker) => marker.markerId === markerDrag?.markerId ? { ...marker, position } : marker);
	}

	async function onMarkerPointerUp(event: PointerEvent) {
		if (calibrationCapturePending) {
			const start = placePointerStart;
			placePointerStart = null;
			if (controls) controls.enabled = true;
			if (!start || start.pointerId !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
			const point = hitPoint(event);
			if (!point) {
				calibrationStatus = 'No splat point was hit; the control point was not captured.';
				return;
			}
			try { captureCalibrationAnchor(point); }
			catch (cause) { calibrationStatus = cause instanceof Error ? cause.message : String(cause); }
			calibrationCapturePending = false;
			return;
		}
		if (markerDrag) {
			const drag = markerDrag;
			markerDrag = null;
			if (controls) controls.enabled = true;
			const marker = savedMarkers.find((candidate) => candidate.markerId === drag.markerId);
			if (!marker || (marker.position.x === drag.original.x && marker.position.y === drag.original.y && marker.position.z === drag.original.z)) return;
			try {
				const response = await fetch(markerUrl(), {
					method: 'PATCH', headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ markerId: marker.markerId, commandId: crypto.randomUUID(), expectedRevision: drag.revision, expectedSourceSha256: sourceDigest, position: marker.position }),
				});
				const body = await response.json();
				if (!response.ok || !body.success || body.data?.sourceSha256 !== sourceDigest) throw new Error(body.error ?? 'Could not save marker movement.');
				savedMarkers = savedMarkers.map((candidate) => candidate.markerId === marker.markerId ? { ...candidate, revision: body.data.revision } : candidate);
				markerStatus = `Scene marker move saved at revision ${body.data.revision}.`;
			} catch (cause) {
				const original = { markerId: drag.markerId, position: drag.original };
				updateMarkerVisual(original);
				savedMarkers = savedMarkers.map((candidate) => candidate.markerId === drag.markerId ? { ...candidate, position: drag.original } : candidate);
				markerStatus = cause instanceof Error ? cause.message : String(cause);
			}
			return;
		}
		const start = placePointerStart;
		placePointerStart = null;
		if (!placeMarkerMode || !start || start.pointerId !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
		const point = hitPoint(event);
		if (!point) return;
		try { await createSceneMarker(point); }
		catch (cause) { markerStatus = cause instanceof Error ? cause.message : String(cause); }
	}

	async function deleteSelectedMarker() {
		const marker = savedMarkers.find((candidate) => candidate.markerId === selectedMarkerId);
		if (!marker || !sourceDigest) return;
		try {
			const response = await fetch(markerUrl(), {
				method: 'DELETE', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ markerId: marker.markerId, commandId: crypto.randomUUID(), expectedRevision: marker.revision, expectedSourceSha256: sourceDigest }),
			});
			const body = await response.json();
			if (!response.ok || !body.success || body.data?.sourceSha256 !== sourceDigest) throw new Error(body.error ?? 'Could not remove this saved marker.');
			savedMarkers = savedMarkers.filter((candidate) => candidate.markerId !== marker.markerId);
			selectedMarkerId = null;
			disposeMarkerVisuals();
			for (const remaining of savedMarkers) addMarkerVisual(remaining, THREERef);
			markerStatus = `Scene marker removed at revision ${body.data.revision}.`;
		} catch (cause) {
			markerStatus = cause instanceof Error ? cause.message : String(cause);
		}
	}

	function dispose() {
		generation += 1;
		removeMarkerListeners?.();
		removeMarkerListeners = null;
		removeMarkerKeyListener?.();
		removeMarkerKeyListener = null;
		markerDrag = null;
		placePointerStart = null;
		disposeMarkerVisuals();
		markerRoot = null;
		raycaster = null;
		try { decodeClient?.dispose(); } catch { /* continue teardown */ }
		decodeClient = null;
		try { resizeObserver?.disconnect(); } catch { /* continue teardown */ }
		resizeObserver = null;
		try { renderer?.setAnimationLoop(null); } catch { /* backend may be lost */ }
		try { controls?.dispose(); } catch { /* canvas may be gone */ }
		controls = null;
		try {
			if (scene && calibratedFrame) scene.remove(calibratedFrame);
			else if (scene && splat) scene.remove(splat);
		} catch { /* scene may be gone */ }
		try { geometry?.dispose(); } catch { /* continue teardown */ }
		geometry = null;
		try { splat?.material?.dispose?.(); } catch { /* continue teardown */ }
		splat = null;
		calibratedFrame = null;
		try { renderer?.dispose(); } catch { /* continue teardown */ }
		renderer = null;
		scene = null;
		camera = null;
		THREERef = null;
		pointCount = 0;
		sourceDigest = '';
		savedMarkers = [];
		selectedMarkerId = null;
		placeMarkerMode = false;
		calibrationAnchors = [];
		calibrationCapturePending = false;
		markerStatus = '';
		calibrationStatus = 'No admitted calibration loaded; showing source-frame coordinates.';
	}

	onDestroy(dispose);

	async function loadVerifiedSource() {
		if (!canvas || busy) return;
		busy = true;
		error = '';
		status = 'Checking case access and source integrity…';
		dispose();
		const currentGeneration = generation;
		try {
			const admissionResponse = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/spz-source?caseId=${encodeURIComponent(caseId)}`, { cache: 'no-store' });
			const admission = await admissionResponse.json();
			if (!admissionResponse.ok || !admission.success || admission.asset?.admission !== 'SOURCE_VERIFIED') {
				throw new Error(admission.error ?? `Source admission failed (${admissionResponse.status})`);
			}
			const asset = admission.asset as { sourceSha256: string; downloadUrl: string; pointCount: number; byteLength: number };
			const sourceResponse = await fetch(asset.downloadUrl, { cache: 'no-store' });
			if (!sourceResponse.ok) throw new Error(`Authorized source download failed (${sourceResponse.status})`);
			const bytes = await sourceResponse.arrayBuffer();
			if (bytes.byteLength !== asset.byteLength) throw new Error('Downloaded SPZ length does not match its verified source receipt.');
			const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
			const downloadedDigest = `sha256:${Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
			if (downloadedDigest !== asset.sourceSha256) throw new Error('Downloaded SPZ SHA-256 differs from the admitted source.');
			if (currentGeneration !== generation) return;
			const calibration = await loadCalibrationForSource(asset.sourceSha256);
			if (currentGeneration !== generation) return;

			status = 'Source verified; preparing the splat viewer…';
			const THREE = await import('three/webgpu');
			THREERef = THREE;
			const [{ GaussianSplat }, { OrbitControls }] = await Promise.all([
				import('three/addons/objects/GaussianSplat.js'),
				import('three/addons/controls/OrbitControls.js'),
			]);
			if (currentGeneration !== generation) return;
			renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
			await renderer.init();
			if (currentGeneration !== generation) { renderer.dispose(); renderer = null; return; }
			scene = new THREE.Scene();
			scene.background = new THREE.Color('#0b101b');
			camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
			decodeClient = createSpzDecodeClient();
			const decodeJob = decodeClient.decode(bytes);
			const decoded = await decodeJob.result;
			if (currentGeneration !== generation) return;
			if (decoded.sourceSha256 !== asset.sourceSha256) throw new Error('Worker decode source digest does not match the admitted evidence digest.');
			geometry = workerPayloadToGaussianGeometry(decoded);
			decodeClient.dispose();
			decodeClient = null;
			splat = new GaussianSplat(geometry, { autoSort: true });
			splat.name = `Case evidence ${evidenceId} SPZ`;
			calibratedFrame = calibration
				? createCalibratedGroup({
					scale: calibration.transform.scale,
					yawRad: calibration.transform.yawRad,
					translation: [
						Number(calibration.transform.translation[0]),
						Number(calibration.transform.translation[1]),
						Number(calibration.transform.translation[2])
					]
				})
				: new THREE.Group();
			calibratedFrame.name = calibration ? 'case-evidence-calibrated-frame' : 'case-evidence-source-frame';
			scene.add(calibratedFrame);
			calibratedFrame.add(splat);
			markerRoot = new THREE.Group();
			markerRoot.name = 'case-evidence-anchors';
			calibratedFrame.add(markerRoot);
			raycaster = new THREE.Raycaster();
			geometry.computeBoundingSphere();
			const bounds = geometry.boundingSphere;
			const center = (bounds?.center ?? new THREE.Vector3()).clone();
			calibratedFrame.updateMatrixWorld(true);
			const worldCenter = center.clone().applyMatrix4(calibratedFrame.matrixWorld);
			const radius = Math.max(bounds?.radius ?? 1, 0.1) * calibratedFrame.scale.x;
			markerWorldRadius = Math.max(0.006, Math.min(radius * 0.012, 0.045));
			camera.position.set(worldCenter.x + radius * 0.15, worldCenter.y + radius * 0.1, worldCenter.z + radius * 6);
			camera.lookAt(worldCenter);
			controls = new OrbitControls(camera, renderer.domElement);
			controls.target.copy(worldCenter);
			controls.enableDamping = true;
			controls.update();
			canvas.addEventListener('pointerdown', onMarkerPointerDown);
			canvas.addEventListener('pointermove', onMarkerPointerMove);
			canvas.addEventListener('pointerup', onMarkerPointerUp);
			canvas.addEventListener('pointercancel', onMarkerPointerUp);
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') placeMarkerMode = false;
				if ((event.key === 'Delete' || event.key === 'Backspace') && selectedMarkerId) {
					event.preventDefault();
					void deleteSelectedMarker();
				}
			};
			window.addEventListener('keydown', onKeyDown);
			removeMarkerKeyListener = () => window.removeEventListener('keydown', onKeyDown);
			removeMarkerListeners = () => {
				canvas?.removeEventListener('pointerdown', onMarkerPointerDown);
				canvas?.removeEventListener('pointermove', onMarkerPointerMove);
				canvas?.removeEventListener('pointerup', onMarkerPointerUp);
				canvas?.removeEventListener('pointercancel', onMarkerPointerUp);
			};
			const resize = () => {
				if (!renderer || !camera || !canvas) return;
				const rect = canvas.getBoundingClientRect();
				const width = Math.max(1, Math.floor(rect.width));
				const height = Math.max(1, Math.floor(rect.height));
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
				renderer.setSize(width, height, false);
			};
			resizeObserver = new ResizeObserver(resize);
			resizeObserver.observe(canvas);
			resize();
			renderer.setAnimationLoop(() => { controls?.update(); renderer?.render(scene, camera); });
			pointCount = decoded.numPoints;
			sourceDigest = decoded.sourceSha256;
			try { await loadSceneMarkers(sourceDigest, THREE, currentGeneration); }
			catch (cause) { markerStatus = `Scene anchors could not be loaded: ${cause instanceof Error ? cause.message : String(cause)}`; }
			const backend = renderer.backend?.isWebGLBackend ? 'WebGL2 fallback' : renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'unknown backend';
			status = `Source verified · ${pointCount.toLocaleString()} splats · automatic sorting · ${backend}`;
		} catch (cause) {
			if (currentGeneration === generation) {
				error = cause instanceof Error ? cause.message : String(cause);
				status = 'SPZ scene could not be loaded.';
				dispose();
			}
		} finally {
			busy = false;
		}
	}

	function setSampling(mode: 'native' | 'half' | 'retro') {
		samplingMode = mode;
		if (!renderer || !canvas) return;
		renderer.setPixelRatio(renderPixelRatioV1(window.devicePixelRatio || 1, mode));
		const rect = canvas.getBoundingClientRect();
		renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)), false);
		canvas.style.imageRendering = renderImageRenderingV1(mode);
	}
</script>

<section class="spz-case-viewer" aria-label="Case evidence Gaussian splat viewer">
	<div class="spz-toolbar">
		<button type="button" class="spz-load" onclick={loadVerifiedSource} disabled={busy || !!renderer}>{busy ? 'Loading…' : renderer ? 'SPZ loaded' : 'Load verified SPZ'}</button>
		<div class="spz-sampling" role="group" aria-label="SPZ display sampling">
			<button type="button" aria-pressed={samplingMode === 'native'} onclick={() => setSampling('native')}>Native</button>
			<button type="button" aria-pressed={samplingMode === 'half'} onclick={() => setSampling('half')}>Half</button>
			<button type="button" aria-pressed={samplingMode === 'retro'} title="Low-resolution nearest-pixel display preview; not DLSS" onclick={() => setSampling('retro')}>Retro</button>
		</div>
		<button type="button" class="spz-place-marker" aria-pressed={placeMarkerMode} disabled={!renderer} onclick={() => (placeMarkerMode = !placeMarkerMode)}>{placeMarkerMode ? 'Click scene to place · Esc to stop' : 'Place 3D marker'}</button>
		{#if savedMarkers.length}
			<label class="spz-marker-select-label">Marker
				<select aria-label="Select a 3D scene marker" value={selectedMarkerId ?? ''} onchange={(event) => (selectedMarkerId = (event.currentTarget as HTMLSelectElement).value || null)}>
					<option value="">Choose marker…</option>
					{#each savedMarkers as marker, index (marker.markerId)}<option value={marker.markerId}>{marker.label || `Scene marker ${index + 1}`}</option>{/each}
				</select>
			</label>
		{/if}
		{#if selectedMarkerId}<button type="button" class="spz-delete-marker" onclick={deleteSelectedMarker}>Delete selected marker</button>{/if}
		<span class="spz-status" role="status">{status}</span>
	</div>
	<p class="spz-note">3D markers are saved as source-frame hypothesis anchors keyed to the verified SPZ hash. They are not survey-calibrated or GPS coordinates. Drag a marker to move it; a changed source hash starts a separate marker set.</p>
	<section class="spz-calibration" aria-label="Local scene calibration">
		<strong>Local scene calibration</strong>
		<p>Capture SPZ points and enter corresponding surveyed local X/Y/Z meters. Use three or more non-collinear control points; this local frame is not GPS.</p>
		<div class="spz-calibration-inputs">
			<label>X meters<input aria-label="Control point X meters" type="number" step="any" bind:value={calibrationWorldDraft.x} disabled={!renderer || busy || calibrationCapturePending} /></label>
			<label>Y meters<input aria-label="Control point Y meters" type="number" step="any" bind:value={calibrationWorldDraft.y} disabled={!renderer || busy || calibrationCapturePending} /></label>
			<label>Z meters<input aria-label="Control point Z meters" type="number" step="any" bind:value={calibrationWorldDraft.z} disabled={!renderer || busy || calibrationCapturePending} /></label>
			<label>Tolerance m<input aria-label="Calibration tolerance meters" type="number" min="0.001" max="0.5" step="0.001" bind:value={calibrationToleranceM} disabled={!renderer || busy || calibrationCapturePending} /></label>
		</div>
		<div class="spz-calibration-actions">
			<button type="button" onclick={armCalibrationAnchor} disabled={!renderer || busy || calibrationCapturePending || placeMarkerMode}>Capture control point on scene</button>
			{#if calibrationCapturePending}<button type="button" onclick={() => { calibrationCapturePending = false; calibrationStatus = 'Calibration point capture cancelled.'; }}>Cancel capture</button>{/if}
			<button type="button" onclick={() => (calibrationAnchors = calibrationAnchors.slice(0, -1))} disabled={!calibrationAnchors.length || busy}>Remove last point</button>
			<button type="button" onclick={saveLocalCalibration} disabled={!caseId || !renderer || calibrationAnchors.length < 3 || busy}>Save calibration revision</button>
		</div>
		{#if calibrationAnchors.length}<ol aria-label="Captured calibration control points">{#each calibrationAnchors as anchor (anchor.id)}<li>{anchor.id}: SPZ ({anchor.splat.map((value) => value.toFixed(3)).join(', ')}) → local m ({anchor.worldM.join(', ')})</li>{/each}</ol>{/if}
		<p class="spz-calibration-status" role="status" data-testid="spz-calibration-status">{calibrationStatus}</p>
	</section>
	<div class="spz-canvas-wrap">
		<canvas bind:this={canvas} aria-label="Verified evidence Gaussian splat; drag to orbit, scroll to zoom" data-testid="case-spz-canvas"></canvas>
		{#if !renderer && !busy}<p class="spz-empty">SPZ sources must be uploaded as evidence and admitted for this case before decoding.</p>{/if}
	</div>
	{#if markerStatus}<p class="spz-marker-status" role="status">{markerStatus}</p>{/if}
	{#if sourceDigest}<p class="spz-receipt">Source {sourceDigest} · {pointCount.toLocaleString()} splats · source verified, not a measured reconstruction</p>{/if}
	{#if error}<p class="spz-error" role="alert">{error}</p>{/if}
</section>

<style>
	.spz-case-viewer { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; color:#e8ecf4; background:#080b12; overflow:auto; }
	.spz-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem; padding:.5rem; border-bottom:1px solid #343948; background:#111724; }
	.spz-toolbar button { border:1px solid #596172; border-radius:5px; padding:.35rem .55rem; color:#e8ecf4; background:#1b2432; cursor:pointer; }
	.spz-toolbar button:focus-visible { outline:2px solid #e2bd54; outline-offset:2px; }
	.spz-marker-select-label { display:flex; align-items:center; gap:.25rem; font-size:.72rem; }
	.spz-marker-select-label select { max-width:12rem; border:1px solid #596172; border-radius:5px; padding:.35rem; color:#e8ecf4; background:#1b2432; }
	.spz-toolbar button:disabled { opacity:.65; cursor:wait; }
	.spz-load { border-color:#b99d50 !important; }
	.spz-place-marker[aria-pressed="true"] { border-color:#35e6e2; color:#081116; background:#69eee4; }
	.spz-sampling { display:flex; gap:.25rem; }
	.spz-status { font-size:.75rem; opacity:.8; }
	.spz-canvas-wrap { position:relative; flex:1; min-height:18rem; }
	canvas { display:block; width:100%; height:100%; min-height:18rem; touch-action:none; cursor:grab; }
	canvas:active { cursor:grabbing; }
	.spz-empty { position:absolute; inset:50% auto auto 50%; width:min(90%,32rem); transform:translate(-50%,-50%); text-align:center; font-size:.85rem; opacity:.72; pointer-events:none; }
	.spz-note,.spz-calibration-status,.spz-receipt,.spz-error,.spz-marker-status { margin:.35rem .6rem; font-size:.72rem; overflow-wrap:anywhere; }
	.spz-note { color:#f0d58a; }
	.spz-calibration-status { color:#8fe9df; }
	.spz-calibration { margin:.35rem .6rem; padding:.6rem; border:1px solid #34475b; border-radius:.5rem; background:#101a27; font-size:.72rem; }
	.spz-calibration strong { color:#f0d084; }
	.spz-calibration p { margin:.25rem 0; color:#bac5d4; }
	.spz-calibration-inputs,.spz-calibration-actions { display:flex; flex-wrap:wrap; gap:.4rem; align-items:end; margin-top:.4rem; }
	.spz-calibration-inputs label { display:grid; gap:.15rem; color:#b7c5d7; }
	.spz-calibration-inputs input { width:7rem; border:1px solid #596172; border-radius:4px; padding:.3rem; color:#e8ecf4; background:#1b2432; }
	.spz-calibration-actions button { border:1px solid #596172; border-radius:4px; padding:.35rem .5rem; color:#e8ecf4; background:#1b2432; cursor:pointer; }
	.spz-calibration-actions button:disabled { opacity:.55; cursor:not-allowed; }
	.spz-calibration ol { margin:.4rem 0; padding-left:1.2rem; color:#c8d2df; }
	.spz-marker-status { color:#89e7dc; }
	.spz-error { color:#ff9f9f; }
	@media (prefers-reduced-motion: reduce) { * { scroll-behavior:auto; } }
</style>
