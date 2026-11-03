<script lang="ts" module>
	export type Tier = 'high' | 'medium' | 'low';
	export interface ViewerStatus {
		backend: 'WebGPU' | 'WebGL2' | 'none';
		vendor: string;
		tier: Tier;
		lod: number;
		vertices: number;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	/**
	 * Estimated 2.5D relief from ONE image + its depth map (both MUST describe the same frame).
	 * Backend chain: three/webgpu WebGPU -> WebGL2 (forced) -> flat image. Quality tier is picked from the
	 * adapter vendor (NVIDIA/AMD higher, Intel lower); three generates WGSL/GLSL itself, no per-vendor shaders.
	 * Mesh LOD swaps between three grid resolutions by camera distance. Not a measured 3D reconstruction.
	 */
	interface Props {
		imageUrl: string;
		depthUrl: string;
		relief?: number;
		discontinuity?: number;
		invertDepth?: boolean;
		quality?: 'auto' | Tier;
		backend?: 'auto' | 'webgpu' | 'webgl';
		onStatus?: (s: ViewerStatus) => void;
	}

	let {
		imageUrl,
		depthUrl,
		relief = 0.85,
		discontinuity = 0.17,
		invertDepth = false,
		quality = 'auto',
		backend = 'auto',
		onStatus
	}: Props = $props();

	// Base grid width per tier; LOD1/LOD2 halve it again.
	const GRID: Record<Tier, number> = { high: 193, medium: 129, low: 97 };
	const PIXEL_RATIO: Record<Tier, number> = { high: 1.5, medium: 1.25, low: 1 };

	let host = $state<HTMLDivElement | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let debugWireframe = $state(false);
	let status = $state<ViewerStatus>({ backend: 'none', vendor: 'unknown', tier: 'medium', lod: 0, vertices: 0 });

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
			try {
				const THREE: any = await import('three/webgpu');
				const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
				const fetchBitmap = async (url: string) => {
					const response = await fetch(url, { credentials: 'same-origin' });
					if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
					return createImageBitmap(await response.blob());
				};
				[colorBitmap, depthBitmap] = await Promise.all([fetchBitmap(imageUrl), fetchBitmap(depthUrl)]);
				if (disposed) return;

				const imageAspect = colorBitmap.width / colorBitmap.height;
				const depthAspect = depthBitmap.width / depthBitmap.height;
				if (Math.abs(imageAspect - depthAspect) > 0.015) {
					throw new Error('Image and depth dimensions do not match the same frame');
				}

				const gpuInfo = await detectGpu();
				const tier: Tier = quality === 'auto' ? gpuInfo.tier : quality;

				// Color texture from the real source pixels.
				const colorCanvas = document.createElement('canvas');
				colorCanvas.width = Math.min(1536, colorBitmap.width);
				colorCanvas.height = Math.round(colorCanvas.width / imageAspect);
				const cctx = colorCanvas.getContext('2d');
				if (!cctx) throw new Error('Color canvas unavailable');
				cctx.drawImage(colorBitmap, 0, 0, colorCanvas.width, colorCanvas.height);
				const texture = new THREE.CanvasTexture(colorCanvas);
				texture.colorSpace = THREE.SRGBColorSpace;
				texture.anisotropy = tier === 'high' ? 8 : 4;

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
					const positions = geometry.getAttribute('position');
					const z = new Float32Array(gridW * gridH);
					const d = (x: number, y: number) => depth[(y * gridW + x) * 4] / 255;
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
							z[i] = ((sum / n) - 0.5) * relief * direction;
							positions.setZ(i, z[i]);
						}
					}
					const src = geometry.getIndex();
					if (!src) throw new Error('Grid index unavailable');
					const kept: number[] = [];
					for (let i = 0; i < src.count; i += 3) {
						const a = src.getX(i), b = src.getX(i + 1), c = src.getX(i + 2);
						if (Math.max(z[a], z[b], z[c]) - Math.min(z[a], z[b], z[c]) <= discontinuity) kept.push(a, b, c);
					}
					geometry.setIndex(kept);
					geometry.computeVertexNormals();
					return geometry;
				}

				const material = new THREE.MeshStandardMaterial({
					map: texture, color: '#ffffff', metalness: 0, roughness: 0.88, side: THREE.DoubleSide
				});
				const scene = new THREE.Scene();
				scene.background = new THREE.Color('#0c1220');
				const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
				camera.position.set(0, 0, 3.4);

				const baseGrid = GRID[tier];
				const gridSizes = [baseGrid, Math.round(baseGrid / 2) | 1, Math.round(baseGrid / 4) | 1];
				const lods = gridSizes.map((g) => {
					const geometry = buildReliefGeometry(g);
					const mesh = new THREE.Mesh(geometry, material);
					mesh.visible = false;
					scene.add(mesh);
					return { geometry, mesh, vertices: geometry.getAttribute('position').count };
				});

				// Backplate hides gaps at culled discontinuities.
				const backMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
				const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), backMaterial);
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
				let renderer: any;
				try {
					renderer = await makeRenderer(!wantWebGPU);
				} catch {
					renderer = await makeRenderer(true); // throws if WebGL2 is unavailable too
				}
				if (disposed) { renderer.dispose(); return; }
				if (!host) throw new Error('Viewer host missing');
				host.appendChild(renderer.domElement);
				const activeBackend: 'WebGPU' | 'WebGL2' = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

				const controls = new OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.dampingFactor = 0.075;
				controls.enablePan = false;
				controls.minDistance = 2.0;
				controls.maxDistance = 5.0;
				// Never orbit behind a single-view surface and reveal invented geometry.
				controls.minAzimuthAngle = -Math.PI / 5;
				controls.maxAzimuthAngle = Math.PI / 5;
				controls.minPolarAngle = Math.PI / 2 - Math.PI / 5;
				controls.maxPolarAngle = Math.PI / 2 + Math.PI / 5;

				const resize = () => {
					if (!host) return;
					const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
					camera.aspect = w / h;
					camera.updateProjectionMatrix();
					renderer.setSize(w, h, false);
				};
				const observer = new ResizeObserver(resize);
				observer.observe(host);
				resize();

				let currentLod = -1;
				const pickLod = (dist: number) => (dist < 2.9 ? 0 : dist < 3.9 ? 1 : 2);
				renderer.setAnimationLoop(() => {
					controls.update();
					const lod = pickLod(camera.position.distanceTo(controls.target));
					if (lod !== currentLod) {
						lods.forEach((l, i) => (l.mesh.visible = i === lod));
						currentLod = lod;
						status = { backend: activeBackend, vendor: gpuInfo.vendor, tier, lod, vertices: lods[lod].vertices };
						onStatus?.(status);
					}
					material.wireframe = debugWireframe;
					renderer.render(scene, camera);
				});
				loading = false;

				shutdown = () => {
					renderer.setAnimationLoop(null);
					observer.disconnect();
					controls.dispose();
					lods.forEach((l) => l.geometry.dispose());
					material.dispose();
					backPlane.geometry.dispose();
					backMaterial.dispose();
					texture.dispose();
					renderer.dispose();
					renderer.domElement.remove();
				};
			} catch (e) {
				if (!disposed) error = e instanceof Error ? e.message : String(e);
			} finally {
				colorBitmap?.close();
				depthBitmap?.close();
				if (!disposed) loading = false;
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
>
	<div bind:this={host} class="scene"></div>
	{#if loading}<div class="message">Building textured depth surface…</div>{/if}
	{#if error}
		<!-- Final fallback: flat evidence image so the panel is never blank. -->
		<img class="flat" src={imageUrl} alt="Evidence (flat view; relief unavailable)" />
		<div class="message error" role="alert" data-testid="depth-relief-error">
			<Icon name="yorha-warning" size={16} /> {error}
		</div>
	{/if}
	<div class="toolbar">
		<span class="note">
			<Icon name="yorha-evidence" size={16} />
			Estimated 2.5D relief · not a measured 3D reconstruction
			{#if status.backend !== 'none'}· {status.backend} · {status.tier} · LOD{status.lod}{/if}
		</span>
		<button type="button" aria-pressed={debugWireframe} onclick={() => (debugWireframe = !debugWireframe)}>
			<Icon name="yorha-network" size={16} />
			{debugWireframe ? 'Photo surface' : 'Wireframe'}
		</button>
	</div>
</div>

<style>
	.relief { position: relative; width: 100%; height: 100%; min-height: 340px; overflow: hidden; border-radius: 12px; background: #0c1220; border: 1px solid rgba(125, 211, 252, 0.3); }
	.scene { position: absolute; inset: 0; }
	.scene :global(canvas) { display: block; width: 100%; height: 100%; touch-action: none; }
	.flat { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0.85; }
	.toolbar { position: absolute; bottom: 12px; left: 12px; right: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #e5ebf6; font: 12px system-ui, sans-serif; pointer-events: none; }
	.note { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; background: rgba(12, 18, 32, 0.78); border: 1px solid rgba(197, 154, 43, 0.5); border-radius: 6px; }
	.toolbar button { pointer-events: auto; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: #1b2940; color: #fff; border: 1px solid rgba(125, 211, 252, 0.45); padding: 7px 11px; border-radius: 8px; }
	.toolbar button[aria-pressed='true'] { background: #2a3f5e; border-color: #c59a2b; }
	.message { position: absolute; top: 16px; left: 16px; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; background: rgba(20, 34, 53, 0.92); border-radius: 6px; color: #fff; font: 13px system-ui, sans-serif; }
	.error { color: #ffc4c4; }
</style>
