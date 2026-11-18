import { describe, expect, it } from 'vitest';
import { derivePrimitiveInstanceKeyV1 } from './scene-primitive-key-v1.js';

const base = { kind: 'hexagon', detail: 'balanced', materialKey: 'brass', sceneRevision: 'rev-1' } as const;

describe('scene primitive instance key v1', () => {
	it('is deterministic for the same inputs', async () => {
		const a = await derivePrimitiveInstanceKeyV1(base);
		const b = await derivePrimitiveInstanceKeyV1({ ...base });
		expect(a).toBe(b);
	});

	it('changes when any input changes', async () => {
		const original = await derivePrimitiveInstanceKeyV1(base);
		expect(await derivePrimitiveInstanceKeyV1({ ...base, kind: 'box' })).not.toBe(original);
		expect(await derivePrimitiveInstanceKeyV1({ ...base, detail: 'retro' })).not.toBe(original);
		expect(await derivePrimitiveInstanceKeyV1({ ...base, materialKey: 'steel' })).not.toBe(original);
		expect(await derivePrimitiveInstanceKeyV1({ ...base, sceneRevision: 'rev-2' })).not.toBe(original);
	});

	it('returns a canonical UUID string', async () => {
		const key = await derivePrimitiveInstanceKeyV1(base);
		expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});
});
