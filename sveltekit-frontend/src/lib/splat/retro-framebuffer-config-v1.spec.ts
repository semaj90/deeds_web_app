import { describe, expect, it } from 'vitest';
import { retroFramebufferConfigV1, retroUpscaleFactorV1, RETRO_DEMONSTRATIVE_LABEL_V1 } from './retro-framebuffer-config-v1.js';

describe('retro framebuffer config v1', () => {
	it('defaults to the 320x180 target with nearest filtering and no per-frame readback', () => {
		const c = retroFramebufferConfigV1();
		expect(c).toMatchObject({ preset: 'default', width: 320, height: 180, filter: 'nearest', readbackPerFrame: false });
	});

	it('offers the 160x90 and 640x360 options', () => {
		expect(retroFramebufferConfigV1('low')).toMatchObject({ width: 160, height: 90 });
		expect(retroFramebufferConfigV1('high')).toMatchObject({ width: 640, height: 360 });
	});

	it('labels every configuration as a demonstrative reconstruction', () => {
		expect(retroFramebufferConfigV1('default').label).toBe(RETRO_DEMONSTRATIVE_LABEL_V1);
	});

	it('rejects an unknown preset', () => {
		expect(() => retroFramebufferConfigV1('ultra' as never)).toThrow('RETRO_PRESET_UNKNOWN');
	});

	it('computes an exact integer upscale to a 1280x720 display', () => {
		expect(retroUpscaleFactorV1('default', 1280, 720)).toBe(4);
		expect(retroUpscaleFactorV1('low', 1280, 720)).toBe(8);
	});

	it('rejects a display size that would give non-square or fractional pixels', () => {
		expect(() => retroUpscaleFactorV1('default', 1000, 720)).toThrow('RETRO_UPSCALE_NOT_INTEGER');
		expect(() => retroUpscaleFactorV1('default', 0, 720)).toThrow('RETRO_DISPLAY_SIZE_INVALID');
	});
});
