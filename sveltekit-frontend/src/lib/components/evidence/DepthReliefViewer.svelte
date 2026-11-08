<script lang="ts" module>
	export type Tier = 'high' | 'medium' | 'low';
	export interface ViewerStatus {
		backend: 'WebGPU' | 'WebGL2' | 'none';
		vendor: string;
		tier: Tier;
		lod: number;
		vertices: number;
	}
	export type DepthSourceMode = 'STORED_MONOCULAR_DEPTH' | 'BRIGHTNESS_PREVIEW' | 'DEPTH_UNAVAILABLE';
	export type ReliefSamplingMode = 'native' | 'half' | 'retro';
	export interface ReliefAnnotationPoint { id: string; x: number; y: number; }
	export type AnnotationScreenPositions = Record<string, { left: number; top: number }>;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Slider } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { create2DDepthReliefGaussianCloud, serializeSpz } from '$lib/splat/spz-serializer.js';
	import { parseSpz } from '$lib/splat/spz-loader.js';
	import { createLocalSpzSession } from '$lib/splat/local-spz-session.js';

	/**
	 * Estimated 2.5D relief from ONE image + its depth map (both MUST describe the same frame).
	 * Backend chain: three/webgpu WebGPU -> WebGL2 (forced) -> flat image. Quality tier is picked from the
	 * adapter vendor (NVIDIA/AMD higher, Intel lower); three generates WGSL/GLSL itself, no per-vendor shaders.
	 * Mesh LOD swaps between three grid resolutions by camera distance. Not a measured 3D reconstruction.
	 */
	interface Props {
		imageUrl: string;
		depthUrl: string | null;
		relief?: number;
		discontinuity?: number;
		invertDepth?: boolean;
		quality?: 'auto' | Tier;
		backend?: 'auto' | 'webgpu' | 'webgl';
		wireframe?: boolean;
		showToolbar?: boolean;
		samplingMode?: ReliefSamplingMode;
		annotations?: ReliefAnnotationPoint[];
		placementEnabled?: boolean;
		draggingAnnotationId?: string | null;
		onStatus?: (s: ViewerStatus) => void;
		onLoadState?: (state: 'loading' | 'ready' | 'error') => void;
		onDepthSource?: (mode: DepthSourceMode) => void;
		onAnnotationPositions?: (positions: AnnotationScreenPositions) => void;
		onPlaceAnnotation?: (x: number, y: number) => void;
		onMoveAnnotation?: (id: string, x: number, y: number) => void;
		onToolShortcut?: (key: 'marker' | 'orbit' | 'delete' | 'deselect') => void;
	}

	let {
		imageUrl,
		depthUrl,
		relief = 0.85,
		discontinuity = 0.17,
		invertDepth = false,
		quality = 'auto',
		backend = 'auto',
		wireframe,
		showToolbar = true,
		samplingMode,
		annotations = [],
		placementEnabled = false,
		draggingAnnotationId = null,
		onStatus,
		onLoadState,
		onDepthSource,
		onAnnotationPositions,
		onPlaceAnnotation,
		onMoveAnnotation,
		onToolShortcut
	}: Props = $props();

	// Base grid width per tier; LOD1/LOD2 halve it again.
	const GRID: Record<Tier, number> = { high: 193, medium: 129, low: 97 };
	const PIXEL_RATIO: Record<Tier, number> = { high: 1.5, medium: 1.25, low: 1 };

	let host = $state<HTMLDivElement | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let localWireframe = $state(false);
	let showEvidenceBounds = $state(true);
	let localSamplingMode = $state<ReliefSamplingMode>('native');
	const activeSamplingMode = $derived(samplingMode ?? localSamplingMode);
	let applySampling: ((mode: ReliefSamplingMode) => void) | null = null;
	let evidenceBoundsSegments = $state<Array<[number, number, number, number]>>([]);
	let evidenceBoundsFaces = $state<string[]>([]);
	let evidenceBoundsHandles = $state<Array<[number, number]>>([]);
	let zoomPercent = $state(100);
	let setCameraZoom: ((value: number) => void) | null = null;
	function changeCameraZoom(value: number) { setCameraZoom?.(value); }
	const debugWireframe = $derived(wireframe ?? localWireframe);
	let updateRelief: ((value: number) => void) | null = null;
	let status = $state<ViewerStatus>({ backend: 'none', vendor: 'unknown', tier: 'medium', lod: 0, vertices: 0 });
	let sourceMode = $state<DepthSourceMode>('DEPTH_UNAVAILABLE');
	let exportSpz = $state<(() => void) | null>(null);

	$effect(() => updateRelief?.(relief));
	$effect(() => applySampling?.(activeSamplingMode));

	async function detectGpu(): Promise<{ vendor: string; tier: Tier; hasWebGPU: boolean }> {
		const gpu = (navigator as any).gpu;
		if (!gpu) return { vendor: 'WebGL only', tier: 'medium', hasWebGPU: false };
		try {
			const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
			if (!adapter) return { vendor: 'no adapter', tier: 'medium', hasWebGPU: false };
			const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
			const text = `${info.vendor ?? ''} ${info.architecture ?? ''} ${info.description ?? ''}`.toLowerCase();
			const vendor = info.vendor || info.description || 'unknown';
			let tier: Tier = 'medium';
			if (/nvidia|amd|radeon|geforce/.test(text)) tier = 'high';
			else if (/\barc\b|xe-hpg|battlemage|alchemist/.test(text)) tier = 'high';
			else if (/intel/.test(text)) tier = 'medium';
			return { vendor, tier, hasWebGPU: true };
		} catch {
			return { vendor: 'adapter query failed', tier: 'medium', hasWebGPU: false };
		}
	}

	onMount(() => {
		let disposed = false;
		let shutdown: (() => void) | null = null;

		async function boot() {
			let colorBitmap: ImageBitmap | null = null;
			let depthBitmap: ImageBitmap | null = null;
			let renderer: any = null;
			let controls: any = null;
			let observer: ResizeObserver | null = null;
			let interactionCleanup: (() => void) | null = null;
			let spzSession: any = null;
			const geometries: Array<{ dispose(): void }> = [];
			const materials: Array<{ dispose(): void }> = [];
			const textures: Array<{ dispose(): void }> = [];
			let resourcesReleased = false;
			const releaseResources = () => {
				if (resourcesReleased) return;
				resourcesReleased = true;
				renderer?.setAnimationLoop(null);
				setCameraZoom = null;
				applySampling = null;
				updateRelief = null;
				spzSession?.cancel();
				spzSession = null;
				exportSpz = null;
				observer?.disconnect();
				interactionCleanup?.();
				interactionCleanup = null;
				controls?.dispose();
				geometries.forEach((geometry) => geometry.dispose());
				materials.forEach((material) => material.dispose());
				textures.forEach((texture) => texture.dispose());
				renderer?.dispose();
				renderer?.domElement?.remove();
			};
			try {
				onLoadState?.('loading');
				const THREE: any = await import('three/webgpu');
				const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
				if (disposed) return;
				const fetchBitmap = async (url: string) => {
					const response = await fetch(url, { credentials: 'same-origin' });
					if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
					return createImageBitmap(await response.blob());
				};
				colorBitmap = await fetchBitmap(imageUrl);
				if (disposed) return;

				const imageAspect = colorBitmap.width / colorBitmap.height;
				let depthSourceMode: DepthSourceMode = 'DEPTH_UNAVAILABLE';
				if (depthUrl) {
					try {
						const candidateDepth = await fetchBitmap(depthUrl);
						const depthAspect = candidateDepth.width / candidateDepth.height;
						if (candidateDepth.width !== colorBitmap.width || candidateDepth.height !== colorBitmap.height || Math.abs(imageAspect - depthAspect) > 0.001) {
							candidateDepth.close();
							throw new Error('Depth map dimensions do not match its source image');
						}
						depthBitmap = candidateDepth;
						depthSourceMode = 'STORED_MONOCULAR_DEPTH';
					} catch {
						depthBitmap = null;
					}
				}
				if (!depthBitmap) {
					try {
						const previewCanvas = document.createElement('canvas');
						previewCanvas.width = 256;
						previewCanvas.height = Math.max(16, Math.round(256 / imageAspect));
						const previewContext = previewCanvas.getContext('2d');
						if (!previewContext) throw new Error('Preview canvas unavailable');
						previewContext.filter = 'grayscale(1) blur(6px) contrast(1.15)';
						previewContext.drawImage(colorBitmap, 0, 0, previewCanvas.width, previewCanvas.height);
						previewContext.filter = 'none';
						depthBitmap = await createImageBitmap(previewCanvas);
						depthSourceMode = 'BRIGHTNESS_PREVIEW';
					} catch {
						const flatDepth = document.createElement('canvas');
						flatDepth.width = 2;
						flatDepth.height = 2;
						const flatContext = flatDepth.getContext('2d');
						if (flatContext) {
							flatContext.fillStyle = '#808080';
							flatContext.fillRect(0, 0, 2, 2);
						}
						depthBitmap = await createImageBitmap(flatDepth);
					}
				}
				if (disposed) return;
				sourceMode = depthSourceMode;
				onDepthSource?.(depthSourceMode);

				const gpuInfo = await detectGpu();
				if (disposed) return;
				const tier: Tier = quality === 'auto' ? gpuInfo.tier : quality;

				// Build three source-faithful texture levels alongside the geometry LODs.
				// These are lower-resolution samples of the same evidence image, not generated detail.
				const textureWidth = Math.min(1536, colorBitmap.width);
				const textureLevels = [0, 1, 2].map((level) => {
					const colorCanvas = document.createElement('canvas');
					colorCanvas.width = Math.max(64, Math.round(textureWidth / 2 ** level));
					colorCanvas.height = Math.max(64, Math.round(colorCanvas.width / imageAspect));
					const cctx = colorCanvas.getContext('2d');
					if (!cctx) throw new Error('Color texture LOD canvas unavailable');
					cctx.drawImage(colorBitmap, 0, 0, colorCanvas.width, colorCanvas.height);
					const texture = new THREE.CanvasTexture(colorCanvas);
					texture.colorSpace = THREE.SRGBColorSpace;
					texture.anisotropy = tier === 'high' && level === 0 ? 8 : 4;
					textures.push(texture);
					return texture;
				});
				const texture = textureLevels[0]!;

				// Retain offscreen sampling canvas for SPZ export
				const spzSampleW = 128;
				const spzSampleH = Math.max(16, Math.min(256, Math.round(spzSampleW / imageAspect)));
				const spzColorCanvas = document.createElement('canvas');
				spzColorCanvas.width = spzSampleW;
				spzColorCanvas.height = spzSampleH;
				const spzColorCtx = spzColorCanvas.getContext('2d');
				if (spzColorCtx) spzColorCtx.drawImage(colorBitmap, 0, 0, spzSampleW, spzSampleH);

				const spzDepthCanvas = document.createElement('canvas');
				spzDepthCanvas.width = spzSampleW;
				spzDepthCanvas.height = spzSampleH;
				const spzDepthCtx = spzDepthCanvas.getContext('2d');
				if (spzDepthCtx && depthBitmap) spzDepthCtx.drawImage(depthBitmap, 0, 0, spzSampleW, spzSampleH);

				spzSession = createLocalSpzSession({
					serialize: (cloud) => serializeSpz(cloud),
					decode: (bytes) => parseSpz(bytes),
					decodedPointCount: (decoded) => decoded.positions.length / 3
				});

				exportSpz = async () => {
					if (!spzColorCtx || !spzDepthCtx) return;
					const cPixels = spzColorCtx.getImageData(0, 0, spzSampleW, spzSampleH).data;
					const dPixels = spzDepthCtx.getImageData(0, 0, spzSampleW, spzSampleH).data;
					const rgb = new Uint8Array(spzSampleW * spzSampleH * 3);
					const depthArr = new Float32Array(spzSampleW * spzSampleH);
					for (let i = 0; i < spzSampleW * spzSampleH; i++) {
						rgb[i * 3] = cPixels[i * 4];
						rgb[i * 3 + 1] = cPixels[i * 4 + 1];
						rgb[i * 3 + 2] = cPixels[i * 4 + 2];
						depthArr[i] = dPixels[i * 4] / 255;
					}
					const cloud = create2DDepthReliefGaussianCloud(spzSampleW, spzSampleH, rgb, depthArr, {
						step: 1,
						depthScale: relief,
					});
					const sessionResult = await spzSession.process(cloud);
					if (sessionResult) {
						sessionResult.download(`evidence-relief-${sessionResult.sha256.slice(0, 8)}.spz`);
					}
				};

				const width = 2;
				const height = width / imageAspect;
				const direction = invertDepth ? -1 : 1;

				// One relief mesh at a given grid width (edge-aware smoothing + discontinuity culling).
				function buildReliefGeometry(gridW: number) {
					const gridH = Math.max(17, Math.min(257, Math.round((gridW - 1) / imageAspect) + 1));
					const dc = document.createElement('canvas');
					dc.width = gridW;
					dc.height = gridH;
					const dctx = dc.getContext('2d', { willReadFrequently: true });
					if (!dctx) throw new Error('Depth canvas unavailable');
					dctx.drawImage(depthBitmap!, 0, 0, gridW, gridH);
					const depth = dctx.getImageData(0, 0, gridW, gridH).data;
					const geometry = new THREE.PlaneGeometry(width, height, gridW - 1, gridH - 1);
					geometries.push(geometry);
					const positions = geometry.getAttribute('position');
					const z = new Float32Array(gridW * gridH);
					const d = (x: number, y: number) => depth[((gridH - 1 - y) * gridW + x) * 4] / 255;
					for (let y = 0; y < gridH; y++) {
						for (let x = 0; x < gridW; x++) {
							const base = d(x, y);
							let sum = base;
							let n = 1;
							for (let dy = -1; dy <= 1; dy++) {
								for (let dx = -1; dx <= 1; dx++) {
									if (!dx && !dy) continue;
									const xx = x + dx, yy = y + dy;
									if (xx < 0 || yy < 0 || xx >= gridW || yy >= gridH) continue;
									const next = d(xx, yy);
									if (Math.abs(next - base) < 0.065) { sum += next; n++; }
								}
							}
							const i = y * gridW + x;
							z[i] = ((sum / n) - 0.5) * direction;
							positions.setZ(i, z[i] * relief);
						}
					}
					const src = geometry.getIndex();
					if (!src) throw new Error('Grid index unavailable');
					const kept: number[] = [];
					for (let i = 0; i < src.count; i += 3) {
						const a = src.getX(i), b = src.getX(i + 1), c = src.getX(i + 2);
						if ((Math.max(z[a], z[b], z[c]) - Math.min(z[a], z[b], z[c])) * Math.abs(relief) <= discontinuity) kept.push(a, b, c);
					}
					geometry.setIndex(kept);
					geometry.computeVertexNormals();
					return { geometry, gridW, gridH, z };
				}

				const material = new THREE.MeshStandardMaterial({
					map: texture, color: '#ffffff', metalness: 0, roughness: 0.88, side: THREE.DoubleSide
				});
				materials.push(material);
				const scene = new THREE.Scene();
				scene.background = new THREE.Color('#0c1220');
				const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
				camera.position.set(0, 0, 3.4);

				const baseGrid = GRID[tier];
				const gridSizes = [baseGrid, Math.round(baseGrid / 2) | 1, Math.round(baseGrid / 4) | 1];
				const lods = gridSizes.map((g) => {
					const grid = buildReliefGeometry(g);
					const { geometry } = grid;
					const mesh = new THREE.Mesh(geometry, material);
					mesh.visible = false;
					scene.add(mesh);
					return { ...grid, mesh, vertices: geometry.getAttribute('position').count };
				});

				// Backplate hides gaps at culled discontinuities.
				const backMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
				materials.push(backMaterial);
				const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), backMaterial);
				geometries.push(backPlane.geometry);
				backPlane.position.z = -Math.abs(relief) * 0.5 - 0.045;
				scene.add(backPlane);
				scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x525d77, 2.1));
				const key = new THREE.DirectionalLight(0xfff5e9, 1.6);
				key.position.set(-2, 3, 5);
				scene.add(key);

				// Renderer chain: WebGPU -> forced WebGL2. A failed init disposes before retrying.
				async function makeRenderer(forceWebGL: boolean) {
					const r = new THREE.WebGPURenderer({ antialias: true, alpha: false, forceWebGL });
					r.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[tier]));
					try {
						await r.init();
						return r;
					} catch (e) {
						r.dispose?.();
						throw e;
					}
				}
				const wantWebGPU = backend !== 'webgl' && gpuInfo.hasWebGPU;
				try {
					renderer = await makeRenderer(!wantWebGPU);
				} catch {
					renderer = await makeRenderer(true); // throws if WebGL2 is unavailable too
				}
				if (disposed) { releaseResources(); return; }
				if (!host) throw new Error('Viewer host missing');
				host.appendChild(renderer.domElement);
				const activeBackend: 'WebGPU' | 'WebGL2' = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
				renderer.domElement.setAttribute('role', 'application');
				renderer.domElement.setAttribute('aria-label', 'Interactive source-bound depth relief. Use Orbit or Place marker tools; press Enter to place a marker.');
				renderer.domElement.tabIndex = 0;
				updateRelief = (value) => {
					for (const lod of lods) {
						const positions = lod.geometry.getAttribute('position');
						for (let i = 0; i < lod.z.length; i++) positions.setZ(i, lod.z[i] * value);
						positions.needsUpdate = true;
						lod.geometry.computeVertexNormals();
						lod.geometry.computeBoundingBox();
					}
					backPlane.position.z = -Math.abs(value) * 0.5 - 0.045;
				};

				controls = new OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.dampingFactor = 0.075;
				controls.enablePan = true;
				controls.screenSpacePanning = true;
				controls.minDistance = 0.85;
				controls.maxDistance = 14;
				// Never orbit behind a single-view surface and reveal invented geometry.
				controls.minAzimuthAngle = -Math.PI / 5;
				controls.maxAzimuthAngle = Math.PI / 5;
				controls.minPolarAngle = Math.PI / 2 - Math.PI / 5;
				controls.maxPolarAngle = Math.PI / 2 + Math.PI / 5;
				const defaultCameraDistance = camera.position.distanceTo(controls.target);
				setCameraZoom = (value: number) => {
					const nextZoom = THREE.MathUtils.clamp(value, 25, 400);
					const direction = camera.position.clone().sub(controls.target).normalize();
					const distance = THREE.MathUtils.clamp(defaultCameraDistance * (100 / nextZoom), controls.minDistance, controls.maxDistance);
					camera.position.copy(controls.target).addScaledVector(direction, distance);
					zoomPercent = Math.round((defaultCameraDistance / distance) * 100);
					controls.update();
				};

				const resize = () => {
					if (!host) return;
					const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
					camera.aspect = w / h;
					camera.updateProjectionMatrix();
					renderer.setSize(w, h, false);
				};
				const applySamplingMode = (mode: ReliefSamplingMode) => {
					const scale = mode === 'native' ? 1 : mode === 'half' ? 0.5 : 0.35;
					renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[tier]) * scale);
					renderer.domElement.style.imageRendering = mode === 'retro' ? 'pixelated' : '';
					for (const levelTexture of textureLevels) {
						levelTexture.magFilter = mode === 'retro' ? THREE.NearestFilter : THREE.LinearFilter;
						levelTexture.minFilter = mode === 'retro' ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
						levelTexture.generateMipmaps = mode !== 'retro';
						levelTexture.needsUpdate = true;
					}
					resize();
				};
				applySampling = applySamplingMode;
				applySamplingMode(activeSamplingMode);
				observer = new ResizeObserver(resize);
				observer.observe(host);
				resize();

				let currentLod = -1;
				let projectionTick = 0;
				let boundsTick = 0;
				const raycaster = new THREE.Raycaster();
				const pointer = new THREE.Vector2();
				function pickImagePoint(clientX: number, clientY: number) {
					const bounds = renderer.domElement.getBoundingClientRect();
					if (!bounds.width || !bounds.height || currentLod < 0) return null;
					pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
					raycaster.setFromCamera(pointer, camera);
					const hit = raycaster.intersectObject(lods[currentLod].mesh, false)[0];
					if (!hit) return null;
					const local = lods[currentLod].mesh.worldToLocal(hit.point.clone());
					return { x: THREE.MathUtils.clamp(local.x / width + 0.5, 0, 1), y: THREE.MathUtils.clamp(0.5 - local.y / height, 0, 1) };
				}
				const onCanvasPointerDown = (event: PointerEvent) => {
					if (!placementEnabled || event.button !== 0) return;
					event.preventDefault();
					const point = pickImagePoint(event.clientX, event.clientY);
					if (point) onPlaceAnnotation?.(point.x, point.y);
				};
				const onCanvasKeydown = (event: KeyboardEvent) => {
					if (event.key.toLowerCase() === 'm') onToolShortcut?.('marker');
					else if (event.key.toLowerCase() === 'o') onToolShortcut?.('orbit');
					else if (event.key === 'Escape') onToolShortcut?.('deselect');
					else if (event.key === 'Delete' || event.key === 'Backspace') onToolShortcut?.('delete');
					else if (placementEnabled && (event.key === 'Enter' || event.key === ' ')) {
						event.preventDefault();
						const bounds = renderer.domElement.getBoundingClientRect();
						const point = pickImagePoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
						if (point) onPlaceAnnotation?.(point.x, point.y);
					}
				};
				const onWindowPointerMove = (event: PointerEvent) => {
					if (!draggingAnnotationId) return;
					const point = pickImagePoint(event.clientX, event.clientY);
					if (point) onMoveAnnotation?.(draggingAnnotationId, point.x, point.y);
				};
				renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
				renderer.domElement.addEventListener('keydown', onCanvasKeydown);
				window.addEventListener('pointermove', onWindowPointerMove);
				interactionCleanup = () => {
					renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
					renderer.domElement.removeEventListener('keydown', onCanvasKeydown);
					window.removeEventListener('pointermove', onWindowPointerMove);
				};
				const pickLod = (dist: number) => (dist < 2.9 ? 0 : dist < 3.9 ? 1 : 2);
				renderer.setAnimationLoop(() => {
					controls.enabled = !placementEnabled && !draggingAnnotationId;
					controls.update();
					const cameraZoom = THREE.MathUtils.clamp(Math.round((defaultCameraDistance / camera.position.distanceTo(controls.target)) * 100), 25, 400);
					if (cameraZoom !== zoomPercent) zoomPercent = cameraZoom;
					const lod = pickLod(camera.position.distanceTo(controls.target));
					if (lod !== currentLod) {
						lods.forEach((l, i) => (l.mesh.visible = i === lod));
						material.map = textureLevels[lod] ?? textureLevels[2];
						material.needsUpdate = true;
						currentLod = lod;
						status = { backend: activeBackend, vendor: gpuInfo.vendor, tier, lod, vertices: lods[lod].vertices };
						onStatus?.(status);
					}
					if (showEvidenceBounds && host && ++boundsTick % 2 === 0) {
						// This encloses the whole image-derived relief mesh. It is not an object detector box.
						const bounds = new THREE.Box3().setFromObject(lods[currentLod].mesh);
						bounds.expandByScalar(Math.max(width, height) * 0.008);
						const corners = [
							new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
							new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
							new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
							new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
							new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
							new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
							new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
							new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z)
						];
						const projected = corners.map((point) => point.project(camera));
						const screen = projected.map((point) => [
							((point.x + 1) / 2) * host!.clientWidth,
							((1 - point.y) / 2) * host!.clientHeight
						] as const);
						const edges: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
						const faces: number[][] = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
						evidenceBoundsSegments = edges.map(([a, b]) => [screen[a][0], screen[a][1], screen[b][0], screen[b][1]] as [number, number, number, number]);
						evidenceBoundsFaces = faces.map((face) => face.map((index) => `${screen[index][0]},${screen[index][1]}`).join(' '));
						evidenceBoundsHandles = [0, 2, 4, 6].map((index) => [screen[index][0], screen[index][1]] as [number, number]);
					} else if (!showEvidenceBounds && evidenceBoundsSegments.length) {
						evidenceBoundsSegments = [];
						evidenceBoundsFaces = [];
						evidenceBoundsHandles = [];
					}
					if (onAnnotationPositions && ++projectionTick % 3 === 0) {
						const positions: AnnotationScreenPositions = {};
						const activeGrid = lods[currentLod];
						for (const annotation of annotations) {
							const gridX = annotation.x * (activeGrid.gridW - 1);
							const gridY = (1 - annotation.y) * (activeGrid.gridH - 1);
							const x0 = Math.floor(gridX), y0 = Math.floor(gridY);
							const x1 = Math.min(activeGrid.gridW - 1, x0 + 1), y1 = Math.min(activeGrid.gridH - 1, y0 + 1);
							const tx = gridX - x0, ty = gridY - y0;
							const z00 = activeGrid.z[y0 * activeGrid.gridW + x0];
							const z10 = activeGrid.z[y0 * activeGrid.gridW + x1];
							const z01 = activeGrid.z[y1 * activeGrid.gridW + x0];
							const z11 = activeGrid.z[y1 * activeGrid.gridW + x1];
							const z = ((z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty) * relief + 0.018;
							const projected = new THREE.Vector3((annotation.x - 0.5) * width, (0.5 - annotation.y) * height, z).project(camera);
							if (projected.z >= -1 && projected.z <= 1) positions[annotation.id] = { left: ((projected.x + 1) / 2) * 100, top: ((1 - projected.y) / 2) * 100 };
						}
						onAnnotationPositions(positions);
					}
					material.wireframe = debugWireframe;
					renderer.render(scene, camera);
				});
				loading = false;
				onLoadState?.('ready');

				shutdown = releaseResources;
			} catch (e) {
				releaseResources();
				if (!disposed) {
					error = e instanceof Error ? e.message : String(e);
					onLoadState?.('error');
				}
			} finally {
				colorBitmap?.close();
				depthBitmap?.close();
				if (!disposed) {
					loading = false;
					if (error) onLoadState?.('error');
				}
			}
		}
		void boot();
		return () => { disposed = true; shutdown?.(); };
	});
</script>

<div
	class="relief"
	aria-label="Depth-estimated three dimensional evidence relief"
	data-testid="depth-relief"
	data-backend={status.backend}
	data-tier={status.tier}
	data-lod={status.lod}
	data-depth-source={sourceMode}
>
	<div bind:this={host} class="scene"></div>
	{#if showEvidenceBounds && evidenceBoundsSegments.length}
		<svg class="evidence-bounds" aria-hidden="true">
			{#each evidenceBoundsFaces as face, index (`face-${index}`)}<polygon class="evidence-bounds-face" points={face} />{/each}
			{#each evidenceBoundsSegments as segment, index (`edge-${index}`)}<line class="evidence-bounds-edge" x1={segment[0]} y1={segment[1]} x2={segment[2]} y2={segment[3]} />{/each}
			{#each evidenceBoundsHandles as handle, index (`handle-${index}`)}<rect class="evidence-bounds-handle" x={handle[0] - 4} y={handle[1] - 4} width="8" height="8" rx="1" />{/each}
		</svg>
	{/if}
	<div class="canvas-controls" role="group" aria-label="Evidence canvas navigation">
		<button type="button" aria-label="Zoom out" title="Zoom out" onclick={() => changeCameraZoom(zoomPercent - 20)}>−</button>
		<Slider.Root type="single" min={25} max={400} step={5} value={zoomPercent} onValueChange={changeCameraZoom} aria-label="Canvas zoom" class="canvas-zoom-slider">
			{#snippet children({ thumbItems })}
				<span class="canvas-zoom-track"><Slider.Range class="canvas-zoom-range" /></span>
				{#each thumbItems as thumb (thumb.index)}<Slider.Thumb index={thumb.index} class="canvas-zoom-thumb" aria-label="Canvas zoom" />{/each}
			{/snippet}
		</Slider.Root>
		<output aria-live="off">{zoomPercent}%</output>
		<button type="button" aria-label="Zoom in" title="Zoom in" onclick={() => changeCameraZoom(zoomPercent + 20)}>+</button>
		<button type="button" aria-label="Reset canvas view" title="Reset view" onclick={() => changeCameraZoom(100)}>⌂</button>
		<button type="button" aria-pressed={showEvidenceBounds} title="Toggle source surface bounds" aria-label="Toggle source surface bounds" onclick={() => (showEvidenceBounds = !showEvidenceBounds)}>□</button>
		<span class="canvas-hint">Scroll to zoom · right-drag to pan</span>
	</div>
	{#if loading}<div class="message">Building textured depth surface…</div>{/if}
	{#if error}
		<!-- Final fallback: flat evidence image so the panel is never blank. -->
		<img class="flat" src={imageUrl} alt="Evidence (flat view; relief unavailable)" />
		<div class="message error" role="alert" data-testid="depth-relief-error">
			<Icon name="yorha-warning" size={16} /> {error}
		</div>
	{/if}
	{#if showToolbar}
	<div class="toolbar">
		<span class="note">
			<Icon name="yorha-evidence" size={16} />
			{sourceMode === 'STORED_MONOCULAR_DEPTH' ? 'Stored image-bound depth' : sourceMode === 'BRIGHTNESS_PREVIEW' ? 'Brightness preview only' : 'Flat image fallback'} · derived 2.5D, not measured 3D
			{#if status.backend !== 'none'}· {status.backend} · {status.tier} · LOD{status.lod}{/if}
		</span>
		<button type="button" aria-pressed={debugWireframe} onclick={() => (localWireframe = !localWireframe)}>
			<Icon name="yorha-network" size={16} />
			{debugWireframe ? 'Photo surface' : 'Wireframe'}
		</button>
		<div class="sampling-group" role="group" aria-label="Display sampling">
			{#each [{ id: 'native', label: 'Native' }, { id: 'half', label: 'Half' }, { id: 'retro', label: 'Retro' }] as mode (mode.id)}
				<button type="button" aria-pressed={activeSamplingMode === mode.id} onclick={() => (localSamplingMode = mode.id as ReliefSamplingMode)}>{mode.label}</button>
			{/each}
		</div>
		<button type="button" aria-pressed={showEvidenceBounds} onclick={() => (showEvidenceBounds = !showEvidenceBounds)} title="Show the bounds of the complete image-derived relief">
			<Icon name="yorha-network" size={16} />
			{showEvidenceBounds ? 'Hide evidence frame' : 'Evidence frame'}
		</button>
		{#if exportSpz}
		<button type="button" onclick={exportSpz} title="Export 2.5D depth relief as standard Niantic SPZ v4 Gaussian splat file">
			<Icon name="yorha-evidence" size={16} />
			Export .SPZ
		</button>
		{/if}
	</div>
	{/if}
</div>

<style>
	.relief { position: relative; width: 100%; height: 100%; min-height: 340px; overflow: hidden; border-radius: 12px; background: #0c1220; border: 1px solid rgba(125, 211, 252, 0.3); }
	.scene { position: absolute; inset: 0; }
	.scene :global(canvas) { display: block; width: 100%; height: 100%; touch-action: none; }
	.evidence-bounds { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
	.evidence-bounds-face { fill: rgba(85, 216, 255, 0.035); stroke: none; }
	.evidence-bounds-edge { fill: none; stroke: #7ee7ff; stroke-width: 1.5; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 3px rgba(77, 224, 255, 0.92)); animation: evidence-bounds-glow 2.2s ease-in-out infinite; }
	.evidence-bounds-handle { fill: #07111e; stroke: #9bf0ff; stroke-width: 1.5; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 4px rgba(77, 224, 255, 0.9)); }
	@keyframes evidence-bounds-glow { 0%, 100% { stroke-opacity: 0.48; filter: drop-shadow(0 0 2px rgba(77, 224, 255, 0.58)); } 50% { stroke-opacity: 1; filter: drop-shadow(0 0 7px rgba(77, 224, 255, 0.98)); } }
	@media (prefers-reduced-motion: reduce) { .evidence-bounds-edge { animation: none; stroke-opacity: 0.8; } }
	.canvas-controls { position: absolute; z-index: 4; top: 12px; right: 12px; display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid rgba(212,199,163,.25); border-radius: 9px; color: #f4e8c8; background: rgba(8,13,22,.86); backdrop-filter: blur(10px); font: 11px system-ui,sans-serif; }
	.canvas-controls button { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid rgba(212,199,163,.28); border-radius: 6px; color: inherit; background: rgba(255,255,255,.06); cursor: pointer; }
	.canvas-controls button:hover { border-color: #7ee7ff; color: #9bf0ff; }
	.canvas-controls button:focus-visible { outline: 2px solid #7ee7ff; outline-offset: 2px; }
	.canvas-controls output { min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; }
	.sampling-group { display: inline-flex; align-items: center; gap: 3px; }
	.sampling-group button { min-height: 28px; padding: 0 7px; border: 1px solid rgba(212,199,163,.28); border-radius: 6px; color: inherit; background: rgba(255,255,255,.06); cursor: pointer; }
	.sampling-group button[aria-pressed="true"] { border-color: #7ee7ff; color: #9bf0ff; background: rgba(126,231,255,.1); }
	:global(.canvas-zoom-slider) { position: relative; display: flex; width: 96px; height: 24px; align-items: center; touch-action: none; user-select: none; }
	:global(.canvas-zoom-track) { position: relative; display: block; width: 100%; height: 4px; overflow: hidden; border-radius: 9px; background: #384052; }
	:global(.canvas-zoom-range) { position: absolute; height: 100%; background: linear-gradient(90deg,#c59e2b,#7ee7ff); }
	:global(.canvas-zoom-thumb) { display: block; width: 13px; height: 13px; border: 2px solid #7ee7ff; border-radius: 50%; background: #f8f1df; box-shadow: 0 0 8px #7ee7ff; }
	.canvas-hint { padding-left: 5px; color: #b9b2a3; white-space: nowrap; }
	@media (max-width: 680px) { .canvas-controls { gap: 4px; padding: 5px; } .canvas-hint { display: none; } :global(.canvas-zoom-slider) { width: 64px; } }
	.flat { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0.85; }
	.toolbar { position: absolute; bottom: 12px; left: 12px; right: 12px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; color: #e5ebf6; font: 12px system-ui, sans-serif; pointer-events: none; }
	.note { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; background: rgba(12, 18, 32, 0.78); border: 1px solid rgba(197, 154, 43, 0.5); border-radius: 6px; }
	.toolbar button { pointer-events: auto; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: #1b2940; color: #fff; border: 1px solid rgba(125, 211, 252, 0.45); padding: 7px 11px; border-radius: 8px; }
	.toolbar button[aria-pressed='true'] { background: #2a3f5e; border-color: #c59a2b; }
	.message { position: absolute; top: 16px; left: 16px; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; background: rgba(20, 34, 53, 0.92); border-radius: 6px; color: #fff; font: 13px system-ui, sans-serif; }
	.error { color: #ffc4c4; }
</style>
