import { describe, expect, it } from 'vitest';
import { mapYoloLetterboxBoxToSourceV1, validateYoloLetterboxTransformV1 } from './yolo-letterbox-v1.js';

describe('YOLO letterbox source-coordinate mapping', () => {
	it('removes symmetric padding and maps a landscape box to source pixels', () => {
		const transform = {
			sourceWidth: 1280,
			sourceHeight: 720,
			scaleX: 0.5,
			scaleY: 0.5,
			padLeft: 0,
			padTop: 140,
		};
		expect(mapYoloLetterboxBoxToSourceV1([100, 190, 500, 440], transform)).toEqual([200, 100, 1000, 600]);
	});

	it('clips boxes to the original source bounds', () => {
		const transform = { sourceWidth: 100, sourceHeight: 50, scaleX: 6.4, scaleY: 6.4, padLeft: 0, padTop: 160 };
		expect(mapYoloLetterboxBoxToSourceV1([-20, 100, 680, 500], transform)).toEqual([0, 0, 100, 50]);
	});

	it('rejects invalid transforms and boxes that map entirely outside the source', () => {
		expect(() => validateYoloLetterboxTransformV1({ sourceWidth: 0 })).toThrow('YOLO_LETTERBOX_TRANSFORM_INVALID');
		expect(() => mapYoloLetterboxBoxToSourceV1([0, 0, 1, 1], {
			sourceWidth: 100, sourceHeight: 50, scaleX: 1, scaleY: 1, padLeft: 0, padTop: 100,
		})).toThrow('YOLO_LETTERBOX_BOX_OUTSIDE_SOURCE');
	});
});
