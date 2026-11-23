import { describe, expect, it } from 'vitest';
import { resolveSceneCameraCueV1, sceneCameraPresetV1Schema } from './scene-camera-cue-v1.js';

describe('source lane camera cues', () => {
	it('uses half-open intervals and restores the same cue on reverse seeking', () => {
		const events = [{ startMs: 1000, endMs: 3000, cameraPreset: 'top-down' as const }, { startMs: 2000, endMs: 4000 }];
		expect(resolveSceneCameraCueV1(events, 999)).toEqual({ preset: null, conflict: false });
		expect(resolveSceneCameraCueV1(events, 1000)).toEqual({ preset: 'top-down', conflict: false });
		expect(resolveSceneCameraCueV1(events, 3000)).toEqual({ preset: null, conflict: false });
		expect(resolveSceneCameraCueV1(events, 1000)).toEqual({ preset: 'top-down', conflict: false });
		expect(resolveSceneCameraCueV1([], 1000)).toEqual({ preset: null, conflict: false });
	});

	it('declines conflicting presets without blocking identical cues', () => {
		const top = { startMs: 1000, endMs: 3000, cameraPreset: 'top-down' as const };
		expect(resolveSceneCameraCueV1([top, { ...top, cameraPreset: 'isometric' }], 2000)).toEqual({ preset: null, conflict: true });
		expect(resolveSceneCameraCueV1([top, top], 2000)).toEqual({ preset: 'top-down', conflict: false });
		expect(sceneCameraPresetV1Schema.safeParse('unknown').success).toBe(false);
	});
});
