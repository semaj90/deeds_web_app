/**
 * Versioned authoring catalog for procedural scene geometry and composite props.
 * This is not a case placement store or physics solver. Generated geometry is
 * demonstrative until linked and reviewed through the authorized case workflow.
 */

export const SCENE_PRIMITIVE_REGISTRY_REVISION_V1 = 'scene-primitive-registry-v1' as const;

export const SCENE_PRIMITIVE_KINDS_V1 = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'circle', 'rectangle'] as const;
export type ScenePrimitiveKindV1 = (typeof SCENE_PRIMITIVE_KINDS_V1)[number];

export const SCENE_ASSEMBLY_KINDS_V1 = ['sword', 'justice-scales'] as const;
export type SceneAssemblyKindV1 = (typeof SCENE_ASSEMBLY_KINDS_V1)[number];

export const PRIMITIVE_DETAIL_LEVELS_V1 = ['retro', 'balanced', 'detailed'] as const;
export type PrimitiveDetailLevelV1 = (typeof PRIMITIVE_DETAIL_LEVELS_V1)[number];

export const SCENE_MATERIAL_KEYS_V1 = ['evidence-gold', 'brass', 'steel', 'dark-leather', 'ivory'] as const;
export type SceneMaterialKeyV1 = (typeof SCENE_MATERIAL_KEYS_V1)[number];

export type ScenePrimitiveGeometryV1 =
	| { readonly kind: 'box'; readonly width: number; readonly height: number; readonly depth: number; readonly widthSegments: number; readonly heightSegments: number; readonly depthSegments: number }
	| { readonly kind: 'sphere'; readonly radius: number; readonly widthSegments: number; readonly heightSegments: number }
	| { readonly kind: 'cylinder'; readonly radiusTop: number; readonly radiusBottom: number; readonly height: number; readonly radialSegments: number; readonly heightSegments: number }
	| { readonly kind: 'cone'; readonly radius: number; readonly height: number; readonly radialSegments: number; readonly heightSegments: number }
	| { readonly kind: 'torus'; readonly radius: number; readonly tube: number; readonly radialSegments: number; readonly tubularSegments: number }
	| { readonly kind: 'circle'; readonly radius: number; readonly segments: number }
	| { readonly kind: 'rectangle'; readonly width: number; readonly height: number }
	| { readonly kind: 'polygon-prism'; readonly points: readonly (readonly [number, number])[]; readonly depth: number };

export interface ScenePrimitiveDefinitionV1 {
	readonly kind: ScenePrimitiveKindV1;
	readonly dimensionsMeters: readonly [number, number, number];
	readonly collider: {
		readonly shape: 'none' | 'box' | 'sphere' | 'cylinder' | 'convex-hull';
		readonly fidelity: 'exact' | 'approximate';
	};
}

export interface ScenePrimitiveSpecV1 extends ScenePrimitiveDefinitionV1 {
	readonly registryRevision: typeof SCENE_PRIMITIVE_REGISTRY_REVISION_V1;
	readonly detail: PrimitiveDetailLevelV1;
	readonly geometry: ScenePrimitiveGeometryV1;
	readonly estimatedTriangles: number;
	readonly physics: 'collider-recipe-only';
	readonly softBody: 'requires-separate-reviewed-deformable-mesh';
}

export interface SceneAssemblyPartV1 {
	readonly partId: string;
	readonly geometry: ScenePrimitiveGeometryV1;
	readonly position: readonly [number, number, number];
	readonly rotation: readonly [number, number, number];
	readonly material: SceneMaterialKeyV1;
}

export interface SceneAssemblySpecV1 {
	readonly kind: SceneAssemblyKindV1;
	readonly registryRevision: typeof SCENE_PRIMITIVE_REGISTRY_REVISION_V1;
	readonly label: string;
	readonly dimensionsMeters: readonly [number, number, number];
	readonly detail: PrimitiveDetailLevelV1;
	readonly parts: readonly SceneAssemblyPartV1[];
	readonly physics: 'collider-recipe-only';
	readonly softBody: 'not-applicable';
}

/** Freezes one definition while keeping its literal kinds checked against the contract. */
function def<T extends ScenePrimitiveDefinitionV1>(definition: T): Readonly<T> {
	return Object.freeze(definition);
}

export const SCENE_PRIMITIVE_REGISTRY_V1: Readonly<Record<ScenePrimitiveKindV1, ScenePrimitiveDefinitionV1>> = Object.freeze({
	box: def({ kind: 'box', dimensionsMeters: [0.5, 0.5, 0.5] as const, collider: { shape: 'box', fidelity: 'exact' } as const }),
	sphere: def({ kind: 'sphere', dimensionsMeters: [0.6, 0.6, 0.6] as const, collider: { shape: 'sphere', fidelity: 'exact' } as const }),
	cylinder: def({ kind: 'cylinder', dimensionsMeters: [0.5, 0.6, 0.5] as const, collider: { shape: 'cylinder', fidelity: 'approximate' } as const }),
	cone: def({ kind: 'cone', dimensionsMeters: [0.6, 0.65, 0.6] as const, collider: { shape: 'convex-hull', fidelity: 'approximate' } as const }),
	torus: def({ kind: 'torus', dimensionsMeters: [0.76, 0.16, 0.76] as const, collider: { shape: 'convex-hull', fidelity: 'approximate' } as const }),
	circle: def({ kind: 'circle', dimensionsMeters: [0.5, 0, 0.5] as const, collider: { shape: 'none', fidelity: 'exact' } as const }),
	rectangle: def({ kind: 'rectangle', dimensionsMeters: [0.6, 0.4, 0] as const, collider: { shape: 'none', fidelity: 'exact' } as const })
});

/** Palette lookup table for mesh appearance; it does not encode geometry. */
export const SCENE_MATERIAL_LUT_V1: Readonly<Record<SceneMaterialKeyV1, { color: string; metalness: number; roughness: number }>> = Object.freeze({
	'evidence-gold': Object.freeze({ color: '#D8B14D', metalness: 0.35, roughness: 0.48 }),
	brass: Object.freeze({ color: '#B88A35', metalness: 0.72, roughness: 0.34 }),
	steel: Object.freeze({ color: '#9DA8B3', metalness: 0.78, roughness: 0.28 }),
	'dark-leather': Object.freeze({ color: '#352820', metalness: 0.02, roughness: 0.86 }),
	ivory: Object.freeze({ color: '#F2E6C9', metalness: 0.04, roughness: 0.72 })
});

export function resolveSceneMaterialV1(key: SceneMaterialKeyV1) {
	const material = SCENE_MATERIAL_LUT_V1[key];
	if (!material) throw new Error(`Unknown scene material: ${String(key)}`);
	return material;
}

const DETAIL_SEGMENTS: Readonly<Record<PrimitiveDetailLevelV1, { radial: number; height: number; tube: number }>> = Object.freeze({
	retro: Object.freeze({ radial: 8, height: 6, tube: 6 }),
	balanced: Object.freeze({ radial: 16, height: 10, tube: 10 }),
	detailed: Object.freeze({ radial: 32, height: 20, tube: 12 })
});

function triangleEstimate(kind: ScenePrimitiveKindV1, segments: { radial: number; height: number; tube: number }): number {
	switch (kind) {
		case 'box': return 12;
		case 'sphere': return 2 * segments.radial * (segments.height - 1);
		case 'cylinder':
		case 'cone': return 4 * segments.radial;
		case 'torus': return 2 * (segments.radial * 2) * segments.tube;
		case 'circle': return segments.radial;
		case 'rectangle': return 2;
	}
}

/** Resolve an immutable, bounded recipe before creating render geometry. */
export function resolveScenePrimitiveV1(kind: ScenePrimitiveKindV1, detail: PrimitiveDetailLevelV1): ScenePrimitiveSpecV1 {
	const definition = SCENE_PRIMITIVE_REGISTRY_V1[kind];
	if (!definition) throw new Error(`Unknown scene primitive: ${String(kind)}`);
	const segments = DETAIL_SEGMENTS[detail];
	if (!segments) throw new Error(`Unknown primitive detail level: ${String(detail)}`);

	const geometry: ScenePrimitiveGeometryV1 = kind === 'box'
		? { kind: 'box', width: 0.5, height: 0.5, depth: 0.5, widthSegments: 1, heightSegments: 1, depthSegments: 1 }
		: kind === 'sphere'
			? { kind: 'sphere', radius: 0.3, widthSegments: segments.radial, heightSegments: segments.height }
			: kind === 'cylinder'
				? { kind: 'cylinder', radiusTop: 0.25, radiusBottom: 0.25, height: 0.6, radialSegments: segments.radial, heightSegments: 1 }
				: kind === 'cone'
					? { kind: 'cone', radius: 0.3, height: 0.65, radialSegments: segments.radial, heightSegments: 1 }
					: kind === 'torus'
						? { kind: 'torus', radius: 0.3, tube: 0.08, radialSegments: segments.tube, tubularSegments: segments.radial * 2 }
						: kind === 'circle'
							? { kind: 'circle', radius: 0.25, segments: segments.radial }
							: { kind: 'rectangle', width: 0.6, height: 0.4 };

	return Object.freeze({
		...definition,
		registryRevision: SCENE_PRIMITIVE_REGISTRY_REVISION_V1,
		detail,
		geometry: Object.freeze(geometry),
		estimatedTriangles: triangleEstimate(kind, segments),
		physics: 'collider-recipe-only',
		softBody: 'requires-separate-reviewed-deformable-mesh'
	});
}

function cylinder(radiusTop: number, radiusBottom: number, height: number, radialSegments: number): ScenePrimitiveGeometryV1 {
	return { kind: 'cylinder', radiusTop, radiusBottom, height, radialSegments, heightSegments: 1 };
}

function box(width: number, height: number, depth: number): ScenePrimitiveGeometryV1 {
	return { kind: 'box', width, height, depth, widthSegments: 1, heightSegments: 1, depthSegments: 1 };
}

function sphere(radius: number, segments: number, heightSegments: number): ScenePrimitiveGeometryV1 {
	return { kind: 'sphere', radius, widthSegments: segments, heightSegments };
}

/** Sword and justice-scale props are deterministic groups of catalog parts. */
export function resolveSceneAssemblyV1(kind: SceneAssemblyKindV1, detail: PrimitiveDetailLevelV1): SceneAssemblySpecV1 {
	const segments = DETAIL_SEGMENTS[detail];
	if (!segments) throw new Error(`Unknown primitive detail level: ${String(detail)}`);
	const common = { registryRevision: SCENE_PRIMITIVE_REGISTRY_REVISION_V1, detail, physics: 'collider-recipe-only' as const, softBody: 'not-applicable' as const };
	if (kind === 'sword') {
		return Object.freeze({
			...common, kind, label: 'Demonstrative sword', dimensionsMeters: [0.3, 1.05, 0.08] as const,
			parts: Object.freeze([
				{ partId: 'blade', geometry: { kind: 'polygon-prism' as const, points: [[0, 0.62], [0.065, 0.42], [0.055, -0.27], [0, -0.38], [-0.055, -0.27], [-0.065, 0.42]] as const, depth: 0.025 }, position: [0, 0.48, 0] as const, rotation: [0, 0, 0] as const, material: 'steel' as const },
				{ partId: 'guard', geometry: box(0.34, 0.055, 0.075), position: [0, 0.06, 0] as const, rotation: [0, 0, 0] as const, material: 'brass' as const },
				{ partId: 'grip', geometry: cylinder(0.035, 0.035, 0.22, segments.radial), position: [0, -0.11, 0] as const, rotation: [0, 0, 0] as const, material: 'dark-leather' as const },
				{ partId: 'pommel', geometry: sphere(0.055, segments.radial, Math.max(4, segments.height - 2)), position: [0, -0.27, 0] as const, rotation: [0, 0, 0] as const, material: 'brass' as const }
			])
		});
	}
	if (kind === 'justice-scales') {
		const chain = cylinder(0.009, 0.009, 0.38, Math.max(6, segments.radial / 2));
		return Object.freeze({
			...common, kind, label: 'Demonstrative justice scales', dimensionsMeters: [1.05, 1.55, 0.28] as const,
			parts: Object.freeze([
				{ partId: 'base', geometry: box(0.55, 0.075, 0.3), position: [0, 0.04, 0] as const, rotation: [0, 0, 0] as const, material: 'brass' as const },
				{ partId: 'column', geometry: cylinder(0.045, 0.075, 1.15, segments.radial), position: [0, 0.65, 0] as const, rotation: [0, 0, 0] as const, material: 'brass' as const },
				{ partId: 'finial', geometry: sphere(0.09, segments.radial, Math.max(4, segments.height - 2)), position: [0, 1.28, 0] as const, rotation: [0, 0, 0] as const, material: 'evidence-gold' as const },
				{ partId: 'crossbar', geometry: cylinder(0.025, 0.025, 0.95, segments.radial), position: [0, 1.24, 0] as const, rotation: [0, 0, Math.PI / 2] as const, material: 'brass' as const },
				{ partId: 'left-end', geometry: sphere(0.04, segments.radial, Math.max(4, segments.height - 2)), position: [-0.47, 1.24, 0] as const, rotation: [0, 0, 0] as const, material: 'evidence-gold' as const },
				{ partId: 'right-end', geometry: sphere(0.04, segments.radial, Math.max(4, segments.height - 2)), position: [0.47, 1.24, 0] as const, rotation: [0, 0, 0] as const, material: 'evidence-gold' as const },
				{ partId: 'left-chain-front', geometry: chain, position: [-0.36, 0.99, 0.09] as const, rotation: [0, 0, -0.18] as const, material: 'steel' as const },
				{ partId: 'left-chain-back', geometry: chain, position: [-0.36, 0.99, -0.09] as const, rotation: [0, 0, -0.18] as const, material: 'steel' as const },
				{ partId: 'right-chain-front', geometry: chain, position: [0.36, 0.99, 0.09] as const, rotation: [0, 0, 0.18] as const, material: 'steel' as const },
				{ partId: 'right-chain-back', geometry: chain, position: [0.36, 0.99, -0.09] as const, rotation: [0, 0, 0.18] as const, material: 'steel' as const },
				{ partId: 'left-pan', geometry: cylinder(0.22, 0.2, 0.045, segments.radial), position: [-0.36, 0.77, 0] as const, rotation: [0, 0, 0] as const, material: 'evidence-gold' as const },
				{ partId: 'right-pan', geometry: cylinder(0.22, 0.2, 0.045, segments.radial), position: [0.36, 0.77, 0] as const, rotation: [0, 0, 0] as const, material: 'evidence-gold' as const }
			])
		});
	}
	throw new Error(`Unknown scene assembly: ${String(kind)}`);
}
