import { beforeEach, describe, expect, it, vi } from 'vitest';

const progressMocks = vi.hoisted(() => ({
	getJob: vi.fn(),
	isJobOwnedBy: vi.fn(),
	subscribe: vi.fn(),
}));

const analysisJobMocks = vi.hoisted(() => ({
	getAnalysisJob: vi.fn(),
	getAnalysisJobForOwner: vi.fn(),
}));

vi.mock('$lib/server/evidence-progress', () => progressMocks);
vi.mock('$lib/server/analysis/analysis-jobs.js', () => analysisJobMocks);

import { GET } from '../../routes/api/evidence/realtime/+server.js';

describe('GET /api/evidence/realtime ownership', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does not open a progress stream for a job owned by another user', async () => {
		progressMocks.getJob.mockReturnValue({ jobId: 'private-job' });
		progressMocks.isJobOwnedBy.mockReturnValue(false);

		const response = await GET({
			url: new URL('http://localhost/api/evidence/realtime?jobId=private-job'),
			locals: { user: { id: 'user-b' } },
		} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(404);
		expect(progressMocks.subscribe).not.toHaveBeenCalled();
		expect(analysisJobMocks.getAnalysisJobForOwner).not.toHaveBeenCalled();
	});
});
