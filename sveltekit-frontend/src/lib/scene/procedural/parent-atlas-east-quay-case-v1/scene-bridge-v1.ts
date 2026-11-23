import { eventBindingAllowed, readEvent, readScene, type EastQuayCaseFixture } from './case-registry-v1.js';

export interface IllustrativeEventPlanV1 {
	fixtureScope: 'DEMO_ONLY'; caseId: string; sceneId: string; eventId: string; sceneRevision: string;
	coordinateSpaceId: string; timeInterval: [string, string]; sceneClassification: string;
	evidenceIds: string[]; readOnly: true;
	actors: Array<{ id: string; personId: string; characterAssetId: string; portraitAssetPath: string; representation: 'low-poly-mesh' | '2.5d-sprite'; positionXYZ: [number, number, number]; placementType: 'ILLUSTRATIVE_BLOCKOUT_NOT_OBSERVED'; faceAssetClassification: 'synthetic_illustration' }>;
}

export function planIllustrativeEvent(fixture: EastQuayCaseFixture, sceneId: string, eventId: string, options: { representation?: 'low-poly-mesh' | '2.5d-sprite' } = {}): IllustrativeEventPlanV1 {
	const representation = options.representation ?? 'low-poly-mesh';
	if (representation !== 'low-poly-mesh' && representation !== '2.5d-sprite') throw new Error('EAST_QUAY_REPRESENTATION_INVALID');
	const { scene } = readScene(fixture, sceneId);
	const { event, people, evidence, locations } = readEvent(fixture, eventId);
	if (!event.sceneIds.includes(sceneId)) throw new Error('EAST_QUAY_EVENT_SCENE_MISMATCH');
	const anchor = locations[0];
	if (!anchor || (anchor.sceneId !== sceneId && !(scene.coordinateSpaceId === 'bank_site' && fixture.scenes.some((item) => item.sceneId === anchor.sceneId && item.coordinateSpaceId === 'bank_site')))) throw new Error('EAST_QUAY_COORDINATE_SPACE_MISMATCH');
	return {
		fixtureScope: 'DEMO_ONLY', caseId: fixture.caseId, sceneId, eventId, sceneRevision: scene.sceneRevision,
		coordinateSpaceId: scene.coordinateSpaceId, timeInterval: [event.start, event.end], sceneClassification: scene.hypothesisStatus,
		evidenceIds: evidence.map((item) => item.evidenceId), readOnly: true,
		actors: people.filter((person) => person.personId.startsWith('POI-')).map((person, index) => ({
			id: `${fixture.caseId}:${sceneId}:${eventId}:actor:${person.personId}`,
			personId: person.personId, characterAssetId: person.characterAsset.id, portraitAssetPath: person.portraitAsset.path,
			representation, positionXYZ: [anchor.xyz[0] + (index - 1.5) * 0.55, anchor.xyz[1], anchor.xyz[2]],
			placementType: 'ILLUSTRATIVE_BLOCKOUT_NOT_OBSERVED', faceAssetClassification: 'synthetic_illustration'
		}))
	};
}

export function validateAnimationSaveBinding(fixture: EastQuayCaseFixture, input: { caseId: string; sceneId: string; sceneRevision: string; eventId: string; evidenceId: string; evidenceSha256: string; start: string; end: string }): { fixtureScope: 'DEMO_ONLY'; caseId: string; sceneId: string; eventId: string; evidenceId: string; evidenceSha256: string; sceneRevision: string; interval: [string, string]; provenance: 'synthetic_illustrative_animation' } {
	if (input.caseId !== fixture.caseId) throw new Error('EAST_QUAY_CASE_SCOPE_MISMATCH');
	if (!eventBindingAllowed(fixture, { eventId: input.eventId, sceneId: input.sceneId, evidenceId: input.evidenceId, revision: input.sceneRevision })) throw new Error('EAST_QUAY_EVENT_EVIDENCE_REVISION_MISMATCH');
	const exhibit = fixture.evidence.find((item) => item.evidenceId === input.evidenceId)!;
	if (input.evidenceSha256 !== exhibit.sha256) throw new Error('EAST_QUAY_SOURCE_HASH_MISMATCH');
	const event = fixture.events.find((item) => item.eventId === input.eventId)!;
	const start = Date.parse(input.start), end = Date.parse(input.end);
	if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end < Date.parse(event.start) || start > Date.parse(event.end)) throw new Error('EAST_QUAY_ANIMATION_INTERVAL_INVALID');
	return { fixtureScope: 'DEMO_ONLY', caseId: input.caseId, sceneId: input.sceneId, eventId: input.eventId, evidenceId: input.evidenceId, evidenceSha256: input.evidenceSha256, sceneRevision: input.sceneRevision, interval: [input.start, input.end], provenance: 'synthetic_illustrative_animation' };
}
