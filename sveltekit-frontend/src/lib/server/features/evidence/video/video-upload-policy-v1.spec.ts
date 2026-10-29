import { describe, expect, it } from 'vitest';
import {
	checkVideoUploadSizeV1,
	MAX_VIDEO_UPLOAD_BODY_BYTES_V1,
	MAX_VIDEO_UPLOAD_BYTES_V1,
	isVideoUploadContentLengthAllowedV1
} from './video-upload-policy-v1.js';

describe('video upload size policy v1', () => {
	it('admits files at and below the existing 100 MiB upload limit', () => {
		expect(checkVideoUploadSizeV1(0)).toEqual({ ok: true });
		expect(checkVideoUploadSizeV1(MAX_VIDEO_UPLOAD_BYTES_V1)).toEqual({ ok: true });
	});

	it('rejects files above the limit', () => {
		expect(checkVideoUploadSizeV1(MAX_VIDEO_UPLOAD_BYTES_V1 + 1)).toEqual({
			ok: false,
			reason: 'too_large',
			maxBytes: MAX_VIDEO_UPLOAD_BYTES_V1
		});
	});

	it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects invalid byte counts: %s', (size) => {
		expect(checkVideoUploadSizeV1(size)).toEqual({
			ok: false,
			reason: 'invalid_size',
			maxBytes: MAX_VIDEO_UPLOAD_BYTES_V1
		});
	});

	it('rejects oversized or malformed declared multipart bodies before parsing', () => {
		expect(isVideoUploadContentLengthAllowedV1(String(MAX_VIDEO_UPLOAD_BODY_BYTES_V1))).toBe(true);
		expect(isVideoUploadContentLengthAllowedV1(String(MAX_VIDEO_UPLOAD_BODY_BYTES_V1 + 1))).toBe(false);
		expect(isVideoUploadContentLengthAllowedV1('unknown')).toBe(false);
		expect(isVideoUploadContentLengthAllowedV1(null)).toBe(true);
	});
});
