/**
 * detective-scene-composer.ts
 *
 * DETECTIVE-SCENE-COMPOSER-V1: Reusable Object Catalog & 6-DoF Scene Assembly Helper.
 * Bridges demonstrative crime scene composition with Parent Atlas Detective Mode.
 *
 * Invariants:
 * 1. Geometry Reference Architecture: Scenes store lightweight object references (catalogKey,
 *    assetRevision, 6-DoF pose) rather than copying heavy GLB/SPZ meshes into database documents.
 * 2. Google Earth Policy Boundary: User-provided GPS coordinates provide geographic context
 *    and map viewer framing; 3D geometry is strictly composed from independently-modeled catalog
 *    assets (no scraping or derivative model training on proprietary 3D tiles).
 * 3. Blender RNA Safety: Vertex extraction scripts target `mesh.vertices.foreach_get("co", coords)`
 *    to guarantee crash-free buffer reads under Windows MSVC.
 * 4. SIMD & Morton Alignment: Posed objects are converted to continuous 6D rotations and 30-bit
 *    Morton codes along the Z-order curve for cache-coherent AVX2/AVX-512 keyframe synthesis.
 */

import {
	detectiveSceneCompositionSchema,
	type DetectiveSceneComposition,
	type ScenePlacedObject,
	type SceneLocation
} from '../types/detective-scene-composition.js';
import {
	computeMorton30,
	type KeyframeChunk
} from '../spatial/spatial-simd-morton.js';

export interface CatalogObjectDefinition {
	catalogKey: string;
	title: string;
	category: 'structural' | 'furniture' | 'sensor' | 'forensic';
	boundingVolume: [number, number, number]; // [width, height, depth] in meters
	defaultScale: [number, number, number];
	assetRevision: string;
	description: string;
}

/** Standard reusable forensic object catalog (5 calibrated primitives) */
export const DETECTIVE_OBJECT_CATALOG: Record<string, CatalogObjectDefinition> = {
	'catalog:stairwell-concrete': {
		catalogKey: 'catalog:stairwell-concrete',
		title: 'Modular Concrete Stairwell',
		category: 'structural',
		boundingVolume: [3.20, 2.80, 1.40],
		defaultScale: [1, 1, 1],
		assetRevision: 'fixture-v1',
		description: 'Standard 12-step reinforced concrete commercial stair flight with safety nosing.'
	},
	'catalog:office-chair-mesh': {
		catalogKey: 'catalog:office-chair-mesh',
		title: 'Executive Task Chair (Turnstile)',
		category: 'furniture',
		boundingVolume: [0.65, 0.95, 0.65],
		defaultScale: [1, 1, 1],
		assetRevision: 'fixture-v1',
		description: 'Five-caster ergonomic office chair with adjustable armrests and mesh backing.'
	},
	'catalog:security-door-heavy': {
		catalogKey: 'catalog:security-door-heavy',
		title: 'Heavy Magnetic Interlock Security Door',
		category: 'structural',
		boundingVolume: [0.95, 2.10, 0.12],
		defaultScale: [1, 1, 1],
		assetRevision: 'fixture-v1',
		description: 'Steel commercial fire door with electronic badge reader strike plate.'
	},
	'catalog:surveillance-camera-cctv': {
		catalogKey: 'catalog:surveillance-camera-cctv',
		title: 'Ceiling Dome CCTV Camera (CAM-N-04)',
		category: 'sensor',
		boundingVolume: [0.22, 0.15, 0.22],
		defaultScale: [1, 1, 1],
		assetRevision: 'fixture-v1',
		description: 'Fixed-focal 1080p vandal-resistant dome surveillance camera with infrared ring.'
	},
	'catalog:evidence-marker-tent': {
		catalogKey: 'catalog:evidence-marker-tent',
		title: 'Numbered Forensic Evidence Tent (#02)',
		category: 'forensic',
		boundingVolume: [0.12, 0.10, 0.14],
		defaultScale: [1, 1, 1],
		assetRevision: 'fixture-v1',
		description: 'High-visibility yellow acrylic A-frame evidence marker with metric scale bar.'
	}
};

/**
 * Converts a quaternion [x, y, z, w] to a continuous 6D rotation representation [r1..r6].
 * The 6D continuous rotation consists of the first two column vectors of the 3x3 rotation matrix.
 */
export function quaternionToRot6D(q: [number, number, number, number]): [number, number, number, number, number, number] {
	const [x, y, z, w] = q;
	// Column 1 (R00, R10, R20)
	const r00 = 1 - 2 * (y * y + z * z);
	const r10 = 2 * (x * y + z * w);
	const r20 = 2 * (x * z - y * w);
	// Column 2 (R01, R11, R21)
	const r01 = 2 * (x * y - z * w);
	const r11 = 1 - 2 * (x * x + z * z);
	const r21 = 2 * (y * z + x * w);

	return [r00, r10, r20, r01, r11, r21];
}

/**
 * Creates a validated 5-object synthetic stairwell scene composition.
 * Used for synthetic test fixtures and demonstrative scene reconstructions.
 */
export function createSyntheticStairwellScene(params?: {
	location?: Partial<SceneLocation>;
	classification?: DetectiveSceneComposition['classification'];
	calibration?: DetectiveSceneComposition['calibration'];
}): DetectiveSceneComposition {
	const location: SceneLocation = {
		latitude: params?.location?.latitude ?? 34.0522,
		longitude: params?.location?.longitude ?? -118.2437,
		source: params?.location?.source ?? 'USER_OPTIONAL',
		verified: params?.location?.verified ?? true,
		attribution: params?.location?.attribution ?? 'Los Angeles Civic Center Locus (Illustrative Demonstrative Only)'
	};

	const objects: ScenePlacedObject[] = [
		// 1. Concrete Stairwell
		{
			objectId: 'obj-stairs-01',
			catalogKey: 'catalog:stairwell-concrete',
			assetRevision: 'fixture-v1',
			position: [0.0, 0.0, 0.0],
			rotation: [0, 0, 0, 1], // Identity
			scale: [1, 1, 1],
			locked: true
		},
		// 2. Heavy Security Door at landing
		{
			objectId: 'obj-door-01',
			catalogKey: 'catalog:security-door-heavy',
			assetRevision: 'fixture-v1',
			position: [1.60, 1.40, 0.0],
			rotation: [0, 0.7071, 0, 0.7071], // 90 deg Y rotation
			scale: [1, 1, 1],
			locked: true
		},
		// 3. CCTV Camera mounted on ceiling corner
		{
			objectId: 'obj-cctv-01',
			catalogKey: 'catalog:surveillance-camera-cctv',
			assetRevision: 'fixture-v1',
			position: [1.50, 2.65, 0.85],
			rotation: [0.3827, 0, 0, 0.9239], // Downward tilt
			scale: [1, 1, 1],
			locked: true,
			anchorEvidenceId: 'e-008-cctv'
		},
		// 4. Overturned Task Chair
		{
			objectId: 'obj-chair-01',
			catalogKey: 'catalog:office-chair-mesh',
			assetRevision: 'fixture-v1',
			position: [0.45, 0.32, 0.20],
			rotation: [0.5, 0.5, 0.5, 0.5], // Tilted/fallen
			scale: [1, 1, 1],
			locked: false
		},
		// 5. Evidence Marker Tent #02 at bloodstain locus
		{
			objectId: 'obj-marker-02',
			catalogKey: 'catalog:evidence-marker-tent',
			assetRevision: 'fixture-v1',
			position: [0.85, 0.02, 0.15],
			rotation: [0, 0, 0, 1],
			scale: [1, 1, 1],
			locked: false,
			anchorEvidenceId: 'e-002-bloodstain'
		}
	];

	const composition: DetectiveSceneComposition = {
		schema: 'atlas.detective-scene-composition.v1',
		classification: params?.classification ?? 'SYNTHETIC_FIXTURE',
		location,
		objects,
		calibration: params?.calibration ?? 'CALIPER_VERIFIED',
		admission: 'LOCAL_PREFLIGHT'
	};

	return detectiveSceneCompositionSchema.parse(composition);
}

/**
 * Converts a DetectiveSceneComposition into SIMD-ready KeyframeChunk array
 * with 30-bit Morton code spatial indexing and continuous 6D rotations.
 */
export function convertSceneCompositionToKeyframeChunks(
	composition: DetectiveSceneComposition
): KeyframeChunk[] {
	return composition.objects.map((obj, slotIndex) => {
		const pos: [number, number, number] = [obj.position[0] ?? 0, obj.position[1] ?? 0, obj.position[2] ?? 0];
		const rot: [number, number, number, number] = [
			obj.rotation[0] ?? 0,
			obj.rotation[1] ?? 0,
			obj.rotation[2] ?? 0,
			obj.rotation[3] ?? 1
		];
		const scl: [number, number, number] = [obj.scale[0] ?? 1, obj.scale[1] ?? 1, obj.scale[2] ?? 1];
		const mortonCode = computeMorton30(pos[0], pos[1], pos[2]);
		const rot6d = quaternionToRot6D(rot);

		return {
			mortonCode,
			slotIndex,
			clusterId: obj.catalogKey.includes('structural') ? 0 : 1,
			position: pos,
			rot6d,
			scale: scl,
			flags: obj.locked ? 1 : 0,
			reserved: 0
		};
	});
}

/**
 * Generates safe Blender Python RNA vertex inspection script for MSVC/Windows.
 * Guarantees zero memory corruptions by using `foreach_get` instead of `as_pointer()`.
 */
export function generateBlenderRnaExtractionScript(objectName: string): string {
	return `import bpy
import numpy as np

# Safe Blender Python RNA extraction without pointer dereference
obj = bpy.data.objects.get("${objectName}")
if obj and obj.type == 'MESH':
    mesh = obj.data
    num_verts = len(mesh.vertices)
    coords = np.empty(num_verts * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", coords)
    coords = coords.reshape((num_verts, 3))
    print(f"Extracted {num_verts} vertices safely via foreach_get")
else:
    print(f"Object ${objectName} not found or not a mesh")
`;
}
