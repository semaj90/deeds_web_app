import { describe, expect, it } from 'vitest';
import { admitEvidenceProgressEventV1, caseEvidenceProgressEventUrlV1, parseEvidenceProgressControlCodeV1 } from './evidence-progress-event-client-v1.js';

const jobId = 'e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51';
const caseId = '89317a13-5ec2-4919-8795-1128bb01fdce';
const envelope = {
	eventId: 'f24f9ad7-75b5-4f7c-9a40-1f305b6f0c51',
	jobId,
	evidenceId: '1c7a1bdc-8a1f-41f4-9c72-c9b4cfad8434',
	caseId,
	stage: 'running',
	status: 'running',
	sourceRevision: `sha256:${'a'.repeat(64)}`,
	progress: 45,
};

describe('browser evidence progress event admission', () => {
	it('admits only known control codes for their matching event names', () => {
		expect(parseEvidenceProgressControlCodeV1('stream-error', { code: 'PROGRESS_READ_UNAVAILABLE' })).toBe('PROGRESS_READ_UNAVAILABLE');
		expect(parseEvidenceProgressControlCodeV1('stream-ended', '{"code":"EVENT_HISTORY_GAP"}')).toBe('EVENT_HISTORY_GAP');
		expect(parseEvidenceProgressControlCodeV1('stream-error', { code: 'AUTHORIZATION_REVOKED' })).toBeNull();
		expect(parseEvidenceProgressControlCodeV1('stream-ended', '{bad json')).toBeNull();
	});

	it('builds the case-authorized stream URL and preserves explicit replay cursors', () => {
		const path = `/api/cases/${caseId}/evidence/jobs/${jobId}/events`;
		expect(caseEvidenceProgressEventUrlV1(caseId, jobId)).toBe(path);
		expect(caseEvidenceProgressEventUrlV1(caseId, jobId, 42n)).toBe(`${path}?after=42`);
		expect(caseEvidenceProgressEventUrlV1(caseId, jobId, 0n)).toBe(path);
	});

	it('rejects malformed identities and out-of-range explicit cursors', () => {
		expect(() => caseEvidenceProgressEventUrlV1('not-a-case', jobId)).toThrow(TypeError);
		expect(() => caseEvidenceProgressEventUrlV1(caseId, 'not-a-job')).toThrow(TypeError);
		expect(() => caseEvidenceProgressEventUrlV1(caseId, jobId, -1n)).toThrow(RangeError);
		expect(() => caseEvidenceProgressEventUrlV1(caseId, jobId, 9_223_372_036_854_775_808n)).toThrow(RangeError);
	});

	it('accepts a fresh source-qualified event and bounds displayed progress', () => {
		const result = admitEvidenceProgressEventV1({
			lastEventId: '42', data: JSON.stringify({ ...envelope, progress: 120 }), jobId, caseId, lastSequence: 41n,
		});
		expect(result).toMatchObject({ accepted: true, sequence: 42n, envelope: { status: 'running', progress: 100 } });
	});

	it('drops duplicate or older sequence IDs so native reconnect replay is idempotent', () => {
		expect(admitEvidenceProgressEventV1({
			lastEventId: '42', data: envelope, jobId, caseId, lastSequence: 42n,
		})).toEqual({ accepted: false, reason: 'duplicate_or_old' });
	});

	it('rejects cross-case and cross-job envelopes before advancing the cursor', () => {
		for (const data of [
			{ ...envelope, caseId: '814f6fc8-3321-4bab-a4a0-2d8196cf9153' },
			{ ...envelope, jobId: 'c3b32a20-01b5-4ef6-a8e5-f59798ea9304' },
		]) {
			expect(admitEvidenceProgressEventV1({
				lastEventId: '43', data, jobId, caseId, lastSequence: 42n,
			})).toEqual({ accepted: false, reason: 'invalid_envelope' });
		}
	});

	it('rejects invalid UUID, source revision, cursor, and status data', () => {
		expect(admitEvidenceProgressEventV1({ lastEventId: '1;forged', data: envelope, jobId, caseId, lastSequence: 0n }).accepted).toBe(false);
		expect(admitEvidenceProgressEventV1({ lastEventId: '43', data: { ...envelope, eventId: 'not-a-uuid' }, jobId, caseId, lastSequence: 42n }).accepted).toBe(false);
		expect(admitEvidenceProgressEventV1({ lastEventId: '43', data: { ...envelope, sourceRevision: 'sha256:bad' }, jobId, caseId, lastSequence: 42n }).accepted).toBe(false);
		expect(admitEvidenceProgressEventV1({ lastEventId: '43', data: { ...envelope, status: 'unknown' }, jobId, caseId, lastSequence: 42n }).accepted).toBe(false);
	});
});
