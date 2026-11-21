/**
 * Searchable source-code catalog for the geometry recipes already owned by the
 * scene primitive registry. This is an authoring index, not an asset/evidence
 * registry and not a persisted case catalog.
 */
import {
	SCENE_PRIMITIVE_KINDS_V1,
	SCENE_PRIMITIVE_REGISTRY_V1,
	resolveScenePrimitiveV1,
	type ScenePrimitiveKindV1
} from '$lib/splat/scene-primitive-registry-v1.js';

export const SCENE_AUTHORING_CATALOG_REVISION_V1 = 'scene-authoring-catalog-v1' as const;

export interface SceneAuthoringCatalogEntryV1 {
	id: `primitive:${ScenePrimitiveKindV1}`;
	kind: ScenePrimitiveKindV1;
	label: string;
	category: 'primitive';
	searchTerms: readonly string[];
	dimensionsMeters: readonly [number, number, number];
	collider: (typeof SCENE_PRIMITIVE_REGISTRY_V1)[ScenePrimitiveKindV1]['collider'];
	triangleEstimates: Readonly<Record<'retro' | 'balanced' | 'detailed', number>>;
	authority: 'generated_illustrative_recipe';
}

const DISPLAY: Readonly<Record<ScenePrimitiveKindV1, { label: string; terms: readonly string[] }>> = {
	box: { label: 'Box / block', terms: ['cube', 'rectangular solid', 'blockout'] },
	sphere: { label: 'Sphere', terms: ['ball', 'round', 'blockout'] },
	cylinder: { label: 'Cylinder', terms: ['tube', 'column', 'round solid', 'blockout'] },
	cone: { label: 'Cone', terms: ['pointed', 'tapered', 'blockout'] },
	torus: { label: 'Torus / ring', terms: ['donut', 'loop', 'blockout'] },
	circle: { label: 'Circle / disc', terms: ['flat round', 'marker', 'blockout'] },
	hexagon: { label: 'Hexagon', terms: ['six sided', 'polygon', 'blockout'] },
	rectangle: { label: 'Rectangle / plane', terms: ['flat panel', 'plane', 'blockout'] }
};

export const SCENE_AUTHORING_CATALOG_V1: readonly SceneAuthoringCatalogEntryV1[] = Object.freeze(
	SCENE_PRIMITIVE_KINDS_V1.map((kind) => Object.freeze({
		id: `primitive:${kind}` as const,
		kind,
		label: DISPLAY[kind].label,
		category: 'primitive' as const,
		searchTerms: Object.freeze([...DISPLAY[kind].terms]),
		dimensionsMeters: SCENE_PRIMITIVE_REGISTRY_V1[kind].dimensionsMeters,
		collider: SCENE_PRIMITIVE_REGISTRY_V1[kind].collider,
		triangleEstimates: Object.freeze({
			retro: resolveScenePrimitiveV1(kind, 'retro').estimatedTriangles,
			balanced: resolveScenePrimitiveV1(kind, 'balanced').estimatedTriangles,
			detailed: resolveScenePrimitiveV1(kind, 'detailed').estimatedTriangles
		}),
		authority: 'generated_illustrative_recipe' as const
	}))
);

function normalizeSearch(value: string): string[] {
	return value.normalize('NFKC').toLocaleLowerCase('en-US').trim().split(/\s+/u).filter(Boolean);
}

/** Deterministic local lookup; no network, model, or asset-store access. */
export function searchSceneAuthoringCatalogV1(query: string, limit = 20): SceneAuthoringCatalogEntryV1[] {
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('catalog limit must be 1..100');
	const terms = normalizeSearch(query);
	const ranked = SCENE_AUTHORING_CATALOG_V1.map((entry) => {
		const haystack = [entry.id, entry.kind, entry.label, ...entry.searchTerms].join(' ').toLocaleLowerCase('en-US');
		const score = terms.reduce((sum, term) => sum + (entry.kind === term ? 4 : entry.label.toLocaleLowerCase('en-US').startsWith(term) ? 3 : haystack.includes(term) ? 1 : -100), 0);
		return { entry, score };
	}).filter(({ score }) => terms.length === 0 || score >= 0);
	ranked.sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
	return ranked.slice(0, limit).map(({ entry }) => entry);
}
