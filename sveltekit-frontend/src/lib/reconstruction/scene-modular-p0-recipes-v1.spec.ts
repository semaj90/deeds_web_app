import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	P0_MODULAR_RECIPES_V1,
	buildBeachNightPrefabV1,
	buildCityBlockPrefabV1,
	buildFourBedroomHouseMilestoneSceneV1,
	buildFourBedroomHousePrefabV1,
	catalogAssetRegistrationV1Schema
} from './scene-modular-p0-recipes-v1.js';
import { SceneObjectRegistryV1 } from './scene-object-registry-v1.js';
import { scenePrefabV1Schema } from './scene-prefab-registry-v1.js';

describe('Parent Atlas P0 Modular Recipes & Four-Bedroom House Milestone', () => {
	it('maps every P0 modular recipe to a verified pa:* concept in scene-ontology-catalog-v1.json', () => {
		const catalogPath = resolve(
			process.cwd(),
			'src/lib/splat/scene-ontology/scene-ontology-catalog-v1.json'
		);
		const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
			concepts: Array<{ id: string }>;
		};
		const validIds = new Set(catalog.concepts.map((c) => c.id));

		expect(P0_MODULAR_RECIPES_V1.length).toBeGreaterThanOrEqual(18);
		for (const entry of P0_MODULAR_RECIPES_V1) {
			expect(validIds.has(entry.canonicalOntologyConceptId)).toBe(true);
			expect(entry.recipe.recipeHash).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it('builds and validates house.four_bedroom.v1 from shared reusable recipes', () => {
		const { prefab, recipes } = buildFourBedroomHousePrefabV1();
		const parsed = scenePrefabV1Schema.safeParse(prefab);
		expect(parsed.success).toBe(true);
		expect(prefab.prefabId).toBe('house.four_bedroom.v1');
		expect(prefab.components.length).toBeGreaterThanOrEqual(30);

		const uniqueRecipeIds = new Set(prefab.components.map((c) => c.recipeId));
		expect(uniqueRecipeIds.size).toBeLessThan(prefab.components.length);
		expect(recipes.length).toBeGreaterThanOrEqual(uniqueRecipeIds.size);

		// Deterministic hash check
		const second = buildFourBedroomHousePrefabV1();
		expect(second.prefab.prefabHash).toBe(prefab.prefabHash);
	});

	it('assembles the 4-bedroom milestone scene with 1 rigged actor and source-linked evidence overlay', () => {
		const evidenceId = '11111111-2222-4333-8444-555555555555';
		const milestone = buildFourBedroomHouseMilestoneSceneV1({
			caseId: 'case-house-milestone-01',
			sceneId: 'scene-house-milestone-01',
			evidenceId,
			sourceRevision: 'sha256:abcdef0123456789'
		});

		const objRegistry = new SceneObjectRegistryV1();
		for (const r of milestone.recipes) {
			objRegistry.registerRecipe(r);
		}
		for (const inst of milestone.compiledHouse.spawnedObjects) {
			objRegistry.registerInstance(inst);
		}
		objRegistry.registerInstance(milestone.riggedActor);
		objRegistry.registerInstance(milestone.evidenceOverlay);
		objRegistry.registerInstance(milestone.evidenceMarker);

		expect(milestone.compiledHouse.spawnedObjects.length).toBeGreaterThanOrEqual(30);
		expect(milestone.riggedActor.ontologyConceptId).toBe('pa:actor.representation.rigged-body');
		expect(milestone.evidenceOverlay.sourceBinding?.evidenceId).toBe(evidenceId);
		expect(milestone.evidenceOverlay.sourceBinding?.coordinateStatus).toBe(
			'ILLUSTRATIVE_UNCALIBRATED'
		);
		expect(milestone.evidenceMarker.sourceBinding?.evidenceId).toBe(evidenceId);
		expect(objRegistry.getAllInstances().length).toBe(
			milestone.compiledHouse.spawnedObjects.length + 3
		);
	});

	it('builds city.block.v1 and beach.night.v1 P0 prefabs and validates catalog registration metadata', () => {
		const city = buildCityBlockPrefabV1();
		expect(scenePrefabV1Schema.safeParse(city.prefab).success).toBe(true);
		expect(city.prefab.prefabId).toBe('city.block.v1');
		expect(city.prefab.components.length).toBe(15);

		const beach = buildBeachNightPrefabV1();
		expect(scenePrefabV1Schema.safeParse(beach.prefab).success).toBe(true);
		expect(beach.prefab.prefabId).toBe('beach.night.v1');
		expect(beach.prefab.components.length).toBe(7);

		const reg = catalogAssetRegistrationV1Schema.safeParse({
			assetId: '11111111-2222-4333-8444-555555555555',
			meshTemplateId: 'atlas.mesh.architecture_structure.door_leaf.v1',
			registryRevision: 'scene-primitive-registry-v1',
			ontologyConceptIds: ['pa:space.structure.door'],
			representation: 'geometry',
			sourceKind: 'blender_generated',
			generator: 'blender',
			generatorRevision: '4.3.0',
			sourceRights: 'public-procedural',
			artifactSha256: 'a'.repeat(64),
			licenseApproval: 'approved',
			lod: 'balanced',
			encodedBytes: 18432,
			decodedBytes: 65536,
			gpuEstimatedBytes: 98304,
			materialRefs: ['dark-leather'],
			textureRefs: [],
			socketNames: [],
			reviewStatus: 'CANDIDATE'
		});
		expect(reg.success).toBe(true);
	});
});
