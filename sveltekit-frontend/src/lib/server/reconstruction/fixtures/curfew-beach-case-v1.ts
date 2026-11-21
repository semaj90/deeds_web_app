import { z } from 'zod';

const sourceSchema = z.object({
	sourceId: z.string().regex(/^SRC-[A-Z0-9-]{1,40}$/),
	clockId: z.string().regex(/^CLK-[A-Z0-9-]{1,40}$/),
	kind: z.enum(['witness-report', 'body-camera', 'interview']),
	description: z.string().min(1).max(300),
	timeBasis: z.enum(['source-local-wall-clock', 'media-elapsed']),
	synthetic: z.literal(true)
}).strict();

const actorSchema = z.object({
	actorId: z.string().regex(/^POI-[0-9]{2}$/),
	label: z.string().min(1).max(80),
	appearanceStatus: z.literal('unidentified'),
	identityLinks: z.array(z.never()).max(0),
	positionMeters: z.tuple([z.number().finite().min(-50).max(50), z.number().finite().min(0).max(10), z.number().finite().min(-50).max(50)])
}).strict();

const eventSchema = z.object({
	eventId: z.string().regex(/^EVT-[A-Z0-9-]{1,48}$/),
	sourceId: z.string().regex(/^SRC-[A-Z0-9-]{1,40}$/),
	clockId: z.string().regex(/^CLK-[A-Z0-9-]{1,40}$/),
	startMs: z.number().int().nonnegative().max(172_800_000),
	endMs: z.number().int().positive().max(172_800_000),
	uncertaintyMs: z.number().int().nonnegative().max(86_400_000),
	claimType: z.enum(['reported-presence', 'reported-bonfire', 'possible-alcohol-use', 'response', 'interview-claim']),
	statement: z.string().min(1).max(500),
	status: z.enum(['reported', 'disputed', 'unknown']),
	reviewStatus: z.literal('unreviewed'),
	actorIds: z.array(z.string().regex(/^POI-[0-9]{2}$/)).max(16),
	targetRefs: z.array(z.object({ kind: z.enum(['actor', 'primitive']), targetId: z.string().min(1).max(80) }).strict()).max(32)
}).strict().refine((event) => event.endMs > event.startMs, 'Event interval must be positive');

export const CurfewBeachCaseFixtureV1Schema = z.object({
	schema: z.literal('parent-atlas.synthetic-curfew-beach/v1'),
	fixtureScope: z.literal('SYNTHETIC_FIXTURE'),
	case: z.object({
		caseId: z.literal('DEMO-CURFEW-BEACH-01'),
		title: z.literal('Morrow Bay Curfew and Beach Reports'),
		jurisdiction: z.literal('Fictional Morrow Bay'),
		coordinateStatus: z.literal('illustrative_uncalibrated'),
		originMeters: z.tuple([z.literal(0), z.literal(0), z.literal(0)])
	}).strict(),
	curfewContext: z.object({
		localStartMs: z.literal(79_200_000),
		timeBasis: z.literal('scenario-provided-local-time'),
		status: z.literal('unverified-context'),
		text: z.string().min(1).max(300)
	}).strict(),
	sources: z.array(sourceSchema).min(1).max(32),
	actors: z.array(actorSchema).min(1).max(16),
	props: z.array(z.object({ targetId: z.string().regex(/^PROP-[A-Z0-9-]{1,40}$/), kind: z.literal('bonfire'), illustrative: z.literal(true) }).strict()).max(16),
	events: z.array(eventSchema).min(1).max(100),
	why: z.object({ status: z.literal('unknown'), text: z.null() }).strict(),
	how: z.object({ status: z.literal('unresolved'), text: z.null() }).strict(),
	provenance: z.object({ evidenceBytesPresent: z.literal(false), databaseWritesAllowed: z.literal(false), visualIdentityLinksAllowed: z.literal(false) }).strict()
}).strict().superRefine((fixture, ctx) => {
	const sourceMap = new Map(fixture.sources.map((source) => [source.sourceId, source]));
	if (sourceMap.size !== fixture.sources.length) ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Source IDs must be unique' });
	if (new Set(fixture.sources.map((source) => source.clockId)).size !== fixture.sources.length) {
		ctx.addIssue({ code: 'custom', path: ['sources'], message: 'This fixture requires a distinct source clock for each independent recording/report' });
	}
	const actorIds = new Set(fixture.actors.map((actor) => actor.actorId));
	if (actorIds.size !== fixture.actors.length) ctx.addIssue({ code: 'custom', path: ['actors'], message: 'POI handles must be unique' });
	const eventIds = new Set<string>();
	for (const [index, event] of fixture.events.entries()) {
		if (eventIds.has(event.eventId)) ctx.addIssue({ code: 'custom', path: ['events', index, 'eventId'], message: 'Event IDs must be unique' });
		eventIds.add(event.eventId);
		const source = sourceMap.get(event.sourceId);
		if (!source || source.clockId !== event.clockId) ctx.addIssue({ code: 'custom', path: ['events', index, 'clockId'], message: 'Event must retain its source clock; no clock merging is permitted' });
		for (const actorId of event.actorIds) if (!actorIds.has(actorId)) ctx.addIssue({ code: 'custom', path: ['events', index, 'actorIds'], message: `Unknown POI handle ${actorId}` });
		for (const target of event.targetRefs) {
			if (target.kind === 'actor' && !actorIds.has(target.targetId)) ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: `Unknown actor target ${target.targetId}` });
			if (target.kind === 'primitive' && !fixture.props.some((prop) => prop.targetId === target.targetId)) ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: `Unknown prop target ${target.targetId}` });
		}
	}
	if (fixture.events.some((event) => event.claimType === 'possible-alcohol-use' && event.actorIds.length > 0)) {
		ctx.addIssue({ code: 'custom', path: ['events'], message: 'Possible alcohol-use reports cannot identify or age-match a POI by appearance' });
	}
});

export type CurfewBeachCaseFixtureV1 = z.infer<typeof CurfewBeachCaseFixtureV1Schema>;

/** Synthetic-only fixture: event summaries are reports, not admitted findings. */
export const CURFEW_BEACH_CASE_FIXTURE_V1: CurfewBeachCaseFixtureV1 = CurfewBeachCaseFixtureV1Schema.parse({
	schema: 'parent-atlas.synthetic-curfew-beach/v1',
	fixtureScope: 'SYNTHETIC_FIXTURE',
	case: {
		caseId: 'DEMO-CURFEW-BEACH-01', title: 'Morrow Bay Curfew and Beach Reports', jurisdiction: 'Fictional Morrow Bay',
		coordinateStatus: 'illustrative_uncalibrated', originMeters: [0, 0, 0]
	},
	curfewContext: {
		localStartMs: 79_200_000, timeBasis: 'scenario-provided-local-time', status: 'unverified-context',
		text: 'The scenario states that a local curfew begins at 22:00. The ordinance, date, exceptions, and applicability require independent verification.'
	},
	sources: [
		{ sourceId: 'SRC-WITNESS-A', clockId: 'CLK-WITNESS-A', kind: 'witness-report', description: 'Synthetic witness summary A; approximate times', timeBasis: 'source-local-wall-clock', synthetic: true },
		{ sourceId: 'SRC-WITNESS-B', clockId: 'CLK-WITNESS-B', kind: 'witness-report', description: 'Synthetic witness summary B; independent clock', timeBasis: 'source-local-wall-clock', synthetic: true },
		{ sourceId: 'SRC-WITNESS-C', clockId: 'CLK-WITNESS-C', kind: 'witness-report', description: 'Synthetic witness summary C; independent clock', timeBasis: 'source-local-wall-clock', synthetic: true },
		{ sourceId: 'SRC-BODYCAM-01', clockId: 'CLK-BODYCAM-01', kind: 'body-camera', description: 'Synthetic response footage summary', timeBasis: 'media-elapsed', synthetic: true },
		{ sourceId: 'SRC-INTERVIEW-A', clockId: 'CLK-INTERVIEW-A', kind: 'interview', description: 'Synthetic interview summary A', timeBasis: 'media-elapsed', synthetic: true }
	],
	actors: [
		{ actorId: 'POI-01', label: 'Unidentified attendee A', appearanceStatus: 'unidentified', identityLinks: [], positionMeters: [-2.5, 0, 0.5] },
		{ actorId: 'POI-02', label: 'Unidentified attendee B', appearanceStatus: 'unidentified', identityLinks: [], positionMeters: [-0.8, 0, 1.1] },
		{ actorId: 'POI-03', label: 'Unidentified attendee C', appearanceStatus: 'unidentified', identityLinks: [], positionMeters: [1.0, 0, 0.7] },
		{ actorId: 'POI-04', label: 'Unidentified attendee D', appearanceStatus: 'unidentified', identityLinks: [], positionMeters: [2.4, 0, 1.2] }
	],
	props: [{ targetId: 'PROP-BONFIRE-01', kind: 'bonfire', illustrative: true }],
	events: [
		{ eventId: 'EVT-WA-PRESENCE-AFTER-CURFEW', sourceId: 'SRC-WITNESS-A', clockId: 'CLK-WITNESS-A', startMs: 82_800_000, endMs: 93_600_000, uncertaintyMs: 900_000, claimType: 'reported-presence', statement: 'Witness A reports several unidentified people at the beach after the stated 22:00 curfew, approximately 23:00–02:00 on this source clock. This report does not identify any POI or establish a curfew violation.', status: 'reported', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [] },
		{ eventId: 'EVT-WA-BONFIRE', sourceId: 'SRC-WITNESS-A', clockId: 'CLK-WITNESS-A', startMs: 82_800_000, endMs: 93_600_000, uncertaintyMs: 900_000, claimType: 'reported-bonfire', statement: 'Witness A reports a bonfire from approximately 23:00 until 02:00 on this source clock.', status: 'reported', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [{ kind: 'primitive', targetId: 'PROP-BONFIRE-01' }] },
		{ eventId: 'EVT-WB-PRESENCE-AFTER-CURFEW', sourceId: 'SRC-WITNESS-B', clockId: 'CLK-WITNESS-B', startMs: 83_400_000, endMs: 92_700_000, uncertaintyMs: 1_200_000, claimType: 'reported-presence', statement: 'Witness B independently reports several unidentified people at the beach after the stated 22:00 curfew during an approximate overnight interval. This report does not identify any POI or establish a curfew violation.', status: 'reported', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [] },
		{ eventId: 'EVT-WB-BONFIRE', sourceId: 'SRC-WITNESS-B', clockId: 'CLK-WITNESS-B', startMs: 83_400_000, endMs: 92_700_000, uncertaintyMs: 1_200_000, claimType: 'reported-bonfire', statement: 'Witness B independently reports a bonfire during an approximate overnight interval.', status: 'reported', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [{ kind: 'primitive', targetId: 'PROP-BONFIRE-01' }] },
		{ eventId: 'EVT-WA-POSSIBLE-DRINKING', sourceId: 'SRC-WITNESS-A', clockId: 'CLK-WITNESS-A', startMs: 84_600_000, endMs: 88_200_000, uncertaintyMs: 1_800_000, claimType: 'possible-alcohol-use', statement: 'Witness A reports possible alcohol use and repeats an unverified age statement. The statement does not establish who drank or anyone’s age.', status: 'reported', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [] },
		{ eventId: 'EVT-WC-POSSIBLE-DRINKING', sourceId: 'SRC-WITNESS-C', clockId: 'CLK-WITNESS-C', startMs: 83_700_000, endMs: 90_000_000, uncertaintyMs: 2_400_000, claimType: 'possible-alcohol-use', statement: 'Witness C reports seeing containers and speculates that some attendees may have been underage; neither drinking nor age is established.', status: 'reported', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [] },
		{ eventId: 'EVT-BODYCAM-ARRIVAL', sourceId: 'SRC-BODYCAM-01', clockId: 'CLK-BODYCAM-01', startMs: 0, endMs: 30_000, uncertaintyMs: 0, claimType: 'response', statement: 'Illustrative response clip begins; media elapsed time is local to this recording.', status: 'unknown', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [] },
		{ eventId: 'EVT-INTERVIEW-A-CLAIM', sourceId: 'SRC-INTERVIEW-A', clockId: 'CLK-INTERVIEW-A', startMs: 0, endMs: 20_000, uncertaintyMs: 0, claimType: 'interview-claim', statement: 'Synthetic interview account; transcript claim remains unreviewed and must be compared with source material.', status: 'unknown', reviewStatus: 'unreviewed', actorIds: [], targetRefs: [] }
	],
	why: { status: 'unknown', text: null },
	how: { status: 'unresolved', text: null },
	provenance: { evidenceBytesPresent: false, databaseWritesAllowed: false, visualIdentityLinksAllowed: false }
});
