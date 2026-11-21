/**
 * Parent Atlas P0 Modular Mesh Recipes & Four-Bedroom House Prefab Assembly (v1)
 *
 * Bridges the verified P0 requirements from Parent_Atlas_Mesh_Requirements_v1.json
 * to reusable SceneGeometryRecipeV1 definitions and canonical pa:* ontology concepts
 * in scene-ontology-catalog-v1.json.
 *
 * Invariants:
 * - Every recipe is reusable across multiple instanced objects (one geometry buffer, many transforms).
 * - Every object keeps its own unique objectId and optional sourceBinding.
 * - Authority is explicitly labeled (GENERATED_ILLUSTRATIVE_BLOCKOUT until reviewed against calibrated evidence).
 */

import { z } from 'zod';
import {
	createGeometryRecipeV1,
	type SceneGeometryRecipeV1,
	type SceneObjectInstanceV1
} from './scene-object-registry-v1.js';
import {
	createScenePrefabV1,
	ScenePrefabRegistryV1,
	type CompiledPrefabResultV1,
	type PrefabComponentV1,
	type ScenePrefabV1
} from './scene-prefab-registry-v1.js';

export interface P0ModularRecipeEntryV1 {
	readonly draftMeshKey: string;
	readonly canonicalOntologyConceptId: string;
	readonly recommendedBuilder: 'cpp' | 'blender' | 'blender_rig' | 'threejs';
	readonly recipe: SceneGeometryRecipeV1;
}

/**
 * Core P0 reusable modular recipes (architecture, furniture, terrain, urban, evidence).
 * Multiple components in a house or city block reference the same recipeId.
 */
export const P0_MODULAR_RECIPES_V1: readonly P0ModularRecipeEntryV1[] = Object.freeze([
	// Architecture / Structure
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.foundation_slab.v1',
		canonicalOntologyConceptId: 'pa:space.structure.floor-slab',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_foundation_slab_14x12_v1',
			name: 'Foundation Slab (14m x 0.25m x 12m)',
			primitiveKind: 'box',
			dimensions: { width: 14.0, height: 0.25, depth: 12.0 },
			materialKey: 'steel',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.floor_slab.v1',
		canonicalOntologyConceptId: 'pa:space.structure.floor-slab',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_floor_slab_4x4_v1',
			name: 'Modular Floor Tile (4m x 0.12m x 4m)',
			primitiveKind: 'box',
			dimensions: { width: 4.0, height: 0.12, depth: 4.0 },
			materialKey: 'dark-leather',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.wall_exterior.v1',
		canonicalOntologyConceptId: 'pa:space.structure.wall',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_wall_exterior_4m_v1',
			name: 'Exterior Wall Module (4m x 2.8m x 0.24m)',
			primitiveKind: 'box',
			dimensions: { width: 4.0, height: 2.8, depth: 0.24 },
			materialKey: 'ivory',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.wall_interior.v1',
		canonicalOntologyConceptId: 'pa:space.structure.wall',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_wall_interior_4m_v1',
			name: 'Interior Partition Wall (4m x 2.8m x 0.14m)',
			primitiveKind: 'box',
			dimensions: { width: 4.0, height: 2.8, depth: 0.14 },
			materialKey: 'ivory',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.wall_corner.v1',
		canonicalOntologyConceptId: 'pa:space.structure.wall',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_wall_corner_v1',
			name: 'Corner Wall Post (0.24m x 2.8m x 0.24m)',
			primitiveKind: 'box',
			dimensions: { width: 0.24, height: 2.8, depth: 0.24 },
			materialKey: 'ivory',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.door_frame.v1',
		canonicalOntologyConceptId: 'pa:geometry.composite.door-frame',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_door_frame_v1',
			name: 'Standard Door Frame (1.0m x 2.1m x 0.18m)',
			primitiveKind: 'box',
			dimensions: { width: 1.0, height: 2.1, depth: 0.18 },
			materialKey: 'brass',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.door_leaf.v1',
		canonicalOntologyConceptId: 'pa:space.structure.door',
		recommendedBuilder: 'blender',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_door_leaf_v1',
			name: 'Hinged Door Leaf (0.9m x 2.04m x 0.05m)',
			primitiveKind: 'box',
			dimensions: { width: 0.9, height: 2.04, depth: 0.05 },
			materialKey: 'dark-leather',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.window_frame.v1',
		canonicalOntologyConceptId: 'pa:space.structure.window',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_window_frame_v1',
			name: 'Standard Window Frame (1.4m x 1.2m x 0.18m)',
			primitiveKind: 'box',
			dimensions: { width: 1.4, height: 1.2, depth: 0.18 },
			materialKey: 'steel',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.roof_gable.v1',
		canonicalOntologyConceptId: 'pa:space.structure.roof',
		recommendedBuilder: 'blender',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_roof_gable_14x12_v1',
			name: 'Gable Roof Cap (14.6m x 1.8m x 12.6m)',
			primitiveKind: 'polygon_prism',
			dimensions: { width: 14.6, height: 1.8, depth: 12.6 },
			polygonVertices: [
				[-6.3, 0],
				[0, 1.8],
				[6.3, 0]
			],
			extrusionDepth: 14.6,
			materialKey: 'dark-leather',
			detailLevel: 'retro'
		})
	},

	// Indoor Furniture (P0)
	{
		draftMeshKey: 'atlas.mesh.indoor_furniture.bed_frame.v1',
		canonicalOntologyConceptId: 'pa:geometry.composite.bed',
		recommendedBuilder: 'blender',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_bed_frame_v1',
			name: 'Single/Queen Bed Frame (1.6m x 0.55m x 2.0m)',
			primitiveKind: 'box',
			dimensions: { width: 1.6, height: 0.55, depth: 2.0 },
			materialKey: 'ivory',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.indoor_furniture.sofa.v1',
		canonicalOntologyConceptId: 'pa:geometry.composite.sofa',
		recommendedBuilder: 'blender',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_sofa_3seat_v1',
			name: 'Three-Seat Sofa (2.1m x 0.85m x 0.9m)',
			primitiveKind: 'box',
			dimensions: { width: 2.1, height: 0.85, depth: 0.9 },
			materialKey: 'dark-leather',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.indoor_furniture.desk.v1',
		canonicalOntologyConceptId: 'pa:object.furniture.desk',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_desk_v1',
			name: 'Study / Office Desk (1.4m x 0.75m x 0.7m)',
			primitiveKind: 'box',
			dimensions: { width: 1.4, height: 0.75, depth: 0.7 },
			materialKey: 'brass',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.indoor_furniture.kitchen_counter.v1',
		canonicalOntologyConceptId: 'pa:object.furniture.counter',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_kitchen_counter_v1',
			name: 'Kitchen Counter Block (2.8m x 0.9m x 0.65m)',
			primitiveKind: 'box',
			dimensions: { width: 2.8, height: 0.9, depth: 0.65 },
			materialKey: 'steel',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.indoor_furniture.table_simple.v1',
		canonicalOntologyConceptId: 'pa:geometry.composite.table',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_table_simple_v1',
			name: 'Dining Table (1.8m x 0.75m x 0.9m)',
			primitiveKind: 'box',
			dimensions: { width: 1.8, height: 0.75, depth: 0.9 },
			materialKey: 'brass',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.indoor_furniture.chair_simple.v1',
		canonicalOntologyConceptId: 'pa:geometry.composite.chair',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_chair_simple_v1',
			name: 'Basic Chair (0.48m x 0.85m x 0.48m)',
			primitiveKind: 'box',
			dimensions: { width: 0.48, height: 0.85, depth: 0.48 },
			materialKey: 'dark-leather',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.indoor_furniture.ceiling_light.v1',
		canonicalOntologyConceptId: 'pa:object.fixture.light-fixture',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_ceiling_light_v1',
			name: 'Ceiling Light Fixture',
			primitiveKind: 'cylinder',
			dimensions: { radius: 0.25, height: 0.08 },
			materialKey: 'evidence-gold',
			detailLevel: 'retro'
		})
	},

	// Evidence & Actor Milestone Recipes
	{
		draftMeshKey: 'atlas.mesh.humanoid_modular.actor_skinned_7bone.v1',
		canonicalOntologyConceptId: 'pa:actor.representation.rigged-body',
		recommendedBuilder: 'blender_rig',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_actor_skinned_7bone_v1',
			name: 'Seven-Bone Rigged Reference Actor',
			primitiveKind: 'glb',
			dimensions: { width: 0.6, height: 1.75, depth: 0.35 },
			materialKey: 'steel',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.evidence_visualization.image_evidence_plane.v1',
		canonicalOntologyConceptId: 'pa:geometry.representation.source-image-plane',
		recommendedBuilder: 'threejs',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_image_evidence_plane_v1',
			name: 'Source Image Evidence Overlay Plane',
			primitiveKind: 'box',
			dimensions: { width: 1.6, height: 0.9, depth: 0.02 },
			materialKey: 'evidence-gold',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.evidence_visualization.evidence_marker_tent.v1',
		canonicalOntologyConceptId: 'pa:object.evidence-proxy.marker',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_evidence_marker_tent_v1',
			name: 'Numbered Evidence Marker Tent',
			primitiveKind: 'cone',
			dimensions: { radius: 0.12, height: 0.24 },
			materialKey: 'evidence-gold',
			detailLevel: 'retro'
		})
	},

	// Urban & Terrain P0 Recipes (for city.block.v1 & beach.night.v1)
	{
		draftMeshKey: 'atlas.mesh.terrain_environment.road_segment.v1',
		canonicalOntologyConceptId: 'pa:space.outdoor-zone.road',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_road_segment_8m_v1',
			name: 'Straight Road Segment (8m x 0.08m x 6m)',
			primitiveKind: 'box',
			dimensions: { width: 8.0, height: 0.08, depth: 6.0 },
			materialKey: 'dark-leather',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.terrain_environment.road_intersection.v1',
		canonicalOntologyConceptId: 'pa:space.outdoor-zone.intersection',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_road_intersection_8x8_v1',
			name: 'Road Intersection Slab (8m x 0.08m x 8m)',
			primitiveKind: 'box',
			dimensions: { width: 8.0, height: 0.08, depth: 8.0 },
			materialKey: 'dark-leather',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.terrain_environment.sidewalk.v1',
		canonicalOntologyConceptId: 'pa:space.outdoor-zone.sidewalk',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_sidewalk_8x2_v1',
			name: 'Sidewalk Slab (8m x 0.16m x 2.2m)',
			primitiveKind: 'box',
			dimensions: { width: 8.0, height: 0.16, depth: 2.2 },
			materialKey: 'ivory',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.terrain_environment.curb.v1',
		canonicalOntologyConceptId: 'pa:space.outdoor-zone.sidewalk',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_curb_8m_v1',
			name: 'Curb Segment (8m x 0.18m x 0.2m)',
			primitiveKind: 'box',
			dimensions: { width: 8.0, height: 0.18, depth: 0.2 },
			materialKey: 'steel',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.architecture_structure.facade_section.v1',
		canonicalOntologyConceptId: 'pa:space.building',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_facade_section_8m_v1',
			name: 'Urban Building Facade (8m x 9m x 0.35m)',
			primitiveKind: 'box',
			dimensions: { width: 8.0, height: 9.0, depth: 0.35 },
			materialKey: 'steel',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.urban_outdoor.streetlamp.v1',
		canonicalOntologyConceptId: 'pa:object.landscape.lamp-post',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_streetlamp_v1',
			name: 'Streetlamp Post (4.2m)',
			primitiveKind: 'cylinder',
			dimensions: { radius: 0.1, height: 4.2 },
			materialKey: 'steel',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.urban_outdoor.crosswalk_marking.v1',
		canonicalOntologyConceptId: 'pa:space.outdoor-zone.crosswalk',
		recommendedBuilder: 'threejs',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_crosswalk_stripe_v1',
			name: 'Crosswalk Marking Stripe (2.5m x 0.02m x 0.45m)',
			primitiveKind: 'box',
			dimensions: { width: 2.5, height: 0.02, depth: 0.45 },
			materialKey: 'ivory',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.urban_outdoor.vehicle_car_proxy.v1',
		canonicalOntologyConceptId: 'pa:geometry.composite.vehicle-proxy',
		recommendedBuilder: 'blender',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_vehicle_car_proxy_v1',
			name: 'Generic Car Proxy (4.4m x 1.45m x 1.8m)',
			primitiveKind: 'box',
			dimensions: { width: 4.4, height: 1.45, depth: 1.8 },
			materialKey: 'steel',
			detailLevel: 'balanced'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.terrain_environment.beach_sand.v1',
		canonicalOntologyConceptId: 'pa:object.landscape.sand',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_beach_sand_16x16_v1',
			name: 'Beach Sand Surface Tile (16m x 0.2m x 16m)',
			primitiveKind: 'box',
			dimensions: { width: 16.0, height: 0.2, depth: 16.0 },
			materialKey: 'ivory',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.terrain_environment.shoreline_strip.v1',
		canonicalOntologyConceptId: 'pa:space.outdoor-zone.shore',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_shoreline_strip_16m_v1',
			name: 'Shoreline Transition Strip (16m x 0.08m x 3m)',
			primitiveKind: 'box',
			dimensions: { width: 16.0, height: 0.08, depth: 3.0 },
			materialKey: 'brass',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.terrain_environment.coastal_water.v1',
		canonicalOntologyConceptId: 'pa:object.landscape.water',
		recommendedBuilder: 'threejs',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_coastal_water_16x16_v1',
			name: 'Coastal Water Plane (16m x 0.05m x 16m)',
			primitiveKind: 'box',
			dimensions: { width: 16.0, height: 0.05, depth: 16.0 },
			materialKey: 'steel',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.urban_outdoor.bonfire_assembly.v1',
		canonicalOntologyConceptId: 'pa:object.landscape.fire-pit',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_bonfire_assembly_v1',
			name: 'Bonfire Wood Assembly',
			primitiveKind: 'cone',
			dimensions: { radius: 0.55, height: 0.45 },
			materialKey: 'brass',
			detailLevel: 'retro'
		})
	},
	{
		draftMeshKey: 'atlas.mesh.humanoid_modular.actor_witness_placeholder.v1',
		canonicalOntologyConceptId: 'pa:actor.role.illustrative-participant',
		recommendedBuilder: 'cpp',
		recipe: createGeometryRecipeV1({
			recipeId: 'p0_actor_witness_placeholder_v1',
			name: 'Illustrative Witness Placeholder (1.7m)',
			primitiveKind: 'cylinder',
			dimensions: { radius: 0.22, height: 1.7 },
			materialKey: 'evidence-gold',
			detailLevel: 'retro'
		})
	}
]);

const IDENTITY_ROTATION: [number, number, number, number] = [0, 0, 0, 1];
const ROT_Y_90: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

function comp(
	componentId: string,
	name: string,
	conceptId: string,
	recipeId: string,
	position: [number, number, number],
	options: {
		rotationXyzw?: [number, number, number, number];
		scale?: [number, number, number];
		isInstanced?: boolean;
		behaviorPolicy?: PrefabComponentV1['behaviorPolicy'];
	} = {}
): PrefabComponentV1 {
	return {
		componentId,
		name,
		conceptId,
		recipeId,
		relativeTransform: {
			position,
			rotationXyzw: options.rotationXyzw ?? IDENTITY_ROTATION,
			scale: options.scale ?? [1, 1, 1]
		},
		isInstanced: options.isInstanced ?? true,
		behaviorPolicy: options.behaviorPolicy ?? 'STATIC_COLLIDER'
	};
}

/**
 * Builds `house.four_bedroom.v1` (atlas.prefab.house.four_bedroom.v1):
 * A 14m x 12m single-story 4-bedroom residential house assembled strictly from
 * reusable modular recipes (shared walls, doors, windows, beds, sofa, kitchen, lights).
 */
export function buildFourBedroomHousePrefabV1(): {
	prefab: ScenePrefabV1;
	recipes: SceneGeometryRecipeV1[];
} {
	const recipes = P0_MODULAR_RECIPES_V1.map((entry) => entry.recipe);

	const components: PrefabComponentV1[] = [
		// Foundation slab
		comp('foundation_main', 'Foundation Slab', 'pa:space.structure.floor-slab', 'p0_foundation_slab_14x12_v1', [0, -0.125, 0], {
			isInstanced: false
		}),

		// Perimeter exterior walls (14m x 12m footprint)
		comp('wall_ext_north_w', 'North Exterior Wall West', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [-4.5, 1.4, -6.0], { scale: [1.25, 1, 1] }),
		comp('wall_ext_north_e', 'North Exterior Wall East', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [4.5, 1.4, -6.0], { scale: [1.25, 1, 1] }),
		comp('wall_ext_south_w', 'South Exterior Wall West', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [-4.5, 1.4, 6.0], { scale: [1.25, 1, 1] }),
		comp('wall_ext_south_e', 'South Exterior Wall East', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [4.5, 1.4, 6.0], { scale: [1.25, 1, 1] }),
		comp('wall_ext_west_n', 'West Exterior Wall North', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [-7.0, 1.4, -3.0], { rotationXyzw: ROT_Y_90, scale: [1.5, 1, 1] }),
		comp('wall_ext_west_s', 'West Exterior Wall South', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [-7.0, 1.4, 3.0], { rotationXyzw: ROT_Y_90, scale: [1.5, 1, 1] }),
		comp('wall_ext_east_n', 'East Exterior Wall North', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [7.0, 1.4, -3.0], { rotationXyzw: ROT_Y_90, scale: [1.5, 1, 1] }),
		comp('wall_ext_east_s', 'East Exterior Wall South', 'pa:space.structure.wall', 'p0_wall_exterior_4m_v1', [7.0, 1.4, 3.0], { rotationXyzw: ROT_Y_90, scale: [1.5, 1, 1] }),

		// Interior partition walls creating 4 corner bedrooms + central living/kitchen hall
		comp('wall_int_nw_s', 'Bedroom 1 South Partition', 'pa:space.structure.wall', 'p0_wall_interior_4m_v1', [-5.0, 1.4, -1.5]),
		comp('wall_int_ne_s', 'Bedroom 2 South Partition', 'pa:space.structure.wall', 'p0_wall_interior_4m_v1', [5.0, 1.4, -1.5]),
		comp('wall_int_sw_n', 'Bedroom 3 North Partition', 'pa:space.structure.wall', 'p0_wall_interior_4m_v1', [-5.0, 1.4, 1.5]),
		comp('wall_int_se_n', 'Bedroom 4 North Partition', 'pa:space.structure.wall', 'p0_wall_interior_4m_v1', [5.0, 1.4, 1.5]),

		// Doors & Windows
		comp('door_front_frame', 'Front Entry Door Frame', 'pa:geometry.composite.door-frame', 'p0_door_frame_v1', [0, 1.05, 6.0]),
		comp('door_front_leaf', 'Front Entry Door Leaf', 'pa:space.structure.door', 'p0_door_leaf_v1', [0, 1.02, 6.02], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('win_living_n', 'North Living Window', 'pa:space.structure.window', 'p0_window_frame_v1', [0, 1.4, -6.0]),
		comp('win_bed1_w', 'Bedroom 1 Window', 'pa:space.structure.window', 'p0_window_frame_v1', [-7.0, 1.4, -4.0], { rotationXyzw: ROT_Y_90 }),
		comp('win_bed2_e', 'Bedroom 2 Window', 'pa:space.structure.window', 'p0_window_frame_v1', [7.0, 1.4, -4.0], { rotationXyzw: ROT_Y_90 }),

		// Gable Roof (passive non-blocking cap above ceiling height)
		comp('roof_main', 'House Gable Roof', 'pa:space.structure.roof', 'p0_roof_gable_14x12_v1', [0, 2.8, 0], {
			isInstanced: false,
			behaviorPolicy: 'PASSIVE_DECORATION'
		}),

		// 4 Bedrooms — shared Bed Frame recipe instanced 4 times
		comp('bed_1_nw', 'Bedroom 1 Bed', 'pa:geometry.composite.bed', 'p0_bed_frame_v1', [-5.2, 0.275, -4.2], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('bed_2_ne', 'Bedroom 2 Bed', 'pa:geometry.composite.bed', 'p0_bed_frame_v1', [5.2, 0.275, -4.2], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('bed_3_sw', 'Bedroom 3 Bed', 'pa:geometry.composite.bed', 'p0_bed_frame_v1', [-5.2, 0.275, 4.2], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('bed_4_se', 'Bedroom 4 Bed', 'pa:geometry.composite.bed', 'p0_bed_frame_v1', [5.2, 0.275, 4.2], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),

		// Central Living, Dining & Kitchen
		comp('living_sofa', 'Living Room Sofa', 'pa:geometry.composite.sofa', 'p0_sofa_3seat_v1', [0, 0.425, 2.0], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('dining_table', 'Dining Table', 'pa:geometry.composite.table', 'p0_table_simple_v1', [0, 0.375, -1.5], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('dining_chair_w', 'Dining Chair West', 'pa:geometry.composite.chair', 'p0_chair_simple_v1', [-1.1, 0.425, -1.5], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('dining_chair_e', 'Dining Chair East', 'pa:geometry.composite.chair', 'p0_chair_simple_v1', [1.1, 0.425, -1.5], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('kitchen_counter', 'Kitchen Counter', 'pa:object.furniture.counter', 'p0_kitchen_counter_v1', [0, 0.45, -5.2], { behaviorPolicy: 'STATIC_COLLIDER' }),
		comp('study_desk', 'Bedroom 1 Desk', 'pa:object.furniture.desk', 'p0_desk_v1', [-3.4, 0.375, -4.8], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),

		// Ceiling Lights (instanced across rooms)
		comp('light_living', 'Living Ceiling Light', 'pa:object.fixture.light-fixture', 'p0_ceiling_light_v1', [0, 2.74, 0], { behaviorPolicy: 'PASSIVE_DECORATION' }),
		comp('light_bed1', 'Bedroom 1 Ceiling Light', 'pa:object.fixture.light-fixture', 'p0_ceiling_light_v1', [-5.0, 2.74, -3.8], { behaviorPolicy: 'PASSIVE_DECORATION' }),
		comp('light_bed2', 'Bedroom 2 Ceiling Light', 'pa:object.fixture.light-fixture', 'p0_ceiling_light_v1', [5.0, 2.74, -3.8], { behaviorPolicy: 'PASSIVE_DECORATION' }),
		comp('light_bed3', 'Bedroom 3 Ceiling Light', 'pa:object.fixture.light-fixture', 'p0_ceiling_light_v1', [-5.0, 2.74, 3.8], { behaviorPolicy: 'PASSIVE_DECORATION' }),
		comp('light_bed4', 'Bedroom 4 Ceiling Light', 'pa:object.fixture.light-fixture', 'p0_ceiling_light_v1', [5.0, 2.74, 3.8], { behaviorPolicy: 'PASSIVE_DECORATION' })
	];

	const prefab = createScenePrefabV1({
		prefabId: 'house.four_bedroom.v1',
		name: 'Four-Bedroom Residential House (14m x 12m)',
		category: 'building',
		visualStyle: 'balanced',
		authority: 'GENERATED_ILLUSTRATIVE_BLOCKOUT',
		dimensions: { width: 14.0, height: 4.6, depth: 12.0 },
		components
	});

	return { prefab, recipes };
}

export interface FourBedroomMilestoneSceneV1 {
	compiledHouse: CompiledPrefabResultV1;
	riggedActor: SceneObjectInstanceV1;
	evidenceOverlay: SceneObjectInstanceV1;
	evidenceMarker: SceneObjectInstanceV1;
	recipes: SceneGeometryRecipeV1[];
}

/**
 * Assembles the target milestone scene:
 * 1. Four-bedroom house (`house.four_bedroom.v1`) from reusable shared parts
 * 2. One rigged actor (`pa:actor.representation.rigged-body`)
 * 3. Source-linked evidence overlay + marker tent (`pa:geometry.representation.source-image-plane`)
 */
export function buildFourBedroomHouseMilestoneSceneV1(input: {
	caseId: string;
	sceneId: string;
	evidenceId: string;
	sourceRevision: string;
}): FourBedroomMilestoneSceneV1 {
	const registry = new ScenePrefabRegistryV1();
	const { prefab, recipes } = buildFourBedroomHousePrefabV1();
	for (const r of recipes) registry.registerRecipe(r);
	registry.registerPrefab(prefab);

	const compiledHouse = registry.compilePrefab(prefab.prefabId, {
		caseId: input.caseId,
		sceneId: input.sceneId
	});

	const riggedActor: SceneObjectInstanceV1 = {
		objectId: crypto.randomUUID(),
		name: 'Seven-Bone Rigged Actor (Living Room)',
		recipeId: 'p0_actor_skinned_7bone_v1',
		ontologyConceptId: 'pa:actor.representation.rigged-body',
		transform: {
			position: [0.8, 0, 0.5],
			rotationXyzw: [0, 0, 0, 1],
			scale: [1, 1, 1]
		},
		isInstanced: false
	};

	const evidenceOverlay: SceneObjectInstanceV1 = {
		objectId: crypto.randomUUID(),
		name: 'Source Image Evidence Overlay',
		recipeId: 'p0_image_evidence_plane_v1',
		ontologyConceptId: 'pa:geometry.representation.source-image-plane',
		transform: {
			position: [0, 1.35, -0.2],
			rotationXyzw: [0, 0, 0, 1],
			scale: [1, 1, 1]
		},
		isInstanced: false,
		sourceBinding: {
			evidenceId: input.evidenceId,
			sourceRevision: input.sourceRevision,
			observationId: 'obs_house_living_01',
			coordinateStatus: 'ILLUSTRATIVE_UNCALIBRATED'
		}
	};

	const evidenceMarker: SceneObjectInstanceV1 = {
		objectId: crypto.randomUUID(),
		name: 'Evidence Marker Tent #1',
		recipeId: 'p0_evidence_marker_tent_v1',
		ontologyConceptId: 'pa:object.evidence-proxy.marker',
		transform: {
			position: [0.4, 0.12, 0.1],
			rotationXyzw: [0, 0, 0, 1],
			scale: [1, 1, 1]
		},
		isInstanced: true,
		instancedMeshKey: 'instanced_p0_evidence_marker_tent_v1',
		sourceBinding: {
			evidenceId: input.evidenceId,
			sourceRevision: input.sourceRevision,
			observationId: 'obs_house_marker_01',
			coordinateStatus: 'ILLUSTRATIVE_UNCALIBRATED'
		}
	};

	return {
		compiledHouse,
		riggedActor,
		evidenceOverlay,
		evidenceMarker,
		recipes
	};
}

/**
 * Builds `city.block.v1` (atlas.prefab.city.block.v1):
 * Reusable urban city block assembled from road segments, intersection,
 * sidewalks, curbs, building facades, streetlamps, crosswalk markings, and car proxy.
 */
export function buildCityBlockPrefabV1(): {
	prefab: ScenePrefabV1;
	recipes: SceneGeometryRecipeV1[];
} {
	const recipes = P0_MODULAR_RECIPES_V1.map((entry) => entry.recipe);
	const components: PrefabComponentV1[] = [
		comp('road_int_0', 'Main Intersection', 'pa:space.outdoor-zone.intersection', 'p0_road_intersection_8x8_v1', [0, -0.04, 0], { isInstanced: false }),
		comp('road_seg_w', 'Road Segment West', 'pa:space.outdoor-zone.road', 'p0_road_segment_8m_v1', [-8.0, -0.04, 0]),
		comp('road_seg_e', 'Road Segment East', 'pa:space.outdoor-zone.road', 'p0_road_segment_8m_v1', [8.0, -0.04, 0]),
		comp('sidewalk_n', 'North Sidewalk', 'pa:space.outdoor-zone.sidewalk', 'p0_sidewalk_8x2_v1', [0, 0.08, -5.2]),
		comp('sidewalk_s', 'South Sidewalk', 'pa:space.outdoor-zone.sidewalk', 'p0_sidewalk_8x2_v1', [0, 0.08, 5.2]),
		comp('curb_n', 'North Curb', 'pa:space.outdoor-zone.sidewalk', 'p0_curb_8m_v1', [0, 0.09, -4.0]),
		comp('curb_s', 'South Curb', 'pa:space.outdoor-zone.sidewalk', 'p0_curb_8m_v1', [0, 0.09, 4.0]),
		comp('facade_nw', 'North Facade Module', 'pa:space.building', 'p0_facade_section_8m_v1', [-4.0, 4.5, -6.5]),
		comp('facade_ne', 'North-East Facade Module', 'pa:space.building', 'p0_facade_section_8m_v1', [4.0, 4.5, -6.5]),
		comp('lamp_nw', 'Streetlamp NW', 'pa:object.landscape.lamp-post', 'p0_streetlamp_v1', [-5.0, 2.1, -4.4]),
		comp('lamp_ne', 'Streetlamp NE', 'pa:object.landscape.lamp-post', 'p0_streetlamp_v1', [5.0, 2.1, -4.4]),
		comp('crosswalk_0', 'Crosswalk Stripe 1', 'pa:space.outdoor-zone.crosswalk', 'p0_crosswalk_stripe_v1', [-3.5, 0.01, -1.5]),
		comp('crosswalk_1', 'Crosswalk Stripe 2', 'pa:space.outdoor-zone.crosswalk', 'p0_crosswalk_stripe_v1', [-3.5, 0.01, 0.0]),
		comp('crosswalk_2', 'Crosswalk Stripe 3', 'pa:space.outdoor-zone.crosswalk', 'p0_crosswalk_stripe_v1', [-3.5, 0.01, 1.5]),
		comp('car_proxy_0', 'Parked Car Proxy', 'pa:geometry.composite.vehicle-proxy', 'p0_vehicle_car_proxy_v1', [4.0, 0.725, 2.2], { behaviorPolicy: 'INTERACTIVE_GIZMO' })
	];

	const prefab = createScenePrefabV1({
		prefabId: 'city.block.v1',
		name: 'Urban City Block (24m x 14m)',
		category: 'street_prop',
		visualStyle: 'balanced',
		authority: 'GENERATED_ILLUSTRATIVE_BLOCKOUT',
		dimensions: { width: 24.0, height: 9.0, depth: 14.0 },
		components
	});

	return { prefab, recipes };
}

/**
 * Builds `beach.night.v1` (atlas.prefab.beach.night.v1):
 * Nighttime beach / bonfire illustrative scene assembled from beach sand,
 * shoreline strip, coastal water, bonfire assembly, streetlamp, and witness placeholder.
 */
export function buildBeachNightPrefabV1(): {
	prefab: ScenePrefabV1;
	recipes: SceneGeometryRecipeV1[];
} {
	const recipes = P0_MODULAR_RECIPES_V1.map((entry) => entry.recipe);
	const components: PrefabComponentV1[] = [
		comp('beach_sand_main', 'Beach Sand Tile', 'pa:object.landscape.sand', 'p0_beach_sand_16x16_v1', [0, -0.1, 4.0], { isInstanced: false }),
		comp('shoreline_0', 'Shoreline Strip', 'pa:space.outdoor-zone.shore', 'p0_shoreline_strip_16m_v1', [0, -0.04, -5.5]),
		comp('water_0', 'Coastal Water Plane', 'pa:object.landscape.water', 'p0_coastal_water_16x16_v1', [0, -0.06, -15.0], { isInstanced: false, behaviorPolicy: 'PASSIVE_DECORATION' }),
		comp('bonfire_0', 'Bonfire Assembly', 'pa:object.landscape.fire-pit', 'p0_bonfire_assembly_v1', [0, 0.225, 2.0], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('boardwalk_lamp', 'Boardwalk Streetlamp', 'pa:object.landscape.lamp-post', 'p0_streetlamp_v1', [-6.0, 2.1, 9.0]),
		comp('witness_1', 'Witness Placeholder 1', 'pa:actor.role.illustrative-participant', 'p0_actor_witness_placeholder_v1', [-1.8, 0.85, 2.4], { behaviorPolicy: 'INTERACTIVE_GIZMO' }),
		comp('witness_2', 'Witness Placeholder 2', 'pa:actor.role.illustrative-participant', 'p0_actor_witness_placeholder_v1', [1.9, 0.85, 1.8], { behaviorPolicy: 'INTERACTIVE_GIZMO' })
	];

	const prefab = createScenePrefabV1({
		prefabId: 'beach.night.v1',
		name: 'Nighttime Beach & Bonfire Cluster (16m x 30m)',
		category: 'beach_cluster',
		visualStyle: 'retro',
		authority: 'GENERATED_ILLUSTRATIVE_BLOCKOUT',
		dimensions: { width: 16.0, height: 4.2, depth: 30.0 },
		components
	});

	return { prefab, recipes };
}

/**
 * Minimum technical metadata contract for authorized catalog registration
 * (22 required/optional fields from Parent Atlas Mesh Requirements v1).
 */
export const catalogAssetRegistrationV1Schema = z
	.object({
		assetId: z.string().uuid(),
		meshTemplateId: z.string().min(1).max(160),
		registryRevision: z.string().min(1).max(100),
		ontologyConceptIds: z.array(z.string().regex(/^pa:[a-z0-9.-]+$/)).min(1),
		representation: z.enum(['geometry', 'rigged_geometry', 'runtime_visual']),
		sourceKind: z.enum(['procedural_recipe', 'blender_generated', 'evidence_derived', 'synthetic_fixture']),
		generator: z.enum(['cpp', 'blender', 'blender_rig', 'threejs', 'trellis_optional']),
		generatorRevision: z.string().min(1).max(100),
		sourceRights: z.enum(['public-procedural', 'case-authorized', 'third-party-licensed']),
		sourceSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
		artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
		licenseApproval: z.enum(['approved', 'manual_review', 'blocked']),
		lod: z.enum(['retro', 'balanced', 'detailed']),
		encodedBytes: z.number().int().nonnegative(),
		decodedBytes: z.number().int().nonnegative(),
		gpuEstimatedBytes: z.number().int().nonnegative(),
		materialRefs: z.array(z.string().min(1)),
		textureRefs: z.array(z.string().min(1)),
		rigSignature: z.string().min(1).optional(),
		socketNames: z.array(z.string().min(1)),
		authorizingCaseScope: z.string().min(1).optional(),
		reviewStatus: z.enum(['RAW', 'CANDIDATE', 'REVIEWED', 'REJECTED'])
	})
	.strict();

export type CatalogAssetRegistrationV1 = z.infer<typeof catalogAssetRegistrationV1Schema>;
