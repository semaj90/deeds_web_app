import { describe, expect, it } from 'vitest';
import {
	FILMCRAFT_TICKS_PER_SECOND_V1,
	validateFilmCraftProbeV1,
	type FilmCraftProbeV1,
} from './filmcraft-cli-adapter-v1.js';

const expected = {
	width: 1280,
	height: 720,
	fpsNumerator: 30,
	fpsDenominator: 1,
	durationSeconds: 8,
	colorProfile: 'bt709',
} as const;

function validProbe(overrides: Partial<FilmCraftProbeV1> = {}): FilmCraftProbeV1 {
	return {
		container: 'MPEG-4',
		duration: 8 * FILMCRAFT_TICKS_PER_SECOND_V1,
		file_size: 1000,
		video: {
			codec: 'H.264 (High)',
			width: 1280,
			height: 720,
			frame_rate: { num: 30, den: 1 },
			par: [1, 1],
			color: { matrix: 'Bt709', primaries: 'Bt709', transfer: 'Bt709' },
		},
		...overrides,
	};
}

describe('FilmCraft CLI export profile gate', () => {
	it('accepts the exact 1280x720, 30/1, square-pixel, eight-second H.264 profile', () => {
		expect(() => validateFilmCraftProbeV1(validProbe(), expected)).not.toThrow();
	});

	it.each([
		['wrong dimensions', { video: { ...validProbe().video, width: 1920 } }],
		['wrong frame rate', { video: { ...validProbe().video, frame_rate: { num: 60, den: 1 } } }],
		['non-square pixels', { video: { ...validProbe().video, par: [4, 3] as const } }],
		['wrong duration', { duration: 7 * FILMCRAFT_TICKS_PER_SECOND_V1 }],
		['wrong codec', { video: { ...validProbe().video, codec: 'VP9' } }],
		['wrong SDR color profile', { video: { ...validProbe().video, color: { matrix: 'Bt709', primaries: 'Smpte170m', transfer: 'Bt709' } } }],
		['missing color metadata', { video: { ...validProbe().video, color: undefined } }],
	] as const)('rejects %s', (_label, overrides) => {
		expect(() => validateFilmCraftProbeV1(validProbe(overrides), expected)).toThrow(/does not match/);
	});
});
