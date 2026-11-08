<script lang="ts">
	import { onMount } from 'svelte';
	import type { Application as PlayCanvasApplication, Asset as PlayCanvasAsset, Entity as PlayCanvasEntity } from 'playcanvas';
	import { verifyStreamedSogPackageV1 } from '$lib/splat/streamed-sog-manifest-v1.js';
	import { renderImageRenderingV1, renderPixelRatioV1, type RenderSamplingModeV1 } from '$lib/splat/render-sampling-v1.js';

	let canvas: HTMLCanvasElement;
	let host: HTMLDivElement;
	let status = $state('Synthetic Streamed SOG fixture · package verification pending');
	let backend = $state('Initializing');
	let failed = $state(false);
	let verified = $state(false);
	let samplingMode = $state<RenderSamplingModeV1>('native');

	const fixtureBase = '/fixtures/synthetic-streamed-sog/';
	let app: PlayCanvasApplication | null = null;
	let asset: PlayCanvasAsset | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let camera: PlayCanvasEntity | null = null;
	let activePointer: number | null = null;
	let lastX = 0;
	let lastY = 0;
	let yaw = 0;
	let pitch = 0;
	let distance = 2.8;
	let disposed = false;

	function applySamplingMode() {
		if (canvas) canvas.style.imageRendering = renderImageRenderingV1(samplingMode);
		if (!app) return;
		app.graphicsDevice.maxPixelRatio = renderPixelRatioV1(window.devicePixelRatio || 1, samplingMode);
		app.resizeCanvas();
	}

	function setSamplingMode(mode: RenderSamplingModeV1) {
		samplingMode = mode;
		applySamplingMode();
	}

	function setCameraPose() {
		if (!camera) return;
		const horizontal = Math.cos(pitch) * distance;
		camera.setLocalPosition(Math.sin(yaw) * horizontal, Math.sin(pitch) * distance, Math.cos(yaw) * horizontal);
		camera.lookAt(0, 0, 0);
	}

	function pointerDown(event: PointerEvent) {
		activePointer = event.pointerId;
		lastX = event.clientX;
		lastY = event.clientY;
		canvas.setPointerCapture(event.pointerId);
	}

	function pointerMove(event: PointerEvent) {
		if (activePointer !== event.pointerId) return;
		const dx = event.clientX - lastX;
		const dy = event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;
		yaw -= dx * 0.006;
		pitch = Math.max(-1.35, Math.min(1.35, pitch - dy * 0.006));
		setCameraPose();
	}

	function pointerUp(event: PointerEvent) {
		if (activePointer === event.pointerId) activePointer = null;
	}

	function wheel(event: WheelEvent) {
		event.preventDefault();
		distance = Math.max(0.35, Math.min(30, distance * Math.exp(event.deltaY * 0.001)));
		setCameraPose();
	}

	async function verifyFixture() {
		const receiptResponse = await fetch(`${fixtureBase}receipt.json`, { cache: 'no-store' });
		if (!receiptResponse.ok) throw new Error(`Fixture receipt unavailable (${receiptResponse.status})`);
		const receipt = await receiptResponse.json();
		if (receipt.schema !== 'parent-atlas.synthetic-streamed-sog-fixture.v1' || receipt.provenance !== 'SYNTHETIC_INPUTS_ONLY') {
			throw new Error('Fixture provenance receipt is not admitted');
		}
		const packageReceipt = await verifyStreamedSogPackageV1({
			files: receipt.files,
			readFile: async (path, maximumBytes) => {
				const response = await fetch(`${fixtureBase}${path.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' });
				if (!response.ok) throw new Error(`Fixture file unavailable: ${path} (${response.status})`);
				const bytes = new Uint8Array(await response.arrayBuffer());
				if (bytes.byteLength > maximumBytes) throw new Error(`Fixture file exceeds byte limit: ${path}`);
				return bytes;
			}
		});
		return packageReceipt;
	}

	async function initialize() {
		try {
			const receipt = await verifyFixture();
			if (disposed) return;
			verified = true;
			status = `Package verified · ${receipt.filesVerified} files · ${receipt.totalBytes.toLocaleString()} bytes · ${receipt.gaussianCount.toLocaleString()} splats`;

			const pc = await import('playcanvas');
			const graphicsDevice = await pc.createGraphicsDevice(canvas, {
				deviceTypes: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
				antialias: false,
				powerPreference: 'high-performance'
			});
			if (disposed) {
				graphicsDevice.destroy();
				return;
			}
			backend = graphicsDevice.deviceType === pc.DEVICETYPE_WEBGPU ? 'WebGPU' : 'WebGL2 fallback';
			app = new pc.Application(canvas, {
				graphicsDevice,
				mouse: new pc.Mouse(canvas),
				touch: new pc.TouchDevice(canvas),
				devtools: false
			});
			// Use distance thresholds for the bounded comparison fixture. The default
			// TARGET budget can keep a tiny synthetic scene at LOD 0 at every distance.
			app.scene.gsplat.splatBudgetMode = pc.GSPLAT_BUDGET_LIMIT;
			app.scene.gsplat.splatBudget = 0;
			app.setCanvasFillMode(pc.FILLMODE_NONE);
			app.setCanvasResolution(pc.RESOLUTION_AUTO);

			const cameraEntity = new pc.Entity('Streamed SOG comparison camera');
			cameraEntity.addComponent('camera', { clearColor: new pc.Color(0.035, 0.045, 0.07, 1), fov: 55, nearClip: 0.01, farClip: 1000 });
			app.root.addChild(cameraEntity);
			camera = cameraEntity;
			setCameraPose();

			const splatEntity = new pc.Entity('Synthetic Streamed SOG');
			app.root.addChild(splatEntity);
			asset = new pc.Asset('Synthetic Streamed SOG fixture', 'gsplat', { url: `${fixtureBase}lod-meta.json` });
			asset.on('load', () => {
				if (disposed || !app || !asset) return;
				splatEntity.addComponent('gsplat', { asset, unified: true });
				splatEntity.gsplat.lodBaseDistance = 5;
				splatEntity.gsplat.lodMultiplier = 3;
				status = `Rendering verified synthetic SOG · camera-driven LOD · ${receipt.lodCounts.length} levels · ${receipt.gaussianCount.toLocaleString()} splats`;
			});
			asset.on('error', (error: unknown) => {
				failed = true;
				status = `PlayCanvas SOG load failed: ${error instanceof Error ? error.message : 'unknown error'}`;
			});
			app.assets.add(asset);
			app.assets.load(asset);
			app.start();
			applySamplingMode();
			resizeObserver = new ResizeObserver(() => {
				if (!app || !host) return;
				applySamplingMode();
			});
			resizeObserver.observe(host);
		} catch (error) {
			failed = true;
			status = `Streamed SOG comparison unavailable: ${error instanceof Error ? error.message : 'unknown error'}`;
		}
	}

	function dispose() {
		disposed = true;
		resizeObserver?.disconnect();
		resizeObserver = null;
		if (asset && app) {
			app.assets.remove(asset);
			asset.unload();
		}
		asset = null;
		camera = null;
		app?.destroy();
		app = null;
	}

	onMount(() => {
		void initialize();
		return dispose;
	});
</script>

<div class="sog-comparison" bind:this={host}>
	<canvas
		bind:this={canvas}
		aria-label="Synthetic Streamed SOG comparison canvas. Drag to orbit and scroll to zoom."
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
		onwheel={wheel}
	></canvas>
	<div class="status" role="status" data-testid="streamed-sog-status">
		<span class:failed>{failed ? 'FAILED' : verified ? 'VERIFIED FIXTURE' : 'CHECKING'}</span>
		{status} · {backend} · {samplingMode} display sampling
	</div>
	<div class="sampling" role="group" aria-label="SOG display sampling">
		{#each [{ id: 'native', label: 'Native' }, { id: 'half', label: 'Half' }, { id: 'retro', label: 'Retro' }] as mode (mode.id)}
			<button type="button" aria-pressed={samplingMode === mode.id} onclick={() => setSamplingMode(mode.id as RenderSamplingModeV1)}>{mode.label}</button>
		{/each}
	</div>
	<p class="provenance">Display-resolution preview only; not DLSS, case evidence, calibrated geometry, or an RTX performance measurement.</p>
</div>

<style>
	.sog-comparison { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 24rem; overflow: hidden; background: #080d18; }
	canvas { display: block; width: 100%; height: 100%; min-height: 24rem; touch-action: none; }
	.status { position: absolute; top: .75rem; left: .75rem; max-width: calc(100% - 1.5rem); padding: .55rem .75rem; border: 1px solid #36576c; border-radius: .5rem; background: #09111de8; color: #e4e1da; font: .72rem ui-monospace, monospace; }
	.status span { margin-right: .5rem; color: #64e6c1; font-weight: 700; }
	.status span.failed { color: #ff8b8b; }
	.sampling { position: absolute; top: .75rem; right: .75rem; display: flex; gap: .25rem; padding: .25rem; border: 1px solid #36576c; border-radius: .5rem; background: #09111de8; }
	.sampling button { border: 0; border-radius: .3rem; padding: .35rem .55rem; background: transparent; color: #aaa49a; font: .68rem ui-monospace, monospace; cursor: pointer; }
	.sampling button[aria-pressed="true"] { background: #1a3140; color: #64e6c1; }
	.provenance { position: absolute; right: .75rem; bottom: .6rem; margin: 0; padding: .35rem .5rem; border-radius: .35rem; background: #09111dd9; color: #aaa49a; font: .65rem ui-monospace, monospace; }
</style>
