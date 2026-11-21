import { describe, expect, it } from 'vitest';
import { SCENE_PRIMITIVE_KINDS_V1 } from '$lib/splat/scene-primitive-registry-v1.js';
import { SCENE_AUTHORING_CATALOG_V1, searchSceneAuthoringCatalogV1 } from './scene-authoring-catalog-v1.js';

describe('scene authoring catalog v1', () => {
	it('indexes every existing primitive without defining duplicate geometry', () => {
		expect(SCENE_AUTHORING_CATALOG_V1.map((entry) => entry.kind).sort()).toEqual([...SCENE_PRIMITIVE_KINDS_V1].sort());
		expect(SCENE_AUTHORING_CATALOG_V1.every((entry) => entry.authority === 'generated_illustrative_recipe')).toBe(true);
		expect(SCENE_AUTHORING_CATALOG_V1.every((entry) => entry.triangleEstimates.retro > 0 && entry.triangleEstimates.balanced >= entry.triangleEstimates.retro && entry.triangleEstimates.detailed >= entry.triangleEstimates.balanced)).toBe(true);
	});

	it('supports multi-term local lookup and stable result ordering', () => {
		expect(searchSceneAuthoringCatalogV1('flat panel').map((entry) => entry.kind)).toEqual(['rectangle']);
		expect(searchSceneAuthoringCatalogV1('column').map((entry) => entry.kind)).toEqual(['cylinder']);
		expect(searchSceneAuthoringCatalogV1('no matching recipe')).toEqual([]);
	});

	it('rejects unbounded result limits', () => {
		expect(() => searchSceneAuthoringCatalogV1('', 101)).toThrow(/limit/);
	});
});
