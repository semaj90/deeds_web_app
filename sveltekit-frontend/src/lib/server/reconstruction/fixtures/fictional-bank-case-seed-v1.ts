import { z } from 'zod';
import { SceneIntentSchema, SceneIntentCitationV1 } from '../crime-scene-schema.js';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const uuid = z.uuid();

export const fictionalBankEvidenceV1Schema = z.object({
	evidenceId: uuid,
	sourceRevision: digest,
	kind: z.enum(['VIDEO', 'DISPATCH_LOG', 'INTERVIEW_TRANSCRIPT', 'WITNESS_TRANSCRIPT']),
	label: z.string().min(1).max(160),
	clockDomain: z.string().min(1).max(100),
	timeBasis: z.enum(['MEDIA_RELATIVE', 'RECORDED_WALL_CLOCK']),
	clockUncertaintyMs: z.number().int().nonnegative(),
	transcriptSegments: z.array(z.object({
		segmentId: z.string().min(1).max(120),
		startMs: z.number().int().nonnegative(),
		endMs: z.number().int().nonnegative(),
		speakerId: z.string().min(1).max(80),
		text: z.string().min(1).max(1_000),
		claimStatus: z.literal('UNVERIFIED_STATEMENT'),
	}).strict().refine((segment) => segment.endMs >= segment.startMs)).max(100).default([]),
}).strict();

export const fictionalBankParticipantV1Schema = z.object({
	participantId: z.string().min(1).max(80),
	registryKind: z.enum(['PERSON_OF_INTEREST', 'DETAINED_PERSON']),
	displayLabel: z.string().min(1).max(120),
	identityStatus: z.literal('UNIDENTIFIED'),
	identityLinks: z.array(z.string().min(1).max(80)).max(8),
	visualDescriptionStatus: z.enum(['NOT_RECORDED', 'WITNESS_DESCRIPTION_ONLY', 'UNREVIEWED_VISUAL_PROPOSAL']),
	presentation: z.object({
		meshRegistryKey: z.literal('person-lowpoly-neutral-v1'),
		portrait: z.object({
			status: z.literal('SYNTHETIC_PLACEHOLDER'),
			attachment: z.literal('HEAD_REFERENCE_CARD'),
			assetKey: z.string().min(1).max(160),
			isEvidence: z.literal(false),
		}).strict(),
	}).strict(),
}).strict();

export const fictionalBankSceneV1Schema = z.object({
	sceneId: uuid,
	title: z.string().min(1).max(160),
	coordinateFrame: z.object({
		frameId: z.string().min(1).max(100),
		kind: z.literal('LOCAL_UNCALIBRATED'),
		units: z.literal('UNITLESS_LOCAL'),
		geodeticCoordinates: z.null(),
	}).strict(),
	evidenceIds: z.array(uuid).min(1).max(12),
	intent: SceneIntentSchema,
}).strict().superRefine((scene, context) => {
	if (scene.intent.scene_id !== scene.sceneId) {
		context.addIssue({ code: 'custom', message: 'SceneIntent ID must match its parent scene', path: ['intent', 'scene_id'] });
	}
	const linked = new Set(scene.evidenceIds);
	for (const [index, citation] of scene.intent.events.flatMap((event) => event.citations).entries()) {
		if (!linked.has(citation.evidence_id)) {
			context.addIssue({ code: 'custom', message: 'Every event citation must name evidence linked to this scene', path: ['intent', 'events', index, 'citations'] });
		}
	}
});

export const fictionalBankCaseSeedV1Schema = z.object({
	schema: z.literal('atlas.fictional-bank-case-seed.v1'),
	provenanceClass: z.literal('SYNTHETIC_FIXTURE'),
	admissionMode: z.literal('DEMO_ONLY'),
	fictional: z.literal(true),
	caseId: uuid,
	title: z.string().min(1).max(160),
	jurisdiction: z.string().min(1).max(160),
	location: z.object({
		city: z.string().min(1).max(120),
		area: z.string().min(1).max(120),
		coordinateSystem: z.literal('FICTIONAL_LOCAL_GRID'),
		coordinateLabel: z.string().min(1).max(80),
	}).strict(),
	disclaimer: z.literal('Synthetic training fixture. No real people, case, address, or evidence.'),
	unknowns: z.array(z.string().min(1).max(300)).min(1).max(30),
	evidence: z.array(fictionalBankEvidenceV1Schema).min(1).max(32),
	participants: z.array(fictionalBankParticipantV1Schema).min(1).max(24),
	scenes: z.array(fictionalBankSceneV1Schema).min(1).max(16),
}).strict().superRefine((seed, context) => {
	const evidenceIds = new Set(seed.evidence.map((item) => item.evidenceId));
	if (evidenceIds.size !== seed.evidence.length) context.addIssue({ code: 'custom', message: 'Evidence IDs must be unique', path: ['evidence'] });
	const participantIds = new Set(seed.participants.map((item) => item.participantId));
	if (participantIds.size !== seed.participants.length) context.addIssue({ code: 'custom', message: 'Participant IDs must be unique', path: ['participants'] });
	const sceneIds = new Set(seed.scenes.map((item) => item.sceneId));
	if (sceneIds.size !== seed.scenes.length) context.addIssue({ code: 'custom', message: 'Scene IDs must be unique', path: ['scenes'] });
	for (const [index, scene] of seed.scenes.entries()) {
		for (const evidenceId of scene.evidenceIds) {
			if (!evidenceIds.has(evidenceId)) context.addIssue({ code: 'custom', message: 'Scene evidence reference is not in this case seed', path: ['scenes', index, 'evidenceIds'] });
		}
		const sceneParticipants = new Set(scene.intent.actors.map((actor) => actor.actor_id));
		for (const event of scene.intent.events) {
			for (const actor of event.who) {
				if (!sceneParticipants.has(actor.actor_id) || !participantIds.has(actor.actor_id)) {
					context.addIssue({ code: 'custom', message: 'Event actor must resolve to this case registry without asserting identity', path: ['scenes', index, 'intent', 'events'] });
				}
			}
			if (event.kind !== 'fixture') context.addIssue({ code: 'custom', message: 'Synthetic case events must retain fixture status', path: ['scenes', index, 'intent', 'events'] });
		}
	}
	for (const [index, participant] of seed.participants.entries()) {
		if (participant.identityLinks.length) {
			context.addIssue({ code: 'custom', message: 'Fictional starter seed must not assert cross-scene identities', path: ['participants', index, 'identityLinks'] });
		}
		for (const linkedId of participant.identityLinks) {
			if (!participantIds.has(linkedId) || linkedId === participant.participantId) {
				context.addIssue({ code: 'custom', message: 'Identity links must point to another registered participant', path: ['participants', index, 'identityLinks'] });
			}
		}
	}
});

const revision = (hex: string) => `sha256:${hex.repeat(64)}`;
const evidence = {
	street: '10000000-0000-4000-8000-000000000001',
	lobby: '10000000-0000-4000-8000-000000000002',
	rear: '10000000-0000-4000-8000-000000000003',
	dispatch: '10000000-0000-4000-8000-000000000004',
	bodycam: '10000000-0000-4000-8000-000000000005',
	interviewOne: '10000000-0000-4000-8000-000000000006',
	interviewTwo: '10000000-0000-4000-8000-000000000007',
	witness: '10000000-0000-4000-8000-000000000008',
} as const;
const participants = [
	{ participantId: 'POI-01', registryKind: 'PERSON_OF_INTEREST', displayLabel: 'Unidentified person A', identityStatus: 'UNIDENTIFIED', identityLinks: [], visualDescriptionStatus: 'WITNESS_DESCRIPTION_ONLY', presentation: { meshRegistryKey: 'person-lowpoly-neutral-v1', portrait: { status: 'SYNTHETIC_PLACEHOLDER', attachment: 'HEAD_REFERENCE_CARD', assetKey: 'synthetic-head-a-v1', isEvidence: false } } },
	{ participantId: 'POI-02', registryKind: 'PERSON_OF_INTEREST', displayLabel: 'Unidentified person B', identityStatus: 'UNIDENTIFIED', identityLinks: [], visualDescriptionStatus: 'UNREVIEWED_VISUAL_PROPOSAL', presentation: { meshRegistryKey: 'person-lowpoly-neutral-v1', portrait: { status: 'SYNTHETIC_PLACEHOLDER', attachment: 'HEAD_REFERENCE_CARD', assetKey: 'synthetic-head-b-v1', isEvidence: false } } },
	{ participantId: 'POI-03', registryKind: 'PERSON_OF_INTEREST', displayLabel: 'Unidentified person C', identityStatus: 'UNIDENTIFIED', identityLinks: [], visualDescriptionStatus: 'NOT_RECORDED', presentation: { meshRegistryKey: 'person-lowpoly-neutral-v1', portrait: { status: 'SYNTHETIC_PLACEHOLDER', attachment: 'HEAD_REFERENCE_CARD', assetKey: 'synthetic-head-c-v1', isEvidence: false } } },
	{ participantId: 'POI-04', registryKind: 'PERSON_OF_INTEREST', displayLabel: 'Unidentified person D', identityStatus: 'UNIDENTIFIED', identityLinks: [], visualDescriptionStatus: 'WITNESS_DESCRIPTION_ONLY', presentation: { meshRegistryKey: 'person-lowpoly-neutral-v1', portrait: { status: 'SYNTHETIC_PLACEHOLDER', attachment: 'HEAD_REFERENCE_CARD', assetKey: 'synthetic-head-d-v1', isEvidence: false } } },
	{ participantId: 'DET-01', registryKind: 'DETAINED_PERSON', displayLabel: 'Detained person A', identityStatus: 'UNIDENTIFIED', identityLinks: [], visualDescriptionStatus: 'NOT_RECORDED', presentation: { meshRegistryKey: 'person-lowpoly-neutral-v1', portrait: { status: 'SYNTHETIC_PLACEHOLDER', attachment: 'HEAD_REFERENCE_CARD', assetKey: 'synthetic-head-det-a-v1', isEvidence: false } } },
	{ participantId: 'DET-02', registryKind: 'DETAINED_PERSON', displayLabel: 'Detained person B', identityStatus: 'UNIDENTIFIED', identityLinks: [], visualDescriptionStatus: 'NOT_RECORDED', presentation: { meshRegistryKey: 'person-lowpoly-neutral-v1', portrait: { status: 'SYNTHETIC_PLACEHOLDER', attachment: 'HEAD_REFERENCE_CARD', assetKey: 'synthetic-head-det-b-v1', isEvidence: false } } },
] as const;

const source = (evidenceId: string, sourceRevision: string) => ({ evidence_id: evidenceId, source_revision: sourceRevision });
const imageCitation = (evidenceId: string, digestHex: string, observationId: string, frameTimestampS: number) => ({
	source: 'image_observation' as const, evidence_id: evidenceId, source_revision: revision(digestHex),
	analysis_revision: 'fictional-fixture-analysis-v1', observation_revision: revision('f'),
	observation_id: observationId, observation_kind: 'detection' as const, frame_timestamp_s: frameTimestampS, confidence: 0.5,
});
const event = (input: {
	id: string; timeS: number; durationS?: number; who: string[]; what: string; how: string; action: 'walk' | 'idle' | 'run' | 'gesture';
	citations: z.infer<typeof SceneIntentCitationV1>[]; evidenceIds: string[]; disputed?: boolean;
}) => ({ id: input.id, time_s: input.timeS, duration_s: input.durationS ?? 2, location: 'Fictional local scene; not GPS',
	who: input.who.map((actor_id) => ({ actor_id, role: 'unknown' as const, label: actor_id })), what: input.what,
	why_hypothesis: 'Motive unknown; no supported inference in this fixture.', how: input.how, action: input.action,
	path: [], evidence_ids: input.evidenceIds, confidence: 'low' as const, disputed: input.disputed ?? true,
	annotations: [], kind: 'fixture' as const, citations: input.citations });
const actorRows = participants.map((participant) => ({ actor_id: participant.participantId, role: 'unknown' as const, label: participant.displayLabel }));
function scene(input: {
	sceneId: string; title: string; location: string; frameId: string; evidenceIds: string[];
	events: ReturnType<typeof event>[]; city?: string;
}) {
	return {
		sceneId: input.sceneId, title: input.title,
		coordinateFrame: { frameId: input.frameId, kind: 'LOCAL_UNCALIBRATED' as const, units: 'UNITLESS_LOCAL' as const, geodeticCoordinates: null },
		evidenceIds: input.evidenceIds,
		intent: {
			scene_id: input.sceneId, case_id: '00000000-0000-4000-8000-000000000001', title: input.title, duration_s: 20, aesthetic: 'n64' as const,
			environment: { city: input.city ?? 'Morrow Bay (fictional)', location: input.location, time_of_day: 'morning' as const, notes: 'Synthetic demonstration; separate source clocks and coordinates.' },
			actors: actorRows, events: input.events,
			evidence_links: input.evidenceIds.map((evidenceId) => ({ evidence_id: evidenceId, status: 'cited' as const })),
			disclaimer: 'Synthetic training fixture — demonstrative hypothesis, not original evidence.',
		},
	};
}

const rawFictionalBankCaseSeedV1 = {
	schema: 'atlas.fictional-bank-case-seed.v1', provenanceClass: 'SYNTHETIC_FIXTURE', admissionMode: 'DEMO_ONLY', fictional: true,
	caseId: '00000000-0000-4000-8000-000000000001', title: 'Fictional State v. North Quay Participants',
	jurisdiction: 'Morrow Bay (fictional jurisdiction)',
	location: { city: 'Morrow Bay', area: 'North Quay', coordinateSystem: 'FICTIONAL_LOCAL_GRID', coordinateLabel: 'NQ-01 (not geodetic)' },
	disclaimer: 'Synthetic training fixture. No real people, case, address, or evidence.',
	unknowns: [
		'Whether any detained person is one of the four people described by witnesses.',
		'Whether the object described as a weapon is identifiable from any source.',
		'Whether the camera, alarm, dispatch, and interview clocks can be aligned.',
		'Motive, identity, intent, and legal responsibility are not established by this fixture.',
	],
	evidence: [
		{ evidenceId: evidence.street, sourceRevision: revision('1'), kind: 'VIDEO', label: 'Street camera NQ-04', clockDomain: 'CAM-NQ-04', timeBasis: 'MEDIA_RELATIVE', clockUncertaintyMs: 1200 },
		{ evidenceId: evidence.lobby, sourceRevision: revision('2'), kind: 'VIDEO', label: 'Bank lobby camera', clockDomain: 'BANK-CAM-LOBBY-01', timeBasis: 'RECORDED_WALL_CLOCK', clockUncertaintyMs: 700 },
		{ evidenceId: evidence.rear, sourceRevision: revision('3'), kind: 'VIDEO', label: 'Bank rear corridor camera', clockDomain: 'BANK-CAM-REAR-02', timeBasis: 'RECORDED_WALL_CLOCK', clockUncertaintyMs: 900 },
		{ evidenceId: evidence.dispatch, sourceRevision: revision('4'), kind: 'DISPATCH_LOG', label: 'Dispatch CAD log', clockDomain: 'CAD-SYSTEM', timeBasis: 'RECORDED_WALL_CLOCK', clockUncertaintyMs: 500 },
		{ evidenceId: evidence.bodycam, sourceRevision: revision('5'), kind: 'VIDEO', label: 'Body camera pair', clockDomain: 'BODYCAM-PAIR', timeBasis: 'MEDIA_RELATIVE', clockUncertaintyMs: 1500 },
		{ evidenceId: evidence.interviewOne, sourceRevision: revision('6'), kind: 'INTERVIEW_TRANSCRIPT', label: 'Interview transcript A', clockDomain: 'INTERVIEW-ROOM-A', timeBasis: 'MEDIA_RELATIVE', clockUncertaintyMs: 250,
			transcriptSegments: [
				{ segmentId: 'INT-A-001', startMs: 0, endMs: 4_200, speakerId: 'DET-01', text: 'I was outside the branch. I did not go into the lobby.', claimStatus: 'UNVERIFIED_STATEMENT' },
				{ segmentId: 'INT-A-002', startMs: 5_100, endMs: 9_800, speakerId: 'DET-01', text: 'I heard an alarm after I reached North Quay.', claimStatus: 'UNVERIFIED_STATEMENT' },
			] },
		{ evidenceId: evidence.interviewTwo, sourceRevision: revision('7'), kind: 'INTERVIEW_TRANSCRIPT', label: 'Interview transcript B', clockDomain: 'INTERVIEW-ROOM-B', timeBasis: 'MEDIA_RELATIVE', clockUncertaintyMs: 300,
			transcriptSegments: [
				{ segmentId: 'INT-B-001', startMs: 0, endMs: 3_700, speakerId: 'DET-02', text: 'I entered the bank, but I did not go toward the rear corridor.', claimStatus: 'UNVERIFIED_STATEMENT' },
				{ segmentId: 'INT-B-002', startMs: 4_000, endMs: 8_900, speakerId: 'DET-02', text: 'I cannot identify the other people from the camera stills.', claimStatus: 'UNVERIFIED_STATEMENT' },
			] },
		{ evidenceId: evidence.witness, sourceRevision: revision('8'), kind: 'WITNESS_TRANSCRIPT', label: 'Customer witness statement', clockDomain: 'WITNESS-RECORDER-01', timeBasis: 'MEDIA_RELATIVE', clockUncertaintyMs: 400,
			transcriptSegments: [
				{ segmentId: 'WIT-001', startMs: 0, endMs: 6_400, speakerId: 'WIT-01', text: 'I recall four people entering. I thought three were men and one was a woman.', claimStatus: 'UNVERIFIED_STATEMENT' },
				{ segmentId: 'WIT-002', startMs: 7_000, endMs: 11_500, speakerId: 'WIT-01', text: 'I heard a demand for money, but I could not see who spoke.', claimStatus: 'UNVERIFIED_STATEMENT' },
			] },
	],
	participants,
	scenes: [
		scene({ sceneId: '20000000-0000-4000-8000-000000000001', title: 'Exterior approach', location: 'North Quay branch exterior', frameId: 'FRAME-EXT-01', evidenceIds: [evidence.street, evidence.witness], events: [
			event({ id: 'EXT-01', timeS: 3.2, who: ['POI-01', 'POI-02', 'POI-03', 'POI-04'], what: 'Four people are described as approaching the branch.', how: 'A synthetic camera observation and a witness statement are retained as distinct citations.', action: 'walk', evidenceIds: [evidence.street, evidence.witness], citations: [imageCitation(evidence.street, '1', 'FIXTURE-EXT-OBS-01', 3.2)] }),
		] }),
		scene({ sceneId: '20000000-0000-4000-8000-000000000002', title: 'Lobby and teller area', location: 'North Quay branch lobby', frameId: 'FRAME-LOBBY-01', evidenceIds: [evidence.lobby, evidence.witness], events: [
			event({ id: 'LOB-01', timeS: 8.4, who: ['POI-01'], what: 'One person is proposed to approach the teller area.', how: 'The depiction is a low-confidence synthetic frame observation; witness wording is separately available in transcript spans.', action: 'walk', evidenceIds: [evidence.lobby], citations: [imageCitation(evidence.lobby, '2', 'FIXTURE-LOB-OBS-01', 8.4)] }),
			event({ id: 'LOB-02', timeS: 11.6, who: ['POI-01', 'POI-02'], what: 'A demand for money is alleged in a witness statement.', how: 'The statement does not identify the speaker; no actor-to-voice link is asserted.', action: 'gesture', evidenceIds: [evidence.witness], citations: [{ source: 'transcript_segment', evidence_id: evidence.witness, source_revision: revision('8'), start_ms: 7_000, end_ms: 11_500 }] }),
		] }),
		scene({ sceneId: '20000000-0000-4000-8000-000000000003', title: 'Rear corridor and alarm', location: 'North Quay branch rear corridor', frameId: 'FRAME-REAR-01', evidenceIds: [evidence.rear, evidence.dispatch], events: [
			event({ id: 'REAR-01', timeS: 12.1, who: ['POI-02'], what: 'Movement toward the rear corridor is a scene hypothesis.', how: 'Separate the visual proposal from any inference that people were forced or confined.', action: 'walk', evidenceIds: [evidence.rear], citations: [imageCitation(evidence.rear, '3', 'FIXTURE-REAR-OBS-01', 12.1)] }),
			event({ id: 'REAR-02', timeS: 15.2, who: ['POI-01', 'POI-02', 'POI-03', 'POI-04'], what: 'An alarm activation is recorded in a different system clock.', how: 'The fixture preserves the alarm and camera timelines separately pending a reviewed clock transform.', action: 'idle', evidenceIds: [evidence.dispatch], citations: [{ source: 'timeline_event', evidence_id: evidence.dispatch, source_revision: revision('4'), event_ref: 'CAD-FIXTURE-ALARM-01' }] }),
		] }),
		scene({ sceneId: '20000000-0000-4000-8000-000000000004', title: 'Public exit and underpass detentions', location: 'North Quay exit / fictional ferry underpass', frameId: 'FRAME-EXIT-01', evidenceIds: [evidence.lobby, evidence.bodycam, evidence.dispatch], events: [
			event({ id: 'EXIT-01', timeS: 17.6, who: ['POI-01', 'POI-02', 'POI-03', 'POI-04'], what: 'Several people are proposed to leave the branch.', how: 'The fixture does not assert which people from the approach view are the same individuals.', action: 'walk', evidenceIds: [evidence.lobby], citations: [imageCitation(evidence.lobby, '2', 'FIXTURE-LOB-OBS-02', 17.6)] }),
			event({ id: 'DET-01', timeS: 18.2, who: ['DET-01', 'DET-02'], what: 'Two separate people are recorded as detained near the underpass.', how: 'Detention does not establish that either person is among POI-01 through POI-04.', action: 'idle', evidenceIds: [evidence.bodycam, evidence.dispatch], citations: [{ source: 'timeline_event', evidence_id: evidence.dispatch, source_revision: revision('4'), event_ref: 'CAD-FIXTURE-DETENTION-01' }] }),
		] }),
		scene({ sceneId: '20000000-0000-4000-8000-000000000005', title: 'Interview A', location: 'Interview room A', frameId: 'FRAME-INTERVIEW-A', evidenceIds: [evidence.interviewOne], events: [
			event({ id: 'INT-A-E01', timeS: 0.5, who: ['DET-01'], what: 'The interviewee says they remained outside the branch.', how: 'This is an attributed, unverified transcript claim.', action: 'idle', evidenceIds: [evidence.interviewOne], citations: [{ source: 'transcript_segment', evidence_id: evidence.interviewOne, source_revision: revision('6'), start_ms: 0, end_ms: 4_200 }] }),
		] }),
		scene({ sceneId: '20000000-0000-4000-8000-000000000006', title: 'Interview B', location: 'Interview room B', frameId: 'FRAME-INTERVIEW-B', evidenceIds: [evidence.interviewTwo], events: [
			event({ id: 'INT-B-E01', timeS: 0.5, who: ['DET-02'], what: 'The interviewee says they entered the bank but did not go toward the rear corridor.', how: 'This is an attributed, unverified transcript claim.', action: 'idle', evidenceIds: [evidence.interviewTwo], citations: [{ source: 'transcript_segment', evidence_id: evidence.interviewTwo, source_revision: revision('7'), start_ms: 0, end_ms: 3_700 }] }),
		] }),
	],
};

export const fictionalBankCaseSeedV1 = fictionalBankCaseSeedV1Schema.parse(rawFictionalBankCaseSeedV1);
