export type RenderSamplingModeV1 = 'native' | 'half' | 'retro';

export type RenderQualityLabelV1 = 'HIGH' | 'MEDIUM' | 'LOW';

export function renderQualityLabelV1(mode: RenderSamplingModeV1): RenderQualityLabelV1 {
	return mode === 'native' ? 'HIGH' : mode === 'half' ? 'MEDIUM' : 'LOW';
}

/** RGBA8 color-target estimate from measured canvas backing dimensions; excludes depth, MSAA and driver overhead. */
export function rgba8ColorTargetEstimateBytesV1(width: number, height: number): number {
	if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
		throw new RangeError('INVALID_COLOR_TARGET_DIMENSIONS');
	}
	const bytes = width * height * 4;
	if (!Number.isSafeInteger(bytes)) throw new RangeError('COLOR_TARGET_ESTIMATE_OVERFLOW');
	return bytes;
}

/** Browser backing-buffer ratio for display previews; this is not a temporal upscaler. */
export function renderPixelRatioV1(devicePixelRatio: number, mode: RenderSamplingModeV1, maximumRatio = 1.5): number {
	if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) throw new RangeError('INVALID_DEVICE_PIXEL_RATIO');
	if (!Number.isFinite(maximumRatio) || maximumRatio <= 0) throw new RangeError('INVALID_MAX_PIXEL_RATIO');
	const scale = mode === 'native' ? 1 : mode === 'half' ? 0.5 : 0.25;
	return Math.min(devicePixelRatio, maximumRatio) * scale;
}

export function renderImageRenderingV1(mode: RenderSamplingModeV1): 'pixelated' | '' {
	return mode === 'retro' ? 'pixelated' : '';
}
