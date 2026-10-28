// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { qAngleDeg, qFromAxisAngle, qInv, qMul, qNormalize, retargetPose, type Quat, type Rig } from './rest-pose-retarget-v1.js';

const I: Quat = [0, 0, 0, 1];
const rad = (d: number) => (d * Math.PI) / 180;

function worldOf(rig: Rig, local: Record<string, Quat>): Record<string, Quat> {
	const w: Record<string, Quat> = {};
	for (const b of rig) {
		const l = local[b.name] ?? b.restLocal;
		w[b.name] = b.parent ? qNormalize(qMul(w[b.parent], l)) : qNormalize(l);
	}
	return w;
}

// Source: chain with non-trivial rest frames (axis conventions), world rests R_i.
const srcRig: Rig = [
	{ name: 'hips', parent: null, restLocal: qFromAxisAngle([1, 0, 0], rad(90)) },
	{ name: 'spine', parent: 'hips', restLocal: qFromAxisAngle([0, 1, 0], rad(-90)) },
	{ name: 'arm', parent: 'spine', restLocal: qFromAxisAngle([0, 0, 1], rad(180)) },
];
// Target: same bones with identity rest (world rest aligned, local axes differ from the source).
const tgtRig: Rig = [
	{ name: 'Hips', parent: null, restLocal: I },
	{ name: 'Spine', parent: 'Hips', restLocal: I },
	{ name: 'Arm', parent: 'Spine', restLocal: I },
	{ name: 'Extra', parent: 'Arm', restLocal: qFromAxisAngle([0, 1, 0], rad(30)) },
];
const map = { hips: 'Hips', spine: 'Spine', arm: 'Arm' };

describe('retargetPose', () => {
	it('source rest pose retargets to target rest pose', () => {
		const out = retargetPose(srcRig, tgtRig, map, {});
		for (const name of ['Hips', 'Spine', 'Arm']) expect(qAngleDeg(out[name], I)).toBeLessThan(1e-3);
	});

	it('reproduces the source world-space motion on a skeleton with different local axes', () => {
		const anim: Record<string, Quat> = {
			hips: qMul(srcRig[0].restLocal, qFromAxisAngle([0, 0, 1], rad(20))),
			spine: qMul(srcRig[1].restLocal, qFromAxisAngle([1, 0, 0], rad(35))),
			arm: qMul(srcRig[2].restLocal, qFromAxisAngle([0, 1, 0], rad(-50))),
		};
		const srcRest = worldOf(srcRig, {});
		const srcWorld = worldOf(srcRig, anim);
		const out = retargetPose(srcRig, tgtRig, map, anim);
		const tgtWorld = worldOf(tgtRig, out);
		for (const [s, t] of Object.entries(map)) {
			const delta = qMul(srcWorld[s], qInv(srcRest[s])); // world delta from rest on the source
			const expected = qMul(delta, worldOf(tgtRig, {})[t]); // same delta applied to the target rest
			expect(qAngleDeg(tgtWorld[t], expected), t).toBeLessThan(1e-3);
		}
	});

	it('leaves unmapped target bones at their rest rotation and omits them from the output', () => {
		const out = retargetPose(srcRig, tgtRig, map, { arm: qFromAxisAngle([0, 1, 0], rad(10)) });
		expect(out.Extra).toBeUndefined();
	});

	it('rejects a rig that is not parents-first', () => {
		const bad: Rig = [{ name: 'child', parent: 'root', restLocal: I }, { name: 'root', parent: null, restLocal: I }];
		expect(() => retargetPose(bad, bad, { child: 'child', root: 'root' }, {})).toThrow(/parents-first/);
	});
});
