import { describe, it, expect } from 'vitest';
import {
	applyStreamEvent,
	createLoadingState,
	determinateProgress,
	markComplete,
	markError,
	markRunning
} from './indexing-progress.js';

describe('request lifecycle', () => {
	it('moves queued -> running -> complete without inventing counts', () => {
		let s = createLoadingState('INDEXING', 'job-1');
		expect(s.status).toBe('queued');
		s = markRunning(s);
		expect(s.status).toBe('running');
		expect(s.completed).toBeNull();
		expect(s.total).toBeNull();
		s = markComplete(s);
		expect(s.status).toBe('complete');
		expect(s.completed).toBeNull();
	});

	it('keeps the error message on failure', () => {
		const s = markError(markRunning(createLoadingState('INDEXING')), 'Qdrant upsert failed');
		expect(s.status).toBe('error');
		expect(s.errorMessage).toBe('Qdrant upsert failed');
	});

	it('does not leave a terminal state', () => {
		const done = markComplete(markRunning(createLoadingState('SEARCH')));
		expect(markError(done, 'late error').status).toBe('complete');
		expect(markRunning(done).status).toBe('complete');
		const failed = markError(markRunning(createLoadingState('SEARCH')), 'boom');
		expect(markComplete(failed).status).toBe('error');
	});
});

describe('index-stream SSE events', () => {
	it('maps mirror_progress to real mirrored/total counts', () => {
		const s = applyStreamEvent(createLoadingState('INDEXING'), 'mirror_progress', { mirrored: 30, total: 120 });
		expect(s.stage).toBe('MIRRORING VECTORS');
		expect(s.completed).toBe(30);
		expect(s.total).toBe(120);
		expect(determinateProgress(s)).toBeCloseTo(25, 6);
	});

	it('shows a stage without counts when the event carries none', () => {
		const s = applyStreamEvent(createLoadingState('INDEXING'), 'scroll', { pages: 3 });
		expect(s.stage).toBe('SCANNING FILES');
		expect(s.completed).toBeNull();
		expect(s.total).toBeNull();
		expect(determinateProgress(s)).toBeNull();
	});

	it('ignores non-finite or negative counts', () => {
		const s = applyStreamEvent(createLoadingState('INDEXING'), 'mirror_progress', { mirrored: Number.NaN, total: -4 });
		expect(s.completed).toBeNull();
		expect(s.total).toBeNull();
	});

	it('ignores unknown events so no invented stage appears', () => {
		const before = createLoadingState('INDEXING');
		expect(applyStreamEvent(before, 'something_new', { x: 1 })).toBe(before);
	});

	it('turns an error event into an error state with its message', () => {
		const s = applyStreamEvent(markRunning(createLoadingState('INDEXING')), 'error', { message: 'GPU lost' });
		expect(s.status).toBe('error');
		expect(s.errorMessage).toBe('GPU lost');
	});

	it('marks complete on the complete event and stops accepting progress', () => {
		let s = applyStreamEvent(createLoadingState('INDEXING'), 'complete', { totalMs: 900 });
		expect(s.status).toBe('complete');
		s = applyStreamEvent(s, 'mirror_progress', { mirrored: 5, total: 10 });
		expect(s.status).toBe('complete');
		expect(s.stage).toBeNull();
	});
});

describe('determinateProgress', () => {
	it('is null unless both counts are real and total is positive', () => {
		expect(determinateProgress(createLoadingState('INDEXING'))).toBeNull();
		const zeroTotal = { ...createLoadingState('INDEXING'), completed: 0, total: 0 };
		expect(determinateProgress(zeroTotal)).toBeNull();
	});

	it('caps at 100', () => {
		const over = { ...createLoadingState('INDEXING'), completed: 12, total: 10 };
		expect(determinateProgress(over)).toBe(100);
	});
});
