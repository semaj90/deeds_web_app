import { z } from 'zod';

export const VIDEO_MOTION_LUT_SCHEMA_V1 = 'atlas.video-motion-lut.v1' as const;
export const VIDEO_MOTION_LUT_PROCESSING_REVISION_V1 = 'gray-delta-64x128-4bpp-low-nibble-first-v1' as const;
export const VIDEO_MOTION_LUT_WIDTH_V1 = 64;
export const VIDEO_MOTION_LUT_HEIGHT_V1 = 128;
export const VIDEO_MOTION_LUT_BIT_DEPTH_V1 = 4;
export const VIDEO_MOTION_LUT_HEADER_BYTES_V1 = 16;
export const VIDEO_MOTION_LUT_PIXEL_BYTES_V1 = VIDEO_MOTION_LUT_WIDTH_V1 * VIDEO_MOTION_LUT_HEIGHT_V1 / 2;
export const VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1 = VIDEO_MOTION_LUT_HEADER_BYTES_V1 + VIDEO_MOTION_LUT_PIXEL_BYTES_V1;
/** Canonical display lookup: 16 evenly spaced grayscale values for the packed 4-bit motion index. */
export const VIDEO_MOTION_GRAYSCALE_LUT_V1 = Object.freeze([
	0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255,
] as const);

const MAGIC = new Uint8Array([0x41, 0x54, 0x4c, 0x4d, 0x4f, 0x54, 0x31, 0x00]); // "ATLMOT1\0"

export const videoMotionLutManifestV1Schema = z.object({
	schema: z.literal(VIDEO_MOTION_LUT_SCHEMA_V1),
	processingRevision: z.literal(VIDEO_MOTION_LUT_PROCESSING_REVISION_V1),
	evidenceId: z.string().uuid(),
	sourceRevision: z.string().min(1),
	analysisRevision: z.string().min(1),
	frameIndex: z.number().int().nonnegative(),
	width: z.literal(VIDEO_MOTION_LUT_WIDTH_V1),
	height: z.literal(VIDEO_MOTION_LUT_HEIGHT_V1),
	bitDepth: z.literal(VIDEO_MOTION_LUT_BIT_DEPTH_V1),
	packing: z.literal('row-major-even-pixel-low-nibble-first'),
	previousTimestampMs: z.number().int().nonnegative().nullable(),
	timestampMs: z.number().int().nonnegative(),
	motionScore: z.number().min(0).max(1),
	artifact: z.object({
		bucket: z.string().min(1),
		objectKey: z.string().min(1),
		sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		byteLength: z.literal(VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1),
		sourceRevision: z.string().min(1),
		analysisRevision: z.string().min(1),
	}),
});

export type VideoMotionLutManifestV1 = z.infer<typeof videoMotionLutManifestV1Schema>;

/** Separate, denser motion-only sample. It is not a detector/keyframe index. */
export const videoMotionSampleManifestV1Schema = z.object({
	schema: z.literal('atlas.video-motion-sample.v1'),
	processingRevision: z.literal(VIDEO_MOTION_LUT_PROCESSING_REVISION_V1),
	evidenceId: z.string().uuid(),
	sourceRevision: z.string().min(1),
	analysisRevision: z.string().min(1),
	sampleIndex: z.number().int().nonnegative(),
	width: z.literal(VIDEO_MOTION_LUT_WIDTH_V1),
	height: z.literal(VIDEO_MOTION_LUT_HEIGHT_V1),
	bitDepth: z.literal(VIDEO_MOTION_LUT_BIT_DEPTH_V1),
	packing: z.literal('row-major-even-pixel-low-nibble-first'),
	reviewState: z.literal('UNREVIEWED_PIXEL_CHANGE_CUE'),
	previousTimestampMs: z.number().int().nonnegative().nullable(),
	timestampMs: z.number().int().nonnegative(),
	motionScore: z.number().min(0).max(1),
	artifact: z.object({
		bucket: z.string().min(1),
		objectKey: z.string().min(1),
		sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		byteLength: z.literal(VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1),
		sourceRevision: z.string().min(1),
		analysisRevision: z.string().min(1),
	}),
});

export type VideoMotionSampleManifestV1 = z.infer<typeof videoMotionSampleManifestV1Schema>;

/** A dense motion sample must reference the immediately preceding valid sample. */
export function hasValidMotionSampleComparisonV1(
	sample: VideoMotionSampleManifestV1,
	samples: readonly unknown[],
): boolean {
	if (sample.sampleIndex === 0) return sample.previousTimestampMs === null && sample.motionScore === 0;
	if (sample.previousTimestampMs === null || sample.previousTimestampMs > sample.timestampMs) return false;
	const previous = samples[sample.sampleIndex - 1];
	if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return false;
	const record = previous as Record<string, unknown>;
	return record.sampleIndex === sample.sampleIndex - 1 && record.timestampMs === sample.previousTimestampMs &&
		record.sourceRevision === sample.sourceRevision && record.analysisRevision === sample.analysisRevision;
}

/** Validate the timestamp relationship recorded by the sequential frame sampler. */
export function hasValidMotionComparisonV1(tile: VideoMotionLutManifestV1, frames: readonly unknown[]): boolean {
	if (tile.previousTimestampMs === null) return tile.motionScore === 0;
	if (tile.frameIndex < 1 || tile.previousTimestampMs > tile.timestampMs) return false;
	const previous = frames[tile.frameIndex - 1];
	if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return false;
	const frame = previous as Record<string, unknown>;
	return frame.frameIndex === tile.frameIndex - 1 && frame.timestampMs === tile.previousTimestampMs
		&& frame.sourceRevision === tile.sourceRevision && frame.analysisRevision === tile.analysisRevision;
}

export interface EncodedVideoMotionLutV1 {
	readonly bytes: Uint8Array;
	readonly motionScore: number;
	readonly changedPixels: number;
}

export interface PackedMotionLodV1 {
	readonly level: number;
	readonly width: number;
	readonly height: number;
	/** Row-major pixel indices, two 4-bit values per byte; even pixel is low nibble. */
	readonly data: Uint8Array;
}

/**
 * Encode absolute grayscale change as a fixed 64x128, 16-level tile.
 * `previousLuma === null` means the first sample and deliberately emits a zero tile.
 */
export function encodeVideoMotionLutV1(previousLuma: Uint8Array | null, currentLuma: Uint8Array): EncodedVideoMotionLutV1 {
	const pixelCount = VIDEO_MOTION_LUT_WIDTH_V1 * VIDEO_MOTION_LUT_HEIGHT_V1;
	if (currentLuma.byteLength !== pixelCount || (previousLuma && previousLuma.byteLength !== pixelCount)) {
		throw new RangeError(`Motion LUT input must contain exactly ${pixelCount} grayscale pixels.`);
	}
	const bytes = new Uint8Array(VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1);
	bytes.set(MAGIC, 0);
	const header = new DataView(bytes.buffer, bytes.byteOffset, VIDEO_MOTION_LUT_HEADER_BYTES_V1);
	header.setUint16(8, VIDEO_MOTION_LUT_WIDTH_V1, true);
	header.setUint16(10, VIDEO_MOTION_LUT_HEIGHT_V1, true);
	header.setUint8(12, VIDEO_MOTION_LUT_BIT_DEPTH_V1);
	header.setUint8(13, 0); // row-major, even pixel in low nibble
	header.setUint16(14, 0, true);

	let levelSum = 0;
	let changedPixels = 0;
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const delta = previousLuma ? Math.abs(currentLuma[pixel]! - previousLuma[pixel]!) : 0;
		const level = Math.min(15, delta >>> 4);
		levelSum += level;
		if (delta > 0) changedPixels += 1;
		const payloadIndex = VIDEO_MOTION_LUT_HEADER_BYTES_V1 + (pixel >>> 1);
		bytes[payloadIndex] = pixel & 1
			? bytes[payloadIndex]! | (level << 4)
			: bytes[payloadIndex]! | level;
	}
	return Object.freeze({
		bytes,
		motionScore: levelSum / (pixelCount * 15),
		changedPixels,
	});
}

/** Decode a checked tile to one 0..15 index per pixel for preview rendering. */
export function decodeVideoMotionLutIndicesV1(bytes: Uint8Array): Uint8Array {
	if (bytes.byteLength !== VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1) throw new RangeError('Invalid motion LUT artifact length.');
	for (let i = 0; i < MAGIC.length; i += 1) {
		if (bytes[i] !== MAGIC[i]) throw new RangeError('Invalid motion LUT magic.');
	}
	const header = new DataView(bytes.buffer, bytes.byteOffset, VIDEO_MOTION_LUT_HEADER_BYTES_V1);
	if (
		header.getUint16(8, true) !== VIDEO_MOTION_LUT_WIDTH_V1 ||
		header.getUint16(10, true) !== VIDEO_MOTION_LUT_HEIGHT_V1 ||
		header.getUint8(12) !== VIDEO_MOTION_LUT_BIT_DEPTH_V1 ||
		header.getUint8(13) !== 0 ||
		header.getUint16(14, true) !== 0
	) throw new RangeError('Unsupported motion LUT header.');

	const pixelCount = VIDEO_MOTION_LUT_WIDTH_V1 * VIDEO_MOTION_LUT_HEIGHT_V1;
	const indices = new Uint8Array(pixelCount);
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const packed = bytes[VIDEO_MOTION_LUT_HEADER_BYTES_V1 + (pixel >>> 1)]!;
		indices[pixel] = pixel & 1 ? packed >>> 4 : packed & 0x0f;
	}
	return indices;
}

/** Build stable max-pooled 4-bit display levels, ordered smallest to largest. */
export function buildPackedMotionLodsV1(indices: Uint8Array): PackedMotionLodV1[] {
	let width = VIDEO_MOTION_LUT_WIDTH_V1;
	let height = VIDEO_MOTION_LUT_HEIGHT_V1;
	if (indices.byteLength !== width * height || indices.some((value) => value > 15)) {
		throw new RangeError('Motion LOD input must contain 64x128 indices in the range 0..15.');
	}
	const levels: PackedMotionLodV1[] = [];
	let pixels = Uint8Array.from(indices);
	while (true) {
		const packed = new Uint8Array((width * height) / 2);
		for (let pixel = 0; pixel < pixels.length; pixel += 2) packed[pixel >>> 1] = pixels[pixel]! | (pixels[pixel + 1]! << 4);
		levels.push(Object.freeze({ level: levels.length, width, height, data: packed }));
		if (width <= 4 || height <= 8) break;
		const nextWidth = Math.max(4, width >>> 1);
		const nextHeight = Math.max(8, height >>> 1);
		const nextPixels = new Uint8Array(nextWidth * nextHeight);
		for (let y = 0; y < nextHeight; y += 1) {
			for (let x = 0; x < nextWidth; x += 1) {
				const sourceX = x * 2;
				const sourceY = y * 2;
				let max = 0;
				for (let dy = 0; dy < 2 && sourceY + dy < height; dy += 1) {
					for (let dx = 0; dx < 2 && sourceX + dx < width; dx += 1) max = Math.max(max, pixels[(sourceY + dy) * width + sourceX + dx]!);
				}
				nextPixels[y * nextWidth + x] = max;
			}
		}
		pixels = nextPixels;
		width = nextWidth;
		height = nextHeight;
	}
	return levels.reverse().map((level, index) => Object.freeze({ ...level, level: index }));
}

/** Choose the largest packed level that fits the physical display footprint without oversampling. */
export function selectPackedMotionLodV1(
	lods: readonly PackedMotionLodV1[],
	targetWidthPx: number,
	targetHeightPx: number,
): PackedMotionLodV1 {
	if (!Array.isArray(lods) || lods.length === 0) throw new RangeError('At least one packed motion LOD is required.');
	if (!Number.isFinite(targetWidthPx) || targetWidthPx <= 0 || !Number.isFinite(targetHeightPx) || targetHeightPx <= 0) {
		throw new RangeError('Motion LOD target dimensions must be positive finite pixel sizes.');
	}
	for (const lod of lods) {
		if (!Number.isSafeInteger(lod.level) || lod.level < 0 || !Number.isSafeInteger(lod.width) || lod.width < 2
			|| lod.width % 2 !== 0 || !Number.isSafeInteger(lod.height) || lod.height < 1
			|| lod.data.byteLength !== (lod.width * lod.height) / 2) {
			throw new RangeError('Packed motion LOD dimensions or payload are invalid.');
		}
	}
	const sorted = [...lods].sort((a, b) => a.width * a.height - b.width * b.height || a.level - b.level);
	const targetWidth = Math.floor(targetWidthPx);
	const targetHeight = Math.floor(targetHeightPx);
	const fitting = sorted.filter((lod) => lod.width <= targetWidth && lod.height <= targetHeight);
	// Below the smallest level, retain the minimum tile; above the largest, use the source level.
	return fitting[fitting.length - 1] ?? sorted[0]!;
}
