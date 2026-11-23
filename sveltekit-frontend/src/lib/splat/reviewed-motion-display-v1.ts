/**
 * Phase 15.D2: reviewed movement coordinates stay independent of display quantisation.
 *
 * The reviewed plane coordinates are the evidence record. Retro or grid display
 * snapping produces a separate display array and never writes back into the reviewed
 * points, so a display change cannot alter reviewed coordinates.
 */
export const REVIEWED_MOTION_DISPLAY_REVISION_V1 = 'atlas-reviewed-motion-display-v1' as const;

export interface ReviewedPlanePointLikeV1 {
	readonly frameIndex: number;
	readonly planeM: readonly [number, number];
}

export interface DisplaySnapOptionsV1 {
	/** Grid cell size in metres for display snapping. Must be finite and > 0. */
	readonly cellM: number;
}

export interface ReviewedMotionDisplayV1<T extends ReviewedPlanePointLikeV1> {
	readonly revision: typeof REVIEWED_MOTION_DISPLAY_REVISION_V1;
	/** The input points, frozen. Never modified by display options. */
	readonly reviewed: readonly Readonly<T>[];
	/** Display-only positions, one per reviewed point, in the same order. */
	readonly display: readonly { frameIndex: number; planeM: [number, number] }[];
}

export function buildReviewedMotionDisplayV1<T extends ReviewedPlanePointLikeV1>(
	points: readonly T[],
	options: DisplaySnapOptionsV1
): ReviewedMotionDisplayV1<T> {
	if (!Number.isFinite(options.cellM) || options.cellM <= 0) {
		throw new RangeError('REVIEWED_MOTION_DISPLAY_CELL_INVALID');
	}
	const reviewed = points.map((p) => Object.freeze({ ...p, planeM: Object.freeze([p.planeM[0], p.planeM[1]]) as unknown as readonly [number, number] }) as Readonly<T>);
	const display = points.map((p) => ({
		frameIndex: p.frameIndex,
		planeM: [snap(p.planeM[0], options.cellM), snap(p.planeM[1], options.cellM)] as [number, number],
	}));
	return Object.freeze({
		revision: REVIEWED_MOTION_DISPLAY_REVISION_V1,
		reviewed: Object.freeze(reviewed),
		display: Object.freeze(display),
	});
}

function snap(value: number, cell: number): number {
	return Math.round(value / cell) * cell;
}
