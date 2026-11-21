import * as THREE from 'three';
import { validatePolygonWithHolesV1, type PolygonPointV1 } from './polygon-prism-validation-v1.js';
import type { MaskPolygonV1 } from './mask-contour-compiler-v1.js';

export const REVIEWED_POLYGON_MESH_SCHEMA_V1 = 'atlas.reviewed-polygon-mesh.v1' as const;
const MAX_IMAGE_DIMENSION = 8192;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Authoring remains in source pixels. This mesh is an illustrative image-plane projection. */
export interface ReviewedPolygonMeshRecipeV1 {
	schema: typeof REVIEWED_POLYGON_MESH_SCHEMA_V1;
	geometryRevision: string;
	evidenceId: string;
	sourceSha256: string;
	sourceRevision: string;
	reviewRevision: string;
	width: number;
	height: number;
	polygon: MaskPolygonV1;
}

export interface ReviewedPolygonMeshOptionsV1 {
	/** Display-only scale; does not establish world units or camera calibration. */
	unitsPerPixel?: number;
	material?: THREE.Material;
}

function assertText(value: string, name: string): void {
	if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) throw new TypeError(`${name} is invalid`);
}

function validateRecipe(recipe: ReviewedPolygonMeshRecipeV1): void {
	if (!recipe || recipe.schema !== REVIEWED_POLYGON_MESH_SCHEMA_V1) throw new TypeError('POLYGON_MESH_SCHEMA_INVALID');
	assertText(recipe.geometryRevision, 'geometryRevision');
	assertText(recipe.evidenceId, 'evidenceId');
	assertText(recipe.sourceRevision, 'sourceRevision');
	assertText(recipe.reviewRevision, 'reviewRevision');
	if (!SHA256_PATTERN.test(recipe.sourceSha256)) throw new TypeError('POLYGON_MESH_SOURCE_HASH_INVALID');
	if (!Number.isInteger(recipe.width) || !Number.isInteger(recipe.height) || recipe.width < 1 || recipe.height < 1 || recipe.width > MAX_IMAGE_DIMENSION || recipe.height > MAX_IMAGE_DIMENSION) {
		throw new RangeError('POLYGON_MESH_SOURCE_DIMENSIONS_INVALID');
	}
	const { outer, holes } = recipe.polygon;
	try {
		validatePolygonWithHolesV1(outer, holes);
	} catch (error) {
		const message = error instanceof Error ? error.message : '';
		if (message.includes('lies outside the outer')) throw new RangeError('POLYGON_MESH_HOLE_OUTSIDE_OUTER');
		if (message.includes('rings intersect') || message.includes('holes overlap or nest')) throw new RangeError('POLYGON_MESH_HOLES_OVERLAP');
		throw error;
	}
	for (const point of outer) if (point[0] < 0 || point[1] < 0 || point[0] > recipe.width || point[1] > recipe.height) throw new RangeError('POLYGON_MESH_VERTEX_OUTSIDE_SOURCE');
	for (let i = 0; i < holes.length; i++) {
		const hole = holes[i]!;
		if (hole.some((point) => point[0] < 0 || point[1] < 0 || point[0] > recipe.width || point[1] > recipe.height)) throw new RangeError('POLYGON_MESH_HOLE_OUTSIDE_OUTER');
	}
}

/** Validate a stored or edited image-space mesh recipe without allocating Three.js geometry. */
export function validateReviewedPolygonMeshRecipeV1(recipe: ReviewedPolygonMeshRecipeV1): void {
	validateRecipe(recipe);
}

/** Build a Three.js planar mesh from a reviewed contour without altering source pixels. */
export function compileReviewedPolygonMeshV1(
	recipe: ReviewedPolygonMeshRecipeV1,
	options: ReviewedPolygonMeshOptionsV1 = {}
): THREE.Mesh<THREE.ShapeGeometry, THREE.Material> {
	validateRecipe(recipe);
	const unitsPerPixel = options.unitsPerPixel ?? 1;
	if (!Number.isFinite(unitsPerPixel) || unitsPerPixel <= 0 || unitsPerPixel > 100) throw new RangeError('POLYGON_MESH_DISPLAY_SCALE_INVALID');
	const toScene = ([x, y]: PolygonPointV1) => new THREE.Vector2((x - recipe.width / 2) * unitsPerPixel, (recipe.height / 2 - y) * unitsPerPixel);
	const first = toScene(recipe.polygon.outer[0]!);
	const shape = new THREE.Shape();
	shape.moveTo(first.x, first.y);
	for (const point of recipe.polygon.outer.slice(1)) {
		const scenePoint = toScene(point);
		shape.lineTo(scenePoint.x, scenePoint.y);
	}
	shape.closePath();
	for (const hole of recipe.polygon.holes) {
		const path = new THREE.Path();
		const start = toScene(hole[0]!);
		path.moveTo(start.x, start.y);
		for (const point of hole.slice(1)) {
			const scenePoint = toScene(point);
			path.lineTo(scenePoint.x, scenePoint.y);
		}
		path.closePath();
		shape.holes.push(path);
	}
	const geometry = new THREE.ShapeGeometry(shape);
	geometry.computeBoundingBox();
	const mesh = new THREE.Mesh(geometry, options.material ?? new THREE.MeshBasicMaterial({ color: 0x75b9d1, side: THREE.DoubleSide }));
	mesh.name = `reviewed-polygon:${recipe.evidenceId}:${recipe.geometryRevision}`;
	mesh.userData = {
		...mesh.userData,
		schema: REVIEWED_POLYGON_MESH_SCHEMA_V1,
		representation: 'ILLUSTRATIVE_IMAGE_PLANE',
		geometryRevision: recipe.geometryRevision,
		evidenceId: recipe.evidenceId,
		sourceSha256: recipe.sourceSha256,
		sourceRevision: recipe.sourceRevision,
		reviewRevision: recipe.reviewRevision,
		sourceDimensions: [recipe.width, recipe.height],
		coordinateSpace: 'SOURCE_IMAGE_PIXELS',
		unitsPerPixel
	};
	return mesh;
}

/** Return a new validated recipe revision after moving one source-pixel vertex. */
export function moveReviewedPolygonVertexV1(input: {
	recipe: ReviewedPolygonMeshRecipeV1;
	nextGeometryRevision: string;
	ring: 'outer' | 'hole';
	holeIndex?: number;
	vertexIndex: number;
	positionPx: PolygonPointV1;
}): ReviewedPolygonMeshRecipeV1 {
	validateRecipe(input.recipe);
	assertText(input.nextGeometryRevision, 'nextGeometryRevision');
	if (input.nextGeometryRevision === input.recipe.geometryRevision) throw new Error('POLYGON_MESH_REVISION_MUST_ADVANCE');
	if (!Array.isArray(input.positionPx) || input.positionPx.length !== 2 || input.positionPx.some((value) => !Number.isFinite(value))) throw new TypeError('POLYGON_MESH_EDIT_POINT_INVALID');
	const polygon: MaskPolygonV1 = { outer: input.recipe.polygon.outer.map(([x, y]) => [x, y]), holes: input.recipe.polygon.holes.map((ring) => ring.map(([x, y]) => [x, y])) };
	const target = input.ring === 'outer' ? polygon.outer : polygon.holes[input.holeIndex ?? -1];
	if (!target || !Number.isInteger(input.vertexIndex) || input.vertexIndex < 0 || input.vertexIndex >= target.length) throw new RangeError('POLYGON_MESH_EDIT_VERTEX_INVALID');
	target[input.vertexIndex] = [input.positionPx[0], input.positionPx[1]];
	const next = { ...input.recipe, geometryRevision: input.nextGeometryRevision, polygon };
	validateRecipe(next);
	return next;
}
