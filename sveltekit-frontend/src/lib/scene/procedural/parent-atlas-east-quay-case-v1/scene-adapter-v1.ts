import type { ScenePrimitiveManager } from '$lib/n64-fsm/scene-primitive-sync.js';
import { planIllustrativeEvent, type IllustrativeEventPlanV1 } from './scene-bridge-v1.js';
import type { EastQuayCaseFixture } from './case-registry-v1.js';

export function buildEastQuaySceneIndexV1(fixture: EastQuayCaseFixture) {
	return fixture.scenes.map((scene) => ({
		sceneId: scene.sceneId,
		label: scene.label,
		coordinateSpaceId: scene.coordinateSpaceId,
		sceneRevision: scene.sceneRevision,
		people: fixture.people.filter((person) => scene.participantIds.includes(person.personId)),
		events: fixture.events.filter((event) => event.sceneIds.includes(scene.sceneId))
	}));
}

export function registerEastQuayIllustrativeObjectsV1(input: {
	fixture: EastQuayCaseFixture;
	plan: IllustrativeEventPlanV1;
	manager: ScenePrimitiveManager;
	actorRoot: import('three').Object3D;
	marker: import('three').Object3D;
	slotOffset?: number;
}): string[] {
	if (input.plan.fixtureScope !== 'DEMO_ONLY' || input.plan.caseId !== input.fixture.caseId || input.plan.readOnly !== true) throw new Error('EAST_QUAY_SCENE_ADMISSION_DENIED');
	const actor = input.plan.actors[0];
	if (!actor) throw new Error('EAST_QUAY_EVENT_HAS_NO_ACTOR');
	const slot = input.slotOffset ?? 0;
	input.actorRoot.position.set(...actor.positionXYZ);
	input.actorRoot.userData = { ...input.actorRoot.userData, registryId: actor.id, personId: actor.personId, eventId: input.plan.eventId, fixtureScope: 'DEMO_ONLY', sourceClass: 'synthetic_illustration', identityEstablished: false };
	input.marker.userData = { ...input.marker.userData, eventId: input.plan.eventId, fixtureScope: 'DEMO_ONLY', sourceClass: 'synthetic_illustration' };
	input.manager.register({ id: `${actor.id}:actor`, slotIndex: slot, type: 'ACTOR_PAWN', mesh: input.actorRoot, metadata: { label: `Illustrative actor ${actor.personId}` } });
	input.manager.register({ id: `${actor.id}:event`, slotIndex: slot + 1, type: 'MARKER_TENT', mesh: input.marker, metadata: { label: `Event ${input.plan.eventId}` } });
	return [`${actor.id}:actor`, `${actor.id}:event`];
}

export function planEastQuaySceneEventV1(fixture: EastQuayCaseFixture, sceneId: string, eventId: string): IllustrativeEventPlanV1 {
	return planIllustrativeEvent(fixture, sceneId, eventId);
}
