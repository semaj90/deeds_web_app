import { z } from 'zod';

export const sceneCameraPresetV1Schema = z.enum(['top-down', 'isometric', 'perspective']);
export type SceneCameraPresetV1 = z.infer<typeof sceneCameraPresetV1Schema>;

export const sceneCameraPresetLabelsV1: Record<SceneCameraPresetV1, string> = {
	'top-down': 'Top down', isometric: 'Isometric', perspective: 'Perspective'
};

/** Select only from the caller's already selected source clock lane. */
export function resolveSceneCameraCueV1(
	events: readonly { startMs: number; endMs: number; cameraPreset?: SceneCameraPresetV1 }[],
	timeMs: number
) {
	const presets = new Set<SceneCameraPresetV1>();
	for (const event of events) {
		if (event.cameraPreset && timeMs >= event.startMs && timeMs < event.endMs) presets.add(event.cameraPreset);
	}
	return { preset: presets.size === 1 ? [...presets][0]! : null, conflict: presets.size > 1 };
}
