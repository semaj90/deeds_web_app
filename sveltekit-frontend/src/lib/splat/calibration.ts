/**
 * Splat calibration: a similarity transform (uniform scale + yaw about Y + translation)
 * that maps Gaussian-splat coordinates (unitless) into a calibrated scene in meters.
 *
 * Engine-agnostic. No Three/Babylon/PlayCanvas imports. Adapters live beside this file.
 *
 * Convention: p_world = s * Ry(yaw) * p_splat + t, with Ry matching Three.js Matrix4.makeRotationY.
 */
import { z } from 'zod';

export type Vec3 = readonly [number, number, number];

export interface SimilarityTransform {
	scale: number;
	yawRad: number;
	translation: Vec3;
}

export interface CalibrationAnchor {
	id: string;
	/** Position in splat coordinates (unitless). */
	splat: Vec3;
	/** Measured position in the calibrated scene, meters. */
	worldM: Vec3;
}

const vec3Schema = z
	.tuple([z.number(), z.number(), z.number()])
	.transform((v): Vec3 => [v[0], v[1], v[2]]);

export const calibrationRequestSchema = z.object({
	splat: z.object({
		format: z.literal('spz'),
		sha256: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 must be 64 lowercase hex chars'),
		uri: z.url().optional()
	}),
	anchors: z
		.array(
			z.object({
				id: z.string().min(1).max(100),
				splat: vec3Schema,
				worldM: vec3Schema
			})
		)
		.min(2)
		.max(16),
	toleranceM: z.number().positive().max(0.5).default(0.02)
});

export type CalibrationRequest = z.infer<typeof calibrationRequestSchema>;

const EPS = 1e-9;

function dist3(a: Vec3, b: Vec3): number {
	return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** Apply Ry(yaw) to a vector, matching Three.js makeRotationY. */
function rotateY(p: Vec3, yaw: number): Vec3 {
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
}

/** Apply the transform to a splat-space point, returning meters. */
export function applyTransform(t: SimilarityTransform, p: Vec3): Vec3 {
	const r = rotateY(p, t.yawRad);
	return [
		t.scale * r[0] + t.translation[0],
		t.scale * r[1] + t.translation[1],
		t.scale * r[2] + t.translation[2]
	];
}

/**
 * Solve the similarity transform from two anchors.
 * Scale comes from the 3D distance ratio. Yaw comes from the XZ direction.
 * Translation places anchor A exactly on its measured position.
 * Throws if the anchors coincide, since the transform is then undefined.
 */
export function solveTwoAnchorTransform(a: CalibrationAnchor, b: CalibrationAnchor): SimilarityTransform {
	const splatDist = dist3(a.splat, b.splat);
	const worldDist = dist3(a.worldM, b.worldM);
	if (splatDist < EPS) throw new Error('CALIBRATION_ANCHORS_COINCIDE_IN_SPLAT_SPACE');
	if (worldDist < EPS) throw new Error('CALIBRATION_ANCHORS_COINCIDE_IN_WORLD_SPACE');

	const scale = worldDist / splatDist;

	const sx = b.splat[0] - a.splat[0];
	const sz = b.splat[2] - a.splat[2];
	const tx = b.worldM[0] - a.worldM[0];
	const tz = b.worldM[2] - a.worldM[2];
	const splatXZ = Math.hypot(sx, sz);
	const worldXZ = Math.hypot(tx, tz);
	if (splatXZ < EPS || worldXZ < EPS) {
		throw new Error('CALIBRATION_ANCHORS_VERTICAL_UNSUPPORTED');
	}

	// Rotation about Y that carries the splat XZ direction onto the world XZ direction.
	const yawRad = Math.atan2(sz, sx) - Math.atan2(tz, tx);

	const rotatedA = rotateY(a.splat, yawRad);
	const translation: Vec3 = [
		a.worldM[0] - scale * rotatedA[0],
		a.worldM[1] - scale * rotatedA[1],
		a.worldM[2] - scale * rotatedA[2]
	];

	return { scale, yawRad, translation };
}

export interface CalibrationResult {
	transform: SimilarityTransform;
	residualsM: Array<{ id: string; residualM: number }>;
	maxResidualM: number;
	toleranceM: number;
	pass: boolean;
}

/**
 * Solve from the first two anchors, then measure residuals on every anchor.
 * Anchors 0 and 1 are fitted exactly, so their residuals are ~0. Extra anchors are independent checks.
 */
export function calibrate(anchors: readonly CalibrationAnchor[], toleranceM: number): CalibrationResult {
	if (anchors.length < 2) throw new Error('CALIBRATION_NEEDS_TWO_ANCHORS');
	const transform = solveTwoAnchorTransform(anchors[0], anchors[1]);
	const residualsM = anchors.map((anc) => ({
		id: anc.id,
		residualM: dist3(applyTransform(transform, anc.splat), anc.worldM)
	}));
	const maxResidualM = Math.max(...residualsM.map((r) => r.residualM));
	return {
		transform,
		residualsM,
		maxResidualM,
		toleranceM,
		pass: maxResidualM <= toleranceM
	};
}

/**
 * Marker size is a real-world quantity. Diameter is in meters of the physical object.
 * Do not derive it from screen pixels. Screen-constant size is only for UI handles.
 */
export function markerDiameterM(realObjectSizeM: number): number {
	if (!Number.isFinite(realObjectSizeM) || realObjectSizeM <= 0) {
		throw new Error('MARKER_SIZE_MUST_BE_POSITIVE_METERS');
	}
	return realObjectSizeM;
}
