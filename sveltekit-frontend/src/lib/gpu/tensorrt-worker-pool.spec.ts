import { describe, expect, it, vi } from 'vitest';
import {
	getNextAvailableWorkerIndex,
	removeQueuedTask,
	type GPUTask,
	type GPUResult,
	type QueuedTask,
} from './tensorrt-worker-pool.js';

function queued(taskId: string) {
	const task: GPUTask = { taskId, operation: 'cosine' };
	return { task, resolve: vi.fn<(result: GPUResult) => void>(), reject: vi.fn<(error: Error) => void>() };
}

describe('TensorRT worker queue cancellation', () => {
	it('removes a timed-out task without disturbing FIFO neighbors', () => {
		const first = queued('first');
		const expired = queued('expired');
		const last = queued('last');
		const queue: QueuedTask[] = [first, expired, last];

		expect(removeQueuedTask(queue, 'expired')).toBe(true);
		expect(queue.map((entry) => entry.task.taskId)).toEqual(['first', 'last']);
	});

	it('does not change the queue when the task is already absent', () => {
		const queue: QueuedTask[] = [queued('still-pending')];

		expect(removeQueuedTask(queue, 'already-finished')).toBe(false);
		expect(queue.map((entry) => entry.task.taskId)).toEqual(['still-pending']);
	});
});

describe('TensorRT worker scheduling', () => {
	it('selects an idle worker in round-robin order instead of reusing a busy slot', () => {
		expect(getNextAvailableWorkerIndex(4, new Set([0, 1]), 1)).toBe(2);
		expect(getNextAvailableWorkerIndex(4, new Set([0, 1, 2]), 3)).toBe(3);
	});

	it('wraps around and returns null when every worker is busy', () => {
		expect(getNextAvailableWorkerIndex(4, new Set([1, 2, 3]), 3)).toBe(0);
		expect(getNextAvailableWorkerIndex(2, new Set([0, 1]))).toBeNull();
		expect(getNextAvailableWorkerIndex(0, new Set())).toBeNull();
	});
});
