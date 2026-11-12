import { describe, expect, it } from 'vitest';
import {
	EvidenceProgressConnectionLimiterV1,
	enqueueEvidenceProgressChunkV1,
	type EvidenceProgressStreamLimitsV1,
} from './evidence-progress-stream-limits-v1.js';

const limits: EvidenceProgressStreamLimitsV1 = {
	maxConnectionsPerProcess: 2,
	maxConnectionsPerActor: 1,
	maxConnectionsPerJob: 1,
	maxQueuedBytes: 1024,
};

describe('EvidenceProgressConnectionLimiterV1', () => {
	it('enforces process, actor, and job limits and releases idempotently', () => {
		const limiter = new EvidenceProgressConnectionLimiterV1(limits);
		const first = limiter.acquire('actor-a', 'job-a');
		expect(first.allowed).toBe(true);
		if (!first.allowed) throw new Error('expected first lease');

		expect(limiter.acquire('actor-a', 'job-b')).toMatchObject({ allowed: false, reason: 'ACTOR_LIMIT' });
		expect(limiter.acquire('actor-b', 'job-a')).toMatchObject({ allowed: false, reason: 'JOB_LIMIT' });

		const second = limiter.acquire('actor-b', 'job-b');
		expect(second.allowed).toBe(true);
		if (!second.allowed) throw new Error('expected second lease');
		expect(limiter.acquire('actor-c', 'job-c')).toMatchObject({ allowed: false, reason: 'PROCESS_LIMIT' });

		first.release();
		first.release();
		expect(limiter.acquire('actor-a', 'job-a')).toMatchObject({ allowed: true });
	});
});

describe('enqueueEvidenceProgressChunkV1', () => {
	it('bounds queued bytes and refuses a chunk that would exceed the stream high-water mark', async () => {
		let accepted: boolean[] = [];
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				accepted = [
					enqueueEvidenceProgressChunkV1(controller, new Uint8Array(3), 4),
					enqueueEvidenceProgressChunkV1(controller, new Uint8Array(2), 4),
				];
				controller.close();
			},
		}, {
			highWaterMark: 4,
			size: (chunk) => chunk.byteLength,
		});

		expect(accepted).toEqual([true, false]);
		const reader = stream.getReader();
		expect((await reader.read()).value).toHaveLength(3);
		expect((await reader.read()).done).toBe(true);
	});
});
