<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { INDEXED_PALETTE16_V1, quantizeRgbaToIndexed4BppV1, decodeIndexed4BppToRgbaV1 } from '$lib/splat/indexed-palette-texture-v1.js';
	import { createIndexedPaletteShaderMaterialV1 } from '$lib/splat/indexed-palette-shader-v1.js';
	import { SpatialBvhManagerV1 } from '$lib/splat/spatial-bvh-manager-v1.js';

	let canvas: HTMLCanvasElement | undefined = $state();
	let status = $state('initialising');
	let error = $state('');
	let renderer: THREE.WebGLRenderer | null = null;
	let disposers: Array<() => void> = [];

	// Expose results for the browser check (data-* attributes, one read after the run).
	let results = $state<Record<string, string>>({});

	function fixture(width: number, height: number): Uint8Array {
		const rgba = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
			const p = (y * width + x) * 4;
			let entry = INDEXED_PALETTE16_V1[1]!; // brick
			if (y > height * 0.7) entry = INDEXED_PALETTE16_V1[2]!; // floor
			if (x > width * 0.6 && y > height * 0.4) entry = INDEXED_PALETTE16_V1[3]!; // door
			if ((x + y) % 7 === 0) rgba.set([0, 0, 0, 0], p); // transparent
			else rgba.set(entry.rgba, p);
		}
		return rgba;
	}

	function colourSet(gl: WebGLRenderingContext | WebGL2RenderingContext, w: number, h: number): string[] {
		const px = new Uint8Array(w * h * 4);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
		const seen = new Map<string, number>();
		for (let i = 0; i < px.length; i += 4) {
			const k = `${px[i]},${px[i + 1]},${px[i + 2]}`;
			seen.set(k, (seen.get(k) ?? 0) + 1);
		}
		return [...seen.entries()].filter(([, n]) => n >= 64).map(([k]) => k);
	}

	onMount(async () => {
		try {
			if (!canvas) throw new Error('canvas missing');
			renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
			renderer.setPixelRatio(1);
			renderer.setSize(256, 256, false);
			renderer.setClearColor(0x202020, 1);
			const gl = renderer.getContext();
			const probe: number[] = [renderer.info.memory.textures];
			(window as unknown as Record<string, unknown>).__paletteProbe = probe;

			// Item 3/4: palette fixture through the real shader factory.
			const width = 16;
			const height = 16;
			const indexed = quantizeRgbaToIndexed4BppV1(width, height, fixture(width, height), 0);
			const decoded = decodeIndexed4BppToRgbaV1(indexed);
			const map = new THREE.DataTexture(new Uint8Array(decoded), width, height, THREE.RGBAFormat);
			map.magFilter = THREE.NearestFilter;
			map.minFilter = THREE.NearestFilter;
			map.needsUpdate = true;
			const source = new THREE.MeshBasicMaterial({ map, transparent: true });
			const { material, textures } = createIndexedPaletteShaderMaterialV1(THREE, source, indexed);
			const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
			const scene = new THREE.Scene();
			scene.add(plane);
			const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
			camera.position.z = 5;

			renderer.render(scene, camera);
			const before = colourSet(gl, 256, 256);
			probe.push(renderer.info.memory.textures);
			const indexBefore = Array.from(textures.packedIndexTexture.image.data as Uint8Array);
			results.before = before.join(';');

			// Item 4: recolour palette entry 3 (door) only.
			(textures.paletteTexture.image.data as Uint8Array).set([255, 0, 255, 255], 3 * 4);
			textures.paletteTexture.needsUpdate = true;
			renderer.render(scene, camera);
			const after = colourSet(gl, 256, 256);
			const indexAfter = Array.from(textures.packedIndexTexture.image.data as Uint8Array);
			results.after = after.join(';');
			results.indexUnchanged = String(indexBefore.length === indexAfter.length && indexBefore.every((v, i) => v === indexAfter[i]));
			disposers.push(() => textures.dispose());
			disposers.push(() => map.dispose());
			disposers.push(() => source.dispose());
			disposers.push(() => material.dispose());
			material.dispose();
			plane.geometry.dispose();

			// Item 5: real rubber-hose actor GLB, BVH picking on the skinned mesh.
			const gltf = await new GLTFLoader().loadAsync('/models/rubber-hose-actor-v1.glb');
			probe.push(renderer.info.memory.textures);
			const actorScene = gltf.scene;
			const actorCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
			actorCamera.position.set(0, 1, 6);
			actorCamera.lookAt(0, 1, 0);
			const bvh = new SpatialBvhManagerV1();
			const inventory = bvh.build(actorScene);
			disposers.push(() => bvh.dispose());
			disposers.push(() => {
				actorScene.traverse((o) => {
					const sk = o as THREE.SkinnedMesh;
					if (sk.isSkinnedMesh) sk.skeleton?.dispose();
					const m = o as THREE.Mesh;
					if (!m.isMesh) return;
					m.geometry?.dispose();
					const mats = Array.isArray(m.material) ? m.material : [m.material];
					for (const mat of mats) {
						if (!mat) continue;
						for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) {
							(v as THREE.Texture).dispose();
						}
						mat.dispose();
					}
				});
			});
			results.actorSkinned = String(inventory.skinnedMeshCount);
			const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 1, 5), new THREE.Vector3(0, 0, -1));
			const hits = bvh.raycast(raycaster);
			results.actorHitCount = String(hits.length);
			results.actorHitIsSkinned = String(Boolean(hits[0]?.object && (hits[0].object as THREE.SkinnedMesh).isSkinnedMesh));

			const actorRender = new THREE.Scene();
			actorRender.add(actorScene);
			renderer.render(actorRender, actorCamera);
			probe.push(renderer.info.memory.textures);
			const actorColours = colourSet(gl, 256, 256);
			results.actorColourCount = String(actorColours.length);

			// Posed picking: move the bone that drives vertex 0, refit BVH, pick the posed vertex.
			let skinned: THREE.SkinnedMesh | null = null;
			actorScene.traverse((o) => { if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
			if (skinned) {
				const mesh = skinned as THREE.SkinnedMesh;
				const boneIndex = mesh.geometry.getAttribute('skinIndex').getX(0);
				const bone = mesh.skeleton.bones[boneIndex]!;
				const before = new THREE.Vector3();
				mesh.skeleton.update();
				mesh.getVertexPosition(0, before);
				bone.position.x += 0.3;
				actorScene.updateMatrixWorld(true);
				mesh.skeleton.update();
				const after = new THREE.Vector3();
				mesh.getVertexPosition(0, after);
				bvh.refit();
				const poseRay = new THREE.Raycaster(new THREE.Vector3(after.x, after.y, 5), new THREE.Vector3(0, 0, -1));
				const poseHits = bvh.raycast(poseRay);
				results.poseMovedDistance = before.distanceTo(after).toFixed(3);
				results.poseHitCount = String(poseHits.length);
				results.poseHitToVertex = poseHits[0] ? poseHits[0].point.distanceTo(after).toFixed(3) : '-1';
				// Ground truth: three.js's own (unaccelerated) skinned raycast on the same posed mesh.
				const truth: THREE.Intersection[] = [];
				THREE.SkinnedMesh.prototype.raycast.call(mesh, poseRay, truth);
				truth.sort((x, y) => x.distance - y.distance);
				results.poseTruthDistance = poseHits[0] && truth[0] ? poseHits[0].point.distanceTo(truth[0].point).toFixed(4) : '-1';
				results.poseTruthHit = String(Boolean(truth[0]));
				results.poseTruthToVertex = truth[0] ? truth[0].point.distanceTo(after).toFixed(4) : '-1';
				results.poseBeforeToAfterVertex = before.distanceTo(after).toFixed(3);
				// Isolate the layer: per-mesh SkinnedMeshBVH directly (no TLAS), against the same truth.
				const tree = (bvh as unknown as { skinnedTrees: Map<THREE.SkinnedMesh, { raycastObject3D: (o: THREE.Object3D, r: THREE.Raycaster, out: THREE.Intersection[]) => void }> }).skinnedTrees.get(mesh);
				const direct: THREE.Intersection[] = [];
				tree?.raycastObject3D(mesh, poseRay, direct);
				direct.sort((x, y) => x.distance - y.distance);
				results.poseDirectTreeDistance = direct[0] && truth[0] ? direct[0].point.distanceTo(truth[0].point).toFixed(4) : '-1';
			}

			status = 'done';
		} catch (e) {
			error = e instanceof Error ? `${e.message} @ ${(e.stack ?? '').split('\n').slice(0, 3).join(' | ')}` : String(e);
			status = 'failed';
		}
	});

	onDestroy(() => {
		// Unmount teardown: dispose everything this page owns, then record counts for the browser check.
		const r = renderer;
		const before = r ? { textures: r.info.memory.textures, geometries: r.info.memory.geometries } : null;
		for (const d of disposers) d();
		disposers = [];
		if (r) {
			r.dispose();
			(window as unknown as Record<string, unknown>).__paletteTeardown = {
				before,
				afterGeometries: r.info.memory.geometries,
				afterTextures: r.info.memory.textures,
				disposed: true,
			};
		}
	});
</script>

<svelte:head>
	<title>Indexed palette check · demo</title>
</svelte:head>

<main class="palette-check" data-status={status} data-error={error} data-before={results.before ?? ''} data-after={results.after ?? ''}
	data-index-unchanged={results.indexUnchanged ?? ''} data-actor-skinned={results.actorSkinned ?? ''}
	data-actor-hit-count={results.actorHitCount ?? ''} data-actor-hit-is-skinned={results.actorHitIsSkinned ?? ''}
	data-actor-colour-count={results.actorColourCount ?? ''}
	data-pose-moved={results.poseMovedDistance ?? ''} data-pose-hit-count={results.poseHitCount ?? ''} data-pose-hit-to-vertex={results.poseHitToVertex ?? ''} data-pose-truth-distance={results.poseTruthDistance ?? ''} data-pose-truth-hit={results.poseTruthHit ?? ''} data-pose-truth-to-vertex={results.poseTruthToVertex ?? ''} data-pose-direct-tree-distance={results.poseDirectTreeDistance ?? ''}>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<canvas bind:this={canvas} width="256" height="256" data-testid="palette-canvas"></canvas>
	<a data-testid="leave-demo" href="/demos/retro-framebuffer">leave</a>
</main>

<style>
	.palette-check { padding: 16px; font-family: system-ui, sans-serif; }
	.error { color: #b00020; }
	canvas { width: 256px; height: 256px; image-rendering: pixelated; display: block; }
</style>
