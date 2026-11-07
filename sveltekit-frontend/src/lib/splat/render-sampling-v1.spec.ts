import { describe, expect, it } from 'vitest';
import { renderImageRenderingV1, renderPixelRatioV1, renderQualityLabelV1, rgba8ColorTargetEstimateBytesV1 } from './render-sampling-v1.js';

describe('display sampling controls', () => {
	it('caps device pixel ratio and uses half-resolution backing buffers for reduced modes', () => {
		expect(renderPixelRatioV1(2, 'native')).toBe(1.5);
		expect(renderPixelRatioV1(2, 'half')).toBe(0.75);
		expect(renderPixelRatioV1(1, 'retro')).toBe(0.25);
	});

	it('uses nearest-pixel CSS only for the retro display preview', () => {
		expect(renderImageRenderingV1('native')).toBe('');
		expect(renderImageRenderingV1('half')).toBe('');
		expect(renderImageRenderingV1('retro')).toBe('pixelated');
	});

	it('labels preview levels and estimates the measured RGBA8 backing target independently of antialiasing', () => {
		expect(renderQualityLabelV1('native')).toBe('HIGH');
		expect(renderQualityLabelV1('half')).toBe('MEDIUM');
		expect(renderQualityLabelV1('retro')).toBe('LOW');
		expect(rgba8ColorTargetEstimateBytesV1(1920, 1080)).toBe(8_294_400);
		expect(() => rgba8ColorTargetEstimateBytesV1(0, 1080)).toThrow('INVALID_COLOR_TARGET_DIMENSIONS');
	});

	it('rejects invalid display ratios', () => {
		expect(() => renderPixelRatioV1(0, 'native')).toThrow('INVALID_DEVICE_PIXEL_RATIO');
		expect(() => renderPixelRatioV1(1, 'native', Number.NaN)).toThrow('INVALID_MAX_PIXEL_RATIO');
	});
});
