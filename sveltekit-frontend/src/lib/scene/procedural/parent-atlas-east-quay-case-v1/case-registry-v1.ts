import { z } from 'zod';

const id = z.string().min(1).max(160);
const isoDate = z.string().datetime({ offset: true });
const personSchema = z.object({
	personId: id,
	displayName: z.string().min(1),
	fictional: z.literal(true),
	caseRole: z.string(),
	portraitAsset: z.object({
		path: z.string().regex(/^portraits\/[a-z0-9-]+\.svg$/),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
		classification: z.literal('synthetic_illustration'),
		mediaType: z.literal('image/svg+xml'),
		originalSourceEvidenceId: z.null()
	}),
	characterAsset: z.object({
		id,
		headMeshPart: id,
		headAnchor: id,
		textureBinding: z.object({ portraitAssetPath: z.string(), evidentiaryIdentification: z.literal(false) }),
		preset: z.object({ body: z.string(), outfit: z.string(), hair: z.string() })
	})
}).passthrough();

const sceneSchema = z.object({
	sceneId: id, label: z.string(), coordinateSpaceId: id, anchorId: id,
	start: isoDate, end: isoDate, participantIds: z.array(id), sceneRevision: id, hypothesisStatus: z.string()
}).passthrough();
const eventSchema = z.object({
	eventId: id, title: z.string(), start: isoDate, end: isoDate, sceneIds: z.array(id),
	personIds: z.array(id), evidenceIds: z.array(id), anchorId: id, claimStatus: z.string(), reviewState: z.string()
}).passthrough();
const evidenceSchema = z.object({
	evidenceId: id, title: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
	caseScoped: z.literal(true), requiresAuthorization: z.literal(true),
	classification: z.literal('SYNTHETIC_FIXTURE'), mediaPresent: z.literal(false), observationOnly: z.literal(true),
	sourceTimeCoverage: z.object({ start: isoDate, end: isoDate })
}).passthrough();
const locationSchema = z.object({ id, sceneId: id, xyz: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }).passthrough();

export const eastQuayCaseFixtureV1Schema = z.object({
	schemaVersion: z.literal('parent-atlas-case-fixture/v1'), caseId: z.literal('PA-DEMO-ROBBERY-001'),
	title: z.string(), classification: z.literal('SYNTHETIC_TRAINING_NOT_EVIDENCE'), isRealCase: z.literal(false), disclaimer: z.string(),
	location: z.object({ geoCoordinates: z.null(), coordinateSpaces: z.array(z.object({ id }).passthrough()) }).passthrough(),
	people: z.array(personSchema).min(1), locations: z.array(locationSchema).min(1), scenes: z.array(sceneSchema).min(8),
	events: z.array(eventSchema).min(1), evidence: z.array(evidenceSchema).min(1),
	transcripts: z.array(z.object({ transcriptId: id, evidenceId: id, personId: id }).passthrough()),
	characterTracks: z.array(z.object({ personId: id, notSourceDerived3D: z.literal(true), keyframes: z.array(z.object({ eventId: id, anchorId: id, pathStatus: z.literal('ILLUSTRATIVE_NOT_OBSERVED') }).passthrough()) }).passthrough())
}).passthrough();

export type EastQuayCaseFixture = z.infer<typeof eastQuayCaseFixtureV1Schema>;
export type EastQuayPerson = EastQuayCaseFixture['people'][number];
export type EastQuayScene = EastQuayCaseFixture['scenes'][number];
export type EastQuayEvent = EastQuayCaseFixture['events'][number];
export type EastQuayEvidence = EastQuayCaseFixture['evidence'][number];
export type EastQuayLocation = EastQuayCaseFixture['locations'][number];

export interface EastQuayFixtureValidation { ok: boolean; errors: string[]; counts: Record<string, number> }

export function validateCaseFixture(value: unknown): EastQuayFixtureValidation {
	const parsed = eastQuayCaseFixtureV1Schema.safeParse(value);
	if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`), counts: {} };
	const fixture = parsed.data;
	const errors: string[] = [];
	const unique = <T extends { [key: string]: unknown }>(items: T[], key: keyof T, name: string) => {
		const values = items.map((item) => item[key]);
		if (new Set(values).size !== values.length) errors.push(`${name}: duplicate ${String(key)}`);
		return new Set(values);
	};
	const people = unique(fixture.people, 'personId', 'people');
	const scenes = unique(fixture.scenes, 'sceneId', 'scenes');
	const events = unique(fixture.events, 'eventId', 'events');
	const evidence = unique(fixture.evidence, 'evidenceId', 'evidence');
	const locations = unique(fixture.locations, 'id', 'locations');
	const coordinateSpaces = new Set(fixture.location.coordinateSpaces.map((space) => space.id));
	for (const person of fixture.people) {
		if (person.characterAsset.textureBinding.portraitAssetPath !== person.portraitAsset.path) errors.push(`${person.personId}: portrait path mismatch`);
	}
	for (const scene of fixture.scenes) {
		if (Date.parse(scene.start) > Date.parse(scene.end)) errors.push(`${scene.sceneId}: invalid interval`);
		if (!coordinateSpaces.has(scene.coordinateSpaceId)) errors.push(`${scene.sceneId}: unknown coordinate space`);
		if (!locations.has(scene.anchorId)) errors.push(`${scene.sceneId}: unknown anchor`);
		for (const personId of scene.participantIds) if (!people.has(personId)) errors.push(`${scene.sceneId}: unknown person ${personId}`);
	}
	for (const event of fixture.events) {
		if (Date.parse(event.start) > Date.parse(event.end)) errors.push(`${event.eventId}: invalid interval`);
		for (const sceneId of event.sceneIds) {
			const scene = fixture.scenes.find((item) => item.sceneId === sceneId);
			if (!scene) errors.push(`${event.eventId}: unknown scene ${sceneId}`);
			else if (Date.parse(event.start) < Date.parse(scene.start) || Date.parse(event.end) > Date.parse(scene.end)) errors.push(`${event.eventId}: outside scene interval ${sceneId}`);
		}
		for (const personId of event.personIds) if (!people.has(personId)) errors.push(`${event.eventId}: unknown person ${personId}`);
		for (const evidenceId of event.evidenceIds) if (!evidence.has(evidenceId)) errors.push(`${event.eventId}: unknown evidence ${evidenceId}`);
		if (!locations.has(event.anchorId)) errors.push(`${event.eventId}: unknown anchor`);
	}
	for (const transcript of fixture.transcripts) if (!people.has(transcript.personId) || !evidence.has(transcript.evidenceId)) errors.push(`${transcript.transcriptId}: invalid reference`);
	for (const track of fixture.characterTracks) {
		if (!people.has(track.personId)) errors.push(`${track.personId}: unknown track person`);
		for (const frame of track.keyframes) if (!events.has(frame.eventId) || !locations.has(frame.anchorId)) errors.push(`${track.personId}: invalid keyframe reference`);
	}
	return { ok: errors.length === 0, errors, counts: { people: fixture.people.length, scenes: fixture.scenes.length, events: fixture.events.length, evidence: fixture.evidence.length, locations: fixture.locations.length, transcripts: fixture.transcripts.length } };
}

export function parseEastQuayCaseFixtureV1(value: unknown): EastQuayCaseFixture {
	const result = eastQuayCaseFixtureV1Schema.parse(value);
	const integrity = validateCaseFixture(result);
	if (!integrity.ok) throw new Error(`EAST_QUAY_FIXTURE_INVALID: ${integrity.errors.join('; ')}`);
	return result;
}

export function readScene(fixture: EastQuayCaseFixture, sceneId: string) {
	const scene = fixture.scenes.find((item) => item.sceneId === sceneId);
	if (!scene) throw new Error('EAST_QUAY_SCENE_NOT_FOUND');
	return { scene, events: fixture.events.filter((event) => event.sceneIds.includes(sceneId)), people: fixture.people.filter((person) => scene.participantIds.includes(person.personId)) };
}

export function readEvent(fixture: EastQuayCaseFixture, eventId: string) {
	const event = fixture.events.find((item) => item.eventId === eventId);
	if (!event) throw new Error('EAST_QUAY_EVENT_NOT_FOUND');
	return { event, people: fixture.people.filter((person) => event.personIds.includes(person.personId)), evidence: fixture.evidence.filter((item) => event.evidenceIds.includes(item.evidenceId)), locations: fixture.locations.filter((item) => item.id === event.anchorId), trackSamples: fixture.characterTracks.flatMap((track) => track.keyframes.filter((frame) => frame.eventId === eventId).map((frame) => ({ ...frame, personId: track.personId }))) };
}

export function eventBindingAllowed(fixture: EastQuayCaseFixture, input: { eventId: string; sceneId: string; evidenceId: string; revision: string }): boolean {
	const { event, scene, evidence } = { event: fixture.events.find((item) => item.eventId === input.eventId), scene: fixture.scenes.find((item) => item.sceneId === input.sceneId), evidence: fixture.evidence.find((item) => item.evidenceId === input.evidenceId) };
	if (!event || !scene || !evidence || !event.sceneIds.includes(scene.sceneId) || !event.evidenceIds.includes(evidence.evidenceId) || scene.sceneRevision !== input.revision) return false;
	return evidence.caseScoped && evidence.requiresAuthorization && Date.parse(event.start) <= Date.parse(scene.end) && Date.parse(event.end) >= Date.parse(scene.start) && Date.parse(event.start) <= Date.parse(evidence.sourceTimeCoverage.end) && Date.parse(event.end) >= Date.parse(evidence.sourceTimeCoverage.start);
}

export function decideSyntheticPortraitPresentationV1(person: EastQuayPerson, requestedMode: 'portrait_card' | 'uv_face' = 'portrait_card') {
	if (!person.fictional || person.portraitAsset.classification !== 'synthetic_illustration' || person.portraitAsset.originalSourceEvidenceId !== null || person.characterAsset.textureBinding.evidentiaryIdentification !== false) throw new Error('EAST_QUAY_PORTRAIT_NOT_SYNTHETIC');
	if (requestedMode !== 'portrait_card') throw new Error('EAST_QUAY_UV_FACE_DISABLED_FOR_FIXTURE');
	return { personId: person.personId, mode: 'portrait_card' as const, assetPath: person.portraitAsset.path, headAnchor: person.characterAsset.headAnchor, identityInferenceAllowed: false as const, fixtureScope: 'DEMO_ONLY' as const };
}

export function assertEastQuayFixtureReadOnlyV1(input: { fixture: unknown; caseId: string; sceneId: string; operation: 'READ' | 'WRITE' }): EastQuayCaseFixture {
	if (input.operation !== 'READ') throw new Error('DEMO_FIXTURE_WRITE_FORBIDDEN');
	const fixture = parseEastQuayCaseFixtureV1(input.fixture);
	if (fixture.caseId !== input.caseId || !fixture.scenes.some((scene) => scene.sceneId === input.sceneId)) throw new Error('DEMO_FIXTURE_SCOPE_MISMATCH');
	return fixture;
}
