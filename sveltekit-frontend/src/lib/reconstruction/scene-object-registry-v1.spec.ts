import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
	SceneObjectRegistryV1,
	createGeometryRecipeV1,
	hashGeometryRecipeV1,
	sceneGeometryRecipeV1Schema,
	createProceduralStudioApartmentFixtureV1
} from './scene-object-registry-v1.js';
import {
	buildPolygonPrismBuffersV1,
	MovePolygonVertexCommand,
	SetPolygonExtrusionCommand,
	type PolygonEditorTargetV1
} from '$lib/scene/polygon-mesh-editor-v1.js';
import { SceneControllerV1, InMemorySceneExecutionContext } from '$lib/scene/scene-controller-v1.js';
import { createSceneDocumentV1, stableStringifySceneDocumentV1, type SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
import { hashSceneDocumentV1 } from '$lib/server/scene-document-revisions-v1.js';
import type { PolygonPointV1 } from '$lib/splat/polygon-prism-validation-v1.js';

describe('SceneObjectRegistryV1 & Shared Geometry Recipes', () => {
	it('proves multiple instances share one geometry recipe definition with distinct identities and transforms', () => {
		const fixture = createProceduralStudioApartmentFixtureV1({
			caseId: '11111111-2222-4333-8444-555555555555',
			sceneId: '99999999-8888-4777-8666-555555555555'
		});

		const registry = new SceneObjectRegistryV1();
		for (const recipe of fixture.recipes) {
			registry.registerRecipe(recipe);
		}
		for (const obj of fixture.objects) {
			registry.registerInstance(obj);
		}

		// Verify recipes
		expect(registry.getAllRecipes().length).toBe(4);
		const chairRecipe = registry.getRecipe('chair_lowpoly_v1');
		expect(chairRecipe).toBeDefined();
		expect(chairRecipe?.primitiveKind).toBe('box');

		// Verify the two chairs share the exact same recipe
		const chair1 = registry.getInstance('33333333-3333-4333-8333-333333333331');
		const chair2 = registry.getInstance('33333333-3333-4333-8333-333333333332');

		expect(chair1).toBeDefined();
		expect(chair2).toBeDefined();
		expect(chair1?.recipeId).toBe(chairRecipe?.recipeId);
		expect(chair2?.recipeId).toBe(chairRecipe?.recipeId);

		// But have distinct object identities and transforms
		expect(chair1?.objectId).not.toBe(chair2?.objectId);
		expect(chair1?.transform.position).not.toEqual(chair2?.transform.position);

		// Verify instanced index lookup
		const resolvedByIndex0 = registry.resolveByInstancedIndex('instanced_chair_mesh', 0);
		const resolvedByIndex1 = registry.resolveByInstancedIndex('instanced_chair_mesh', 1);
		expect(resolvedByIndex0?.objectId).toBe(chair1?.objectId);
		expect(resolvedByIndex1?.objectId).toBe(chair2?.objectId);

		// Materialize chair 1 for independent gizmo editing
		const materialized = registry.materializeInstance(chair1!.objectId, 10);
		expect(materialized.isInstanced).toBe(false);
		expect(materialized.arenaSlot).toBe(10);
		// Lookup for instance 0 is now detached
		expect(registry.resolveByInstancedIndex('instanced_chair_mesh', 0)).toBeUndefined();
	});

	it('builds 3D watertight polygon prism buffers and validates ear clipping', () => {
		const points: PolygonPointV1[] = [
			[0, 0],
			[4, 0],
			[4, 3],
			[0, 3]
		];
		const buffers = buildPolygonPrismBuffersV1(points, 2.5);

		expect(buffers.vertexCount).toBe(4 + 4 + 16); // 24 vertices
		expect(buffers.triangleCount).toBe(2 + 2 + 8); // 12 triangles (36 indices)
		expect(buffers.positions.length).toBe(24 * 3);
		expect(buffers.normals.length).toBe(24 * 3);
		expect(buffers.indices.length).toBe(12 * 3);

		// Top cap vertices have y = 2.5
		const topIdx = 4 * 3;
		expect(buffers.positions[topIdx + 1]).toBe(2.5);
		expect(buffers.normals[topIdx + 1]).toBe(1); // Normal pointing up
	});

	it('supports undo/redo on polygon vertex editing via SceneControllerV1', () => {
		let vertices: PolygonPointV1[] = [
			[0, 0],
			[4, 0],
			[4, 3],
			[0, 3]
		];
		let extrusionDepth = 1.0;

		const target: PolygonEditorTargetV1 = {
			recipeId: 'test_prism_recipe',
			getVertices: () => vertices,
			setVertices: (v) => { vertices = v; },
			getExtrusionDepth: () => extrusionDepth,
			setExtrusionDepth: (d) => { extrusionDepth = d; }
		};

		const controller = new SceneControllerV1();

		// Move vertex 2 from [4, 3] to [5, 4]
		const moveCmd = new MovePolygonVertexCommand(target, 2, [5, 4]);
		controller.executeCommand(moveCmd);

		expect(vertices[2]).toEqual([5, 4]);

		// Change extrusion depth from 1.0 to 3.0
		const extrudeCmd = new SetPolygonExtrusionCommand(target, 3.0);
		controller.executeCommand(extrudeCmd);

		expect(extrusionDepth).toBe(3.0);

		// Undo depth change
		controller.undo();
		expect(extrusionDepth).toBe(1.0);

		// Undo vertex move
		controller.undo();
		expect(vertices[2]).toEqual([4, 3]);

		// Redo vertex move
		controller.redo();
		expect(vertices[2]).toEqual([5, 4]);
	});

	it('persists ontology tuples and geometry recipes in SceneDocumentV1 with stable deterministic hash', () => {
		const fixture = createProceduralStudioApartmentFixtureV1({
			caseId: '11111111-2222-4333-8444-555555555555',
			sceneId: '99999999-8888-4777-8666-555555555555'
		});

		const rawDoc: Record<string, unknown> = {
			schema: 'parent-atlas.scene-document.v1',
			sceneId: fixture.sceneId,
			caseId: fixture.caseId,
			status: 'HYPOTHESIS',
			revision: 1,
			parentManifestSha256: null,
			createdAt: '2026-11-20T17:00:00.000Z',
			coordinateFrame: 'GLTF_Y_UP_METERS',
			objects: [],
			animations: [],
			assets: [],
			quality: {
				triangleBudget: 100_000,
				triangleCount: 500,
				textureBytes: null,
				derivedAssetBytes: 0,
				derivedAssetByteBudget: 8 * 1024 * 1024,
				derivedAssetByteStatus: 'WITHIN_BUDGET',
				status: 'PASSED'
			},
			// Additive scene ontology and recipe persistence
			geometryRecipes: fixture.recipes,
			authoredSceneObjects: fixture.objects,
			sceneOntologyTuples: [
				{
					schema: 'atlas.scene-linked-tuple.v1',
					tupleId: 'aaaaaaaa-1111-4111-8111-111111111111',
					subjectId: 'entity:chair1',
					predicate: 'USES_RECIPE',
					objectId: 'recipe:chair_lowpoly_v1',
					origin: 'USER_AUTHORED'
				},
				{
					schema: 'atlas.scene-linked-tuple.v1',
					tupleId: 'aaaaaaaa-2222-4222-8222-222222222222',
					subjectId: 'entity:chair2',
					predicate: 'USES_RECIPE',
					objectId: 'recipe:chair_lowpoly_v1',
					origin: 'USER_AUTHORED'
				},
				{
					schema: 'atlas.scene-linked-tuple.v1',
					tupleId: 'aaaaaaaa-3333-4333-8333-333333333333',
					subjectId: 'entity:chair1',
					predicate: 'LOCATED_IN',
					objectId: 'entity:living_room',
					origin: 'USER_AUTHORED'
				}
			]
		};

		const doc = createSceneDocumentV1(rawDoc);
		expect(doc.geometryRecipes?.length).toBe(4);
		expect(doc.authoredSceneObjects?.length).toBe(6);
		expect(doc.sceneOntologyTuples?.length).toBe(3);

		// Deterministic hash
		const hash1 = hashSceneDocumentV1(doc);
		const hash2 = hashSceneDocumentV1(doc);
		expect(hash1).toBe(hash2);
		expect(hash1).toMatch(/^[a-f0-9]{64}$/);
	});

	it('validates and hashes editable source-pixel contours with holes as a distinct recipe space', () => {
		const recipe = createGeometryRecipeV1({
			recipeId: 'mask-contour-v1', name: 'Image-space reviewed contour', primitiveKind: 'polygon_prism',
			dimensions: {}, polygonVertices: [[10, 10], [630, 10], [630, 470], [10, 470]],
			polygonHoles: [[[210, 180], [300, 180], [300, 260], [210, 260]]],
			polygonCoordinateSpace: 'SOURCE_IMAGE_PIXELS', polygonImageDimensions: { width: 640, height: 480 },
			materialKey: 'evidence-mask-overlay', detailLevel: 'retro'
		});
		const parsed = sceneGeometryRecipeV1Schema.parse(recipe);
		expect(parsed.polygonHoles).toHaveLength(1);
		expect(parsed.polygonCoordinateSpace).toBe('SOURCE_IMAGE_PIXELS');
		expect(parsed.polygonImageDimensions).toEqual({ width: 640, height: 480 });
		const { recipeHash: _recipeHash, ...unsigned } = recipe;
		expect(hashGeometryRecipeV1(unsigned)).toBe(recipe.recipeHash);
		expect(hashGeometryRecipeV1({ ...unsigned, polygonHoles: [] })).not.toBe(recipe.recipeHash);
		expect(() => sceneGeometryRecipeV1Schema.parse({ ...recipe, polygonHoles: [[[700, 490], [710, 490], [710, 500]]] })).toThrow(/outside the original image/);
		expect(() => sceneGeometryRecipeV1Schema.parse({ ...recipe, polygonHoles: [[[5, 5], [8, 5], [8, 8]]] })).toThrow(/outside the outer contour/);
		const legacyRecipe = { recipeId: 'legacy-box', name: 'Legacy box', primitiveKind: 'box' as const,
			dimensions: { width: 1 }, materialKey: 'wood', detailLevel: 'retro' as const };
		const historicalCanonical = { recipeId: legacyRecipe.recipeId, name: legacyRecipe.name, primitiveKind: legacyRecipe.primitiveKind,
			dimensions: { width: 1, height: null, depth: null, radius: null }, polygonVertices: null, extrusionDepth: null,
			materialKey: legacyRecipe.materialKey, detailLevel: legacyRecipe.detailLevel };
		expect(hashGeometryRecipeV1(legacyRecipe)).toBe(createHash('sha256').update(JSON.stringify(historicalCanonical), 'utf8').digest('hex'));
	});
});
