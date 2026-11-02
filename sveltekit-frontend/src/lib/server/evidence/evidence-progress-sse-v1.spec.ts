import { describe, expect, it } from 'vitest';
import {
	buildEvidenceProcessingCompletionV1,
	formatEvidenceProgressSseEventV1,
} from './evidence-progress-sse-v1.js';

describe('evidence progress SSE framing', () => {
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
