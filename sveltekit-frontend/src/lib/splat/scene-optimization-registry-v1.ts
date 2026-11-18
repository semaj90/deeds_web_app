/**
 * Versioned registry for placeholder-scene optimizations: tessellation tiers, culling policy,
 * shader profiles, and an authoring taxonomy for everyday placeholder objects.
 *
 * This is a rendering and authoring catalog. It is not a classifier, not evidence, and not a
 * source of object identity. Taxonomy entries describe what a placeholder is meant to look like;
 * they never describe what appears in a source image.
 */

import { SCENE_PRIMITIVE_KINDS_V1, type ScenePrimitiveKindV1 } from './scene-primitive-registry-v1.js';

export const SCENE_OPTIMIZATION_REGISTRY_REVISION_V1 = 'scene-optimization-registry-v1' as const;

// ---------------------------------------------------------------------------
// Tessellation tiers
// ---------------------------------------------------------------------------

export const TESSELLATION_TIERS_V1 = ['retro', 'balanced', 'detailed'] as const;
export type TessellationTierV1 = (typeof TESSELLATION_TIERS_V1)[number];

/** Radial and height segment counts per tier. Mirrors the primitive registry's detail levels. */
export const TESSELLATION_SEGMENTS_V1: Readonly<Record<TessellationTierV1, { radial: number; height: number; tube: number }>> = Object.freeze({
	retro: Object.freeze({ radial: 8, height: 6, tube: 6 }),
	balanced: Object.freeze({ radial: 16, height: 10, tube: 10 }),
	detailed: Object.freeze({ radial: 32, height: 20, tube: 12 })
});

/**
 * Polygon-prism triangle counts depend on how the caps are triangulated, so both are named:
 * - 'vertex-fan' (minimal, n-2 per cap): a hexagonal prism is 20 triangles. This matches the
 *   primitive registry's estimate of 20.
 * - 'center-fan' (n per cap, one centre vertex): a hexagonal prism is 24 triangles. The crime
 *   reconstruction proxy uses this method.
 * Neither count is wrong. An earlier note in this file said 20 was wrong; that was a mistake.
 */
export type CapTriangulationV1 = 'vertex-fan' | 'center-fan';

export function polygonPrismTriangleCountV1(sides: number, depth: number, cap: CapTriangulationV1): number {
	if (!Number.isInteger(sides) || sides < 3) throw new Error('A polygon needs at least three sides');
	const capTriangles = cap === 'vertex-fan' ? sides - 2 : sides;
	if (depth === 0) return capTriangles; // flat polygon: one cap only
	return 2 * capTriangles + 2 * sides; // two caps plus one quad (two triangles) per side
}

/**
 * Triangle counts for the placeholder shapes at a tier. The hexagon uses the minimal
 * vertex-fan count, matching the primitive registry's estimate.
 */
export function placeholderTriangleCountV1(kind: ScenePrimitiveKindV1, tier: TessellationTierV1): number {
	const { radial, height, tube } = TESSELLATION_SEGMENTS_V1[tier];
	switch (kind) {
		case 'box': return 12;
		case 'rectangle': return 2;
		case 'circle': return radial;
		case 'hexagon': return polygonPrismTriangleCountV1(6, 0.08, 'vertex-fan');
		case 'cone': return 2 * radial; // one side band plus one base fan, one height segment
		case 'cylinder': return 4 * radial; // side band plus two caps
		case 'sphere': return 2 * radial * (height - 1);
		case 'torus': return 2 * tube * (radial * 2); // radial = tube segments x tubular segments (2 x radial)
	}
}

// ---------------------------------------------------------------------------
// Culling policy
// ---------------------------------------------------------------------------

export const CULLING_MODES_V1 = ['none', 'backface', 'frustum', 'distance'] as const;
export type CullingModeV1 = (typeof CULLING_MODES_V1)[number];

/**
 * Culling is applied to placeholder geometry only. Evidence-grade meshes always render with
 * `none` so that no part of a source-derived mesh is hidden by an optimization.
 */
export const CULLING_POLICY_V1 = Object.freeze({
	placeholder: Object.freeze({ modes: ['backface', 'frustum', 'distance'] as const, maxDistanceMeters: 60 }),
	evidenceGrade: Object.freeze({ modes: ['none'] as const })
});

// ---------------------------------------------------------------------------
// Shader profiles
// ---------------------------------------------------------------------------

export const SHADER_PROFILES_V1 = ['flat', 'ps1-retro', 'mode-7'] as const;
export type ShaderProfileV1 = (typeof SHADER_PROFILES_V1)[number];

/**
 * `mode-7` is a placeholder-only floor look: an affine plane transform, so a flat ground plane
 * gets perspective-scaled rows. It is a shader concern only; geometry is unchanged. Not yet
 * implemented in a shader; the entry defines the contract.
 */

/**
 * `flat` is the default: standard three.js flat shading, no custom code.
 * `ps1-retro` is an optional look for placeholders only: snapped vertex positions, affine-style
 * texture coordinates, and reduced color depth. It must never be applied to evidence-grade meshes.
 */
export const SHADER_PROFILE_SPECS_V1: Readonly<Record<ShaderProfileV1, {
	readonly vertexSnapPixels: number;
	readonly colorLevelsPerChannel: number;
	readonly allowedFor: 'any' | 'placeholder-only';
}>> = Object.freeze({
	flat: Object.freeze({ vertexSnapPixels: 0, colorLevelsPerChannel: 256, allowedFor: 'any' }),
	'ps1-retro': Object.freeze({ vertexSnapPixels: 1, colorLevelsPerChannel: 32, allowedFor: 'placeholder-only' }),
	'mode-7': Object.freeze({ vertexSnapPixels: 0, colorLevelsPerChannel: 256, allowedFor: 'placeholder-only' })
});

/** Basic 2D shape recipes built from the polygon-prism kind. A triangle is a three-point polygon. */
export const BASIC_POLYGON_RECIPES_V1 = Object.freeze({
	triangle: Object.freeze({ points: [[0.25, 0], [-0.125, 0.2165], [-0.125, -0.2165]] as const, depth: 0 }),
	hexagon: Object.freeze({ points: [[0.25, 0], [0.125, 0.2165], [-0.125, 0.2165], [-0.25, 0], [-0.125, -0.2165], [0.125, -0.2165]] as const, depth: 0.08 })
});

// ---------------------------------------------------------------------------
// Everyday-object taxonomy (authoring vocabulary, not a classifier)
// ---------------------------------------------------------------------------

/**
 * Coarse groups for placeholder objects a scene author may add. Each entry names the primitive
 * kinds a placeholder of that group is built from. These are repo-authored labels; no COCO or
 * other external dataset is imported, and nothing here is used to classify an image.
 */
export const EVERYDAY_OBJECT_TAXONOMY_V1 = Object.freeze({
	container: Object.freeze({ label: 'Container', primitives: ['box', 'cylinder'] as const }),
	furniture: Object.freeze({ label: 'Furniture', primitives: ['box'] as const }),
	marker: Object.freeze({ label: 'Marker or prop', primitives: ['cone', 'sphere', 'hexagon'] as const }),
	surface: Object.freeze({ label: 'Surface or floor plane', primitives: ['rectangle', 'circle'] as const }),
	ring: Object.freeze({ label: 'Ring or hoop', primitives: ['torus'] as const }),
	structure: Object.freeze({ label: 'Simple structure (e.g. a placeholder castle)', primitives: ['box', 'cylinder', 'cone'] as const })
});
export type EverydayObjectGroupV1 = keyof typeof EVERYDAY_OBJECT_TAXONOMY_V1;

/** Every group must use only primitive kinds that exist in the primitive registry. */
export function validateEverydayObjectTaxonomyV1(): { ok: true } | { ok: false; errors: string[] } {
	const known = new Set<string>(SCENE_PRIMITIVE_KINDS_V1);
	const errors: string[] = [];
	for (const [group, entry] of Object.entries(EVERYDAY_OBJECT_TAXONOMY_V1)) {
		const kinds: readonly string[] = entry.primitives;
		if (kinds.length === 0) errors.push(`${group}: no primitives`);
		for (const kind of kinds) {
			if (!known.has(kind)) errors.push(`${group}: unknown primitive '${kind}'`);
		}
	}
	return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Placeholder budget checks shared by the crime and detective scene loaders. */
export const PLACEHOLDER_BUDGET_V1 = Object.freeze({
	maxTrianglesPerObject: 500,
	maxObjectsPerScene: 100
});

export function placeholderWithinBudgetV1(triangles: number): boolean {
	return Number.isInteger(triangles) && triangles > 0 && triangles <= PLACEHOLDER_BUDGET_V1.maxTrianglesPerObject;
}
