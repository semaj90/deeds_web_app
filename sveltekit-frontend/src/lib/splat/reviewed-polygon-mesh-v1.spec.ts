import { describe, expect, it } from 'vitest';
import {
	compileReviewedPolygonMeshV1,
	moveReviewedPolygonVertexV1,
	type ReviewedPolygonMeshRecipeV1
} from './reviewed-polygon-mesh-v1.js';

const recipe: ReviewedPolygonMeshRecipeV1 = {
	schema: 'atlas.reviewed-polygon-mesh.v1', geometryRevision: 'geom-r1', evidenceId: 'evidence-demo-1',
	sourceSha256: 'a'.repeat(64), sourceRevision: 'source-r1', reviewRevision: 'review-r1', width: 8, height: 8,
	polygon: {
		outer: [[1, 1], [7, 1], [7, 7], [1, 7]],
		holes: [[[3, 3], [3, 5], [5, 5], [5, 3]]]
	}
};

function triangleArea(mesh: ReturnType<typeof compileReviewedPolygonMeshV1>): number {
	const position = mesh.geometry.getAttribute('position');
	const index = mesh.geometry.getIndex();
	if (!index) throw new Error('expected indexed shape geometry');
	let sum = 0;
	for (let i = 0; i < index.count; i += 3) {
		const ax = position.getX(index.getX(i)), ay = position.getY(index.getX(i));
		const bx = position.getX(index.getX(i + 1)), by = position.getY(index.getX(i + 1));
		const cx = position.getX(index.getX(i + 2)), cy = position.getY(index.getX(i + 2));
		sum += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
	}
	return sum;
}

describe('reviewed polygon mesh v1', () => {
	it('compiles a planar image-space mesh and preserves source/review lineage', () => {
		const mesh = compileReviewedPolygonMeshV1(recipe, { unitsPerPixel: 0.5 });
		expect(mesh.name).toBe('reviewed-polygon:evidence-demo-1:geom-r1');
		expect(mesh.userData).toMatchObject({ coordinateSpace: 'SOURCE_IMAGE_PIXELS', representation: 'ILLUSTRATIVE_IMAGE_PLANE', sourceDimensions: [8, 8], reviewRevision: 'review-r1' });
		expect(triangleArea(mesh)).toBeCloseTo(8, 4); // (36 outer pixels - 4 hole pixels) * 0.5^2
	});

	it('creates a new vertex-edited revision without mutating the source recipe', () => {
		const edited = moveReviewedPolygonVertexV1({ recipe, nextGeometryRevision: 'geom-r2', ring: 'outer', vertexIndex: 2, positionPx: [6, 7] });
		expect(edited.geometryRevision).toBe('geom-r2');
		expect(edited.polygon.outer[2]).toEqual([6, 7]);
		expect(recipe.polygon.outer[2]).toEqual([7, 7]);
		expect(() => moveReviewedPolygonVertexV1({ recipe, nextGeometryRevision: 'geom-r2', ring: 'outer', vertexIndex: 2, positionPx: [9, 7] })).toThrow(/OUTSIDE_SOURCE/);
	});

	it('rejects invalid hashes and holes outside or crossing the outer contour', () => {
		expect(() => compileReviewedPolygonMeshV1({ ...recipe, sourceSha256: 'not-a-hash' })).toThrow(/SOURCE_HASH/);
		expect(() => compileReviewedPolygonMeshV1({ ...recipe, polygon: { ...recipe.polygon, holes: [[[0, 0], [0, 1], [1, 1], [1, 0]]] } })).toThrow(/HOLE_OUTSIDE|HOLES_OVERLAP/);
	});
});
