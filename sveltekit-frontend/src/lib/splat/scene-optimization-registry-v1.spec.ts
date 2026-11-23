import { describe, expect, it } from 'vitest';
import {
	BASIC_POLYGON_RECIPES_V1,
	CULLING_POLICY_V1,
	EVERYDAY_OBJECT_TAXONOMY_V1,
	PLACEHOLDER_BUDGET_V1,
	SHADER_PROFILE_SPECS_V1,
	TESSELLATION_TIERS_V1,
	placeholderTriangleCountV1,
	polygonPrismTriangleCountV1,
	placeholderWithinBudgetV1,
	validateEverydayObjectTaxonomyV1
} from './scene-optimization-registry-v1.js';
import { SCENE_PRIMITIVE_KINDS_V1 } from './scene-primitive-registry-v1.js';

describe('scene optimization registry v1', () => {
	it('counts the hexagonal prism as 20 triangles with minimal caps and 24 with centre-fan caps', () => {
		for (const tier of TESSELLATION_TIERS_V1) {
			expect(placeholderTriangleCountV1('hexagon', tier)).toBe(20);
		}
		expect(polygonPrismTriangleCountV1(6, 0.08, 'vertex-fan')).toBe(20);
		expect(polygonPrismTriangleCountV1(6, 0.08, 'center-fan')).toBe(24);
	});

	it('counts flat polygons with one cap only', () => {
		expect(polygonPrismTriangleCountV1(3, 0, 'vertex-fan')).toBe(1);
		expect(polygonPrismTriangleCountV1(6, 0, 'vertex-fan')).toBe(4);
		expect(polygonPrismTriangleCountV1(6, 0, 'center-fan')).toBe(6);
	});

	it('rejects polygons with fewer than three sides', () => {
		expect(() => polygonPrismTriangleCountV1(2, 0, 'vertex-fan')).toThrow();
	});

	it('defines a triangle as a three-point polygon recipe', () => {
		expect(BASIC_POLYGON_RECIPES_V1.triangle.points).toHaveLength(3);
		expect(BASIC_POLYGON_RECIPES_V1.triangle.depth).toBe(0);
	});

	it('restricts mode-7 to placeholders', () => {
		expect(SHADER_PROFILE_SPECS_V1['mode-7'].allowedFor).toBe('placeholder-only');
	});

	it('gives every primitive kind a positive count at every tier', () => {
		for (const kind of SCENE_PRIMITIVE_KINDS_V1) {
			for (const tier of TESSELLATION_TIERS_V1) {
				expect(placeholderTriangleCountV1(kind, tier)).toBeGreaterThan(0);
			}
		}
	});

	it('keeps every primitive within the per-object budget at the retro tier', () => {
		for (const kind of SCENE_PRIMITIVE_KINDS_V1) {
			expect(placeholderWithinBudgetV1(placeholderTriangleCountV1(kind, 'retro'))).toBe(true);
		}
	});

	it('shows that detailed curved shapes exceed the 500-triangle placeholder budget', () => {
		// Known conflict, recorded rather than hidden: detailed sphere and torus need an explicit budget exception.
		expect(placeholderWithinBudgetV1(placeholderTriangleCountV1('sphere', 'detailed'))).toBe(false);
		expect(placeholderWithinBudgetV1(placeholderTriangleCountV1('torus', 'detailed'))).toBe(false);
	});

	it('keeps tessellation monotonic from retro to detailed for curved shapes', () => {
		for (const kind of ['cylinder', 'sphere', 'torus'] as const) {
			const retro = placeholderTriangleCountV1(kind, 'retro');
			const balanced = placeholderTriangleCountV1(kind, 'balanced');
			const detailed = placeholderTriangleCountV1(kind, 'detailed');
			expect(retro).toBeLessThan(balanced);
			expect(balanced).toBeLessThan(detailed);
		}
	});

	it('never allows culling on evidence-grade meshes', () => {
		expect(CULLING_POLICY_V1.evidenceGrade.modes).toEqual(['none']);
		expect(CULLING_POLICY_V1.placeholder.modes).toContain('frustum');
	});

	it('restricts the PS1 shader profile to placeholders', () => {
		expect(SHADER_PROFILE_SPECS_V1.flat.allowedFor).toBe('any');
		expect(SHADER_PROFILE_SPECS_V1['ps1-retro'].allowedFor).toBe('placeholder-only');
	});

	it('uses only primitive kinds that exist in the primitive registry', () => {
		expect(validateEverydayObjectTaxonomyV1()).toEqual({ ok: true });
		for (const entry of Object.values(EVERYDAY_OBJECT_TAXONOMY_V1)) {
			expect(entry.primitives.length).toBeGreaterThan(0);
		}
	});

	it('enforces the per-object triangle budget', () => {
		expect(placeholderWithinBudgetV1(PLACEHOLDER_BUDGET_V1.maxTrianglesPerObject)).toBe(true);
		expect(placeholderWithinBudgetV1(PLACEHOLDER_BUDGET_V1.maxTrianglesPerObject + 1)).toBe(false);
		expect(placeholderWithinBudgetV1(0)).toBe(false);
		expect(placeholderWithinBudgetV1(1.5)).toBe(false);
	});
});
