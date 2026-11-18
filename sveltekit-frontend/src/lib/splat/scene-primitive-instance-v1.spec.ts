import { describe, expect, it } from 'vitest';
import { buildPrimitiveInstanceRecordV1, SCENE_PRIMITIVE_INSTANCE_SCHEMA_V1 } from './scene-primitive-instance-v1.js';

const base = { kind: 'box', detail: 'balanced', materialKey: 'brass', sceneRevision: 'rev-1' } as const;

describe('scene primitive instance record v1', () => {
	it('builds a placeholder record with defaults and a derived key', async () => {
		const r = await buildPrimitiveInstanceRecordV1(base);
		expect(r.schema).toBe(SCENE_PRIMITIVE_INSTANCE_SCHEMA_V1);
		expect(r.provenance).toBe('illustrative-placeholder');
		expect(r.position).toEqual([0, 0, 0]);
		expect(r.rotation).toEqual([0, 0, 0]);
		expect(r.scale).toEqual([1, 1, 1]);
		expect(r.instanceKey).toMatch(/^[0-9a-f-]{36}$/);
		expect(r.withinBudget).toBe(true);
	});

	it('keeps the same key for identical inputs and changes it with the scene revision', async () => {
		const a = await buildPrimitiveInstanceRecordV1(base);
		const b = await buildPrimitiveInstanceRecordV1({ ...base, position: [1, 2, 3] });
		const c = await buildPrimitiveInstanceRecordV1({ ...base, sceneRevision: 'rev-2' });
		expect(b.instanceKey).toBe(a.instanceKey); // transform is not part of the key
		expect(c.instanceKey).not.toBe(a.instanceKey);
	});

	it('reports the triangle count and budget status for the chosen detail', async () => {
		const retro = await buildPrimitiveInstanceRecordV1({ ...base, kind: 'torus', detail: 'retro' });
		const detailed = await buildPrimitiveInstanceRecordV1({ ...base, kind: 'torus', detail: 'detailed' });
		expect(retro.triangleCount).toBeLessThan(detailed.triangleCount);
		expect(retro.withinBudget).toBe(true);
		expect(detailed.withinBudget).toBe(false); // known budget conflict, recorded in REG-OPT-04
	});

	it('rejects blank material or scene revision, non-finite vectors, and non-positive scale', async () => {
		await expect(buildPrimitiveInstanceRecordV1({ ...base, materialKey: ' ' })).rejects.toThrow('PRIMITIVE_INSTANCE_MATERIAL_REQUIRED');
		await expect(buildPrimitiveInstanceRecordV1({ ...base, sceneRevision: '' })).rejects.toThrow('PRIMITIVE_INSTANCE_SCENE_REVISION_REQUIRED');
		await expect(buildPrimitiveInstanceRecordV1({ ...base, position: [Number.NaN, 0, 0] })).rejects.toThrow('PRIMITIVE_INSTANCE_VECTOR_INVALID');
		await expect(buildPrimitiveInstanceRecordV1({ ...base, scale: [0, 1, 1] })).rejects.toThrow('PRIMITIVE_INSTANCE_SCALE_MUST_BE_POSITIVE');
	});
});
