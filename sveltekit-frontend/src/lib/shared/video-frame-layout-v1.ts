/** Shared CPU/WASM/GPU frame descriptor. All serialized integers are little-endian. */
export const VIDEO_FRAME_DESCRIPTOR_SCHEMA_V1 = 'atlas.video-frame-descriptor.v1' as const;
export const VIDEO_FRAME_DESCRIPTOR_BYTES_V1 = 64 as const;

export const VIDEO_FRAME_PIXEL_FORMAT_V1 = {
	GRAY8: 1,
	RGB8: 2,
	RGBA8: 3,
	NV12: 4,
} as const;
export type VideoFramePixelFormatV1 = keyof typeof VIDEO_FRAME_PIXEL_FORMAT_V1;

export const VIDEO_FRAME_FLAG_V1 = { KEYFRAME: 1, DISCONTINUITY: 2 } as const;
const KNOWN_FLAGS = VIDEO_FRAME_FLAG_V1.KEYFRAME | VIDEO_FRAME_FLAG_V1.DISCONTINUITY;

export type VideoFrameDescriptorV1 = {
	schema: typeof VIDEO_FRAME_DESCRIPTOR_SCHEMA_V1;
	frameId: bigint;
	ptsUs: bigint;
	width: number;
	height: number;
	rowStrideBytes: number;
	pixelFormat: VideoFramePixelFormatV1;
	bufferOffset: number;
	bufferLength: number;
	generation: number;
	flags: number;
	planeCount: 1 | 2;
};

export type FrameLayoutCheckV1 = { ok: true; requiredBytes: number } | { ok: false; code: string };

const isU32 = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;

/** Validate the descriptor against an arena without trusting producer lengths. */
export function validateVideoFrameDescriptorV1(frame: VideoFrameDescriptorV1, arenaBytes: number): FrameLayoutCheckV1 {
	if (frame.schema !== VIDEO_FRAME_DESCRIPTOR_SCHEMA_V1) return { ok: false, code: 'SCHEMA_MISMATCH' };
	if (typeof frame.frameId !== 'bigint' || frame.frameId < 0n || frame.frameId > 0xffff_ffff_ffff_ffffn) return { ok: false, code: 'INVALID_FRAME_ID' };
	if (typeof frame.ptsUs !== 'bigint' || frame.ptsUs < -(1n << 63n) || frame.ptsUs > (1n << 63n) - 1n) return { ok: false, code: 'INVALID_PTS' };
	if (!isU32(frame.width) || frame.width === 0 || !isU32(frame.height) || frame.height === 0) return { ok: false, code: 'INVALID_DIMENSIONS' };
	if (!isU32(frame.rowStrideBytes) || !isU32(frame.bufferOffset) || !isU32(frame.bufferLength) || !isU32(frame.generation)) return { ok: false, code: 'INVALID_U32_FIELD' };
	if (!isU32(arenaBytes) || !isU32(frame.flags) || (frame.flags & ~KNOWN_FLAGS) !== 0) return { ok: false, code: 'INVALID_FLAGS_OR_ARENA' };
	if (!Object.hasOwn(VIDEO_FRAME_PIXEL_FORMAT_V1, frame.pixelFormat)) return { ok: false, code: 'UNSUPPORTED_PIXEL_FORMAT' };
	const bytesPerPixel = frame.pixelFormat === 'GRAY8' ? 1 : frame.pixelFormat === 'RGB8' ? 3 : frame.pixelFormat === 'RGBA8' ? 4 : 1;
	const minStride = frame.width * bytesPerPixel;
	if (!Number.isSafeInteger(minStride) || frame.rowStrideBytes < minStride) return { ok: false, code: 'STRIDE_TOO_SMALL' };
	const expectedPlanes = frame.pixelFormat === 'NV12' ? 2 : 1;
	if (frame.planeCount !== expectedPlanes) return { ok: false, code: 'PLANE_COUNT_MISMATCH' };
	if (frame.pixelFormat === 'NV12' && ((frame.width | frame.height | frame.rowStrideBytes) & 1) !== 0) return { ok: false, code: 'NV12_REQUIRES_EVEN_LAYOUT' };
	const required = BigInt(frame.rowStrideBytes) * BigInt(frame.pixelFormat === 'NV12' ? frame.height + frame.height / 2 : frame.height);
	if (required > 0xffff_ffffn || BigInt(frame.bufferLength) !== required) return { ok: false, code: 'BUFFER_LENGTH_MISMATCH' };
	if (BigInt(frame.bufferOffset) + required > BigInt(arenaBytes)) return { ok: false, code: 'BUFFER_OUT_OF_BOUNDS' };
	return { ok: true, requiredBytes: Number(required) };
}

export function encodeVideoFrameDescriptorV1(frame: VideoFrameDescriptorV1): Uint8Array {
	const view = new DataView(new ArrayBuffer(VIDEO_FRAME_DESCRIPTOR_BYTES_V1));
	view.setBigUint64(0, frame.frameId, true);
	view.setBigInt64(8, frame.ptsUs, true);
	view.setUint32(16, frame.width, true);
	view.setUint32(20, frame.height, true);
	view.setUint32(24, frame.rowStrideBytes, true);
	view.setUint32(28, VIDEO_FRAME_PIXEL_FORMAT_V1[frame.pixelFormat], true);
	view.setUint32(32, frame.bufferOffset, true);
	view.setUint32(36, frame.bufferLength, true);
	view.setUint32(40, frame.generation, true);
	view.setUint32(44, frame.flags, true);
	view.setUint32(48, 1, true);
	view.setUint32(52, frame.planeCount, true);
	// bytes 56..63 are reserved and stay zero.
	return new Uint8Array(view.buffer);
}

export function decodeVideoFrameDescriptorV1(bytes: Uint8Array): VideoFrameDescriptorV1 | null {
	if (bytes.byteLength !== VIDEO_FRAME_DESCRIPTOR_BYTES_V1) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(48, true) !== 1 || view.getUint32(56, true) !== 0 || view.getUint32(60, true) !== 0) return null;
	const formatId = view.getUint32(28, true);
	const pixelFormat = (Object.entries(VIDEO_FRAME_PIXEL_FORMAT_V1).find(([, id]) => id === formatId)?.[0]) as VideoFramePixelFormatV1 | undefined;
	if (!pixelFormat) return null;
	const planeCount = view.getUint32(52, true);
	if (planeCount !== 1 && planeCount !== 2) return null;
	return {
		schema: VIDEO_FRAME_DESCRIPTOR_SCHEMA_V1,
		frameId: view.getBigUint64(0, true), ptsUs: view.getBigInt64(8, true),
		width: view.getUint32(16, true), height: view.getUint32(20, true), rowStrideBytes: view.getUint32(24, true),
		pixelFormat, bufferOffset: view.getUint32(32, true), bufferLength: view.getUint32(36, true),
		generation: view.getUint32(40, true), flags: view.getUint32(44, true), planeCount,
	};
}

export type VideoResolutionPolicyV1 = {
	consumer: 'timeline-thumbnail' | 'adaptive-preview' | 'object-crop' | 'threejs-lod' | 'model-input' | 'segmentation-mask' | 'evidence-inspection';
	policyRevision: 'atlas.video-resolution-policy.v1';
	resampling: 'area' | 'bilinear' | 'nearest' | 'model-defined' | 'none';
	width: number | null;
	height: number | null;
	maxPixels: number | null;
	preserveAspect: boolean;
};

export type VideoResolutionTargetV1 = { width: number; height: number; maxPixels: number };

/** Consumer policy only; it does not alter the canonical/original evidence frame. */
export function resolveVideoResolutionPolicyV1(
	consumer: VideoResolutionPolicyV1['consumer'],
	target?: VideoResolutionTargetV1,
): VideoResolutionPolicyV1 | null {
	if (consumer === 'timeline-thumbnail') return { consumer, policyRevision: 'atlas.video-resolution-policy.v1', resampling: 'area', width: 96, height: 54, maxPixels: 96 * 54, preserveAspect: true };
	if (consumer === 'evidence-inspection') return { consumer, policyRevision: 'atlas.video-resolution-policy.v1', resampling: 'none', width: null, height: null, maxPixels: null, preserveAspect: true };
	if (consumer === 'model-input') return { consumer, policyRevision: 'atlas.video-resolution-policy.v1', resampling: 'model-defined', width: null, height: null, maxPixels: null, preserveAspect: true };
	if (consumer === 'segmentation-mask') return { consumer, policyRevision: 'atlas.video-resolution-policy.v1', resampling: 'nearest', width: null, height: null, maxPixels: 4096 * 2160, preserveAspect: false };
	if (!target || !isU32(target.width) || target.width === 0 || !isU32(target.height) || target.height === 0 || !isU32(target.maxPixels) || target.maxPixels === 0 || target.width * target.height > target.maxPixels) return null;
	return { consumer, policyRevision: 'atlas.video-resolution-policy.v1', resampling: consumer === 'object-crop' ? 'bilinear' : 'area', width: target.width, height: target.height, maxPixels: target.maxPixels, preserveAspect: true };
}
