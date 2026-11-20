<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let canvas: HTMLCanvasElement;
	let status = $state('Verifying the generated placeholder GLB…');
	let renderError = $state<string | null>(null);
	let sceneId = $state('');
	let renderSelectedScene: ((id: string) => void) | null = null;
	const selectedScene = $derived(data.fixture.scenes.find((scene) => scene.scene_id === sceneId) ?? data.fixture.scenes[0] ?? null);
	const selectedEvents = $derived(selectedScene?.timeline_proposals ?? []);
	const participants = $derived(selectedScene?.actors.map((actor) => ({ actor, person: data.fixture.person_registry.find((person) => person.registry_key === actor.registry_key) })) ?? []);

	function changeScene(event: Event) {
		sceneId = (event.currentTarget as HTMLSelectElement).value;
		renderSelectedScene?.(sceneId);
	}

	onMount(() => {
		let disposed = false;
		let frame = 0;
		let renderer: import('three').WebGLRenderer | undefined;
		let world: import('three').Scene | undefined;
		let camera: import('three').PerspectiveCamera | undefined;
		let model: import('three').Group | undefined;
		let manager: import('$lib/n64-fsm/scene-primitive-sync.js').ScenePrimitiveManager | undefined;
		let resizeObserver: ResizeObserver | undefined;
		const mountedActors: Array<{ id: string; object: import('three').Object3D }> = [];
		let three: typeof import('three') | undefined;

		const initialize = async () => {
			try {
				const [THREE, { GLTFLoader }, { ScenePrimitiveManager }] = await Promise.all([
					import('three'),
					import('three/addons/loaders/GLTFLoader.js'),
					import('$lib/n64-fsm/scene-primitive-sync.js')
				]);
				if (disposed) return;
				three = THREE;
				world = new THREE.Scene();
				world.background = new THREE.Color('#18242d');
				camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
				camera.position.set(0, 3.2, 3.5);
				camera.lookAt(0, 0.95, -3.1);
				renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
				renderer.setPixelRatio(1);
				world.add(new THREE.HemisphereLight(0xffffff, 0x26343a, 2));
				const key = new THREE.DirectionalLight(0xffe5bb, 2.5);
				key.position.set(-3, 6, 4);
				world.add(key, new THREE.GridHelper(18, 18, 0x9a845f, 0x405057));
				manager = new ScenePrimitiveManager(new Float32Array(256 * 16));

				const response = await fetch(data.asset.url, { cache: 'no-store', credentials: 'same-origin' });
				if (!response.ok) throw new Error(`Placeholder fetch failed (${response.status})`);
				const bytes = await response.arrayBuffer();
				if (bytes.byteLength !== data.asset.byteLength || !globalThis.crypto?.subtle) throw new Error('Placeholder length or checksum API unavailable');
				const digest = await crypto.subtle.digest('SHA-256', bytes);
				const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
				if (actualHash !== data.asset.sha256) throw new Error('Placeholder SHA-256 mismatch');
				const gltf = await new GLTFLoader().parseAsync(bytes, '');
				model = gltf.scene;

				const draw = () => {
					if (!renderer || !world || !camera || disposed) return;
					renderer.render(world, camera);
					frame = requestAnimationFrame(draw);
				};
				const resize = () => {
					if (!renderer || !camera || !canvas) return;
					const bounds = canvas.getBoundingClientRect();
					const width = Math.max(1, Math.min(1000, Math.floor(bounds.width)));
					const height = Math.max(1, Math.min(620, Math.floor(bounds.height)));
					renderer.setSize(width, height, false);
					camera.aspect = width / height;
					camera.updateProjectionMatrix();
				};
				const showScene = (id: string) => {
					if (!world || !manager || !model) return;
					for (const current of mountedActors.splice(0)) {
						manager.unregister(current.id);
						world.remove(current.object);
					}
					const chapter = data.fixture.scenes.find((scene) => scene.scene_id === id);
					if (!chapter) return;
					chapter.actors.forEach((actor, index) => {
						const object = model!.clone(true);
						object.name = actor.actor_id;
						const [px, py, pz] = actor.transform.position as [number, number, number];
						const [qx, qy, qz, qw] = actor.transform.quaternion as [number, number, number, number];
						const [sx, sy, sz] = actor.transform.scale as [number, number, number];
						object.position.set(px, py, pz);
						object.quaternion.set(qx, qy, qz, qw);
						object.scale.set(sx, sy, sz);
						object.userData = { registryKey: actor.registry_key, meshAssetRef: actor.mesh_asset_ref, fixtureScope: 'DEMO_ONLY', identityEstablished: false };
						world!.add(object);
						manager!.register({ id: actor.actor_id, slotIndex: index, type: 'ACTOR_PAWN', mesh: object, metadata: { label: actor.registry_key, sha256: data.asset.sha256 } });
						mountedActors.push({ id: actor.actor_id, object });
					});
				};
				renderSelectedScene = showScene;
				showScene(selectedScene?.scene_id ?? '');
				resizeObserver = new ResizeObserver(resize);
				resizeObserver.observe(canvas);
				resize();
				draw();
				status = `Verified fixture GLB · ${data.asset.byteLength.toLocaleString()} bytes · ${manager.getAll().length} actor appearances loaded`;
			} catch (error) {
				if (!disposed) {
					renderError = error instanceof Error ? error.message : String(error);
					status = 'The verified GLB preview could not load.';
				}
			}
		};

		void initialize();
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			resizeObserver?.disconnect();
			renderSelectedScene = null;
			for (const current of mountedActors) world?.remove(current.object);
			if (model && three) {
				model.traverse((object) => {
					if (object instanceof three!.Mesh) {
						object.geometry.dispose();
						const materials = Array.isArray(object.material) ? object.material : [object.material];
						for (const material of materials) material.dispose();
					}
				});
			}
			renderer?.dispose();
		};
	});
</script>

<svelte:head><title>Morrow Bay Fixture · Mesh Seed 01B</title></svelte:head>

<main>
	<header>
		<p class="eyebrow">PARENT ATLAS · CASE SCENE E2E 01B</p>
		<h1>{data.fixture.case.title}</h1>
		<p class="subtitle">{data.fixture.case.jurisdiction} · FIVE SCENE DEMO · READ ONLY</p>
		<p class="warning">Fictional reconstruction fixture. Generic placeholder geometry and provisional event descriptions do not establish identity, actions, guilt, motive, or measured real-world coordinates.</p>
	</header>

	<section class="workspace" aria-label="Read-only fictional scene preview">
		<div class="viewport">
			<canvas bind:this={canvas} aria-label="Illustrative 3D blockout scene"></canvas>
			<div class="status" aria-live="polite">{status}{#if renderError}<span> · {renderError}</span>{/if}</div>
		</div>
		<aside>
			<label>Scene chapter
				<select value={selectedScene?.scene_id ?? ''} onchange={changeScene}>
					{#each data.fixture.scenes as chapter (chapter.scene_id)}
						<option value={chapter.scene_id}>{chapter.scene_id} · {chapter.title}</option>
					{/each}
				</select>
			</label>
			{#if selectedScene}
				<p class="meta">Coordinate frame: <code>{selectedScene.coordinate_frame.grid_id}</code> · origin [0, 0, 0] · not calibrated</p>
				<h2>Actor appearances</h2>
				<ul>{#each participants as entry (entry.actor.actor_id)}<li><strong>{entry.person?.registry_key}</strong><span>{entry.person?.status}</span><small>{entry.actor.actor_id} · {entry.actor.mesh_asset_ref}</small></li>{/each}</ul>
				<h2>Source-clock events</h2>
				<ul>{#each selectedEvents as event (event.event_id)}<li><strong>{event.source_timestamp} · {event.clock_id}</strong><span>{event.proposal}</span><small>{event.status} · aligned time: unknown</small></li>{/each}</ul>
			{/if}
			<h2>Asset readback</h2>
			<p><code>{data.asset.sha256}</code></p>
			<p>{data.asset.byteLength.toLocaleString()} bytes · fixture-local asset ID · synthetic placeholder</p>
		</aside>
	</section>
	<footer>Fixture state is served without database writes. The synthetic source clocks remain separate; the transit offset is provisional and unapplied. The scene asset UUID shown here is fixture-local, not a PostgreSQL asset ID.</footer>
</main>

<style>
	:global(body) { margin: 0; background: #101820; color: #eef1f2; font: 15px/1.45 system-ui, sans-serif; }
	main { max-width: 1500px; margin: 0 auto; padding: 1.25rem; }
	.eyebrow { color: #edc267; font-size: .75rem; font-weight: 800; letter-spacing: .13em; }
	h1 { margin: .2rem 0; font: 600 clamp(1.6rem, 3vw, 2.5rem)/1.1 Georgia, serif; }
	.subtitle, .meta, footer { color: #bfccd1; }
	.warning { padding: .7rem; border-left: 3px solid #e5bd65; background: #26313a; }
	.workspace { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(18rem, .8fr); gap: 1rem; align-items: start; }
	.viewport { position: relative; min-height: 480px; overflow: hidden; border: 1px solid #43525c; border-radius: .5rem; background: #18242d; }
	canvas { display: block; width: 100%; height: 480px; }
	.status { position: absolute; bottom: .5rem; left: .5rem; right: .5rem; padding: .45rem .6rem; background: #101820e8; color: #d5e0e3; font-size: .82rem; }
	.status span { color: #ffca79; }
	aside { padding: 1rem; border: 1px solid #43525c; border-radius: .5rem; background: #1a2630; }
	label { display: grid; gap: .35rem; font-weight: 700; }
	select { padding: .55rem; background: #0f1920; border: 1px solid #566772; color: inherit; border-radius: .3rem; }
	h2 { margin: 1rem 0 .35rem; font-size: 1rem; }
	ul { display: grid; gap: .5rem; list-style: none; padding: 0; }
	li { display: grid; gap: .12rem; padding: .55rem; background: #111d25; border-radius: .3rem; }
	li span, li small { color: #c2cdd1; }
	li small { font-size: .74rem; }
	code { overflow-wrap: anywhere; font-size: .75rem; }
	footer { margin: 1rem 0; font-size: .85rem; }
	@media (max-width: 900px) { .workspace { grid-template-columns: 1fr; } .viewport { min-height: 360px; } canvas { height: 360px; } }
</style>
