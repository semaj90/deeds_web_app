/**
 * Parent Atlas Versioned Scene Prefab Registry (v1)
 *
 * Implements the reusable prefab pattern:
 * Resolves: Prefab ID -> part recipes -> shared geometry buffers -> instance transforms -> Three.js rendering.
 *
 * Invariants:
 * - A scene object keeps its own unique objectId and source bindings even when
 *   hundreds of instances reference the same prefab definition.
 * - Supports retro, balanced, and detailed visual styles.
 * - Authority is explicitly labeled (e.g. GENERATED_ILLUSTRATIVE_BLOCKOUT).
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { SceneGeometryRecipeV1, SceneObjectInstanceV1 } from './scene-object-registry-v1.js';
import { createGeometryRecipeV1 } from './scene-object-registry-v1.js';
import type { SceneConceptV1 } from './scene-ontology-bridge-v1.js';

// ============================================================================
// 1. Prefab Component & Prefab Schema
// ============================================================================

export const prefabComponentV1Schema = z.object({
	componentId: z.string().min(1).max(100),
	name: z.string().min(1).max(200),
	conceptId: z.string().min(1).max(100),
	recipeId: z.string().min(1).max(100),
	relativeTransform: z.object({
		position: z.tuple([z.number(), z.number(), z.number()]),
		rotationXyzw: z.tuple([z.number(), z.number(), z.number(), z.number()]),
		scale: z.tuple([z.number(), z.number(), z.number()])
	}).strict(),
	isInstanced: z.boolean().default(true),
	behaviorPolicy: z.enum(['STATIC_COLLIDER', 'INTERACTIVE_GIZMO', 'PASSIVE_DECORATION']).default('STATIC_COLLIDER')
}).strict();

export type PrefabComponentV1 = z.infer<typeof prefabComponentV1Schema>;

export const scenePrefabV1Schema = z.object({
	prefabId: z.string().min(1).max(100),
	name: z.string().min(1).max(200),
	category: z.enum(['building', 'room', 'vehicle', 'furniture_set', 'street_prop', 'courtroom', 'beach_cluster']),
	visualStyle: z.enum(['retro', 'balanced', 'detailed']).default('balanced'),
	authority: z.enum(['GENERATED_ILLUSTRATIVE_BLOCKOUT', 'REVIEWED_SOURCE_RECONSTRUCTION']).default('GENERATED_ILLUSTRATIVE_BLOCKOUT'),
	dimensions: z.object({
		width: z.number().positive(),
		height: z.number().positive(),
		depth: z.number().positive()
	}).strict(),
	components: z.array(prefabComponentV1Schema).min(1).max(500),
	prefabHash: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

export type ScenePrefabV1 = z.infer<typeof scenePrefabV1Schema>;

export function hashScenePrefabV1(prefab: Omit<ScenePrefabV1, 'prefabHash'>): string {
	const canonical = {
		prefabId: prefab.prefabId,
		name: prefab.name,
		category: prefab.category,
		visualStyle: prefab.visualStyle,
		authority: prefab.authority,
		dimensions: prefab.dimensions,
		components: prefab.components.map((c) => ({
			componentId: c.componentId,
			conceptId: c.conceptId,
			recipeId: c.recipeId,
			relativeTransform: c.relativeTransform,
			isInstanced: c.isInstanced,
			behaviorPolicy: c.behaviorPolicy
		}))
	};
	return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

export function createScenePrefabV1(input: Omit<ScenePrefabV1, 'prefabHash'>): ScenePrefabV1 {
	const prefabHash = hashScenePrefabV1(input);
	return {
		...input,
		prefabHash
	};
}

// ============================================================================
// 2. Prefab Compiler: Resolves Prefab into Scene Object Instances
// ============================================================================

export interface SpawnPrefabOptionsV1 {
	rootPosition?: [number, number, number];
	rootRotationY?: number; // radians
	sourceBinding?: SceneObjectInstanceV1['sourceBinding'];
	caseId: string;
	sceneId: string;
}

export interface CompiledPrefabResultV1 {
	prefabId: string;
	rootObjectId: string;
	spawnedObjects: SceneObjectInstanceV1[];
}

export class ScenePrefabRegistryV1 {
	private readonly prefabs = new Map<string, ScenePrefabV1>();
	private readonly recipes = new Map<string, SceneGeometryRecipeV1>();

	registerPrefab(prefab: ScenePrefabV1): void {
		this.prefabs.set(prefab.prefabId, prefab);
	}

	registerRecipe(recipe: SceneGeometryRecipeV1): void {
		this.recipes.set(recipe.recipeId, recipe);
	}

	getPrefab(prefabId: string): ScenePrefabV1 | undefined {
		return this.prefabs.get(prefabId);
	}

	getRecipe(recipeId: string): SceneGeometryRecipeV1 | undefined {
		return this.recipes.get(recipeId);
	}

	/**
	 * Compiles a prefab into concrete scene object instances positioned in the world.
	 * Every spawned instance gets a distinct UUID while referencing shared geometry recipes.
	 */
	compilePrefab(prefabId: string, options: SpawnPrefabOptionsV1): CompiledPrefabResultV1 {
		const prefab = this.prefabs.get(prefabId);
		if (!prefab) throw new Error(`Unknown prefabId: '${prefabId}'`);

		const rootPos = options.rootPosition ?? [0, 0, 0];
		const rotY = options.rootRotationY ?? 0;
		const cos = Math.cos(rotY);
		const sin = Math.sin(rotY);

		const rootObjectId = crypto.randomUUID();
		const spawnedObjects: SceneObjectInstanceV1[] = [];

		for (const comp of prefab.components) {
			const [rx, ry, rz] = comp.relativeTransform.position;
			// Rotate relative position around Y axis and offset by rootPos
			const worldX = rootPos[0] + (rx * cos - rz * sin);
			const worldY = rootPos[1] + ry;
			const worldZ = rootPos[2] + (rx * sin + rz * cos);

			// Compute quaternion for Y rotation combined with local rotation
			// Local rotation assumed identity [0,0,0,1] for simple prefabs, or rotated
			const halfRot = rotY * 0.5;
			const qy = Math.sin(halfRot);
			const qw = Math.cos(halfRot);

			const instanceId = crypto.randomUUID();
			const instance: SceneObjectInstanceV1 = {
				objectId: instanceId,
				name: `${prefab.name} - ${comp.name}`,
				recipeId: comp.recipeId,
				ontologyConceptId: comp.conceptId,
				transform: {
					position: [worldX, worldY, worldZ],
					rotationXyzw: [0, qy, 0, qw],
					scale: comp.relativeTransform.scale
				},
				isInstanced: comp.isInstanced,
				instancedMeshKey: comp.isInstanced ? `instanced_${comp.recipeId}` : undefined,
				sourceBinding: options.sourceBinding
			};

			spawnedObjects.push(instance);
		}

		return {
			prefabId,
			rootObjectId,
			spawnedObjects
		};
	}
}

// ============================================================================
// 3. Built-in Studio Apartment Prefab (`house.studio.v1`)
// ============================================================================

export function buildStudioApartmentPrefabV1(): {
	prefab: ScenePrefabV1;
	recipes: SceneGeometryRecipeV1[];
} {
	// Reusable shared recipes
	const wallRecipe = createGeometryRecipeV1({
		recipeId: 'prefab_wall_plaster_v1',
		name: 'Plaster Wall Segment (4m x 2.8m x 0.2m)',
		primitiveKind: 'box',
		dimensions: { width: 4.0, height: 2.8, depth: 0.2 },
		materialKey: 'ivory',
		detailLevel: 'balanced'
	});

	const floorRecipe = createGeometryRecipeV1({
		recipeId: 'prefab_floor_wood_v1',
		name: 'Studio Floor Wood Parquet (6m x 8m x 0.15m)',
		primitiveKind: 'box',
		dimensions: { width: 6.0, height: 0.15, depth: 8.0 },
		materialKey: 'dark-leather',
		detailLevel: 'balanced'
	});

	const tableRecipe = createGeometryRecipeV1({
		recipeId: 'prefab_table_dining_v1',
		name: 'Dining Table (1.4m x 0.75m x 0.8m)',
		primitiveKind: 'box',
		dimensions: { width: 1.4, height: 0.75, depth: 0.8 },
		materialKey: 'steel',
		detailLevel: 'balanced'
	});

	const chairRecipe = createGeometryRecipeV1({
		recipeId: 'prefab_chair_lowpoly_v1',
		name: 'Dining Chair (0.45m x 0.85m x 0.45m)',
		primitiveKind: 'box',
		dimensions: { width: 0.45, height: 0.85, depth: 0.45 },
		materialKey: 'dark-leather',
		detailLevel: 'balanced'
	});

	const ceilingLightRecipe = createGeometryRecipeV1({
		recipeId: 'prefab_ceiling_light_v1',
		name: 'Ceiling Disc Light',
		primitiveKind: 'cylinder',
		dimensions: { radius: 0.3, height: 0.08 },
		materialKey: 'evidence-gold',
		detailLevel: 'retro'
	});

	const recipes = [wallRecipe, floorRecipe, tableRecipe, chairRecipe, ceilingLightRecipe];

	// Components defining the studio layout
	const components: PrefabComponentV1[] = [
		// Floor
		{
			componentId: 'comp_floor',
			name: 'Studio Floor',
			conceptId: 'spatial.floor',
			recipeId: floorRecipe.recipeId,
			relativeTransform: { position: [0, 0, 0], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] },
			isInstanced: false,
			behaviorPolicy: 'STATIC_COLLIDER'
		},
		// North Wall
		{
			componentId: 'comp_wall_north',
			name: 'North Plaster Wall',
			conceptId: 'spatial.wall',
			recipeId: wallRecipe.recipeId,
			relativeTransform: { position: [0, 1.4, -4.0], rotationXyzw: [0, 0, 0, 1], scale: [1.5, 1, 1] },
			isInstanced: true,
			behaviorPolicy: 'STATIC_COLLIDER'
		},
		// South Wall
		{
			componentId: 'comp_wall_south',
			name: 'South Plaster Wall',
			conceptId: 'spatial.wall',
			recipeId: wallRecipe.recipeId,
			relativeTransform: { position: [0, 1.4, 4.0], rotationXyzw: [0, 0, 0, 1], scale: [1.5, 1, 1] },
			isInstanced: true,
			behaviorPolicy: 'STATIC_COLLIDER'
		},
		// Dining Table
		{
			componentId: 'comp_table',
			name: 'Dining Table',
			conceptId: 'object.furniture.table',
			recipeId: tableRecipe.recipeId,
			relativeTransform: { position: [0, 0.45, 0], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] },
			isInstanced: false,
			behaviorPolicy: 'INTERACTIVE_GIZMO'
		},
		// Chair West
		{
			componentId: 'comp_chair_west',
			name: 'Chair West',
			conceptId: 'object.furniture.chair',
			recipeId: chairRecipe.recipeId,
			relativeTransform: { position: [-0.65, 0.5, 0], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] },
			isInstanced: true,
			behaviorPolicy: 'INTERACTIVE_GIZMO'
		},
		// Chair East
		{
			componentId: 'comp_chair_east',
			name: 'Chair East',
			conceptId: 'object.furniture.chair',
			recipeId: chairRecipe.recipeId,
			relativeTransform: { position: [0.65, 0.5, 0], rotationXyzw: [0, 1, 0, 0], scale: [1, 1, 1] },
			isInstanced: true,
			behaviorPolicy: 'INTERACTIVE_GIZMO'
		},
		// Ceiling Light
		{
			componentId: 'comp_light',
			name: 'Ceiling Ambient Light',
			conceptId: 'object.fixtures',
			recipeId: ceilingLightRecipe.recipeId,
			relativeTransform: { position: [0, 2.7, 0], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] },
			isInstanced: true,
			behaviorPolicy: 'PASSIVE_DECORATION'
		}
	];

	const prefab = createScenePrefabV1({
		prefabId: 'house.studio.v1',
		name: 'Studio Apartment Blockout (6m x 8m)',
		category: 'building',
		visualStyle: 'balanced',
		authority: 'GENERATED_ILLUSTRATIVE_BLOCKOUT',
		dimensions: { width: 6.0, height: 2.8, depth: 8.0 },
		components
	});

	return {
		prefab,
		recipes
	};
}
