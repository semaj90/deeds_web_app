// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlb, toRig } from './glb-clip-sampler-v1.js';
import { makeIdlePose, rotateVec, type Vec } from './idle-pose-v1.js';
import { qAngleDeg, qMul, qNormalize, type Quat } from './rest-pose-retarget-v1.js';

const ALICE = join(process.cwd(), 'static/models/courtroom/character_alice_skinned.glb');
const run = existsSync(ALICE) ? describe : describe.skip; // static/models is gitignored

run('procedural idle on Alice', () => {
	const parsed = parseGlb(new Uint8Array(readFileSync(ALICE)));
	const rig = toRig(parsed);
	const idle = makeIdlePose(rig, parsed.bones)!;
	const trans = new Map(parsed.bones.map((b) => [b.name, b.restTranslation as Vec]));

	function world(at: number): Map<string, Quat> {
		const pose = idle.at(at);
		const w = new Map<string, Quat>();
		for (const b of rig) {
			const l = pose[b.name] ?? b.restLocal;
			const p = b.parent ? w.get(b.parent) : undefined;
			w.set(b.name, p ? qNormalize(qMul(p, l)) : qNormalize(l));
		}
		return w;
	}
	const armDir = (w: Map<string, Quat>, side: 'L' | 'R'): Vec =>
		rotateVec(w.get(`J_Bip_${side}_UpperArm`)!, trans.get(`J_Bip_${side}_LowerArm`)!);
	const downness = (v: Vec) => -v[1] / Math.hypot(v[0], v[1], v[2]);

	it('builds and drives arms plus the chest chain only', () => {
		expect(idle).not.toBeNull();
		expect(idle.bones).toEqual(expect.arrayContaining(['J_Bip_L_UpperArm', 'J_Bip_R_UpperArm', 'J_Bip_C_UpperChest']));
		expect(Object.keys(idle.at(0)).sort()).toEqual([...idle.bones].sort());
		expect(Object.keys(idle.at(0)).some((n) => /Leg|Foot|Hips/.test(n))).toBe(false);
	});

	it('lowers both arms out of the T-pose (rest arms are near horizontal)', () => {
		const rest = world(0); // t=0: breath phase 0, arms already lowered
		const bind = new Map<string, Quat>();
		for (const b of rig) {
			const p = b.parent ? bind.get(b.parent) : undefined;
			bind.set(b.name, p ? qNormalize(qMul(p, b.restLocal)) : qNormalize(b.restLocal));
		}
		for (const side of ['L', 'R'] as const) {
			expect(Math.abs(downness(armDir(bind, side)))).toBeLessThan(0.5); // T-pose: roughly sideways
			expect(downness(armDir(rest, side))).toBeGreaterThan(0.75); // lowered: clearly pointing down
		}
	});

	it('breathes: small, periodic, and the arms stay attached', () => {
		const q = idle.at(0)['J_Bip_C_UpperChest'];
		const peak = idle.at(60 / 14 / 4)['J_Bip_C_UpperChest']; // quarter period of 14 bpm
		const later = idle.at(60 / 14)['J_Bip_C_UpperChest']; // full period
		expect(qAngleDeg(q, peak)).toBeGreaterThan(0.5);
		expect(qAngleDeg(q, peak)).toBeLessThan(2);
		expect(qAngleDeg(q, later)).toBeLessThan(0.01);
		const a0 = armDir(world(0), 'L');
		const a1 = armDir(world(60 / 14 / 4), 'L');
		expect(downness(a1)).toBeGreaterThan(0.7); // still down at the top of the breath
		expect(Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2])).toBeGreaterThan(0); // and moves with the chest
	});
});

describe('makeIdlePose without the humanoid bones', () => {
	it('returns null so the caller keeps the bind pose', () => {
		expect(makeIdlePose([{ name: 'root', parent: null, restLocal: [0, 0, 0, 1] }], [])).toBeNull();
	});
});
