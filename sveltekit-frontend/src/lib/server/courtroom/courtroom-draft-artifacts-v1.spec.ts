import { describe, expect, it } from 'vitest';
import { createSyntheticCourtroomProjectV1 } from '$lib/courtroom/courtroom-video-project-v1.js';
import {
	CourtroomDraftErrorV1,
	decideCourtroomDraftRevisionWriteV1,
	syntheticCourtroomDraftV1Schema,
} from './courtroom-draft-artifacts-v1.js';

describe('synthetic courtroom draft artifact contract', () => {
	it('accepts the fixture project and rejects real-case scope or unknown payload keys', () => {
		const project = createSyntheticCourtroomProjectV1();
		expect(syntheticCourtroomDraftV1Schema.safeParse(project).success).toBe(true);
		expect(syntheticCourtroomDraftV1Schema.safeParse({ ...project, caseId: 'case-real-1' }).success).toBe(false);
		expect(syntheticCourtroomDraftV1Schema.safeParse({ ...project, storyboardChecksum: 'sha256:bad' }).success).toBe(false);
	});

	it('requires every observation to carry a source locator', () => {
		const project = createSyntheticCourtroomProjectV1();
		const source = project.segments[0].sourceRefs[0];
		const malformed = {
			...project,
			segments: project.segments.map((segment, index) => index === 0
				? { ...segment, observations: [{
					observationId: 'fixture-observation-without-locator',
					sourceId: source.sourceId,
					sourceRevision: source.sourceRevision,
					sha256: source.sha256,
					fixtureOnly: true,
				}] }
				: segment),
		};
		expect(syntheticCourtroomDraftV1Schema.safeParse(malformed).success).toBe(false);
	});

	it('accepts the first immutable revision only when no prior revision is expected', () => {
		expect(decideCourtroomDraftRevisionWriteV1({
			expectedRevision: null,
			currentRevision: null,
			currentChecksum: null,
			submittedRevision: 1,
			submittedChecksum: 'a'.repeat(64),
		})).toBe('APPEND_REVISION');
		expect(() => decideCourtroomDraftRevisionWriteV1({
			expectedRevision: 1,
			currentRevision: null,
			currentChecksum: null,
			submittedRevision: 2,
			submittedChecksum: 'b'.repeat(64),
		})).toThrow(CourtroomDraftErrorV1);
	});

	it('allows a byte-identical retry and rejects stale or same-revision edits', () => {
		const currentChecksum = 'a'.repeat(64);
		expect(decideCourtroomDraftRevisionWriteV1({
			expectedRevision: 1,
			currentRevision: 1,
			currentChecksum,
			submittedRevision: 1,
			submittedChecksum: currentChecksum,
		})).toBe('IDEMPOTENT_REPLAY');
		expect(() => decideCourtroomDraftRevisionWriteV1({
			expectedRevision: 1,
			currentRevision: 2,
			currentChecksum,
			submittedRevision: 3,
			submittedChecksum: 'b'.repeat(64),
		})).toThrow(CourtroomDraftErrorV1);
		expect(() => decideCourtroomDraftRevisionWriteV1({
			expectedRevision: 1,
			currentRevision: 1,
			currentChecksum,
			submittedRevision: 1,
			submittedChecksum: 'b'.repeat(64),
		})).toThrow(CourtroomDraftErrorV1);
	});

	it('requires a strictly newer revision when the current revision matches', () => {
		expect(decideCourtroomDraftRevisionWriteV1({
			expectedRevision: 4,
			currentRevision: 4,
			currentChecksum: 'a'.repeat(64),
			submittedRevision: 5,
			submittedChecksum: 'b'.repeat(64),
		})).toBe('APPEND_REVISION');
	});
});
