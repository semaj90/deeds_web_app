<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import ContextualChatDemo from '$lib/components/ai/ContextualChatDemo.svelte';
	import { quantizeRgbaToIndexed4BppV1, type IndexedTexture4BppV1 } from '$lib/splat/indexed-palette-texture-v1.js';
	import { applyIndexedPaletteToObjectV1, type IndexedPaletteObjectApplicationV1 } from '$lib/splat/indexed-palette-object-v1.js';
	import '$lib/splat/lut3d-generator-style.css';

	// Courtroom OBJ demo: imported Jester OBJ (UV-mapped, no material file) with a synthetic
	// palette-quantized texture, shown beside the existing contextual chat component.
	const OBJ_URL = '/models/courtroom/jester_accessories_v1.obj';
	const TEXTURE_SIZE = 64;

	let canvas: HTMLCanvasElement | undefined = $state();
	let viewMode = $state<'3d' | '2d'>('3d');
	let loadState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let backendLabel = $state<string>('starting');
	let objectStatus = $state('Loading courtroom OBJ…');
	let paletteStatus = $state('Original material');
	let paletteOn = $state(false);
	let paletteBusy = $state(false);
	let videoStatus = $state('No video loaded. Choose an MP4 or WebM from this computer; it stays in the browser.');
	let videoPlaying = $state(false);
	let videoLoaded = $state(false);
	const VIDEO_MAX_BYTES = 512 * 1024 * 1024;
	let videoEl: HTMLVideoElement | null = null;
	let videoUrl: string | null = null;
	let videoTexture: any = null;
	let videoMesh: any = null;

	let renderer: any = null;
	let scene: any = null;
	let three: any = null;
	let group: any = null;
	let perspectiveCamera: any = null;
	let orthographicCamera: any = null;
	let controls: any = null;
	let sceneCenter: any = null;
	let orthographicHeight = 4;
	let application: IndexedPaletteObjectApplicationV1 | null = null;
	let indexed: IndexedTexture4BppV1 | null = null;
	let rgbaTexture: any = null;
	let backend: 'webgl2' | 'webgpu' | 'unknown' | null = null;

	function setViewMode(mode: '3d' | '2d') {
		viewMode = mode;
		if (controls) controls.enabled = mode === '3d';
	}

	function focusAssistant() {
		document.getElementById('courtroom-assistant-input')?.focus();
	}

	function syntheticTexture(): { rgba: Uint8ClampedArray; texture: any } {
		const surface = document.createElement('canvas');
		surface.width = TEXTURE_SIZE;
		surface.height = TEXTURE_SIZE;
		const ctx = surface.getContext('2d');
		if (!ctx) throw new Error('INDEXED_PALETTE_DEMO_2D_CONTEXT_UNAVAILABLE');
		// Courtroom tones: wood, velvet and brass bands so the 16-colour palette has range.
		ctx.fillStyle = '#5a3a22';
		ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
		ctx.fillStyle = '#7a1f2b';
		ctx.fillRect(0, TEXTURE_SIZE / 3, TEXTURE_SIZE, TEXTURE_SIZE / 3);
		ctx.fillStyle = '#b8862b';
		for (let x = 0; x < TEXTURE_SIZE; x += 16) ctx.fillRect(x, 0, 4, TEXTURE_SIZE);
		const image = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
		return { rgba: image.data, texture: new three.CanvasTexture(surface) };
	}

	function applyPalette(enabled: boolean) {
		if (!group || !indexed || !rgbaTexture || paletteBusy) return;
		paletteBusy = true;
		try {
			if (enabled) {
				application?.dispose();
				application = applyIndexedPaletteToObjectV1(
					three,
					group,
					indexed,
					rgbaTexture,
					backend,
					renderer?.capabilities?.maxTextureSize ?? 4096
				);
				paletteOn = true;
				paletteStatus = `${application.path} · ${application.meshCount} meshes packed · ${application.skippedMeshCount} skipped (no UVs or multi-material)`;
			} else {
				application?.restore();
				paletteOn = false;
				paletteStatus = 'Original material';
			}
		} catch (cause) {
			paletteStatus = cause instanceof Error ? cause.message : 'Palette could not be applied.';
		} finally {
			paletteBusy = false;
		}
	}

	function clearVideo() {
		if (videoEl) {
			videoEl.pause();
			videoEl.removeAttribute('src');
			videoEl.load();
		}
		// The plane is created once with the scene and only hidden/shown: meshes added to the
		// scene after the first frame are not drawn by this renderer.
		if (videoMesh) {
			videoMesh.material.opacity = 0;
			videoMesh.material.map = null;
			videoMesh.material.color.set(0x000000);
			videoMesh.material.needsUpdate = true;
		}
		videoTexture?.dispose?.();
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		videoEl = null;
		videoUrl = null;
		videoTexture = null;
		videoPlaying = false;
		videoLoaded = false;
	}

	async function loadVideoFile(file: File | undefined) {
		if (!file || !scene || !three) return;
		if (!file.type.startsWith('video/')) {
			videoStatus = 'Choose a video file (MP4 or WebM).';
			return;
		}
		if (file.size > VIDEO_MAX_BYTES) {
			videoStatus = 'Video is larger than 512 MB; choose a shorter clip.';
			return;
		}
		clearVideo();
		videoStatus = 'Decoding video in the browser…';
		videoUrl = URL.createObjectURL(file);
		const element = document.createElement('video');
		element.src = videoUrl;
		element.muted = true;
		element.loop = true;
		element.playsInline = true;
		element.preload = 'auto';
		videoEl = element;
		try {
			await new Promise<void>((resolve, reject) => {
				element.onloadeddata = () => resolve();
				element.onerror = () => reject(new Error('This browser could not decode the video (use MP4 H.264 or WebM VP8/VP9).'));
				element.load();
			});
		} catch (cause) {
			videoStatus = cause instanceof Error ? cause.message : 'Video could not be loaded.';
			clearVideo();
			return;
		}
		videoTexture = new three.VideoTexture(element);
		videoTexture.colorSpace = three.SRGBColorSpace;
		const aspect = element.videoWidth > 0 && element.videoHeight > 0 ? element.videoWidth / element.videoHeight : 16 / 9;
		const geometry = new three.PlaneGeometry(1.2, 1.2 / aspect);
		videoMesh.geometry.dispose();
		videoMesh.geometry = geometry;
		videoMesh.material.map = videoTexture;
		videoMesh.material.color.set(0xffffff);
		videoMesh.material.opacity = 1;
		videoMesh.material.needsUpdate = true;
		videoLoaded = true;
		const seconds = Number.isFinite(element.duration) ? `${element.duration.toFixed(1)} s` : 'unknown length';
		videoStatus = `${element.videoWidth}×${element.videoHeight} · ${seconds} · texture live`;
	}

	async function togglePlayback() {
		if (!videoEl) return;
		if (videoEl.paused) {
			try {
				await videoEl.play();
				videoPlaying = true;
			} catch (cause) {
				videoStatus = cause instanceof Error ? cause.message : 'Playback was blocked by the browser.';
			}
		} else {
			videoEl.pause();
			videoPlaying = false;
		}
	}

	onMount(() => {
		void (async () => {
			loadState = 'loading';
			try {
				three = await import('three/webgpu');
				const [{ OBJLoader }, { OrbitControls }] = await Promise.all([
					import('three/addons/loaders/OBJLoader.js'),
					import('three/addons/controls/OrbitControls.js')
				]);
				if (!canvas) throw new Error('INDEXED_PALETTE_DEMO_CANVAS_MISSING');

				renderer = new three.WebGPURenderer({ canvas, antialias: true });
				await renderer.init();
				backend = renderer.backend?.isWebGLBackend ? 'webgl2' : renderer.backend?.isWebGPUBackend ? 'webgpu' : 'unknown';
				backendLabel = backend ?? 'unknown';

				scene = new three.Scene();
				scene.background = new three.Color('#14110d');
				perspectiveCamera = new three.PerspectiveCamera(40, 1, 0.1, 100);
				perspectiveCamera.position.set(0, 1.2, 4.6);
				orthographicCamera = new three.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
				scene.add(new three.AmbientLight(0xffffff, 0.8));
				const light = new three.DirectionalLight(0xffffff, 1.2);
				light.position.set(2, 3, 2);
				scene.add(light);
				controls = new OrbitControls(perspectiveCamera, canvas);
				controls.enableDamping = true;

				const text = await (await fetch(OBJ_URL)).text();
				group = new OBJLoader().parse(text);
				scene.add(group);
				// Visible from the start with zero opacity: the renderer does not draw objects that were
				// hidden when its draw list was built, so hiding by opacity keeps the plane addressable.
				videoMesh = new three.Mesh(
					new three.PlaneGeometry(1.2, 0.675),
					new three.MeshBasicMaterial({ color: 0x000000, side: three.DoubleSide, transparent: true, opacity: 0 })
				);
				scene.add(videoMesh);

				const synthetic = syntheticTexture();
				rgbaTexture = synthetic.texture;
				indexed = quantizeRgbaToIndexed4BppV1(TEXTURE_SIZE, TEXTURE_SIZE, synthetic.rgba);

				const box = new three.Box3().setFromObject(group);
				sceneCenter = box.getCenter(new three.Vector3());
				controls.target.copy(sceneCenter);
				// Place the video plane beside the object, relative to its bounds (the OBJ is not centred on the origin).
				videoMesh.position.set(box.max.x + 0.75, sceneCenter.y + 0.35, sceneCenter.z + 0.4);
				const compositionBounds = box.clone().expandByObject(videoMesh);
				const compositionSize = compositionBounds.getSize(new three.Vector3());
				sceneCenter = compositionBounds.getCenter(new three.Vector3());
				orthographicHeight = Math.max(compositionSize.y, compositionSize.x / (canvas!.clientWidth / canvas!.clientHeight || 1.5), 1) * 1.18;
				orthographicCamera.position.set(sceneCenter.x, sceneCenter.y, sceneCenter.z + 10);
				orthographicCamera.lookAt(sceneCenter);
				controls.target.copy(sceneCenter);
				objectStatus = `${group.children.length} OBJ groups · courtroom Jester accessories · ${backendLabel} backend`;

				const resize = () => {
					const width = canvas!.clientWidth || 640;
					const height = canvas!.clientHeight || 480;
					renderer.setSize(width, height, false);
					perspectiveCamera.aspect = width / height;
					perspectiveCamera.updateProjectionMatrix();
					orthographicCamera.left = -(orthographicHeight * width / height) / 2;
					orthographicCamera.right = (orthographicHeight * width / height) / 2;
					orthographicCamera.top = orthographicHeight / 2;
					orthographicCamera.bottom = -orthographicHeight / 2;
					orthographicCamera.updateProjectionMatrix();
				};
				resize();
				window.addEventListener('resize', resize);
				renderer.setAnimationLoop(() => {
					controls.update();
					renderer.render(scene, viewMode === '2d' ? orthographicCamera : perspectiveCamera);
				});
				loadState = 'ready';
			} catch (cause) {
				loadState = 'error';
				objectStatus = cause instanceof Error ? cause.message : 'Demo could not start.';
			}
		})();
	});

	onDestroy(() => {
		clearVideo();
		videoMesh?.geometry?.dispose?.();
		videoMesh?.material?.dispose?.();
		application?.dispose();
		application = null;
		renderer?.setAnimationLoop?.(null);
		if (group) group.traverse((object: any) => { object.geometry?.dispose?.(); });
		rgbaTexture?.dispose?.();
		renderer?.dispose?.();
	});
</script>

<main class="palette-chat-page">
	<section class="viewer-column lut-container" aria-label="Courtroom 3D object">
		<header>
			<h1>Courtroom scene · 3D / 2D view</h1>
			<p data-testid="palette-chat-object-status">{objectStatus}</p>
		</header>
		<div class="view-toggle" aria-label="Scene projection">
			<button type="button" aria-pressed={viewMode === '3d'} data-testid="scene-view-3d" onclick={() => setViewMode('3d')}>3D orbit</button>
			<button type="button" aria-pressed={viewMode === '2d'} data-testid="scene-view-2d" onclick={() => setViewMode('2d')}>2D illustration</button>
			<span>{viewMode === '2d' ? 'Orthographic projection · same 3D scene' : 'Perspective camera · orbit enabled'}</span>
		</div>
		<div class="viewer-stage" class:flat-view={viewMode === '2d'}>
			<canvas bind:this={canvas} data-testid="palette-chat-canvas" class="viewer" aria-label="Imported courtroom OBJ scene"></canvas>
			{#if viewMode === '2d'}
				<div class="dialogue-card" data-testid="scene-dialogue-overlay">
					<div class="dialogue-kicker">SCENE ASSISTANT · ILLUSTRATIVE VIEW</div>
					<p>This is a flat view of the same 3D scene. Ask a question; review any interpretation against its source.</p>
					<button type="button" onclick={focusAssistant}>Ask about this scene</button>
				</div>
			{/if}
		</div>
		<div class="lut-preview-box">
			<div class="lut-preview-title">Indexed texture controls</div>
			<div class="controls">
				<button
					type="button"
					data-testid="palette-chat-palette-toggle"
					aria-pressed={paletteOn}
					disabled={loadState !== 'ready' || paletteBusy}
					onclick={() => applyPalette(!paletteOn)}
				>{paletteOn ? 'Restore original material' : 'Apply indexed palette'}</button>
				<output data-testid="palette-chat-palette-status">{paletteStatus}</output>
			</div>
		</div>
		<div class="lut-preview-box">
			<div class="lut-preview-title">Video texture controls</div>
			<div class="controls video-controls">
				<label class="file-action">Upload video texture
					<input
						data-testid="video-texture-file-input"
						type="file"
						accept="video/mp4,video/webm,video/*"
						disabled={loadState !== 'ready'}
						onchange={(event) => void loadVideoFile((event.currentTarget as HTMLInputElement).files?.[0])}
					/>
				</label>
				<button
					type="button"
					data-testid="video-texture-toggle"
					disabled={!videoLoaded}
					onclick={() => void togglePlayback()}
				>{videoPlaying ? 'Pause video' : 'Play video'}</button>
				<output data-testid="video-texture-status">{videoStatus}</output>
			</div>
		</div>
	</section>
	<section class="chat-column" aria-label="Contextual chat assistant">
		<ContextualChatDemo inputId="courtroom-assistant-input" enableFunctions={false} />
	</section>
</main>

<style>
	.palette-chat-page {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: 1rem;
		padding: 1rem;
		min-height: 80vh;
	}
	.viewer-column, .chat-column { min-width: 0; }
	.viewer-stage { position: relative; }
	.viewer {
		width: 100%;
		height: 480px;
		display: block;
		border-radius: 8px;
		background: #14110d;
	}
	.flat-view .viewer { border: 1px solid #b59a6a; }
	.view-toggle { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin: 0.65rem 0; }
	.view-toggle button, .dialogue-card button {
		border: 1px solid #a98a50; border-radius: 0.35rem; padding: 0.45rem 0.7rem;
		background: #f6edda; color: #30291f; font: inherit; cursor: pointer;
	}
	.view-toggle button[aria-pressed="true"] { background: #b68b3f; color: #17130d; }
	.view-toggle span { color: #e1d4ba; font-size: 0.8rem; }
	.dialogue-card {
		position: absolute; left: 4%; right: 4%; bottom: 4%; padding: 0.85rem 1rem;
		border: 2px solid #b68b3f; border-radius: 0.5rem; background: rgb(248 240 222 / 96%);
		color: #2c251b; box-shadow: 0 8px 28px rgb(0 0 0 / 32%);
	}
	.dialogue-kicker { color: #795b2c; font-size: 0.7rem; letter-spacing: 0.12em; font-weight: 700; }
	.dialogue-card p { margin: 0.35rem 0 0.7rem; color: #30291f; opacity: 1; }
	.controls { display: flex; gap: 0.75rem; align-items: center; margin-top: 0.5rem; }
	h1 { font-size: 1.1rem; margin: 0 0 0.25rem; }
	p, output { font-size: 0.85rem; opacity: 0.85; }
	@media (max-width: 900px) {
		.palette-chat-page { grid-template-columns: 1fr; }
	}
</style>
