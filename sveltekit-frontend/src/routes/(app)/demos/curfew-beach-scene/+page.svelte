<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { SceneTimedEventV1 } from '$lib/splat/scene-event-visibility-v1.js';
	import SceneRuntimeRecipeCanvas from '$lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte';
	let { data }: { data: PageData } = $props();
	let showV2Canvas = $state(untrack(() => Boolean(data.showV2CanvasInitial)));
	let canvas = $state<HTMLCanvasElement>();
	let selectedEventId = $state('EVT-WA-BONFIRE');
	let clockId = $state('CLK-WITNESS-A');
	let sourceTimeMs = $state(82_800_000);
	let renderState = $state('Loading illustrative beach scene…');
	let renderError = $state<string | null>(null);
	let updateTime: (() => void) | null = null;
	const selectedEvent = $derived(data.fixture.events.find((event) => event.eventId === selectedEventId) ?? null);
	const selectedSource = $derived(data.fixture.sources.find((source) => source.sourceId === selectedEvent?.sourceId) ?? null);
	const maxTimeMs = 100_000_000;
	const clockLabel = (id: string) => data.fixture.sources.find((source) => source.clockId === id)?.description ?? id;

	function selectEvent(eventId: string) {
		const event = data.fixture.events.find((item) => item.eventId === eventId);
		if (!event) return;
		selectedEventId = event.eventId;
		clockId = event.clockId;
		sourceTimeMs = event.startMs;
		updateTime?.();
	}

	onMount(() => {
		if (showV2Canvas) return;
		const sceneCanvas = canvas;
		if (!sceneCanvas) return;
		let disposed = false;
		let frame = 0;
		let renderer: import('three').WebGLRenderer | undefined;
		let world: import('three').Scene | undefined;
		let camera: import('three').PerspectiveCamera | undefined;
		let controls: import('three/addons/controls/OrbitControls.js').OrbitControls | undefined;
		let cell: ReturnType<typeof import('$lib/splat/scene-environment-cell-three-v1.js').createSceneEnvironmentCellThreeV1> | undefined;
		let resizeObserver: ResizeObserver | undefined;
		const initialize = async () => {
			try {
				const [THREE, { OrbitControls }, environment] = await Promise.all([
					import('three'), import('three/addons/controls/OrbitControls.js'), import('$lib/splat/scene-environment-cell-three-v1.js')
				]);
				if (disposed) return;
				world = new THREE.Scene(); world.background = new THREE.Color('#16232b');
				camera = new THREE.PerspectiveCamera(48, 1, 0.1, 160); camera.position.set(13, 12, 18);
				controls = new OrbitControls(camera, sceneCanvas); controls.enableDamping = true; controls.target.set(0, 1, 0);
				renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: false, powerPreference: 'low-power' }); renderer.setPixelRatio(1);
				world.add(new THREE.HemisphereLight(0xffffff, 0x28343b, 2));
				const sun = new THREE.DirectionalLight(0xffe6bf, 2.1); sun.position.set(-4, 9, 6); world.add(sun);
				cell = environment.createSceneEnvironmentCellThreeV1('beach', 0, 0, 32, { timedEventOverrides: { 'DEMO-BONFIRE-01': toRuntimeCue(selectedEvent) } });
				world.add(cell.group);
				const avatarGeometry = new THREE.CapsuleGeometry(0.28, 0.95, 3, 6);
				const headGeometry = new THREE.SphereGeometry(0.22, 6, 4);
				const palette = [0x607b89, 0x83745f, 0x695d72, 0x60765c];
				data.fixture.actors.forEach((actor, index) => {
					const person = new THREE.Group(); person.name = actor.actorId; person.userData = { actorId: actor.actorId, synthetic: true, identityEstablished: false, sourceLinked: false };
					const body = new THREE.Mesh(avatarGeometry, new THREE.MeshStandardMaterial({ color: palette[index % palette.length], roughness: 1 })); body.position.y = 0.72; person.add(body);
					const head = new THREE.Mesh(headGeometry, new THREE.MeshStandardMaterial({ color: 0xc9aa88, roughness: 1 })); head.position.y = 1.48; person.add(head);
					const [actorX, actorY, actorZ] = actor.positionMeters;
					person.position.set(actorX, actorY, actorZ); world!.add(person);
				});
				updateTime = () => {
					const timedNode = cell?.timedNodes[0];
					if (!timedNode) return;
					timedNode.event = toRuntimeCue(selectedEvent);
					timedNode.node.userData = { ...timedNode.node.userData, eventId: timedNode.event.eventId, clockId: timedNode.event.clockId, targetRefs: timedNode.event.targetRefs ?? [], temporalStatus: timedNode.event.status };
					environment.setSceneCellTimeV1(cell!, clockId, sourceTimeMs);
				};
				const resize = () => { if (!renderer || !camera) return; const box = canvas.getBoundingClientRect(); renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false); camera.aspect = Math.max(1, box.width) / Math.max(1, box.height); camera.updateProjectionMatrix(); };
				resizeObserver = new ResizeObserver(resize); resizeObserver.observe(sceneCanvas); resize();
				const draw = () => { if (disposed || !renderer || !world || !camera) return; controls?.update(); renderer.render(world, camera); frame = requestAnimationFrame(draw); };
				updateTime(); draw(); renderState = 'Illustrative scene loaded · 4 generic POI proxies, not source-identified or source-placed';
			} catch (error) { if (!disposed) { renderError = error instanceof Error ? error.message : String(error); renderState = 'Scene preview unavailable'; } }
		};
		void initialize();
		return () => {
			disposed = true; cancelAnimationFrame(frame); resizeObserver?.disconnect(); controls?.dispose();
			const geometries = new Set<import('three').BufferGeometry>(); const materials = new Set<import('three').Material>();
			world?.traverse((node) => { if ('isMesh' in node) { const mesh = node as import('three').Mesh; geometries.add(mesh.geometry); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material); } });
			for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
			renderer?.dispose(); updateTime = null;
		};
	});

	function toRuntimeCue(event: (typeof data.fixture.events)[number] | null): SceneTimedEventV1 {
		return event ? {
			eventId: event.eventId, clockId: event.clockId, startMs: event.startMs, endMs: event.endMs,
			status: event.status === 'unknown' ? 'unresolved' : 'provisional',
			targetRefs: event.targetRefs.map((target) => ({ kind: target.kind === 'primitive' ? 'primitive' as const : 'actor' as const, targetId: target.targetId })),
			action: event.claimType === 'reported-bonfire' ? { type: 'visible_during_interval', visible: true } : undefined
		} : { eventId: 'NO-SELECTED-EVENT', clockId: '', startMs: 0, endMs: 1, status: 'unresolved', targetRefs: [] };
	}
</script>

<svelte:head><title>{data.fixture.case.title} · Scene Preview</title></svelte:head>
<main>
	<header><p class="eyebrow">PARENT ATLAS · SYNTHETIC CASE SCENE</p><h1>{data.fixture.case.title}</h1><p>{data.fixture.case.jurisdiction} · read-only illustrative workspace · <button type="button" data-testid="toggle-v2-recipe-canvas" onclick={() => { showV2Canvas = !showV2Canvas; }}>{showV2Canvas ? 'Switch to Beach Fixture Blockout' : 'Switch to Unified Runtime Recipe Canvas (Parent Atlas v2)'}</button></p></header>
	<p class="notice">All records and meshes here are synthetic. Curfew at 22:00 is unverified scenario context, not proof of a violation. The possible-drinking reports do not establish drinking, anyone’s age, or which person was involved. Coordinates are illustrative and uncalibrated.</p>
	{#if data.conflictFixture}<p role="note">Synthetic test variation: Actor A has two overlapping illustrative movement proposals on one camera clock. Neither proposal is accepted as an observed action.</p>{/if}
	{#if data.maskFixture}<p role="note">Synthetic contour editor fixture: the mask and review status are invented test data, not case evidence or a real reviewer decision. Its source-pixel edit is local and cannot be saved.</p>{/if}
	{#if showV2Canvas}
		<SceneRuntimeRecipeCanvas
			plan={data.demoPlan}
			recipe={data.demoRecipe}
			revision={data.demoRevision ?? null}
			evidenceItems={data.demoEvidenceItems}
			sourceNavigationEnabled={false}
			persistenceEnabled={false}
		/>
	{:else}
	<section class="workspace">
		<div class="viewport"><canvas bind:this={canvas} aria-label="Interactive illustrative beach blockout"></canvas><div class="render-status" role="status">{renderState}{#if renderError} · {renderError}{/if}</div></div>
		<aside>
			<h2>Who</h2><p>Four generic, unlinked POI proxies for blockout only. Their displayed positions are illustrative and are not placements established by witness reports.</p><ul class="people">{#each data.fixture.actors as actor (actor.actorId)}<li>{actor.actorId}<small>{actor.label} · unidentified · not linked to a report</small></li>{/each}</ul>
			<h2>What / when</h2><p>Curfew context: 22:00 local, unverified. Select a source report to inspect its own timeline.</p>
			<div class="events">{#each data.fixture.events as event (event.eventId)}<button class:selected={selectedEventId === event.eventId} type="button" onclick={() => selectEvent(event.eventId)}><strong>{event.eventId}</strong><span>{event.statement}</span><small>{clockLabel(event.clockId)} · {event.status} · review pending</small></button>{/each}</div>
			{#if selectedEvent}<section class="selected"><strong>{selectedEvent.claimType.replaceAll('-', ' ').toUpperCase()}</strong><p>{selectedEvent.statement}</p><p>Source: {selectedSource?.description ?? selectedEvent.sourceId}</p><p>Clock: <code>{selectedEvent.clockId}</code> · uncertainty ±{Math.round(selectedEvent.uncertaintyMs / 60_000)} min</p></section><label>Preview this source clock only · {(sourceTimeMs / 3_600_000).toFixed(2)} h<input type="range" min="0" max={maxTimeMs} step="60000" value={sourceTimeMs} oninput={(e) => { sourceTimeMs = Number((e.currentTarget as HTMLInputElement).value); updateTime?.(); }} /></label>{/if}
			<h2>Why / how</h2><p>Unknown / unresolved. The scene does not infer motive, age, identity, or guilt.</p>
		</aside>
	</section>
	{/if}
	<footer>Generated placeholders and timed props are presentation hypotheses only. No evidence bytes are included and this demo does not write to a case or database.</footer>
</main>

<style>
	:global(body){margin:0;background:#101820;color:#edf2f3;font:14px/1.45 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:1.2rem}.eyebrow{color:#e8bd66;font-size:.72rem;font-weight:800;letter-spacing:.14em}h1{font:600 clamp(1.6rem,3vw,2.5rem)/1.1 Georgia,serif;margin:.2rem 0}.notice{padding:.75rem 1rem;background:#2a251b;border-left:3px solid #e1b45b;color:#f0dbad}.workspace{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(19rem,.8fr);gap:1rem}.viewport{position:relative;min-height:620px;border:1px solid #46545b;border-radius:.5rem;overflow:hidden}.viewport canvas{display:block;width:100%;height:620px}.render-status{position:absolute;bottom:.5rem;left:.5rem;padding:.4rem .6rem;background:#101820dd}.workspace aside{max-height:680px;overflow:auto;padding:1rem;background:#18242d;border:1px solid #46545b;border-radius:.5rem}h2{font-size:1rem;margin:1rem 0 .4rem}.events,.people{display:grid;gap:.4rem;padding:0;list-style:none}.events button,.people li{display:grid;gap:.25rem;text-align:left;background:#111b23;color:inherit;border:1px solid #3b4b55;border-radius:.35rem;padding:.6rem}.events button.selected{border-color:#edc267}.events span,.events small,.people small{color:#bfccd1}.events small,.people small{font-size:.72rem}.selected{padding:.7rem;background:#242a2c;border-radius:.35rem}.selected p{margin:.45rem 0}label{display:grid;gap:.4rem;margin:.8rem 0}input{accent-color:#edc267}footer{margin:1rem 0;color:#bbc8ce}@media(max-width:900px){.workspace{grid-template-columns:1fr}.viewport,.viewport canvas{min-height:380px;height:380px}}
</style>
