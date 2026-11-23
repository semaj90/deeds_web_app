<script lang="ts">
	import { planIllustrativeEvent } from '$lib/scene/procedural/parent-atlas-east-quay-case-v1/scene-bridge-v1.js';
	import { buildEastQuaySceneIndexV1 } from '$lib/scene/procedural/parent-atlas-east-quay-case-v1/scene-adapter-v1.js';
	import type { EastQuayCaseFixtureV1 } from '$lib/scene/procedural/parent-atlas-east-quay-case-v1/case-fixture-v1.js';
	import EastQuaySceneCanvas from './EastQuaySceneCanvas.svelte';

	let { fixture }: { fixture: EastQuayCaseFixtureV1 | null } = $props();
	let sceneId = $state('');
	let eventId = $state('');
	const scene = $derived(fixture?.scenes.find((item) => item.sceneId === sceneId) ?? fixture?.scenes[0] ?? null);
	const sceneIndex = $derived(fixture ? buildEastQuaySceneIndexV1(fixture) : []);
	const sceneEvents = $derived(fixture?.events.filter((event) => event.sceneIds.includes(scene?.sceneId ?? '')) ?? []);
	const activeEvent = $derived(sceneEvents.find((event) => event.eventId === eventId) ?? sceneEvents[0] ?? null);
	const actors = $derived.by(() => {
		if (!fixture || !scene || !activeEvent) return [];
		try {
			return planIllustrativeEvent(fixture, scene.sceneId, activeEvent.eventId).actors;
		} catch {
			return [];
		}
	});
</script>

{#if fixture}
	<section class="east-quay" aria-labelledby="east-quay-title">
		<div class="heading">
			<div>
				<p class="eyebrow">SYNTHETIC FIXTURE · READ ONLY</p>
				<h2 id="east-quay-title">{fixture.title}</h2>
				<p>{fixture.disclaimer}</p>
			</div>
			<p class="counts">{fixture.scenes.length} scenes · {fixture.people.length} placeholder people · {fixture.evidence.length} evidence summaries</p>
		</div>

		<div class="selectors">
			<label>Scene
				<select data-testid="east-quay-scene-select" value={scene?.sceneId ?? ''} onchange={(event) => {
					sceneId = (event.currentTarget as HTMLSelectElement).value;
					eventId = fixture?.events.find((candidate) => candidate.sceneIds.includes(sceneId))?.eventId ?? '';
				}}>
					{#each fixture.scenes as item (item.sceneId)}
						<option value={item.sceneId}>{item.sceneId} · {item.label}</option>
					{/each}
				</select>
			</label>
			<label>Event
				<select data-testid="east-quay-event-select" bind:value={eventId}>
					{#each sceneEvents as item (item.eventId)}
						<option value={item.eventId}>{item.eventId} · {item.title}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if scene && activeEvent}
			<p class="scene-index" data-testid="east-quay-scene-index">Typed scene adapter: {sceneIndex.length} scenes · {sceneIndex.find((item) => item.sceneId === scene.sceneId)?.people.length ?? 0} linked people · fixture scope DEMO_ONLY</p>
			<EastQuaySceneCanvas {fixture} sceneId={scene.sceneId} eventId={activeEvent.eventId} />
			<div class="event-card" data-testid="east-quay-event-inspector">
				<div>
					<strong>{activeEvent.title}</strong>
					<p>{activeEvent.start} – {activeEvent.end} <span>· source time retained</span></p>
					<p>{activeEvent.claimStatus} · {activeEvent.reviewState}</p>
				</div>
				<div class="evidence-synopsis" data-testid="east-quay-evidence-synopsis">
					<strong>Evidence synopsis · source-bound summaries</strong>
					{#each fixture.evidence.filter((item) => activeEvent.evidenceIds.includes(item.evidenceId)) as item (item.evidenceId)}
						<p><b>{item.evidenceId}</b> · {item.title}<small>{item.sourceTimeCoverage.start} – {item.sourceTimeCoverage.end} · evidence remains a separate source record; this fixture creates no evidence rows.</small></p>
					{:else}
						<p>No linked evidence synopsis is available for this event.</p>
					{/each}
				</div>
				<div class="actor-list">
					{#each actors as actor (actor.personId)}
						{@const person = fixture.people.find((candidate) => candidate.personId === actor.personId)}
						{#if person}
							<div class="actor">
								<img src={'/demos/east-quay-bank-case-v1/' + actor.portraitAssetPath} alt={'Synthetic illustration for ' + person.displayName} loading="lazy" />
								<div><strong>{person.displayName}</strong><small>{actor.placementType.replaceAll('_', ' ')}</small></div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/if}
		<p class="boundary">This preview uses a deterministic placement plan and synthetic portraits. It does not create scene objects, identify people, or write to PostgreSQL.</p>
	</section>
{:else}
	<section class="east-quay unavailable" aria-live="polite">The synthetic case fixture did not pass validation, so its preview is unavailable.</section>
{/if}

<style>
	.east-quay { margin: 1rem 0; padding: 1rem; border: 1px solid #8a744e; border-radius: .55rem; background: #121d27; color: #e8e2d6; }
	.heading { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
	.eyebrow { margin: 0; color: #e8bd64; font-size: .72rem; font-weight: 700; letter-spacing: .12em; }
	h2 { margin: .25rem 0; }
	.heading p, .event-card p { margin: .35rem 0; }
	.counts, .event-card p, .boundary { color: #bbc3c9; font-size: .88rem; }
	.selectors { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: .75rem; margin: .9rem 0; }
	label { display: grid; gap: .35rem; font-weight: 600; }
	select { min-width: 0; padding: .5rem; border: 1px solid #52616d; border-radius: .35rem; background: #1b2a36; color: inherit; }
	.event-card { display: grid; grid-template-columns: minmax(15rem, 1fr) 2fr; gap: 1rem; padding: .8rem; border-radius: .4rem; background: #1b2a36; }
	.actor-list { display: flex; flex-wrap: wrap; gap: .65rem; }
	.actor { display: flex; align-items: center; gap: .55rem; min-width: 12rem; padding: .45rem; border: 1px solid #52616d; border-radius: .4rem; }
	.actor img { width: 2.6rem; height: 2.6rem; object-fit: cover; border-radius: 50%; background: #eee4d2; }
	.actor small { display: block; margin-top: .2rem; color: #c6bda9; font-size: .7rem; }
	.boundary { margin-bottom: 0; }
	.scene-index { color: #bbc3c9; font-size: .8rem; }
	.evidence-synopsis { grid-column: 1 / -1; border-top: 1px solid #52616d; padding-top: .65rem; }
	.evidence-synopsis p { padding: .45rem 0; border-bottom: 1px solid #394a57; }
	.evidence-synopsis small { display: block; color: #bbc3c9; margin-top: .2rem; }
	.unavailable { color: #ffd27b; }
	@media (max-width: 44rem) { .heading, .event-card { display: grid; } }
</style>
