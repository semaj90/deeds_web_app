<script lang="ts">
	import { onMount } from 'svelte';
	import type { EastQuayCaseFixture } from '$lib/scene/procedural/parent-atlas-east-quay-case-v1/case-registry-v1.js';
	import { planEastQuaySceneEventV1, registerEastQuayIllustrativeObjectsV1 } from '$lib/scene/procedural/parent-atlas-east-quay-case-v1/scene-adapter-v1.js';
	import { attachSyntheticEastQuayPortraitCardV1, removeSyntheticEastQuayPortraitV1 } from '$lib/scene/procedural/parent-atlas-east-quay-case-v1/poi-portrait-three-v1.js';

	let { fixture, sceneId, eventId }: { fixture: EastQuayCaseFixture; sceneId: string; eventId: string } = $props();
	let canvas: HTMLCanvasElement;
	let status = $state('Loading synthetic scene…');
	let fallbackStatus = $state('');
	let renderedEventId = $state('');
	let renderFrame = 0;
	let renderGeneration = 0;
	let renderer: import('three').WebGLRenderer | null = null;
	let three: typeof import('three') | null = null;
	let scene: import('three').Scene | null = null;
	let camera: import('three').PerspectiveCamera | null = null;
	let manager: import('$lib/n64-fsm/scene-primitive-sync.js').ScenePrimitiveManager | null = null;
	let template: import('three').Object3D | null = null;
	let activeRoot: import('three').Object3D | null = null;
	let activeMarker: import('three').Mesh | null = null;
	let activeIds: string[] = [];
	let disposed = false;
	let resizeObserver: ResizeObserver | null = null;

	onMount(() => {
		void initialize();
		return () => {
			disposed = true;
			cancelAnimationFrame(renderFrame);
			if (activeRoot) removeSyntheticEastQuayPortraitV1(activeRoot);
			for (const id of activeIds) manager?.unregister(id);
			renderer?.dispose();
			resizeObserver?.disconnect();
			renderer = null;
		};
	});

	$effect(() => {
		const selectedSceneId = sceneId;
		const selectedEventId = eventId;
		const currentFixture = fixture;
		if (renderer && manager && scene && template && selectedSceneId && selectedEventId) void renderSelection(currentFixture, selectedSceneId, selectedEventId);
	});

	async function initialize() {
		try {
			const [THREE, { GLTFLoader }, { ScenePrimitiveManager }, { ARENA_BYTE_LENGTH }] = await Promise.all([
				import('three'), import('three/examples/jsm/loaders/GLTFLoader.js'), import('$lib/n64-fsm/scene-primitive-sync.js'), import('$lib/n64-fsm/scene-fsm-cache.js')
			]);
			if (disposed) return;
			three = THREE;
			renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
			renderer.setSize(Math.max(canvas.clientWidth, 320), 360, false);
			resizeObserver = new ResizeObserver((entries) => {
				const entry = entries[0];
				if (!entry || !renderer || !camera || !three) return;
				const width = Math.max(320, Math.floor(entry.contentRect.width));
				renderer.setSize(width, 360, false); camera.aspect = width / 360; camera.updateProjectionMatrix();
			});
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			scene = new THREE.Scene(); scene.background = new THREE.Color('#263846');
			camera = new THREE.PerspectiveCamera(48, Math.max(canvas.clientWidth, 320) / 360, 0.1, 100);
			camera.position.set(3.4, 2.6, 5.2); camera.lookAt(0, 0.85, 0);
			scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x4d4031, 2.0));
			const light = new THREE.DirectionalLight(0xffe5bd, 2.2); light.position.set(3, 6, 4); scene.add(light);
			const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x52645c, roughness: 1 }));
			floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; scene.add(floor);
			manager = new ScenePrimitiveManager(new Float32Array(ARENA_BYTE_LENGTH / Float32Array.BYTES_PER_ELEMENT));
			const gltf = await new GLTFLoader().loadAsync('/demos/east-quay-bank-case-v1/examples/detective-lowpoly-sample.glb');
			if (disposed) return;
			template = gltf.scene;
			status = 'Synthetic GLB loaded; rendering scene…';
			resizeObserver?.observe(canvas);
			void renderSelection(fixture, sceneId, eventId);
			const tick = () => { if (!renderer || !scene || !camera || disposed) return; renderer.render(scene, camera); renderFrame = requestAnimationFrame(tick); };
			tick();
		} catch (error) {
			status = error instanceof Error ? `3D preview unavailable: ${error.message}` : '3D preview unavailable.';
		}
	}

	async function renderSelection(currentFixture: EastQuayCaseFixture, selectedSceneId: string, selectedEventId: string) {
		if (!three || !scene || !template || !manager || !renderer) return;
		const selectionGeneration = ++renderGeneration;
		const plan = planEastQuaySceneEventV1(currentFixture, selectedSceneId, selectedEventId);
		for (const id of activeIds) manager.unregister(id);
		activeIds = [];
		if (activeRoot) {
			removeSyntheticEastQuayPortraitV1(activeRoot);
			scene.remove(activeRoot);
			activeRoot = null;
		}
		if (activeMarker) { scene.remove(activeMarker); activeMarker.geometry.dispose(); (activeMarker.material as import('three').Material).dispose(); activeMarker = null; }
		const actor = plan.actors[0];
		const person = currentFixture.people.find((candidate) => candidate.personId === actor?.personId);
		if (!actor || !person) { status = 'Selected event has no renderable synthetic actor.'; return; }
		const root = template.clone(true);
		root.scale.setScalar(0.8); root.name = actor.id;
		const marker = new three.Mesh(new three.ConeGeometry(0.12, 0.3, 5), new three.MeshStandardMaterial({ color: 0xf5bd4f, emissive: 0x4b2d00 }));
		marker.position.set(actor.positionXYZ[0], 1.8, actor.positionXYZ[2]);
		const ids = registerEastQuayIllustrativeObjectsV1({ fixture: currentFixture, plan, manager, actorRoot: root, marker, slotOffset: 0 });
		scene.add(root, marker);
		activeRoot = root; activeMarker = marker; activeIds = ids;
		try {
			const portrait = await attachSyntheticEastQuayPortraitCardV1({ root, getJoint: (name) => root.getObjectByName(name) }, person, `/demos/east-quay-bank-case-v1/${actor.portraitAssetPath}`);
			fallbackStatus = portrait.fallback ? 'Portrait attached to derived head anchor (static GLB has no named head joint).' : 'Portrait attached to named head anchor.';
		} catch {
			fallbackStatus = 'Portrait card unavailable; synthetic GLB remains visible.';
		}
		if (disposed || selectionGeneration !== renderGeneration) return;
		renderedEventId = selectedEventId;
		status = 'GLB rendered in read-only synthetic scene.';
	}

</script>

<div class="preview" data-testid="east-quay-three-preview" data-event-id={renderedEventId}>
	<canvas bind:this={canvas} aria-label="Synthetic East Quay Three.js scene preview"></canvas>
	<div class="preview-status" role="status" data-testid="east-quay-render-status">{status}</div>
	{#if fallbackStatus}<div class="portrait-status" data-testid="east-quay-portrait-fallback">{fallbackStatus}</div>{/if}
</div>

<style>
	.preview { position: relative; overflow: hidden; border: 1px solid #52616d; border-radius: .45rem; background: #263846; }
	canvas { display: block; width: 100%; height: 360px; }
	.preview-status, .portrait-status { position: absolute; left: .65rem; bottom: .55rem; padding: .35rem .5rem; background: #101820dd; color: #f2eee4; font-size: .75rem; border-radius: .25rem; }
	.portrait-status { bottom: auto; top: .55rem; max-width: 75%; color: #ffe5a8; }
</style>
