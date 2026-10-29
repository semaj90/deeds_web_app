import { describe, expect, it } from 'vitest';
import { createJob, isJobOwnedBy } from './evidence-progress.js';

describe('evidence progress ownership', () => {
	it('allows only the owner bound when the progress job is created', () => {
		const jobId = `owner-test-${crypto.randomUUID()}`;
		createJob(jobId, 'user-17');

		expect(isJobOwnedBy(jobId, 'user-17')).toBe(true);
		expect(isJobOwnedBy(jobId, 'user-18')).toBe(false);
	});

	it('fails closed for legacy jobs without an owner binding', () => {
		const jobId = `legacy-test-${crypto.randomUUID()}`;
		createJob(jobId);

		expect(isJobOwnedBy(jobId, 'user-17')).toBe(false);
	});
});
