import { describe, expect, it } from 'vitest';
import {
	decodeVideoFrameDescriptorV1,
	encodeVideoFrameDescriptorV1,
	resolveVideoResolutionPolicyV1,
	validateVideoFrameDescriptorV1,
	VIDEO_FRAME_DESCRIPTOR_SCHEMA_V1,
	type VideoFrameDescriptorV1,
} from './video-frame-layout-v1.js';

const rgba: VideoFrameDescriptorV1 = {
	schema: VIDEO_FRAME_DESCRIPTOR_SCHEMA_V1, frameId: 7n, ptsUs: -250n,
	width: 4, height: 2, rowStrideBytes: 16, pixelFormat: 'RGBA8',
	bufferOffset: 32, bufferLength: 32, generation: 1, flags: 1, planeCount: 1,
};

describe('video frame layout v1', () => {
	it('round-trips the fixed 64-byte little-endian descriptor', () => {
		const bytes = encodeVideoFrameDescriptorV1(rgba);
		expect(bytes.byteLength).toBe(64);
		expect(decodeVideoFrameDescriptorV1(bytes)).toEqual(rgba);
	});

	it('checks exact pixel storage size and arena bounds', () => {
		expect(validateVideoFrameDescriptorV1(rgba, 64)).toEqual({ ok: true, requiredBytes: 32 });
		expect(validateVideoFrameDescriptorV1({ ...rgba, bufferLength: 31 }, 64)).toEqual({ ok: false, code: 'BUFFER_LENGTH_MISMATCH' });
		expect(validateVideoFrameDescriptorV1({ ...rgba, bufferOffset: 40 }, 64)).toEqual({ ok: false, code: 'BUFFER_OUT_OF_BOUNDS' });
	});

	it('validates NV12 plane layout and rejects invalid odd dimensions', () => {
		const nv12 = { ...rgba, width: 4, height: 2, rowStrideBytes: 4, pixelFormat: 'NV12' as const, bufferLength: 12, planeCount: 2 as const };
		expect(validateVideoFrameDescriptorV1(nv12, 44)).toEqual({ ok: true, requiredBytes: 12 });
		expect(validateVideoFrameDescriptorV1({ ...nv12, height: 3, bufferLength: 20 }, 64)).toEqual({ ok: false, code: 'NV12_REQUIRES_EVEN_LAYOUT' });
	});

	it('rejects unsupported serialized versions and nonzero reserved words', () => {
		const bytes = encodeVideoFrameDescriptorV1(rgba);
		new DataView(bytes.buffer).setUint32(48, 2, true);
		expect(decodeVideoFrameDescriptorV1(bytes)).toBeNull();
		new DataView(bytes.buffer).setUint32(48, 1, true);
		new DataView(bytes.buffer).setUint32(60, 1, true);
		expect(decodeVideoFrameDescriptorV1(bytes)).toBeNull();
	});

	it('uses explicit target sizes for adaptive consumers and fixed policy for thumbnails', () => {
		expect(resolveVideoResolutionPolicyV1('timeline-thumbnail')?.width).toBe(96);
		expect(resolveVideoResolutionPolicyV1('adaptive-preview')).toBeNull();
		expect(resolveVideoResolutionPolicyV1('adaptive-preview', { width: 1280, height: 720, maxPixels: 921600 })?.resampling).toBe('area');
		expect(resolveVideoResolutionPolicyV1('adaptive-preview', { width: 1280, height: 720, maxPixels: 100 }) ).toBeNull();
		expect(resolveVideoResolutionPolicyV1('evidence-inspection')?.resampling).toBe('none');
	});
});
