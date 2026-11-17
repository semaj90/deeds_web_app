import { describe, expect, it } from 'vitest';
import { parseFfmpegPresentationTimestampsV1 } from './ffmpeg-presentation-timestamps-v1.js';

describe('FFmpeg presentation timestamp parser', () => {
	it('keeps showinfo timestamps in source presentation order', () => {
		const stderr = [
			'[Parsed_showinfo_2] n: 0 pts: 0 pts_time:0.041708',
			'[Parsed_showinfo_2] n: 1 pts: 3003 pts_time:1.042708',
			'[Parsed_showinfo_2] n: 2 pts: 6006 pts_time:2.043708',
		].join('\n');
		expect(parseFfmpegPresentationTimestampsV1(stderr)).toEqual([0.041708, 1.042708, 2.043708]);
	});

	it('ignores unrelated or malformed log lines', () => {
		expect(parseFfmpegPresentationTimestampsV1('frame=1 pts_time:nan\npts_time:bad\n')).toEqual([]);
	});
});
