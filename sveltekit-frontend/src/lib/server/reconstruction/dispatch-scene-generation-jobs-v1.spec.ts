import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/server/db/client.js';
import { dispatchSceneGenerationJobsV1 } from './dispatch-scene-generation-jobs-v1.js';
import { recoverExpiredSceneGenerationJobV1 } from './scene-generation-job-lifecycle-v1.js';
import { runSceneGenerationJobV1 } from './run-scene-generation-job-v1.js';

vi.mock('$lib/server/db/client.js', () => ({ db: { select: vi.fn() } }));
vi.mock('./scene-generation-job-lifecycle-v1.js', () => ({ recoverExpiredSceneGenerationJobV1: vi.fn() }));
vi.mock('./run-scene-generation-job-v1.js', () => ({ runSceneGenerationJobV1: vi.fn() }));

const expired = { caseId: 'case-a', sceneId: 'scene-a', jobId: 'expired' };
const queued = { caseId: 'case-b', sceneId: 'scene-b', jobId: 'queued' };

function mockSelect(rows: Array<typeof expired>) {
	const limit = vi.fn().mockResolvedValue(rows);
	vi.mocked(db.select).mockReturnValueOnce({
		from: () => ({ where: () => ({ orderBy: () => ({ limit }) }) })
	} as unknown as ReturnType<typeof db.select>);
	return limit;
}

describe('scene generation poll dispatch', () => {
	beforeEach(() => { vi.resetAllMocks(); });

	it('recovers a bounded expired batch and dispatches one scoped job', async () => {
		const recoveryLimit = mockSelect([expired]);
		const dispatchLimit = mockSelect([queued]);
		vi.mocked(runSceneGenerationJobV1).mockResolvedValue('completed');
		expect(await dispatchSceneGenerationJobsV1()).toBe('completed');
		expect(recoveryLimit).toHaveBeenCalledWith(8);
		expect(dispatchLimit).toHaveBeenCalledWith(1);
		expect(recoverExpiredSceneGenerationJobV1).toHaveBeenCalledWith(expired);
		expect(runSceneGenerationJobV1).toHaveBeenCalledExactlyOnceWith({ ...queued, workerId: expect.stringMatching(/^scene-generation:/), leaseSeconds: 120 });
	});

	it('does not run a job when an eligible row is absent', async () => {
		mockSelect([]);
		mockSelect([]);
		expect(await dispatchSceneGenerationJobsV1()).toBe('empty');
		expect(runSceneGenerationJobV1).not.toHaveBeenCalled();
	});
});
