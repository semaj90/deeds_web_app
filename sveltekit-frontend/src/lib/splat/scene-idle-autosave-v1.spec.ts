import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSceneIdleAutosaveV1 } from './scene-idle-autosave-v1.js';

describe('scene idle autosave v1', () => {
	afterEach(() => vi.useRealTimers());

	it('coalesces rapid edits into one commit after the last idle delay', () => {
		vi.useFakeTimers();
		const commit = vi.fn();
		const autosave = createSceneIdleAutosaveV1(commit, 1200);

		autosave.schedule();
		vi.advanceTimersByTime(900);
		autosave.schedule();
		vi.advanceTimersByTime(1199);
		expect(commit).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(commit).toHaveBeenCalledTimes(1);
	});

	it('cancels a pending commit when the scene is disposed or manually saved', () => {
		vi.useFakeTimers();
		const commit = vi.fn();
		const autosave = createSceneIdleAutosaveV1(commit);
		autosave.schedule();
		autosave.cancel();
		vi.advanceTimersByTime(2000);
		expect(commit).not.toHaveBeenCalled();
	});

	it('rejects an unsafe idle delay', () => {
		expect(() => createSceneIdleAutosaveV1(() => {}, 20)).toThrow(/idle delay/);
		expect(() => createSceneIdleAutosaveV1(() => {}, 60_000)).toThrow(/idle delay/);
	});
});
