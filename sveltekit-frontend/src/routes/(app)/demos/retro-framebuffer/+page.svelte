<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { createRetroRenderTargetV1, RETRO_RENDER_TARGET_REVISION_V1 } from '$lib/splat/retro-render-target-v1.js';
	import { RETRO_DEMONSTRATIVE_LABEL_V1, retroUpscaleFactorV1 } from '$lib/splat/retro-framebuffer-config-v1.js';
	import { resolveViewModeV1 } from '$lib/splat/view-mode-separation-v1.js';

	const DISPLAY_W = 1280;
	const DISPLAY_H = 720;

	let canvas: HTMLCanvasElement | undefined = $state();
	let status = $state('initialising');
	let frames = $state(0);
	let factor = $state(0);
	let error = $state('');

	let renderer: THREE.WebGLRenderer | null = null;
	let rt: ReturnType<typeof createRetroRenderTargetV1> | null = null;
	let raf = 0;

	onMount(() => {
		try {
			if (!canvas) throw new Error('canvas missing');
			factor = retroUpscaleFactorV1('default', DISPLAY_W, DISPLAY_H);
			renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
			renderer.setPixelRatio(1);
			renderer.setSize(DISPLAY_W, DISPLAY_H, false);
			const view = resolveViewModeV1({ mode: 'retro-reconstruction', sourceKind: 'reviewed-reconstruction' });
			rt = createRetroRenderTargetV1(THREE, view.retro?.preset ?? 'default');

			// Hard-edged test pattern: 8x8 checker plus a bright square. Nearest sampling must keep edges sharp.
			const size = 8;
			const data = new Uint8Array(size * size * 4);
			for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
				const p = (y * size + x) * 4;
				const on = (x + y) % 2 === 0;
				data.set(on ? [255, 80, 40, 255] : [30, 60, 160, 255], p);
			}
			const checker = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
			checker.magFilter = THREE.NearestFilter;
			checker.minFilter = THREE.NearestFilter;
			checker.generateMipmaps = false;
			checker.needsUpdate = true;

			const scene = new THREE.Scene();
			scene.background = new THREE.Color(0x101010);
			const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
			camera.position.z = 5;
			const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: checker }));
			scene.add(plane);

			const tick = () => {
				if (!renderer || !rt) return;
				plane.rotation.z += 0.005;
				rt.renderScene(renderer, scene, camera);
				rt.present(renderer);
				frames += 1;
				raf = requestAnimationFrame(tick);
			};
			status = 'running';
			raf = requestAnimationFrame(tick);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			status = 'failed';
		}
	});

	onDestroy(() => {
		cancelAnimationFrame(raf);
		rt?.dispose();
		renderer?.dispose();
	});
</script>

<svelte:head>
	<title>Retro framebuffer · demo</title>
</svelte:head>

<main class="retro-demo" data-revision={RETRO_RENDER_TARGET_REVISION_V1} data-status={status} data-frames={frames} data-factor={factor}>
	<p class="label">{RETRO_DEMONSTRATIVE_LABEL_V1}</p>
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
	<canvas bind:this={canvas} width={DISPLAY_W} height={DISPLAY_H} data-testid="retro-canvas"></canvas>
</main>

<style>
	.retro-demo { padding: 16px; font-family: system-ui, sans-serif; }
	.label { margin: 0 0 8px; font-size: 14px; }
	.error { color: #b00020; }
	canvas { width: 100%; max-width: 1280px; height: auto; image-rendering: pixelated; display: block; }
</style>
