<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { createN64Material } from '$lib/courtroom/n64/n64-material.js';
	import { N64_BROWSER_PROFILE_V1 } from '$lib/courtroom/n64-browser-profile-v1.js';
	import { sceneFsmCache, transitionState, type N64FsmStateType } from '$lib/courtroom/n64/scene-fsm-cache.js';

	let canvas: HTMLCanvasElement;
	let tris = $state(0);
	let geometryBytes = $state(0);
	let error = $state('');
	let dither = $state(true);
	let material: THREE.ShaderMaterial | null = null;

	const models = [
		{ id: 'retro-scout', label: 'Retro Scout (Parent Atlas)', path: '/models/retro-scout.glb' },
		{ id: 'rubber-hose', label: '1928 Rubber-Hose Performer', path: '/models/rubber-hose-actor-v1.glb' },
		{ id: 'n64-toy', label: 'N64 Toy (Gouraud)', path: '/models/n64-toy.glb' }
	] as const;

	let selectedModelId = $state<string>('rubber-hose');
	let availableClips = $state<string[]>([]);
	let activeClipName = $state<string>('Idle');
	let currentFsmState = $state<N64FsmStateType>('IDLE');

	// Three.js runtime references
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let currentObj: THREE.Object3D | null = null;
	let mixer: THREE.AnimationMixer | null = null;
	let activeAction: THREE.AnimationAction | null = null;
	const clock = new THREE.Clock();

	$effect(() => {
		if (material) material.uniforms.uDither.value = dither;
	});

	// Subscribe to FSM changes
	$effect(() => {
		const unsub = sceneFsmCache.subscribe((s) => {
			currentFsmState = s.currentState;
		});
		return unsub;
	});

	function disposeCurrentModel() {
		if (mixer) {
			mixer.stopAllAction();
			mixer.uncacheRoot(mixer.getRoot());
			mixer = null;
		}
		activeAction = null;
		if (currentObj && scene) {
			scene.remove(currentObj);
			currentObj.traverse((o) => {
				const m = o as THREE.Mesh;
				if (m.isMesh) {
					m.geometry?.dispose();
					if (Array.isArray(m.material)) {
						m.material.forEach((mat) => mat.dispose());
					} else if (m.material && m.material !== material) {
						m.material.dispose();
					}
				}
			});
			currentObj = null;
		}
		tris = 0;
		geometryBytes = 0;
		availableClips = [];
	}

	function loadModel(modelPath: string) {
		error = '';
		disposeCurrentModel();

		new GLTFLoader().load(
			modelPath,
			(gltf) => {
				currentObj = gltf.scene;
				let bytes = 0;
				let triCount = 0;

				currentObj.traverse((o) => {
					const m = o as THREE.Mesh;
					if (!m.isMesh) return;
					// Preserve palette textures & skinning if animated mesh, else use N64 Gouraud shader
					if (!(m as any).isSkinnedMesh && material) {
						m.material = material;
					}
					const g = m.geometry;
					const idx = g.index ? g.index.count : g.attributes.position.count;
					triCount += idx / 3;
					bytes += g.attributes.position.count * 32 + idx * 4;
				});

				tris = triCount;
				geometryBytes = bytes;
				scene.add(currentObj);

				// Center and position model
				currentObj.position.set(0, 0, 0);

				// Setup animation clips if present
				if (gltf.animations && gltf.animations.length > 0) {
					mixer = new THREE.AnimationMixer(currentObj);
					availableClips = gltf.animations.map((a) => a.name);
					const defaultClip = gltf.animations.find((a) => a.name === 'Idle') || gltf.animations[0];
					switchClip(defaultClip.name, gltf.animations);
				} else {
					availableClips = [];
					activeClipName = 'None';
					transitionState('IDLE');
				}
			},
			undefined,
			(e) => (error = `Failed to load ${modelPath}: ${String(e)}`)
		);
	}

	function switchClip(clipName: string, allClips?: THREE.AnimationClip[]) {
		if (!mixer || !currentObj) return;

		const targetClip = allClips
			? allClips.find((c) => c.name === clipName)
			: THREE.AnimationClip.findByName(THREE.AnimationMixer.prototype ? (currentObj as any).animations || [] : [], clipName);

		// If clip was found or already cached on mixer
		const newAction = targetClip ? mixer.clipAction(targetClip) : mixer.clipAction(clipName);
		if (!newAction) return;

		if (activeAction && activeAction !== newAction) {
			activeAction.fadeOut(0.2);
		}

		newAction.reset().fadeIn(0.2).play();
		activeAction = newAction;
		activeClipName = clipName;

		// Synchronize FSM state
		if (clipName === 'Walk') {
			transitionState('WALK');
		} else if (clipName === 'Point') {
			transitionState('INSPECT_EXHIBIT');
		} else if (clipName === 'Wave') {
			transitionState('ANIMATE');
		} else {
			transitionState('IDLE');
		}
	}

	function handleModelSelect(modelId: string) {
		selectedModelId = modelId;
		const m = models.find((item) => item.id === modelId);
		if (m) loadModel(m.path);
	}

	onMount(() => {
		const { internalWidth: w, internalHeight: h } = N64_BROWSER_PROFILE_V1;
		renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
		renderer.setPixelRatio(1);
		renderer.setSize(w, h, false);

		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x1a1e28);

		camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50);
		camera.position.set(0, 1.4, 4.2);
		camera.lookAt(0, 1.0, 0);

		// Scene lighting
		const ambientLight = new THREE.AmbientLight(0xfff6e6, 1.2);
		scene.add(ambientLight);

		const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
		dirLight.position.set(2, 4, 3);
		scene.add(dirLight);

		material = createN64Material({ fogNear: 5, fogFar: 14 });

		// Initial load
		handleModelSelect(selectedModelId);

		let raf = 0;
		const tick = () => {
			const delta = clock.getDelta();
			if (mixer) {
				mixer.update(delta);
			} else if (currentObj) {
				currentObj.rotation.y += 0.01;
			}

			// Stream matrix elements into the pre-allocated 64-byte aligned arena (zero-GC)
			if (currentObj) {
				currentObj.updateMatrixWorld();
				sceneFsmCache.setTransform(0, currentObj.matrixWorld.elements);
			}

			renderer.render(scene, camera);
			raf = requestAnimationFrame(tick);
		};
		tick();

		return () => {
			cancelAnimationFrame(raf);
			disposeCurrentModel();
			material?.dispose();
			renderer.dispose();
		};
	});
</script>

<svelte:head><title>N64 1928 Rubber-Hose & Retro Shader Studio</title></svelte:head>

<main class="wrap">
	<header class="header">
		<h1>N64-Style Shader & Rubber-Hose 1928 Studio</h1>
		<p class="subtitle">Rare-Era Polygon Budget · YoRHa Law Vintage 3D Palette · 64-Byte Aligned FSM</p>
	</header>

	<!-- Controls Bar -->
	<section class="controls-panel">
		<!-- Model Selector -->
		<div class="control-group">
			<span class="group-label">ACTOR MODEL:</span>
			{#each models as m}
				<button
					class="pill-btn"
					class:active={selectedModelId === m.id}
					onclick={() => handleModelSelect(m.id)}
				>
					{m.label}
				</button>
			{/each}
		</div>

		<!-- Animation Clip Selector -->
		{#if availableClips.length > 0}
			<div class="control-group">
				<span class="group-label">ANIMATION CLIP:</span>
				{#each availableClips as clip}
					<button
						class="pill-btn clip-pill"
						class:active={activeClipName === clip}
						onclick={() => switchClip(clip)}
					>
						{clip}
					</button>
				{/each}
			</div>
		{/if}

		<!-- FSM State & Shader Flags -->
		<div class="control-group toggles">
			<span class="fsm-badge">FSM: {currentFsmState}</span>
			<label class="toggle-label">
				<input type="checkbox" bind:checked={dither} /> 4×4 Bayer Dither
			</label>
		</div>
	</section>

	<!-- Canvas Viewport -->
	<div class="canvas-container">
		<canvas bind:this={canvas} data-testid="n64-canvas"></canvas>
	</div>

	<!-- Telemetry & Budget Readout -->
	<div class="telemetry-bar" data-testid="n64-stats">
		<span class="metric"><strong>{tris}</strong> Triangles</span>
		<span class="sep">|</span>
		<span class="metric"><strong>{(geometryBytes / 1024).toFixed(1)} KiB</strong> Geometry</span>
		<span class="sep">|</span>
		<span class="metric budget-pass">N64 Budget: 2,048 KiB Max (Sub-8MB Expansion Pak)</span>
		<span class="sep">|</span>
		<span class="metric resolution">{N64_BROWSER_PROFILE_V1.internalWidth}×{N64_BROWSER_PROFILE_V1.internalHeight} Native</span>
	</div>

	{#if error}
		<p class="error-msg" role="alert">{error}</p>
	{/if}

	<footer class="footer-note">
		<p>1928 Rubber-Hose character geometry, rig, and animations are synthetic and public-domain/MIT. Shaded via Three.js with zero-GC TypedArray transform arena.</p>
	</footer>
</main>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem 1.5rem;
		background: #11141c;
		color: #e4e6ed;
		min-height: 100vh;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
	}

	.header {
		text-align: center;
	}

	h1 {
		font-size: 1.6rem;
		font-weight: 700;
		color: #e7b84b;
		margin: 0 0 0.25rem 0;
		letter-spacing: 0.04em;
	}

	.subtitle {
		font-size: 0.85rem;
		color: #9ba1b6;
		margin: 0;
		letter-spacing: 0.02em;
	}

	.controls-panel {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		align-items: center;
		background: #191e2b;
		padding: 0.75rem 1.25rem;
		border-radius: 8px;
		border: 1px solid #283144;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.group-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: #79829c;
		letter-spacing: 0.05em;
		margin-right: 0.2rem;
	}

	.pill-btn {
		padding: 0.35rem 0.75rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		background: #242c3d;
		color: #b8c0d4;
		border: 1px solid #36425b;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.pill-btn:hover {
		background: #313c54;
		color: #ffffff;
	}

	.pill-btn.active {
		background: #e7b84b;
		color: #11141c;
		border-color: #f3cb65;
	}

	.clip-pill.active {
		background: #10b981;
		color: #ffffff;
		border-color: #34d399;
	}

	.fsm-badge {
		font-size: 0.7rem;
		font-family: monospace;
		font-weight: 700;
		padding: 0.25rem 0.5rem;
		background: #0f231e;
		color: #34d399;
		border: 1px solid #134e40;
		border-radius: 4px;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: #b8c0d4;
		cursor: pointer;
	}

	.canvas-container {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		max-width: 960px;
	}

	canvas {
		width: 100%;
		aspect-ratio: 4 / 3;
		image-rendering: pixelated;
		border: 2px solid #e7b84b;
		border-radius: 6px;
		background: #1a1e28;
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
	}

	.telemetry-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8rem;
		color: #9ba1b6;
		background: #151a24;
		padding: 0.4rem 1rem;
		border-radius: 6px;
		border: 1px solid #232a3b;
	}

	.telemetry-bar .metric strong {
		color: #e4e6ed;
	}

	.telemetry-bar .budget-pass {
		color: #10b981;
		font-weight: 600;
	}

	.telemetry-bar .sep {
		color: #384257;
	}

	.error-msg {
		color: #f87171;
		font-size: 0.85rem;
	}

	.footer-note {
		font-size: 0.75rem;
		color: #636b83;
		text-align: center;
		max-width: 650px;
	}
</style>
