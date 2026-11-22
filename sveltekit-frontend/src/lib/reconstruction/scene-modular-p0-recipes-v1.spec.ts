import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	attachModularPrefabAssemblyToRecipeV1,
	SceneRuntimeRecipeV1Schema,
} from './scene-runtime-recipe-v1.js';
import { createSceneRuntimeThreeV1 } from './scene-runtime-three-v1.js';
import {
	P0_MODULAR_RECIPES_V1,
	buildBeachNightPrefabV1,
	buildCityBlockPrefabV1,
	buildCourtroomGenericPrefabV1,
	buildFourBedroomHouseMilestoneSceneV1,
	buildFourBedroomHousePrefabV1,
	buildOfficePrefabV1,
	buildParkingLotPrefabV1,
	catalogAssetRegistrationV1Schema,
	compilePrefabToPlanComponentsV1
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

	it('builds office.v1, road.parking_lot.v1, and courtroom.generic.v1 and compiles selectable plan targets', () => {
		const office = buildOfficePrefabV1();
		const lot = buildParkingLotPrefabV1();
		const court = buildCourtroomGenericPrefabV1();

		expect(scenePrefabV1Schema.safeParse(office.prefab).success).toBe(true);
		expect(scenePrefabV1Schema.safeParse(lot.prefab).success).toBe(true);
		expect(scenePrefabV1Schema.safeParse(court.prefab).success).toBe(true);

		const house = buildFourBedroomHousePrefabV1();
		const selectable = compilePrefabToPlanComponentsV1(house.prefab, house.recipes);
		const door = selectable.find((c) => c.capability === 'door');
		const light = selectable.find((c) => c.capability === 'light');
		expect(door?.objectId).toBe('house.four_bedroom.v1:door_front_leaf');
		expect(light?.ontologyConceptId).toBe('pa:object.fixture.light-fixture');
	});

	it('attaches canonical modular prefab assemblies directly into SceneRuntimeRecipeV1', () => {
		const baseRecipe = SceneRuntimeRecipeV1Schema.parse({
			schema: 'parent-atlas.scene-runtime-recipe/v1',
			planHash: 'a'.repeat(64),
			caseId: '11111111-2222-4333-8444-555555555555',
			sceneId: '22222222-3333-4444-8555-666666666666',
			sceneRevision: 1,
			environment: {
				kind: 'four-bedroom-house',
				seed: 7,
				profile: 'four-bedroom-house-v1',
				customRecipeId: null,
				cellSizeMeters: 16,
				extentMeters: { x: 16, z: 16 },
				coordinateStatus: 'illustrative_uncalibrated',
			},
			streaming: {
				algorithm: 'parent-atlas.scene-cell-residency/v1',
				maxResidentCells: 64,
				unloadGraceMs: 1500,
				activeSceneMemoryMiB: 8,
			},
			actors: [],
			primitiveRegistry: [],
			assets: [],
			placements: [],
			eventLanes: [],
			quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50000, maxInstances: 256 },
			narrative: {
				why: { status: 'unknown', text: null, evidenceIds: [], reviewStatus: 'unreviewed', reviewDecisionId: null },
				how: { status: 'unknown', text: null, evidenceIds: [], reviewStatus: 'unreviewed', reviewDecisionId: null },
			},
			provenance: {
				generator: 'procedural-three-scene-v1',
				clockPolicy: 'source_local_unaligned',
				identityPolicy: 'pseudonymous_visual_handles',
				motivePolicy: 'unknown_or_cited_hypothesis',
			},
		});

		const withCourt = attachModularPrefabAssemblyToRecipeV1(baseRecipe, 'courtroom.generic.v1');
		const withOffice = attachModularPrefabAssemblyToRecipeV1(withCourt, 'office.v1');
		expect(withOffice.prefabAssemblies?.length).toBe(2);
		expect(withOffice.prefabAssemblies?.[0]?.prefabId).toBe('courtroom.generic.v1');
		expect(withOffice.prefabAssemblies?.[0]?.components.length).toBeGreaterThan(0);
		expect(withOffice.prefabAssemblies?.[1]?.prefabId).toBe('office.v1');

		const runtime = createSceneRuntimeThreeV1(withOffice);
		try {
			const prefabRoot = runtime.root.getObjectByName('prefab-assemblies');
			expect(prefabRoot).toBeDefined();
			expect(runtime.prefabAssemblySummary.assemblyCount).toBe(2);
			expect(runtime.prefabAssemblySummary.spawnedCount).toBeGreaterThan(0);
			expect(runtime.prefabAssemblySummary.spawnedCount).toBeLessThanOrEqual(256);
			expect(runtime.prefabAssemblySummary.memoryBudgetMiB).toBeLessThanOrEqual(8);
			expect(runtime.prefabAssemblySummary.tupleCount).toBeGreaterThan(0);

			const firstComp = withOffice.prefabAssemblies![0]!.components[0]!;
			const targetNode = runtime.targetNodes.get(`primitive:${firstComp.objectId}`);
			expect(targetNode).toBeDefined();
			expect(targetNode?.userData.objectId).toBe(firstComp.objectId);
			expect(targetNode?.userData.prefabId).toBe('courtroom.generic.v1');
			expect(runtime.findObjectMesh(firstComp.objectId)).not.toBeNull();
		} finally {
			runtime.dispose();
		}
	});
});
