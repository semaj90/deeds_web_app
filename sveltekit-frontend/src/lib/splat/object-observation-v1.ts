/**
 * Object observation contract (v1): one detected object in one frame of one source.
 *
 * Image coordinates (pixels) are never world coordinates. A world position is only allowed when a
 * calibration id is present. Relative (monocular) depth orders objects front-to-back; it does not
 * give metres, so it cannot produce a world position on its own.
 *
 * Pure module: no I/O, no database, no Three.js import.
 */
import { z } from 'zod';

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const OBSERVATION_STATUS_V1 = ['observed', 'estimated', 'reviewed'] as const;
export const OBSERVATION_COORDINATE_FRAME_V1 = ['image', 'camera', 'world'] as const;
export const OBSERVATION_DEPTH_TYPE_V1 = ['relative_monocular', 'metric'] as const;

export const objectObservationSchemaV1 = z
	.object({
		observationId: z.string().uuid(),
		evidenceId: z.string().uuid(),
		sourceSha256: sha256Schema,
		framePtsMs: z.number().int().nonnegative(),
		imageWidth: z.number().int().positive(),
		imageHeight: z.number().int().positive(),
		classLabel: z.string().min(1).max(64),
		detectionConfidence: z.number().min(0).max(1),
		bboxXYXY: z.tuple([z.number(), z.number(), z.number(), z.number()]),
		maskAssetId: z.string().min(1).optional(),
		depthAssetId: z.string().min(1).optional(),
		depthType: z.enum(OBSERVATION_DEPTH_TYPE_V1).nullable(),
		cameraCalibrationId: z.string().min(1).optional(),
		worldPosition: z.tuple([z.number(), z.number(), z.number()]).optional(),
		coordinateFrame: z.enum(OBSERVATION_COORDINATE_FRAME_V1),
		status: z.enum(OBSERVATION_STATUS_V1)
	})
	.strict()
	.superRefine((o, ctx) => {
		const [x0, y0, x1, y1] = o.bboxXYXY;
		if (!(0 <= x0 && x0 < x1 && x1 <= o.imageWidth && 0 <= y0 && y0 < y1 && y1 <= o.imageHeight)) {
			ctx.addIssue({ code: 'custom', path: ['bboxXYXY'], message: 'BBOX_OUTSIDE_IMAGE_OR_DEGENERATE' });
		}
		if (o.worldPosition && !o.cameraCalibrationId) {
			ctx.addIssue({ code: 'custom', path: ['worldPosition'], message: 'WORLD_POSITION_REQUIRES_CALIBRATION' });
		}
		if (o.coordinateFrame === 'world' && !o.worldPosition) {
			ctx.addIssue({ code: 'custom', path: ['coordinateFrame'], message: 'WORLD_FRAME_REQUIRES_WORLD_POSITION' });
		}
		if (o.coordinateFrame === 'world' && !o.cameraCalibrationId) {
			ctx.addIssue({ code: 'custom', path: ['coordinateFrame'], message: 'WORLD_FRAME_REQUIRES_CALIBRATION' });
		}
		if (o.depthType === 'relative_monocular' && o.worldPosition && o.status === 'observed') {
			ctx.addIssue({ code: 'custom', path: ['status'], message: 'RELATIVE_DEPTH_WORLD_POSITION_MUST_BE_ESTIMATED' });
		}
		if (o.status === 'reviewed' && !o.cameraCalibrationId && o.coordinateFrame !== 'image') {
			ctx.addIssue({ code: 'custom', path: ['status'], message: 'REVIEWED_NON_IMAGE_FRAME_REQUIRES_CALIBRATION' });
		}
	});

export type ObjectObservationV1 = z.infer<typeof objectObservationSchemaV1>;

/** Centre and size of the box in pixels. Image space only. */
export function bboxCentrePx(o: Pick<ObjectObservationV1, 'bboxXYXY'>): [number, number] {
	const [x0, y0, x1, y1] = o.bboxXYXY;
	return [(x0 + x1) / 2, (y0 + y1) / 2];
}

export function bboxSizePx(o: Pick<ObjectObservationV1, 'bboxXYXY'>): [number, number] {
	const [x0, y0, x1, y1] = o.bboxXYXY;
	return [x1 - x0, y1 - y0];
}

/**
 * Median relative depth inside the box. Input is a row-major depth raster of the same size as the
 * image. The result is an ordering key only: it has no units. Use it to sort objects front-to-back.
 */
export function medianRelativeDepthInBox(
	depth: Float32Array,
	imageWidth: number,
	imageHeight: number,
	bboxXYXY: [number, number, number, number]
): number {
	if (depth.length !== imageWidth * imageHeight) throw new Error('DEPTH_RASTER_SIZE_MISMATCH');
	const [x0, y0, x1, y1] = bboxXYXY.map((v) => Math.floor(v)) as [number, number, number, number];
	const samples: number[] = [];
	for (let y = Math.max(0, y0); y < Math.min(imageHeight, y1); y++) {
		for (let x = Math.max(0, x0); x < Math.min(imageWidth, x1); x++) {
			const v = depth[y * imageWidth + x];
			if (Number.isFinite(v)) samples.push(v);
		}
	}
	if (samples.length === 0) throw new Error('DEPTH_BOX_HAS_NO_FINITE_SAMPLES');
	samples.sort((a, b) => a - b);
	const mid = samples.length >> 1;
	return samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
}

/**
 * Illustrative placeholder size in metres. This is NOT a measurement. The caller must supply the
 * metres-per-pixel scale explicitly; there is no default, so no scale can be invented silently.
 */
export function illustrativeSizeMetres(
	o: Pick<ObjectObservationV1, 'bboxXYXY'>,
	metresPerPixel: number
): { widthM: number; heightM: number; provenance: 'ILLUSTRATIVE_FROM_ASSUMED_SCALE' } {
	if (!(metresPerPixel > 0) || !Number.isFinite(metresPerPixel)) {
		throw new Error('ILLUSTRATIVE_SCALE_REQUIRED');
	}
	const [w, h] = bboxSizePx(o);
	return { widthM: w * metresPerPixel, heightM: h * metresPerPixel, provenance: 'ILLUSTRATIVE_FROM_ASSUMED_SCALE' };
}
