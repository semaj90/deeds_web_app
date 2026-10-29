// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JESTER_ACCESSORY_PIVOTS } from './jester-accessory-rig-v1.js';
import { pivotLocalRotation, validateAccessoryManifest, type AccessoryManifest } from './jester-accessory-attach-v1.js';
import { qAngleDeg, type Quat } from './rest-pose-retarget-v1.js';

function syntheticManifest(): AccessoryManifest {
	return {
		scale: 0.34,
		pivots: JESTER_ACCESSORY_PIVOTS.map((s) => ({
			id: s.id,
			bone: s.bone,
			parent: s.follows ?? null,
			offset: [0, 0.1, 0] as [number, number, number],
			...(s.follows ? {} : { baseRotation: [0, 0, 0, 1] as [number, number, number, number] }),
		})),
	};
}

describe('accessory manifest validation', () => {
	it('accepts a manifest that mirrors the rig table', () => {
		expect(() => validateAccessoryManifest(syntheticManifest())).not.toThrow();
	});

	it.each([
		['missing pivot', (m: AccessoryManifest) => void m.pivots.pop(), 'ACCESSORY_MANIFEST_PIVOT_COUNT'],
		['wrong bone', (m: AccessoryManifest) => void (m.pivots[0].bone = 'J_Bip_C_Hips'), 'ACCESSORY_MANIFEST_BONE'],
		['wrong parent', (m: AccessoryManifest) => void (m.pivots.find((p) => p.id === 'tail3')!.parent = 'tail0'), 'ACCESSORY_MANIFEST_PARENT'],
		['non-finite offset', (m: AccessoryManifest) => void (m.pivots[1].offset = [NaN, 0, 0]), 'ACCESSORY_MANIFEST_OFFSET'],
		['root without base rotation', (m: AccessoryManifest) => void delete m.pivots[0].baseRotation, 'ACCESSORY_MANIFEST_BASE_ROTATION'],
	])('rejects %s', (_name, mutate, code) => {
		const m = syntheticManifest();
		mutate(m);
		expect(() => validateAccessoryManifest(m)).toThrow(code);
	});
});

describe('pivot rotation', () => {
	const wing = JESTER_ACCESSORY_PIVOTS.find((p) => p.id === 'wingAngel')!;

	it('is the base rotation at angle 0 and swings by the requested angle', () => {
		const base: Quat = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
		expect(qAngleDeg(pivotLocalRotation(wing, base, 0), base)).toBeLessThan(1e-6);
		expect(qAngleDeg(pivotLocalRotation(wing, null, 0.5), [0, 0, 0, 1])).toBeCloseTo((0.5 * 180) / Math.PI, 4);
		expect(qAngleDeg(pivotLocalRotation(wing, null, NaN), [0, 0, 0, 1])).toBeLessThan(1e-9);
	});
});

const MANIFEST = join(process.cwd(), 'static/models/courtroom/jester_accessories.manifest.json');
(existsSync(MANIFEST) ? describe : describe.skip)('generated manifest (static/models is gitignored)', () => {
	it('matches the rig table and is within a plausible range of Alice', () => {
		const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as AccessoryManifest;
		validateAccessoryManifest(m);
		for (const p of m.pivots) {
			expect(Math.hypot(...p.offset), p.id).toBeLessThan(1.5); // metres from a bone or the previous link
		}
	});
});
