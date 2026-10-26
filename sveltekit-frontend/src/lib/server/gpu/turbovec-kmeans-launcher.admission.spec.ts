import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch, mockDbSelect } = vi.hoisted(() => ({
	mockFetch: vi.fn(),
	mockDbSelect: vi.fn(),
}));

vi.mock('node-fetch', () => ({ default: mockFetch }));
vi.mock('../db/client.js', () => ({ db: { select: mockDbSelect } }));
vi.mock('../db/schema-postgres.js', () => ({ codebaseChunkIndex: {} }));

import { TurboVecKMeansLauncher } from './turbovec-kmeans-launcher.js';

describe('TurboVec KMeans result admission boundary', () => {
	beforeEach(() => {
		mockFetch.mockReset();
		mockDbSelect.mockReset();
	});

	it('blocks live pipeline execution before service or database access', async () => {
		const launcher = new TurboVecKMeansLauncher('http://127.0.0.1:8791');

		await expect(launcher.runFullPipeline()).rejects.toThrow('KMEANS_RESULT_ADMISSION_DISABLED');
		expect(mockFetch).not.toHaveBeenCalled();
		expect(mockDbSelect).not.toHaveBeenCalled();
	});

	it('blocks completed-job persistence before polling', async () => {
		const launcher = new TurboVecKMeansLauncher('http://127.0.0.1:8791');

		await expect(launcher.processCompletedJobs(new Map([['chunk-1', 'job-1']]))).rejects.toThrow(
			'KMEANS_RESULT_ADMISSION_DISABLED'
		);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('blocks direct job submission before any sidecar POST', async () => {
		const launcher = new TurboVecKMeansLauncher('http://127.0.0.1:8791');

		await expect(launcher.submitKMeansJob('chunk-1', new Array(768).fill(0))).rejects.toThrow(
			'KMEANS_EXECUTION_DISABLED'
		);
		await expect(launcher.submitBatch(new Map([['chunk-1', new Array(768).fill(0)]]))).rejects.toThrow(
			'KMEANS_EXECUTION_DISABLED'
		);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('keeps dry-run job review local and write-free', async () => {
		const launcher = new TurboVecKMeansLauncher('http://127.0.0.1:8791');

		await expect(launcher.processCompletedJobs(new Map([['chunk-1', 'job-1']]), true)).resolves.toEqual({
			success: 1,
			failed: 0,
		});
		expect(mockFetch).not.toHaveBeenCalled();
		expect(mockDbSelect).not.toHaveBeenCalled();
	});
});
