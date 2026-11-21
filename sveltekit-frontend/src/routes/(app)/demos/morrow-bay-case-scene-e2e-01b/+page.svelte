<script lang="ts">
	import { onMount } from 'svelte';
	import { createSceneCellResidencyV1 } from '$lib/splat/scene-cell-residency-v1.js';
	import SceneEventCueDevPanel from '$lib/components/scene/SceneEventCueDevPanel.svelte';
	import type { SceneTimedEventV1 } from '$lib/splat/scene-event-visibility-v1.js';
	import { evaluateSceneTimelineV1 } from '$lib/splat/scene-event-visibility-v1.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let canvas: HTMLCanvasElement;
	let status = $state('Preparing procedural scene primitives…');
	let renderError = $state<string | null>(null);
	let representation = $state<'procedural' | 'glb'>('procedural');
	let environmentStyle = $state<'urban' | 'beach'>('urban');
	let sourceClockId = $state('BEACH-CAM-A');
	let sourceTimeMs = $state(0);
	let actorClockId = $state('CLK-BANK-CAM');
	let actorTimeMs = $state(0);
	let bonfireCue = $state<SceneTimedEventV1>({ eventId: 'DEMO-BONFIRE-01', clockId: 'BEACH-CAM-A', startMs: 18_000, endMs: 42_000, status: 'provisional', targetRefs: [{ kind: 'primitive', targetId: 'PROP-BONFIRE-01' }] });
	let actorCue = $state<SceneTimedEventV1>({ eventId: 'DEMO-ACTOR-MOVE-01', clockId: 'CLK-BANK-CAM', startMs: 36_849_000, endMs: 36_854_000, status: 'provisional', targetRefs: [{ kind: 'actor', targetId: 'ACTOR-01' }], action: { type: 'move_during_interval', fromMeters: [0, 0, 0], toMeters: [4, 0, 0] } });
	const showSceneCueDevPanel = import.meta.env.DEV;
	let residentCellCount = $state(0);
	let residentInstanceCount = $state(0);
	let sceneId = $state('');
	let renderSelectedScene: ((id: string) => void) | null = null;
	let updateEnvironment: (() => void) | null = null;
	let updateSceneTime: (() => void) | null = null;
	const selectedScene = $derived(data.fixture.scenes.find((scene) => scene.scene_id === sceneId) ?? data.fixture.scenes[0] ?? null);
	const selectedEvents = $derived(selectedScene?.timeline_proposals ?? []);
	const participants = $derived(selectedScene?.actors.map((actor) => ({ actor, person: data.fixture.person_registry.find((person) => person.registry_key === actor.registry_key) })) ?? []);

	function changeScene(event: Event) {
		sceneId = (event.currentTarget as HTMLSelectElement).value;
		const firstActor = data.fixture.scenes.find((scene) => scene.scene_id === sceneId)?.actors[0];
		if (firstActor) changeActorCue({ ...actorCue, targetRefs: [{ kind: 'actor', targetId: firstActor.actor_id }] });
		renderSelectedScene?.(sceneId);
	}
	function changeRepresentation(event: Event) {
		representation = (event.currentTarget as HTMLSelectElement).value as 'procedural' | 'glb';
		renderSelectedScene?.(sceneId);
	}
	function changeEnvironment(event: Event) {
		environmentStyle = (event.currentTarget as HTMLSelectElement).value as 'urban' | 'beach';
		updateEnvironment?.();
	}
	function changeSceneClock(event: Event) {
		sourceClockId = (event.currentTarget as HTMLSelectElement).value;
		updateSceneTime?.();
	}
	function changeSceneTime(event: Event) {
		sourceTimeMs = Number((event.currentTarget as HTMLInputElement).value);
		updateSceneTime?.();
	}
	function changeBonfireCue(cue: SceneTimedEventV1) {
		bonfireCue = cue;
		updateEnvironment?.();
	}
	function changeActorCue(cue: SceneTimedEventV1) {
		const actorId = cue.targetRefs?.find((target) => target.kind === 'actor')?.targetId;
		const actor = selectedScene?.actors.find((entry) => entry.actor_id === actorId);
		const [x, y, z] = (actor?.transform.position ?? [0, 0, 0]) as [number, number, number];
		actorCue = {
			...cue,
			eventId: `DEMO-MOVE-${(actorId ?? 'ACTOR').replace(/[^A-Z0-9-]/gi, '-').toUpperCase()}`,
			action: cue.action?.type === 'move_during_interval'
				? { type: 'move_during_interval', fromMeters: [x, y, z], toMeters: [x + 4, y, z] }
				: cue.action
		};
		updateSceneTime?.();
	}
	function selectCuePreviewClock(clockId: string) {
		sourceClockId = clockId;
		updateSceneTime?.();
	}
	function selectActorPreviewClock(clockId: string) {
		actorClockId = clockId;
		updateSceneTime?.();
	}

	onMount(() => {
		let disposed = false;
		let frame = 0;
		let renderer: import('three').WebGLRenderer | undefined;
		let world: import('three').Scene | undefined;
		let camera: import('three').PerspectiveCamera | undefined;
		let model: import('three').Group | undefined;
		let controls: import('three/addons/controls/OrbitControls.js').OrbitControls | undefined;
		let manager: import('$lib/n64-fsm/scene-primitive-sync.js').ScenePrimitiveManager | undefined;
		let resizeObserver: ResizeObserver | undefined;
		const mountedActors: Array<{ id: string; object: import('three').Object3D; initialPositionMeters: [number, number, number]; dispose?: () => void }> = [];
		const environmentCells = new Map<string, { group: import('three').Group; timedNodes: Array<{ node: import('three').Object3D; event: { eventId: string; clockId: string; startMs: number; endMs: number; status: 'provisional' | 'accepted' | 'disputed' | 'unresolved' } }>; instanceCount: number }>();
		let residency = createSceneCellResidencyV1({ cellSizeMeters: 32, radiusCells: 2, maxResidentCells: 64, graceMs: 1500 });
		let currentEnvironmentTile = '';
		let lastResidencyCheck = 0;
		let three: typeof import('three') | undefined;
		let disposeEnvironmentCell: ((group: import('three').Group) => void) | undefined;

		const initialize = async () => {
			try {
				const [THREE, { GLTFLoader }, { OrbitControls }, { ScenePrimitiveManager }, avatars, environment] = await Promise.all([
					import('three'),
					import('three/addons/loaders/GLTFLoader.js'),
					import('three/addons/controls/OrbitControls.js'),
					import('$lib/n64-fsm/scene-primitive-sync.js'),
					import('$lib/characters/avatar-primitives-v1.js'),
					import('$lib/splat/scene-environment-cell-three-v1.js')
				]);
				if (disposed) return;
				three = THREE;
				world = new THREE.Scene();
				world.background = new THREE.Color('#18242d');
				camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
				camera.position.set(12, 14, 20);
				camera.lookAt(0, 0, 0);
				controls = new OrbitControls(camera, canvas);
				controls.enableDamping = true;
				controls.maxDistance = 180;
				controls.target.set(0, 1, 0);
				renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
				renderer.setPixelRatio(1);
				world.add(new THREE.HemisphereLight(0xffffff, 0x26343a, 2));
				const key = new THREE.DirectionalLight(0xffe5bb, 2.5);
				key.position.set(-3, 6, 4);
				world.add(key);
				manager = new ScenePrimitiveManager(new Float32Array(256 * 16));
				const clearEnvironment = () => {
					for (const cell of environmentCells.values()) { world?.remove(cell.group); environment.disposeSceneEnvironmentCellThreeV1(cell.group); }
					environmentCells.clear();
					residency.clear();
					currentEnvironmentTile = '';
					lastResidencyCheck = 0;
				};
				disposeEnvironmentCell = environment.disposeSceneEnvironmentCellThreeV1;
				const syncEnvironment = (force = false) => {
					if (!camera || !world) return;
					const now = performance.now();
					const tile = `${Math.floor(camera.position.x / 32)}:${Math.floor(camera.position.z / 32)}`;
					if (!force && tile === currentEnvironmentTile && now - lastResidencyCheck < 250) return;
					currentEnvironmentTile = tile;
					lastResidencyCheck = now;
					const plan = residency.update([camera.position.x, camera.position.y, camera.position.z], now);
					for (const cell of plan.load) {
						const built = environment.createSceneEnvironmentCellThreeV1(environmentStyle, cell.tileX, cell.tileZ, 32, { timedEventOverrides: { 'DEMO-BONFIRE-01': bonfireCue } });
						world.add(built.group);
						environmentCells.set(cell.key, built);
					}
					for (const cell of plan.unload) {
						const resident = environmentCells.get(cell.key);
						if (resident) { world.remove(resident.group); environment.disposeSceneEnvironmentCellThreeV1(resident.group); environmentCells.delete(cell.key); }
					}
					for (const cell of plan.resident) {
						const resident = environmentCells.get(cell.key);
						if (resident) environment.setSceneCellTimeV1(resident, sourceClockId, sourceTimeMs);
					}
					residentCellCount = environmentCells.size;
					residentInstanceCount = [...environmentCells.values()].reduce((total, cell) => total + cell.instanceCount, 0);
				};
				updateEnvironment = () => { clearEnvironment(); syncEnvironment(true); };
				updateSceneTime = () => {
					for (const cell of environmentCells.values()) environment.setSceneCellTimeV1(cell, sourceClockId, sourceTimeMs);
					const actorStates = evaluateSceneTimelineV1(
						mountedActors.map((actor) => ({ kind: 'actor' as const, targetId: actor.id, visible: true, positionMeters: actor.initialPositionMeters })),
						[actorCue], actorClockId, actorTimeMs
					);
					for (const state of actorStates) {
						const actor = mountedActors.find((entry) => entry.id === state.targetId);
						if (actor) { actor.object.visible = state.visible; actor.object.position.set(...state.positionMeters); }
					}
				};

				if (data.asset) {
					const response = await fetch(data.asset.url, { cache: 'no-store', credentials: 'same-origin' });
					if (!response.ok) throw new Error(`Placeholder fetch failed (${response.status})`);
					const bytes = await response.arrayBuffer();
					if (bytes.byteLength !== data.asset.byteLength || !globalThis.crypto?.subtle) throw new Error('Placeholder length or checksum API unavailable');
					const digest = await crypto.subtle.digest('SHA-256', bytes);
					const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
					if (actualHash !== data.asset.sha256) throw new Error('Placeholder SHA-256 mismatch');
					const gltf = await new GLTFLoader().parseAsync(bytes, '');
					model = gltf.scene;
				}

				const draw = () => {
					if (!renderer || !world || !camera || disposed) return;
					controls?.update();
					syncEnvironment();
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
					if (!world || !manager) return;
					for (const current of mountedActors.splice(0)) {
						manager.unregister(current.id);
						world.remove(current.object);
						current.dispose?.();
					}
					const chapter = data.fixture.scenes.find((scene) => scene.scene_id === id);
					if (!chapter) return;
					chapter.actors.forEach((actor, index) => {
						if (index >= 256) throw new Error('Scene exceeds the active 256 actor transform slots');
						const avatar = representation === 'procedural' ? avatars.createPrimitiveAvatar({ style: 'neutral', hairLength: 'short' }) : null;
						const object = avatar?.root ?? model?.clone(true);
						if (!object) throw new Error('Verified fixture GLB representation is unavailable');
						object.name = actor.actor_id;
						const [px, py, pz] = actor.transform.position as [number, number, number];
						const [qx, qy, qz, qw] = actor.transform.quaternion as [number, number, number, number];
						const [sx, sy, sz] = actor.transform.scale as [number, number, number];
						object.position.set(px, py, pz);
						object.quaternion.set(qx, qy, qz, qw);
						object.scale.set(sx, sy, sz);
						object.userData = { ...object.userData, registryKey: actor.registry_key, meshAssetRef: representation === 'glb' ? actor.mesh_asset_ref : null, representation, fixtureScope: 'DEMO_ONLY', identityEstablished: false, illustrative: true, calibrated: false };
						world!.add(object);
						manager!.register({ id: actor.actor_id, slotIndex: index, type: 'ACTOR_PAWN', mesh: object, metadata: { label: actor.registry_key, ...(representation === 'glb' && data.asset ? { sha256: data.asset.sha256 } : {}) } });
						mountedActors.push({ id: actor.actor_id, object, initialPositionMeters: [px, py, pz], dispose: avatar ? () => avatars.disposeAvatar(avatar.root) : undefined });
					});
					updateSceneTime?.();
				};
				renderSelectedScene = showScene;
				showScene(selectedScene?.scene_id ?? '');
				const initialActor = selectedScene?.actors[0];
				if (initialActor) changeActorCue({ ...actorCue, targetRefs: [{ kind: 'actor', targetId: initialActor.actor_id }] });
				syncEnvironment(true);
				resizeObserver = new ResizeObserver(resize);
				resizeObserver.observe(canvas);
				resize();
				draw();
				status = `Instanced ${environmentStyle} cells · ${environmentCells.size} resident · ${manager.getAll().length} editable actor slots used`;
			} catch (error) {
				if (!disposed) {
					renderError = error instanceof Error ? error.message : String(error);
					status = 'The scene preview could not load.';
				}
			}
		};

		void initialize();
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			resizeObserver?.disconnect();
			renderSelectedScene = null;
			updateEnvironment = null;
			updateSceneTime = null;
			for (const cell of environmentCells.values()) { world?.remove(cell.group); disposeEnvironmentCell?.(cell.group); }
			environmentCells.clear();
			controls?.dispose();
			for (const current of mountedActors) { world?.remove(current.object); current.dispose?.(); }
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
			<p class="warning">Fictional reconstruction fixture. The city/beach environment and timed bonfire are independent synthetic demonstrations, not case evidence. Generic placeholder geometry and provisional event descriptions do not establish identity, actions, guilt, motive, or measured coordinates.</p>
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
			<label>Scene representation
				<select value={representation} onchange={changeRepresentation}>
					<option value="procedural">Procedural primitives (no Blender)</option>
					<option value="glb" disabled={!data.asset}>Verified fixture GLB</option>
				</select>
			</label>
			<label>Environment blockout
				<select value={environmentStyle} onchange={changeEnvironment}>
					<option value="urban">Populated city · instanced buildings</option>
					<option value="beach">Beach · instanced palms + timed bonfire</option>
				</select>
			</label>
			{#if environmentStyle === 'beach' && showSceneCueDevPanel}
				<SceneEventCueDevPanel
					cue={bonfireCue}
					clockOptions={[{ id: 'BEACH-CAM-A', label: 'Beach camera A' }, { id: 'BEACH-CAM-B', label: 'Beach camera B (unaligned)' }]}
					targetOptions={[{ kind: 'primitive', id: 'PROP-BONFIRE-01', label: 'Bonfire prop · PROP-BONFIRE-01' }]}
					activeClockId={sourceClockId}
					sourceTimeMs={sourceTimeMs}
					onCueChange={changeBonfireCue}
					onClockSelect={selectCuePreviewClock}
					onScrub={(timeMs) => { sourceTimeMs = timeMs; updateSceneTime?.(); }}
				/>
			{:else if environmentStyle === 'beach'}
				<label>Source clock lane
					<select value={sourceClockId} onchange={changeSceneClock}>
						<option value="BEACH-CAM-A">Beach camera A</option>
						<option value="BEACH-CAM-B">Beach camera B (unaligned)</option>
					</select>
				</label>
				<label>Source time · {(sourceTimeMs / 1000).toFixed(1)} s
					<input type="range" min="0" max="60000" step="100" value={sourceTimeMs} oninput={changeSceneTime} />
				</label>
				<p class="meta">Demo bonfire interval: 18–42 s on BEACH-CAM-A only. It remains hidden on unaligned camera B.</p>
			{/if}
			{#if showSceneCueDevPanel && selectedScene?.actors.length}
				<SceneEventCueDevPanel
					cue={actorCue}
					clockOptions={[{ id: 'CLK-BANK-CAM', label: 'Bank camera clock' }, { id: 'CLK-BANK-SYS', label: 'Bank system clock (unaligned)' }]}
					targetOptions={selectedScene.actors.map((actor) => ({ kind: 'actor' as const, id: actor.actor_id, label: `Actor · ${actor.actor_id}` }))}
					activeClockId={actorClockId}
					sourceTimeMs={actorTimeMs}
					maxTimeMs={86_400_000}
					onCueChange={changeActorCue}
					onClockSelect={selectActorPreviewClock}
					onScrub={(timeMs) => { actorTimeMs = timeMs; updateSceneTime?.(); }}
				/>
			{/if}
			<p class="meta">Pan/zoom the camera to stream nearby 32 m cells. Repeated scenery is instanced; only editable actors use the 256 transform slots.</p>
			<p class="meta">Resident cells: {residentCellCount} · static instances: {residentInstanceCount}</p>
			{#if selectedScene}
				<p class="meta">Coordinate frame: <code>{selectedScene.coordinate_frame.grid_id}</code> · origin [0, 0, 0] · not calibrated</p>
				<h2>Actor appearances</h2>
				<ul>{#each participants as entry (entry.actor.actor_id)}<li><strong>{entry.person?.registry_key}</strong><span>{entry.person?.status}</span><small>{entry.actor.actor_id} · {entry.actor.mesh_asset_ref}</small></li>{/each}</ul>
				<h2>Source-clock events</h2>
				<ul>{#each selectedEvents as event (event.event_id)}<li><strong>{event.source_timestamp} · {event.clock_id}</strong><span>{event.proposal}</span><small>{event.status} · aligned time: unknown</small></li>{/each}</ul>
			{/if}
			<h2>Representation status</h2>
			<p>{representation === 'procedural' ? 'Generated Three.js primitives. No Blender export or GLB is required.' : 'Fixture GLB was verified by server and browser SHA-256 readback.'}</p>
			{#if data.asset}<h2>Asset readback</h2><p><code>{data.asset.sha256}</code></p><p>{data.asset.byteLength.toLocaleString()} bytes · fixture-local asset ID · synthetic placeholder</p>{:else}<p>Optional GLB is absent; procedural primitives remain available.</p>{/if}
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
