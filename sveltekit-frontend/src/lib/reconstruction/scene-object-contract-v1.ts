/** Browser-safe schemas for shared scene geometry recipes and instances. */
import { z } from 'zod';
import type { PolygonPointV1 } from '$lib/splat/polygon-prism-validation-v1.js';
import { validatePolygonWithHolesV1 } from '$lib/splat/polygon-prism-validation-v1.js';

const polygonPointV1Schema = z.custom<PolygonPointV1>((value) => Array.isArray(value) && value.length === 2 &&
	value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)));
const polygonRingV1Schema = z.array(polygonPointV1Schema).min(3).max(256);

export const sceneGeometryRecipeV1Schema = z.object({
	recipeId: z.string().min(1).max(100),
	name: z.string().min(1).max(200),
	primitiveKind: z.enum(['box', 'sphere', 'cylinder', 'cone', 'polygon_prism', 'glb', 'instanced_mesh']),
	dimensions: z.object({
		width: z.number().positive().optional(),
		height: z.number().positive().optional(),
		depth: z.number().positive().optional(),
		radius: z.number().positive().optional()
	}).strict(),
	polygonVertices: polygonRingV1Schema.optional(),
	polygonHoles: z.array(polygonRingV1Schema).max(32).optional(),
	polygonCoordinateSpace: z.enum(['SCENE_LOCAL', 'SOURCE_IMAGE_PIXELS']).optional(),
	polygonImageDimensions: z.object({ width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192) }).strict().optional(),
	extrusionDepth: z.number().positive().optional(),
	materialKey: z.string().min(1).max(100),
	detailLevel: z.enum(['retro', 'balanced', 'detailed']).default('balanced'),
	recipeHash: z.string().regex(/^[0-9a-f]{64}$/)
}).strict().superRefine((recipe, context) => {
	if (recipe.primitiveKind === 'polygon_prism' && !recipe.polygonVertices) {
		context.addIssue({ code: 'custom', message: 'Polygon-prism recipes require an outer polygon ring', path: ['polygonVertices'] });
	}
	if (recipe.polygonHoles?.length && !recipe.polygonVertices) {
		context.addIssue({ code: 'custom', message: 'Polygon holes require an outer polygon ring', path: ['polygonHoles'] });
	}
	if (recipe.polygonCoordinateSpace === 'SOURCE_IMAGE_PIXELS' && !recipe.polygonImageDimensions) {
		context.addIssue({ code: 'custom', message: 'Source-pixel contours require their original image dimensions', path: ['polygonImageDimensions'] });
	}
	if (recipe.polygonImageDimensions && recipe.polygonCoordinateSpace !== 'SOURCE_IMAGE_PIXELS') {
		context.addIssue({ code: 'custom', message: 'Image dimensions are valid only for source-pixel contours', path: ['polygonCoordinateSpace'] });
	}
	if (recipe.polygonCoordinateSpace && recipe.primitiveKind !== 'polygon_prism') {
		context.addIssue({ code: 'custom', message: 'Polygon coordinate space requires polygon-prism geometry', path: ['polygonCoordinateSpace'] });
	}
	if (recipe.polygonVertices) {
		try { validatePolygonWithHolesV1(recipe.polygonVertices as readonly PolygonPointV1[], (recipe.polygonHoles ?? []) as readonly (readonly PolygonPointV1[])[]); }
		catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid polygon topology', path: ['polygonHoles'] }); }
	}
	if (recipe.polygonCoordinateSpace === 'SOURCE_IMAGE_PIXELS' && recipe.polygonImageDimensions) {
		const rings = [recipe.polygonVertices ?? [], ...(recipe.polygonHoles ?? [])];
		for (const [ringIndex, ring] of rings.entries()) {
			if (ring.some(([x, y]) => x < 0 || y < 0 || x > recipe.polygonImageDimensions!.width || y > recipe.polygonImageDimensions!.height)) {
				context.addIssue({ code: 'custom', message: 'Source-pixel contour point is outside the original image', path: [ringIndex === 0 ? 'polygonVertices' : 'polygonHoles'] });
			}
		}
	}
});

export type SceneGeometryRecipeV1 = z.infer<typeof sceneGeometryRecipeV1Schema>;

export const sceneObjectInstanceV1Schema = z.object({
	objectId: z.string().uuid(),
	name: z.string().min(1).max(200),
	recipeId: z.string().min(1).max(100),
	ontologyConceptId: z.string().min(1).max(100),
	transform: z.object({
		position: z.tuple([z.number(), z.number(), z.number()]),
		rotationXyzw: z.tuple([z.number(), z.number(), z.number(), z.number()]),
		scale: z.tuple([z.number(), z.number(), z.number()])
	}).strict(),
	isInstanced: z.boolean().default(false),
	instancedMeshKey: z.string().min(1).max(100).optional(),
	instanceIndex: z.number().int().nonnegative().optional(),
	arenaSlot: z.number().int().min(0).max(255).optional(),
	sourceBinding: z.object({
		evidenceId: z.string().uuid(),
		sourceRevision: z.string().min(1).max(100),
		observationId: z.string().min(1).max(100),
		coordinateStatus: z.enum(['CALIBRATED', 'ILLUSTRATIVE_UNCALIBRATED'])
	}).strict().optional()
}).strict();

export type SceneObjectInstanceV1 = z.infer<typeof sceneObjectInstanceV1Schema>;
