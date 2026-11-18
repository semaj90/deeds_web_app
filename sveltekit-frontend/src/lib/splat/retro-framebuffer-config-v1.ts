/**
 * Resolution presets for the retro reconstruction framebuffer (Phase 4).
 * Pure configuration only: no WebGL here. The render target is created by the renderer that
 * consumes this config, and it is never read back with per-frame readPixels.
 *
 * Demonstrative output only: every retro frame is labelled as a demonstrative reconstruction,
 * not original footage.
 */
export const RETRO_FRAMEBUFFER_CONFIG_REVISION_V1 = 'atlas-retro-framebuffer-config-v1' as const;
export const RETRO_DEMONSTRATIVE_LABEL_V1 = 'Demonstrative reconstruction, not original footage' as const;

export const RETRO_RESOLUTION_PRESETS_V1 = {
	low: { width: 160, height: 90 },
	default: { width: 320, height: 180 },
	high: { width: 640, height: 360 },
} as const;

export type RetroResolutionPresetV1 = keyof typeof RETRO_RESOLUTION_PRESETS_V1;

export type RetroFramebufferConfigV1 = {
	revision: typeof RETRO_FRAMEBUFFER_CONFIG_REVISION_V1;
	preset: RetroResolutionPresetV1;
	width: number;
	height: number;
	filter: 'nearest';
	readbackPerFrame: false;
	label: typeof RETRO_DEMONSTRATIVE_LABEL_V1;
};

export function retroFramebufferConfigV1(preset: RetroResolutionPresetV1 = 'default'): RetroFramebufferConfigV1 {
	const size = RETRO_RESOLUTION_PRESETS_V1[preset];
	if (!size) throw new RangeError('RETRO_PRESET_UNKNOWN');
	return {
		revision: RETRO_FRAMEBUFFER_CONFIG_REVISION_V1,
		preset,
		width: size.width,
		height: size.height,
		filter: 'nearest',
		readbackPerFrame: false,
		label: RETRO_DEMONSTRATIVE_LABEL_V1,
	};
}

/** Integer upscale factor from a retro target to the display size; must be exact to keep pixels square. */
export function retroUpscaleFactorV1(preset: RetroResolutionPresetV1, displayWidth: number, displayHeight: number): number {
	const size = RETRO_RESOLUTION_PRESETS_V1[preset];
	if (!size) throw new RangeError('RETRO_PRESET_UNKNOWN');
	if (!Number.isInteger(displayWidth) || !Number.isInteger(displayHeight) || displayWidth <= 0 || displayHeight <= 0) {
		throw new RangeError('RETRO_DISPLAY_SIZE_INVALID');
	}
	const fx = displayWidth / size.width;
	const fy = displayHeight / size.height;
	if (!Number.isInteger(fx) || fx !== fy) throw new RangeError('RETRO_UPSCALE_NOT_INTEGER');
	return fx;
}
