import { describe, expect, it } from 'vitest';
import { buildCaseSceneFetchParametersV1 } from './case-scene-fetch-parameters-v1.js';
import { buildCaseSceneFetchRequestV1, CaseSceneFetchParametersInputV1Schema, CaseSceneIntakeContextV1Schema } from '$lib/reconstruction/case-scene-fetch-contract-v1.js';

const evidenceA = '11111111-1111-4111-8111-111111111111';
const evidenceB = '22222222-2222-4222-8222-222222222222';
const sceneId = '33333333-3333-4333-8333-333333333333';
const caseId = '44444444-4444-4444-8444-444444444444';
const valid = {
	sceneId,
	expectedRevision: 0,
	sourceEvidenceIds: [evidenceA, evidenceB],
	brief: {
		who: [{ actorId: 'ACTOR-01', label: 'Unidentified person 1', appearance: 'Dark jacket; source observation only', evidenceIds: [evidenceA] }],
		what: [{ eventId: 'EVENT-01', what: 'A person appears to enter the west entrance', status: 'hypothesis' as const, evidenceIds: [evidenceA], timeLanes: [{ evidenceId: evidenceA, clockId: 'CAM-A', startMs: 1000, endMs: 3000, uncertaintyMs: 250 }] }],
		why: { status: 'unknown', evidenceIds: [] },
		how: { status: 'unknown', evidenceIds: [] }
	},
	environment: { kind: 'urban', cellSizeMeters: 32, coordinateStatus: 'illustrative_uncalibrated' as const }
};

describe('case scene reconstruction fetch parameters v1', () => {
	it('builds deterministic parameters while retaining source-local timing and unknown motive', () => {
		const request = CaseSceneFetchParametersInputV1Schema.parse(valid);
		const caseIntake = CaseSceneIntakeContextV1Schema.parse({ schema: 'parent-atlas.case-scene-intake/v1', status: 'USER_INTAKE_UNVERIFIED', who: 'Four people described', what: 'Alleged robbery', when: 'Around 10 AM', where: 'North Quay', why: 'Unknown', how: 'Unclear' });
		const input = { caseId, request, caseIntake, verifiedEvidence: [{ id: evidenceA, hash: 'a'.repeat(64), hashAlgorithm: 'SHA256' }, { id: evidenceB, hash: null }] };
		const first = buildCaseSceneFetchParametersV1(input);
		const replay = buildCaseSceneFetchParametersV1(input);
		expect(first.requestHash).toBe(replay.requestHash);
		expect(first.brief.why).toEqual({ status: 'unknown', evidenceIds: [] });
		expect(first.caseIntake).toMatchObject({ status: 'USER_INTAKE_UNVERIFIED', why: 'Unknown' });
		expect(first.brief.what[0]?.timeLanes[0]).toMatchObject({ clockId: 'CAM-A', startMs: 1000, endMs: 3000, uncertaintyMs: 250 });
		expect(first.sourceEvidence[0]).toMatchObject({ evidenceId: evidenceA, sha256: 'a'.repeat(64), revisionVerified: false });
		expect(first.interpretation.clocks).toBe('source_local_unaligned');
	});

	it('requires evidence references for a motive hypothesis and rejects unselected references', () => {
		expect(() => CaseSceneFetchParametersInputV1Schema.parse({
			...valid, brief: { ...valid.brief, why: { status: 'hypothesis', text: 'Unknown person sought money', evidenceIds: [] } }
		})).toThrow();
		expect(() => CaseSceneFetchParametersInputV1Schema.parse({
			...valid, brief: { ...valid.brief, how: { status: 'hypothesis', description: 'Used a side entrance', evidenceIds: [evidenceB] } }, sourceEvidenceIds: [evidenceA]
		})).toThrow(/not in selected evidence/);
	});

	it('rejects evidence membership mismatch and builds a same-origin POST request', () => {
		const request = CaseSceneFetchParametersInputV1Schema.parse(valid);
		expect(() => buildCaseSceneFetchParametersV1({ caseId, request, verifiedEvidence: [{ id: evidenceA, hash: null }] })).toThrow(/MEMBERSHIP_MISMATCH/);
		const fetchRequest = buildCaseSceneFetchRequestV1(caseId, request);
		expect(fetchRequest.url).toBe(`/api/cases/${caseId}/scene-reconstruction/parameters`);
		expect(fetchRequest.init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
	});

	it('permits blockout-first parameters without evidence or asserted events', () => {
		const blockout = CaseSceneFetchParametersInputV1Schema.parse({
			sceneId, expectedRevision: 0, sourceEvidenceIds: [],
			brief: { who: [], what: [], why: { status: 'unknown' }, how: { status: 'unknown' } },
			environment: { kind: 'urban' }
		});
		const prepared = buildCaseSceneFetchParametersV1({ caseId, request: blockout, verifiedEvidence: [] });
		expect(prepared.sourceEvidence).toEqual([]);
		expect(prepared.brief.what).toEqual([]);
		expect(prepared.environment.cellSizeMeters).toBe(32);
	});
});
