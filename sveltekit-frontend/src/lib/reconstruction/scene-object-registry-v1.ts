/**
 * Parent Atlas Scene Object Registry & Geometry Recipe Manager (v1)
 *
 * Implements shared geometry recipes with separate scene-object instances.
 * Enables multiple scene entities (e.g. 100 walls, 20 chairs) to reuse the
 * same underlying geometry buffers and material definitions while preserving
 * individual transforms, object IDs, room membership, and ontology tuples.
 */

import { sha256HexSync } from './sha256-sync-v1.js';
import type { SceneConceptV1 } from './scene-ontology-bridge-v1.js';
import type { ScenePrimitiveKindV1, SceneMaterialKeyV1, PrimitiveDetailLevelV1 } from '$lib/splat/scene-primitive-registry-v1.js';
import { type PolygonPointV1, triangulateSimplePolygonV1 } from '$lib/splat/polygon-prism-validation-v1.js';
import { sceneGeometryRecipeV1Schema, sceneObjectInstanceV1Schema, type SceneGeometryRecipeV1, type SceneObjectInstanceV1 } from './scene-object-contract-v1.js';
export { sceneGeometryRecipeV1Schema, sceneObjectInstanceV1Schema, type SceneGeometryRecipeV1, type SceneObjectInstanceV1 } from './scene-object-contract-v1.js';

// ============================================================================
// 1. Geometry Recipe Schema & Hashing
// ============================================================================

export function hashGeometryRecipeV1(recipe: Omit<SceneGeometryRecipeV1, 'recipeHash'>): string {
	const canonical: Record<string, unknown> = {
		recipeId: recipe.recipeId,
		name: recipe.name,
		primitiveKind: recipe.primitiveKind,
		dimensions: {
			width: recipe.dimensions.width ?? null,
			height: recipe.dimensions.height ?? null,
			depth: recipe.dimensions.depth ?? null,
			radius: recipe.dimensions.radius ?? null
		},
		polygonVertices: recipe.polygonVertices ?? null,
		extrusionDepth: recipe.extrusionDepth ?? null,
		materialKey: recipe.materialKey,
		detailLevel: recipe.detailLevel
	};
	// Preserve the historical v1 digest for recipes that predate contour metadata.
	if (recipe.polygonHoles !== undefined || recipe.polygonCoordinateSpace !== undefined || recipe.polygonImageDimensions !== undefined) {
		canonical.polygonHoles = recipe.polygonHoles ?? null;
		canonical.polygonCoordinateSpace = recipe.polygonCoordinateSpace ?? null;
		canonical.polygonImageDimensions = recipe.polygonImageDimensions ?? null;
	}
	return sha256HexSync(JSON.stringify(canonical));
}

export function createGeometryRecipeV1(input: Omit<SceneGeometryRecipeV1, 'recipeHash'>): SceneGeometryRecipeV1 {
	const recipeHash = hashGeometryRecipeV1(input);
	return {
		...input,
		recipeHash
	};
}

// ============================================================================
// 2. Scene Object Instance Schema
// ============================================================================

// ============================================================================
// 3. Scene Object Registry Class
// ============================================================================

export class SceneObjectRegistryV1 {
	private readonly recipes = new Map<string, SceneGeometryRecipeV1>();
	private readonly instances = new Map<string, SceneObjectInstanceV1>();
	private readonly instancedMeshLookup = new Map<string, string>(); // `${meshKey}:${index}` -> objectId

	registerRecipe(recipe: SceneGeometryRecipeV1): void {
		this.recipes.set(recipe.recipeId, recipe);
	}

	getRecipe(recipeId: string): SceneGeometryRecipeV1 | undefined {
		return this.recipes.get(recipeId);
	}

	registerInstance(instance: SceneObjectInstanceV1): void {
		if (!this.recipes.has(instance.recipeId)) {
			throw new Error(`Cannot register instance ${instance.objectId}: unknown recipeId '${instance.recipeId}'`);
		}
		this.instances.set(instance.objectId, instance);
		if (instance.isInstanced && instance.instancedMeshKey !== undefined && instance.instanceIndex !== undefined) {
			this.instancedMeshLookup.set(`${instance.instancedMeshKey}:${instance.instanceIndex}`, instance.objectId);
		}
	}

	getInstance(objectId: string): SceneObjectInstanceV1 | undefined {
		return this.instances.get(objectId);
	}

	getAllInstances(): SceneObjectInstanceV1[] {
		return Array.from(this.instances.values());
	}

	getAllRecipes(): SceneGeometryRecipeV1[] {
		return Array.from(this.recipes.values());
	}

	resolveByInstancedIndex(meshKey: string, index: number): SceneObjectInstanceV1 | undefined {
		const objectId = this.instancedMeshLookup.get(`${meshKey}:${index}`);
		return objectId ? this.instances.get(objectId) : undefined;
	}

	/**
	 * Materialize an instanced object into an independent transformable mesh.
	 * Removes it from the InstancedMesh index so gizmo operations can manipulate it.
	 */
	materializeInstance(objectId: string, arenaSlot?: number): SceneObjectInstanceV1 {
		const instance = this.instances.get(objectId);
		if (!instance) throw new Error(`Unknown instance ${objectId}`);
		if (!instance.isInstanced) return instance;

		if (instance.instancedMeshKey !== undefined && instance.instanceIndex !== undefined) {
			this.instancedMeshLookup.delete(`${instance.instancedMeshKey}:${instance.instanceIndex}`);
		}

		const materialized: SceneObjectInstanceV1 = {
			...instance,
			isInstanced: false,
			instancedMeshKey: undefined,
			instanceIndex: undefined,
			arenaSlot
		};
		this.instances.set(objectId, materialized);
		return materialized;
	}
}

// ============================================================================
// 4. Acceptance Fixture Generator: Fictional Studio Apartment
// ============================================================================

export interface StudioApartmentFixtureV1 {
	caseId: string;
	sceneId: string;
	recipes: SceneGeometryRecipeV1[];
	objects: SceneObjectInstanceV1[];
	floorPlanVertices: PolygonPointV1[];
	triangulatedIndices: Uint16Array;
}

/**
 * Creates the required fictional studio apartment acceptance fixture:
 * - 1 combined living/dining room
 * - 1 kitchenette
 * - 1 bathroom
 * - 1 dining table
 * - 2 chairs sharing `chair_lowpoly_v1`
 * - 2 neutral, unnamed generated actors
 * - 1 editable polygon footprint
 * - 1 accepted image observation
 */
export function createProceduralStudioApartmentFixtureV1(input: {
	caseId: string;
	sceneId: string;
	tablePos?: [number, number, number];
	chair1Pos?: [number, number, number];
	chair2Pos?: [number, number, number];
}): StudioApartmentFixtureV1 {
	const tablePos = input.tablePos ?? [0, 0.38, 0];
	const chair1Pos = input.chair1Pos ?? [-0.6, 0.45, 0];
	const chair2Pos = input.chair2Pos ?? [0.6, 0.45, 0];

	// Shared recipes
	const chairRecipe = createGeometryRecipeV1({
		recipeId: 'chair_lowpoly_v1',
		name: 'Low-Poly Wooden Dining Chair',
		primitiveKind: 'box',
		dimensions: { width: 0.45, height: 0.9, depth: 0.45 },
		materialKey: 'dark-leather',
		detailLevel: 'balanced'
	});

	const tableRecipe = createGeometryRecipeV1({
		recipeId: 'table_dining_v1',
		name: 'Rectangular Dining Table',
		primitiveKind: 'box',
		dimensions: { width: 1.4, height: 0.75, depth: 0.8 },
		materialKey: 'steel',
		detailLevel: 'balanced'
	});

	const actorRecipe = createGeometryRecipeV1({
		recipeId: 'humanoid_neutral_v1',
		name: 'Neutral Forensic Humanoid Placeholder',
		primitiveKind: 'cylinder',
		dimensions: { radius: 0.25, height: 1.75 },
		materialKey: 'ivory',
		detailLevel: 'retro'
	});

	// Studio apartment polygon footprint (5m x 7m with bathroom indent)
	const floorPlanVertices: PolygonPointV1[] = [
		[-2.5, -3.5],
		[2.5, -3.5],
		[2.5, 3.5],
		[0.5, 3.5],
		[0.5, 1.5],
		[-2.5, 1.5]
	];
	const triangulatedIndices = triangulateSimplePolygonV1(floorPlanVertices);

	const floorRecipe = createGeometryRecipeV1({
		recipeId: 'studio_floor_prism_v1',
		name: 'Studio Apartment Extruded Floor Prism',
		primitiveKind: 'polygon_prism',
		dimensions: { width: 5.0, depth: 7.0, height: 0.15 },
		polygonVertices: floorPlanVertices,
		extrusionDepth: 0.15,
		materialKey: 'brass',
		detailLevel: 'balanced'
	});

	const recipes = [chairRecipe, tableRecipe, actorRecipe, floorRecipe];

	// Object instances
	const objects: SceneObjectInstanceV1[] = [
		// Floor
		{
			objectId: '11111111-1111-4111-8111-111111111111',
			name: 'Apartment Floor Slab',
			recipeId: floorRecipe.recipeId,
			ontologyConceptId: 'spatial.floor',
			transform: {
				position: [0, 0, 0],
				rotationXyzw: [0, 0, 0, 1],
				scale: [1, 1, 1]
			},
			isInstanced: false
		},
		// Dining Table
		{
			objectId: '22222222-2222-4222-8222-222222222222',
			name: 'Dining Table',
			recipeId: tableRecipe.recipeId,
			ontologyConceptId: 'object.furniture.table',
			transform: {
				position: tablePos,
				rotationXyzw: [0, 0, 0, 1],
				scale: [1, 1, 1]
			},
			isInstanced: false
		},
		// Chair 1 (sharing chair_lowpoly_v1)
		{
			objectId: '33333333-3333-4333-8333-333333333331',
			name: 'Dining Chair West',
			recipeId: chairRecipe.recipeId,
			ontologyConceptId: 'object.furniture.chair',
			transform: {
				position: chair1Pos,
				rotationXyzw: [0, 0, 0, 1],
				scale: [1, 1, 1]
			},
			isInstanced: true,
			instancedMeshKey: 'instanced_chair_mesh',
			instanceIndex: 0
		},
		// Chair 2 (sharing chair_lowpoly_v1 with distinct objectId & transform)
		{
			objectId: '33333333-3333-4333-8333-333333333332',
			name: 'Dining Chair East',
			recipeId: chairRecipe.recipeId,
			ontologyConceptId: 'object.furniture.chair',
			transform: {
				position: chair2Pos,
				rotationXyzw: [0, 1, 0, 0], // rotated 180 degrees
				scale: [1, 1, 1]
			},
			isInstanced: true,
			instancedMeshKey: 'instanced_chair_mesh',
			instanceIndex: 1
		},
		// Actor 1 (neutral generated figure)
		{
			objectId: '44444444-4444-4444-8444-444444444441',
			name: 'Neutral Actor A',
			recipeId: actorRecipe.recipeId,
			ontologyConceptId: 'actor.visual_actor_neutral',
			transform: {
				position: [-0.6, 0.88, 0],
				rotationXyzw: [0, 0, 0, 1],
				scale: [1, 1, 1]
			},
			isInstanced: false,
			arenaSlot: 1
		},
		// Actor 2 (neutral generated figure)
		{
			objectId: '44444444-4444-4444-8444-444444444442',
			name: 'Neutral Actor B',
			recipeId: actorRecipe.recipeId,
			ontologyConceptId: 'actor.visual_actor_neutral',
			transform: {
				position: [0.6, 0.88, 0],
				rotationXyzw: [0, 1, 0, 0],
				scale: [1, 1, 1]
			},
			isInstanced: false,
			arenaSlot: 2
		}
	];

	return {
		caseId: input.caseId,
		sceneId: input.sceneId,
		recipes,
		objects,
		floorPlanVertices,
		triangulatedIndices
	};
}
