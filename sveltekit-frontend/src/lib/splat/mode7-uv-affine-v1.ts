import { z } from 'zod';

/**
 * Explicit 2D affine matrix for palette sampling in normalized Three.js UV space.
 * Order is row-major: [a, b, tx, c, d, ty]. This is visual metadata only; it
 * does not transform evidence/source-image coordinates or candidate identities.
 */
const coefficient = z.number().finite().min(-1_000_000).max(1_000_000);
export const mode7UvAffineV1Schema = z.tuple([
	coefficient, coefficient, coefficient,
	coefficient, coefficient, coefficient,
]);

export type Mode7UvAffineV1 = readonly [number, number, number, number, number, number];

export const IDENTITY_MODE7_UV_AFFINE_V1: Mode7UvAffineV1 = Object.freeze([1, 0, 0, 0, 1, 0]);

export function parseMode7UvAffineV1(value: unknown): Mode7UvAffineV1 {
	const parsed = mode7UvAffineV1Schema.parse(value);
	return [parsed[0], parsed[1], parsed[2], parsed[3], parsed[4], parsed[5]] as const;
}

/** Apply [a,b,tx,c,d,ty] to a point in normalized UV coordinates. */
export function transformMode7UvV1(
	u: number,
	v: number,
	affine: Mode7UvAffineV1 = IDENTITY_MODE7_UV_AFFINE_V1,
): readonly [number, number] {
	if (!Number.isFinite(u) || !Number.isFinite(v)) throw new RangeError('MODE7_UV_COORDINATE_INVALID');
	const [a, b, tx, c, d, ty] = parseMode7UvAffineV1(affine);
	const outU = a * u + b * v + tx;
	const outV = c * u + d * v + ty;
	if (!Number.isFinite(outU) || !Number.isFinite(outV)) throw new RangeError('MODE7_UV_TRANSFORM_OVERFLOW');
	return [outU, outV];
}
