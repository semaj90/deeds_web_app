// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildJesterPartBoneMap } from './jester-part-bone-table-v1.js';
import { JESTER_ACCESSORY_PIVOTS, JesterAccessoryRig, MOOD_TARGETS, validateAccessoryPivots } from './jester-accessory-rig-v1.js';

function run(rig: JesterAccessoryRig, seconds: number, fps = 60, drive = 0) {
	for (let i = 0; i < seconds * fps; i++) rig.step(1 / fps, drive);
}

describe('jester accessory table', () => {
	it('is well formed and consistent with the part-to-bone table', () => {
		validateAccessoryPivots();
		const boneOfPart = buildJesterPartBoneMap();
		for (const p of JESTER_ACCESSORY_PIVOTS) {
			for (const part of p.parts) expect(boneOfPart.get(part), `${p.id} part ${part}`).toBeDefined();
		}
	});

	it('every mood target sits inside its pivot limit', () => {
		const limit = new Map(JESTER_ACCESSORY_PIVOTS.map((p) => [p.id, p.limit]));
		for (const targets of Object.values(MOOD_TARGETS)) {
			for (const [id, angle] of Object.entries(targets)) {
				expect(limit.has(id), id).toBe(true);
				expect(Math.abs(angle)).toBeLessThanOrEqual(limit.get(id)!);
			}
		}
	});
});

describe('JesterAccessoryRig', () => {
	it('settles on the mood target and holds it', () => {
		const rig = new JesterAccessoryRig();
		rig.setMood('angry');
		run(rig, 6);
		expect(rig.angle('wingDemon')).toBeCloseTo(MOOD_TARGETS.angry.wingDemon, 2);
		expect(rig.angle('wingAngel')).toBeCloseTo(MOOD_TARGETS.angry.wingAngel, 2);
	});

	it('moods differ the way the story reads: angry flares the demon wing, nervous folds both, relieved opens the angel wing', () => {
		const settle = (m: Parameters<JesterAccessoryRig['setMood']>[0]) => { const r = new JesterAccessoryRig(); r.setMood(m); run(r, 6); return r.angles(); };
		const angry = settle('angry'); const nervous = settle('nervous'); const relieved = settle('relieved');
		expect(angry.wingDemon).toBeGreaterThan(angry.wingAngel);
		expect(nervous.wingAngel).toBeLessThan(0);
		expect(nervous.wingDemon).toBeLessThan(0);
		expect(relieved.wingAngel).toBeGreaterThan(relieved.wingDemon);
	});

	it('is deterministic and frame-rate independent', () => {
		const a = new JesterAccessoryRig(); const b = new JesterAccessoryRig();
		a.setMood('relieved'); b.setMood('relieved');
		run(a, 2, 60, 3); run(b, 2, 120, 3);
		for (const [id, v] of Object.entries(a.angles())) expect(b.angle(id)).toBeCloseTo(v, 1);
		const c = new JesterAccessoryRig(); c.setMood('relieved'); run(c, 2, 60, 3);
		expect(c.angles()).toEqual(a.angles());
	});

	it('stays finite and inside joint limits under hostile input', () => {
		const rig = new JesterAccessoryRig();
		rig.setMood('angry');
		for (const dt of [NaN, -1, 0, 0.0001, 5, Infinity]) rig.step(dt, 1e9);
		rig.step(0.05, NaN);
		run(rig, 3, 30, -1e6);
		for (const p of JESTER_ACCESSORY_PIVOTS) {
			const v = rig.angle(p.id);
			expect(Number.isFinite(v)).toBe(true);
			expect(Math.abs(v)).toBeLessThanOrEqual(p.limit + 1e-9);
		}
	});

	it('tail links lag the one before them (follow-through)', () => {
		const rig = new JesterAccessoryRig();
		rig.setMood('angry');
		const peakTime = (id: string) => {
			const r = new JesterAccessoryRig(); r.setMood('angry');
			let best = 0, bestT = 0;
			for (let i = 0; i < 240; i++) { r.step(1 / 60); const a = Math.abs(r.angle(id)); if (a > best) { best = a; bestT = i; } }
			return bestT;
		};
		expect(peakTime('tail2')).toBeGreaterThanOrEqual(peakTime('tail0'));
		expect(Math.abs(rig.angle('tail3'))).toBeLessThan(1e-9); // untouched at t=0
	});

	it('reset returns every pivot to rest', () => {
		const rig = new JesterAccessoryRig();
		rig.setMood('nervous'); run(rig, 2); rig.reset();
		expect(Object.values(rig.angles()).every((v) => v === 0)).toBe(true);
	});
});
