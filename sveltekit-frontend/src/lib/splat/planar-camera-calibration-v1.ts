import { z } from 'zod';

/**
 * Candidate image-to-floor homography for a fixed camera and one measured plane.
 * This does not recover height, camera motion, or 3D body pose. Four anchors fit
 * the transform; independent validation anchors are needed to qualify it.
 */
export const PLANAR_CAMERA_CALIBRATION_SCHEMA_V1 = 'atlas.planar-camera-calibration.v1' as const;

const point2Schema = z.tuple([z.number().finite(), z.number().finite()]);
const anchorSchema = z.object({
	id: z.string().trim().min(1).max(100),
	imagePx: point2Schema,
	planeM: point2Schema,
}).strict();

export const planarCameraCalibrationInputV1Schema = z.object({
	evidenceId: z.string().uuid(),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	analysisRevision: z.string().trim().min(1).max(256),
	calibrationFrameIndex: z.number().int().min(0).max(0xffffffff),
	calibrationFramePtsUs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	frameWidth: z.number().int().min(1).max(32768),
	frameHeight: z.number().int().min(1).max(32768),
	operatorConfirmedFixedCamera: z.literal(true),
	fitAnchors: z.array(anchorSchema).length(4),
	validationAnchors: z.array(anchorSchema).max(32).default([]),
	toleranceMeters: z.number().finite().positive().max(1).default(0.05),
}).strict();

const residualSchema = z.object({ anchorId: z.string().min(1).max(100), residualMeters: z.number().finite().nonnegative() }).strict();
const matrixSchema = z.tuple([
	z.number().finite(), z.number().finite(), z.number().finite(),
	z.number().finite(), z.number().finite(), z.number().finite(),
	z.number().finite(), z.number().finite(), z.number().finite(),
]);
export const planarCameraCalibrationV1Schema = z.object({
	schema: z.literal(PLANAR_CAMERA_CALIBRATION_SCHEMA_V1),
	evidenceId: z.string().uuid(),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	analysisRevision: z.string().trim().min(1).max(256),
	calibrationFrameIndex: z.number().int().min(0).max(0xffffffff),
	calibrationFramePtsUs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	frameWidth: z.number().int().min(1).max(32768),
	frameHeight: z.number().int().min(1).max(32768),
	plane: z.literal('operator-defined-ground-plane'),
	operatorConfirmedFixedCamera: z.literal(true),
	imageToPlaneHomography: matrixSchema,
	fitResidualsMeters: z.array(residualSchema).length(4),
	validationResidualsMeters: z.array(residualSchema).min(4).max(32),
	toleranceMeters: z.number().finite().positive().max(1),
	validationStatus: z.literal('CHECKS_PASSED'),
	status: z.literal('UNREVIEWED_CALIBRATION_PROPOSAL'),
	semantics: z.literal('image_to_measured_plane_only_no_height_or_camera_motion_compensation'),
}).strict();

export type PlanarCalibrationAnchorV1 = z.infer<typeof anchorSchema>;
export type PlanarCameraCalibrationInputV1 = z.input<typeof planarCameraCalibrationInputV1Schema>;
export type PlanarCameraCalibrationV1 = Omit<z.infer<typeof planarCameraCalibrationV1Schema>, 'validationStatus' | 'imageToPlaneHomography'> & {
	validationStatus: 'FIT_ONLY_UNVERIFIED' | 'CHECKS_PASSED' | 'CHECKS_FAILED';
	imageToPlaneHomography: Matrix3;
};

type Point = readonly [number, number];
type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

const EPS = 1e-10;

function normalize(points: readonly Point[]): { transform: Matrix3; inverse: Matrix3; points: Point[] } {
	const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length;
	const cy = points.reduce((sum, point) => sum + point[1], 0) / points.length;
	const meanDistance = points.reduce((sum, point) => sum + Math.hypot(point[0] - cx, point[1] - cy), 0) / points.length;
	if (!Number.isFinite(meanDistance) || meanDistance < EPS) throw new RangeError('PLANAR_CALIBRATION_ANCHORS_DEGENERATE');
	const scale = Math.SQRT2 / meanDistance;
	return {
		transform: [scale, 0, -scale * cx, 0, scale, -scale * cy, 0, 0, 1],
		inverse: [1 / scale, 0, cx, 0, 1 / scale, cy, 0, 0, 1],
		points: points.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale]),
	};
}

function multiply3(a: Matrix3, b: Matrix3): Matrix3 {
	const out = new Array<number>(9).fill(0);
	for (let row = 0; row < 3; row += 1) {
		for (let col = 0; col < 3; col += 1) {
			for (let k = 0; k < 3; k += 1) out[row * 3 + col]! += a[row * 3 + k]! * b[k * 3 + col]!;
		}
	}
	return out as unknown as Matrix3;
}

function solve8(rows: number[][]): number[] {
	const a = rows.map((row) => [...row]);
	let largestPivot = 0;
	let smallestPivot = Number.POSITIVE_INFINITY;
	for (let col = 0; col < 8; col += 1) {
		let pivotRow = col;
		for (let row = col + 1; row < 8; row += 1) {
			if (Math.abs(a[row]![col]!) > Math.abs(a[pivotRow]![col]!)) pivotRow = row;
		}
		const pivot = Math.abs(a[pivotRow]![col]!);
		if (!Number.isFinite(pivot) || pivot < EPS) throw new RangeError('PLANAR_CALIBRATION_ANCHORS_DEGENERATE');
		largestPivot = Math.max(largestPivot, pivot);
		smallestPivot = Math.min(smallestPivot, pivot);
		[a[col], a[pivotRow]] = [a[pivotRow]!, a[col]!];
		const divisor = a[col]![col]!;
		for (let k = col; k <= 8; k += 1) a[col]![k]! /= divisor;
		for (let row = 0; row < 8; row += 1) {
			if (row === col) continue;
			const factor = a[row]![col]!;
			for (let k = col; k <= 8; k += 1) a[row]![k]! -= factor * a[col]![k]!;
		}
	}
	if (smallestPivot / largestPivot < 1e-9) throw new RangeError('PLANAR_CALIBRATION_ANCHORS_ILL_CONDITIONED');
	return a.map((row) => row[8]!);
}

function mapWithMatrix(matrix: Matrix3, point: Point): Point {
	const denominator = matrix[6] * point[0] + matrix[7] * point[1] + matrix[8];
	if (!Number.isFinite(denominator) || Math.abs(denominator) < EPS) throw new RangeError('PLANAR_CALIBRATION_POINT_AT_INFINITY');
	const x = (matrix[0] * point[0] + matrix[1] * point[1] + matrix[2]) / denominator;
	const y = (matrix[3] * point[0] + matrix[4] * point[1] + matrix[5]) / denominator;
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('PLANAR_CALIBRATION_PROJECTION_INVALID');
	return [x, y];
}

function rejectCollinearTriples(points: readonly Point[]): void {
	for (let a = 0; a < 4; a += 1) for (let b = a + 1; b < 4; b += 1) for (let c = b + 1; c < 4; c += 1) {
		const p = points[a]!;
		const q = points[b]!;
		const r = points[c]!;
		const area2 = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
		if (Math.abs(area2) < 1e-7) throw new RangeError('PLANAR_CALIBRATION_ANCHORS_DEGENERATE');
	}
}

function solveImageToPlane(fitAnchors: readonly PlanarCalibrationAnchorV1[]): Matrix3 {
	const image = normalize(fitAnchors.map((anchor) => [anchor.imagePx[0]!, anchor.imagePx[1]!] as Point));
	const plane = normalize(fitAnchors.map((anchor) => [anchor.planeM[0]!, anchor.planeM[1]!] as Point));
	rejectCollinearTriples(image.points);
	rejectCollinearTriples(plane.points);
	const rows: number[][] = [];
	for (let index = 0; index < 4; index += 1) {
		const [u, v] = image.points[index]!;
		const [x, y] = plane.points[index]!;
		rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
		rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
	}
	const coefficients = solve8(rows);
	const normalizedMatrix = [...coefficients, 1] as unknown as Matrix3;
	const denormalized = multiply3(plane.inverse, multiply3(normalizedMatrix, image.transform));
	const maxAbs = Math.max(...denormalized.map(Math.abs));
	if (!Number.isFinite(maxAbs) || maxAbs < EPS) throw new RangeError('PLANAR_CALIBRATION_TRANSFORM_INVALID');
	return denormalized.map((value) => value / maxAbs) as unknown as Matrix3;
}

export function createPlanarCameraCalibrationV1(input: unknown): PlanarCameraCalibrationV1 {
	const parsed = planarCameraCalibrationInputV1Schema.parse(input);
	const anchors = [...parsed.fitAnchors, ...parsed.validationAnchors];
	const ids = new Set<string>();
	for (const anchor of anchors) {
		if (ids.has(anchor.id)) throw new RangeError('PLANAR_CALIBRATION_ANCHOR_IDS_MUST_BE_UNIQUE');
		ids.add(anchor.id);
		const [x, y] = anchor.imagePx;
		if (x < 0 || x > parsed.frameWidth || y < 0 || y > parsed.frameHeight) {
			throw new RangeError('PLANAR_CALIBRATION_IMAGE_ANCHOR_OUT_OF_BOUNDS');
		}
	}
	const matrix = solveImageToPlane(parsed.fitAnchors);
	const residuals = (items: readonly PlanarCalibrationAnchorV1[]) => items.map((anchor) => {
		const mapped = mapWithMatrix(matrix, [anchor.imagePx[0]!, anchor.imagePx[1]!] as Point);
		return { anchorId: anchor.id, residualMeters: Math.hypot(mapped[0] - anchor.planeM[0], mapped[1] - anchor.planeM[1]) };
	});
	const fitResidualsMeters = residuals(parsed.fitAnchors);
	const validationResidualsMeters = residuals(parsed.validationAnchors);
	const validationStatus = validationResidualsMeters.length < 4
		? 'FIT_ONLY_UNVERIFIED'
		: validationResidualsMeters.every((item) => item.residualMeters <= parsed.toleranceMeters)
			? 'CHECKS_PASSED'
			: 'CHECKS_FAILED';
	return {
		schema: PLANAR_CAMERA_CALIBRATION_SCHEMA_V1,
		evidenceId: parsed.evidenceId,
		sourceRevision: parsed.sourceRevision,
		analysisRevision: parsed.analysisRevision,
		calibrationFrameIndex: parsed.calibrationFrameIndex,
		calibrationFramePtsUs: parsed.calibrationFramePtsUs,
		frameWidth: parsed.frameWidth,
		frameHeight: parsed.frameHeight,
		plane: 'operator-defined-ground-plane',
		operatorConfirmedFixedCamera: true,
		imageToPlaneHomography: matrix,
		fitResidualsMeters,
		validationResidualsMeters,
		toleranceMeters: parsed.toleranceMeters,
		validationStatus,
		status: 'UNREVIEWED_CALIBRATION_PROPOSAL',
		semantics: 'image_to_measured_plane_only_no_height_or_camera_motion_compensation',
	};
}

/** Projects one source-frame point onto the calibrated plane, keeping output proposal-only. */
export function projectImagePointToPlaneV1(
	calibration: PlanarCameraCalibrationV1,
	input: { evidenceId: string; sourceRevision: string; analysisRevision: string; frameWidth: number; frameHeight: number; imagePx: Point },
): { planeM: Point; status: 'UNREVIEWED_GROUND_PLANE_PROJECTION'; semantics: PlanarCameraCalibrationV1['semantics'] } {
	if (calibration.validationStatus !== 'CHECKS_PASSED') {
		throw new RangeError('PLANAR_CALIBRATION_REQUIRES_PASSED_INDEPENDENT_CHECKS');
	}
	if (input.evidenceId !== calibration.evidenceId || input.sourceRevision !== calibration.sourceRevision
		|| input.analysisRevision !== calibration.analysisRevision || input.frameWidth !== calibration.frameWidth
		|| input.frameHeight !== calibration.frameHeight) {
		throw new RangeError('PLANAR_CALIBRATION_SOURCE_OR_FRAME_MISMATCH');
	}
	if (input.imagePx[0] < 0 || input.imagePx[0] > input.frameWidth || input.imagePx[1] < 0 || input.imagePx[1] > input.frameHeight) {
		throw new RangeError('PLANAR_CALIBRATION_IMAGE_POINT_OUT_OF_BOUNDS');
	}
	return {
		planeM: mapWithMatrix(calibration.imageToPlaneHomography, input.imagePx),
		status: 'UNREVIEWED_GROUND_PLANE_PROJECTION',
		semantics: calibration.semantics,
	};
}
