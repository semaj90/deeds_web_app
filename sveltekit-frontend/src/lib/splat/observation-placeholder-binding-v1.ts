/**
 * Binds one validated ObjectObservation to an ILLUSTRATIVE placeholder proxy.
 *
 * Rules:
 * - The metres-per-pixel scale is required. No default: an unscaled placeholder is refused.
 * - Output position is CAMERA-FRAME and illustrative. It is never a world position.
 * - Vertical placement (y) is null unless a ground-contact point is supplied. A box centre is not
 *   a ground point.
 * - Relative depth only orders objects; when a depth span is supplied, it offsets z within that span.
 * - Every result carries provenance and the evidence reference. Nothing here is evidence.
 *
 * Pure module.
 */
import { bboxCentrePx, illustrativeSizeMetres, type ObjectObservationV1 } from './object-observation-v1';

/** Shared plan vocabulary: observed | estimated | illustrative | reviewed. A placeholder is always illustrative. */
export const PLACEHOLDER_BINDING_PROVENANCE_V1 = 'illustrative' as const;
export const PLACEHOLDER_PRIMITIVE_ID_V1 = 'hexagonal_prism_v1' as const;

export type PlaceholderBindingOptionsV1 = {
	metresPerPixel: number;
	/** Pixel y of an annotated ground-contact point (e.g. a visible foot). Omit when not reviewed. */
	groundContactPxY?: number;
	/** Depth span in metres for relative z offset. Omit to keep z = 0. Illustrative only. */
	depthSpanM?: number;
	/** Median relative depth of the object and the min/max of the frame's depth raster. */
	relativeDepth?: { value: number; min: number; max: number };
};

export type PlaceholderBindingV1 = {
	provenance: typeof PLACEHOLDER_BINDING_PROVENANCE_V1;
	observationId: string;
	evidenceId: string;
	primitiveId: typeof PLACEHOLDER_PRIMITIVE_ID_V1;
	shape: 'hexagonal_prism';
	radiusM: number;
	depthM: number;
	position: { frame: 'camera_illustrative'; xM: number; yM: number | null; zM: number };
	alignment: 'GROUND_CONTACT_ANNOTATED' | 'NOT_GROUNDED';
	evidenceRef: { sourceSha256: string; framePtsMs: number; classLabel: string; bboxXYXY: [number, number, number, number] };
	scale: { metresPerPixel: number; source: 'CALLER_SUPPLIED' };
};

const MIN_RADIUS_M = 0.05;
const MAX_RADIUS_M = 2;
const PROXY_DEPTH_M = 0.08;

export function bindObservationToPlaceholderV1(
	obs: ObjectObservationV1,
	opts: PlaceholderBindingOptionsV1
): PlaceholderBindingV1 {
	const size = illustrativeSizeMetres(obs, opts.metresPerPixel); // throws if scale invalid
	const [cx] = bboxCentrePx(obs);

	// Radius: half the smaller footprint dimension, clamped so a single bad box cannot dominate.
	const radiusRaw = Math.min(size.widthM, size.heightM) / 2;
	const radiusM = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, radiusRaw));

	// Camera-frame x/z from pixel centre relative to the image centre. Metres via the caller's scale.
	const xM = (cx - obs.imageWidth / 2) * opts.metresPerPixel;

	let yM: number | null = null;
	let alignment: PlaceholderBindingV1['alignment'] = 'NOT_GROUNDED';
	if (opts.groundContactPxY !== undefined) {
		if (!Number.isFinite(opts.groundContactPxY)) throw new Error('GROUND_CONTACT_PX_INVALID');
		yM = (obs.imageHeight / 2 - opts.groundContactPxY) * opts.metresPerPixel;
		alignment = 'GROUND_CONTACT_ANNOTATED';
	}

	let zM = 0;
	if (opts.depthSpanM !== undefined && opts.relativeDepth) {
		const { value, min, max } = opts.relativeDepth;
		const range = max - min;
		if (range > 0 && Number.isFinite(value)) {
			// Nearer objects (larger relative value in the monocular convention) sit closer to the camera.
			zM = ((value - min) / range - 0.5) * opts.depthSpanM;
		}
	}

	return {
		provenance: PLACEHOLDER_BINDING_PROVENANCE_V1,
		observationId: obs.observationId,
		evidenceId: obs.evidenceId,
		primitiveId: PLACEHOLDER_PRIMITIVE_ID_V1,
		shape: 'hexagonal_prism',
		radiusM,
		depthM: PROXY_DEPTH_M,
		position: { frame: 'camera_illustrative', xM, yM, zM },
		alignment,
		evidenceRef: {
			sourceSha256: obs.sourceSha256,
			framePtsMs: obs.framePtsMs,
			classLabel: obs.classLabel,
			bboxXYXY: [obs.bboxXYXY[0], obs.bboxXYXY[1], obs.bboxXYXY[2], obs.bboxXYXY[3]]
		},
		scale: { metresPerPixel: opts.metresPerPixel, source: 'CALLER_SUPPLIED' }
	};
}
