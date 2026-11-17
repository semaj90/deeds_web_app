/**
 * Marker anchors (MARK-01): where a scene marker sits on evidence, not only where it floats.
 *
 * Two kinds, matching the scene_markers CHECK constraints:
 * - IMAGE_UV: normalized image coordinates in [0, 1] on a still image (evidence_id).
 * - MESH_SURFACE: a triangle of a stored mesh plus barycentric weights (sums to 1).
 *
 * Anchors are DRAFT when written. Review status comes only from a server-side review route,
 * never from the client. Video UVs need a frame reference (MARK-03) and are not accepted here.
 */
import { z } from 'zod';

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const sha256Revision = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'must be sha256:<64 lowercase hex>');

export const imageUvAnchorSchema = z
	.object({
		kind: z.literal('IMAGE_UV'),
		u: finite.min(0).max(1),
		v: finite.min(0).max(1),
	})
	.strict();

export const meshSurfaceAnchorSchema = z
	.object({
		kind: z.literal('MESH_SURFACE'),
		meshId: z.string().min(1).max(200),
		triangleIndex: z.number().int().nonnegative(),
		barycentric: z
			.tuple([finite.min(0), finite.min(0), finite.min(0)])
			.refine((b) => Math.abs(b[0] + b[1] + b[2] - 1) <= 1e-6, 'barycentric weights must sum to 1'),
	})
	.strict();

export const markerAnchorSchema = z.discriminatedUnion('kind', [imageUvAnchorSchema, meshSurfaceAnchorSchema]);
export type MarkerAnchor = z.infer<typeof markerAnchorSchema>;

/** Provenance the anchor was placed against. Both optional; recorded when present. */
export const anchorProvenanceSchema = z
	.object({
		sourceRevision: sha256Revision.nullable().default(null),
		sourceSha256: sha256Revision.nullable().default(null),
	})
	.strict();

/** Row values for the scene_markers anchor columns. Null when no anchor was given. */
export function anchorRowValues(anchor: MarkerAnchor | null | undefined) {
	if (!anchor) {
		return { anchorKind: null, anchorU: null, anchorV: null, meshId: null, triangleIndex: null, barycentric: null, anchorStatus: 'DRAFT' as const };
	}
	if (anchor.kind === 'IMAGE_UV') {
		return { anchorKind: 'IMAGE_UV' as const, anchorU: anchor.u, anchorV: anchor.v, meshId: null, triangleIndex: null, barycentric: null, anchorStatus: 'DRAFT' as const };
	}
	return {
		anchorKind: 'MESH_SURFACE' as const,
		anchorU: null,
		anchorV: null,
		meshId: anchor.meshId,
		triangleIndex: anchor.triangleIndex,
		barycentric: anchor.barycentric,
		anchorStatus: 'DRAFT' as const,
	};
}
