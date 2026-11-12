import { describe, expect, it } from 'vitest';
import {
	buildEvidenceProcessingCompletionV1,
	formatEvidenceAnalysisProgressSseV1,
	formatEvidenceSseRetryV1,
	formatEvidenceProgressSseEventV1,
	parseEvidenceEventCursorV1,
} from './evidence-progress-sse-v1.js';

describe('evidence progress SSE framing', () => {
	it('sends a bounded retry hint and supports jitter without changing the event cursor', () => {
		expect(formatEvidenceSseRetryV1(() => 0)).toBe('retry: 2500\n\n');
		expect(formatEvidenceSseRetryV1(() => 0.5)).toBe('retry: 3750\n\n');
		expect(formatEvidenceSseRetryV1(() => 1)).toBe('retry: 5000\n\n');
	});

	it('supports stable monotonic resume cursors and rejects malformed or overflowing IDs', () => {
		expect(parseEvidenceEventCursorV1(null)).toBe(0n);
		expect(parseEvidenceEventCursorV1('41')).toBe(41n);
		expect(parseEvidenceEventCursorV1('-1')).toBeNull();
		expect(parseEvidenceEventCursorV1('1;data: forged')).toBeNull();
		expect(parseEvidenceEventCursorV1('9223372036854775808')).toBeNull();
	});

	it('emits source-qualified job state with a stable event ID and transport cursor', () => {
		expect(formatEvidenceAnalysisProgressSseV1(41n, {
			eventId: 'e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51',
			jobId: 'e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51',
			evidenceId: '1c7a1bdc-8a1f-41f4-9c72-c9b4cfad8434',
			caseId: '89317a13-5ec2-4919-8795-1128bb01fdce',
			stage: 'running',
			status: 'running',
			sourceRevision: 'sha256:0123456789abcdef',
			progress: 25,
		})).toBe('id: 41\nevent: analysis-progress\ndata: {"eventId":"e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51","jobId":"e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51","evidenceId":"1c7a1bdc-8a1f-41f4-9c72-c9b4cfad8434","caseId":"89317a13-5ec2-4919-8795-1128bb01fdce","stage":"running","status":"running","sourceRevision":"sha256:0123456789abcdef","progress":25}\n\n');
	});

	it('emits named events consumed by EventSource listeners', () => {
		expect(formatEvidenceProgressSseEventV1('progress', {
			jobId: 'job-1',
			step: 'embedding',
			progress: 42,
		})).toBe('event: progress\ndata: {"jobId":"job-1","step":"embedding","progress":42}\n\n');
	});

	it('keeps payload newlines JSON-escaped so events remain one frame', () => {
		const frame = formatEvidenceProgressSseEventV1('error', { message: 'line one\nline two' });
		expect(frame).toContain('event: error\n');
		expect(frame.split('\n\n')).toHaveLength(2);
	});

	it('distinguishes verified PostgreSQL indexing from unverified Qdrant projection', () => {
		const completion = buildEvidenceProcessingCompletionV1({
			jobId: 'job-1',
			evidenceId: 'evidence-1',
			projectionSchedulerEnabled: false,
			result: {
				canonicalStore: 'postgresql.evidence_vectors',
				representationId: 'semantic_768',
				chunkCount: 3,
				persistedCount: 3,
			},
		});
		expect(completion).toMatchObject({
			canonicalStatus: 'postgresql_indexed',
			projectionStatus: 'scheduler_disabled_not_verified',
			chunkCount: 3,
		});
		expect(completion.message).toContain('Qdrant projection is not scheduled');
	});

	it('does not claim PostgreSQL indexing from an incomplete completion result', () => {
		const completion = buildEvidenceProcessingCompletionV1({
			jobId: 'job-2',
			evidenceId: 'evidence-2',
			projectionSchedulerEnabled: true,
			result: { canonicalStore: 'postgresql.evidence_vectors', chunkCount: 2, persistedCount: 1 },
		});
		expect(completion.canonicalStatus).toBe('completion_unverified');
		expect(completion.canonicalStore).toBeNull();
	});
});
