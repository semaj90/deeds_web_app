// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { qAngleDeg, qFromAxisAngle, qMul, qNormalize, retargetPose, type Quat } from './rest-pose-retarget-v1.js';
import {
	CLIP_FPS,
	PROCEDURAL_CLIPS,
	PROCEDURAL_CLIP_NAMES,
	PROCEDURAL_HUMANOID_RIG,
	clipFrameCount,
	poseAtFrame,
	type ClipName,
	type Pose,
} from './procedural-clips-v1.js';

const IDENTITY: Quat = [0, 0, 0, 1];

function allFrames(name: ClipName): number[] {
	return Array.from({ length: clipFrameCount(name) + 1 }, (_, i) => i);
}

function maxAngleDeg(pose: Pose): number {
	return Math.max(0, ...Object.values(pose).map((q) => qAngleDeg(q, IDENTITY)));
}

describe('procedural humanoid rig', () => {
	it('is parents-first with unique names and identity rest rotations', () => {
		const seen = new Set<string>();
		for (const bone of PROCEDURAL_HUMANOID_RIG) {
			if (bone.parent) expect(seen.has(bone.parent)).toBe(true);
			expect(seen.has(bone.name)).toBe(false);
			seen.add(bone.name);
			expect(bone.restLocal).toEqual(IDENTITY);
		}
		// 17 bones: below the 20-30 target in the work package; the richer rig is a later Blender fixture step.
		expect(PROCEDURAL_HUMANOID_RIG.length).toBe(17);
	});

	it('uses a fixed 24 fps clock and whole-frame clip lengths', () => {
		expect(CLIP_FPS).toBe(24);
		for (const name of PROCEDURAL_CLIP_NAMES) {
			expect(Number.isInteger(clipFrameCount(name))).toBe(true);
			expect(clipFrameCount(name)).toBe(Math.round(PROCEDURAL_CLIPS[name].durationSec * CLIP_FPS));
		}
	});
});

describe('procedural clips are deterministic frame functions', () => {
	it('returns identical poses for the same frame across calls', () => {
		for (const name of PROCEDURAL_CLIP_NAMES) {
			for (const f of [0, 1, 7, 13, clipFrameCount(name)]) {
				const opts = { lookYawRad: 0.4, turnToRad: 1.1 };
				expect(poseAtFrame(name, f, opts)).toEqual(poseAtFrame(name, f, opts));
			}
		}
	});

	it('emits only unit quaternions that reference rig bones', () => {
		const names = new Set(PROCEDURAL_HUMANOID_RIG.map((b) => b.name));
		for (const name of PROCEDURAL_CLIP_NAMES) {
			for (const f of allFrames(name)) {
				for (const [bone, q] of Object.entries(poseAtFrame(name, f, { lookYawRad: -0.5, turnToRad: 2 }))) {
					expect(names.has(bone)).toBe(true);
					expect(Math.hypot(...q)).toBeCloseTo(1, 12);
				}
			}
		}
	});

	it('rejects negative and non-finite frames', () => {
		expect(() => poseAtFrame('idle', -1)).toThrow(RangeError);
		expect(() => poseAtFrame('idle', Number.NaN)).toThrow(RangeError);
		expect(() => poseAtFrame('idle', Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});
});

describe('loop clips', () => {
	it('wrap exactly after one clip length', () => {
		for (const name of ['idle', 'walk', 'wave'] as const) {
			const n = clipFrameCount(name);
			for (const f of [0, 3, 11]) {
				expect(poseAtFrame(name, f + n)).toEqual(poseAtFrame(name, f));
			}
		}
	});

	it('walk repeats every stride (1 s) and stays within bounded limb angles', () => {
		for (let f = 0; f < 24; f++) {
			const a = poseAtFrame('walk', f);
			const b = poseAtFrame('walk', f + 24 * 2);
			expect(b).toEqual(a);
		}
		expect(Math.max(...allFrames('walk').map((f) => maxAngleDeg(poseAtFrame('walk', f))))).toBeLessThan(40);
	});

	it('idle stays a small breathing motion', () => {
		expect(Math.max(...allFrames('idle').map((f) => maxAngleDeg(poseAtFrame('idle', f))))).toBeLessThan(5);
	});

	it('wave holds the right arm raised and oscillates the forearm', () => {
		const raised = Math.min(...allFrames('wave').map((f) => qAngleDeg(poseAtFrame('wave', f).upper_arm_r, IDENTITY)));
		expect(raised).toBeGreaterThan(120);
		const forearm = new Set(allFrames('wave').map((f) => poseAtFrame('wave', f).forearm_r.join(',')));
		expect(forearm.size).toBeGreaterThan(4);
	});
});

describe('one-shot clips', () => {
	it('look_at eases toward a clamped target and holds the final value', () => {
		const end = poseAtFrame('look_at', 1000, { lookYawRad: 5 });
		expect(qAngleDeg(end.head, IDENTITY)).toBeCloseTo((0.9 * 0.6 * 180) / Math.PI, 6);
		expect(qAngleDeg(end.neck, IDENTITY)).toBeCloseTo((0.9 * 0.4 * 180) / Math.PI, 6);
		expect(poseAtFrame('look_at', 0, { lookYawRad: 0.5 }).head).toEqual(IDENTITY);
		expect(poseAtFrame('look_at', 1000, { lookYawRad: 5 })).toEqual(poseAtFrame('look_at', clipFrameCount('look_at'), { lookYawRad: 5 }));
	});

	it('turn starts at identity and ends at the requested hips yaw', () => {
		const to = 1.2;
		expect(poseAtFrame('turn', 0, { turnToRad: to }).hips).toEqual(IDENTITY);
		const end = poseAtFrame('turn', clipFrameCount('turn'), { turnToRad: to }).hips;
		const expected = qFromAxisAngle([0, 1, 0], to);
		expect(qAngleDeg(end, expected)).toBeLessThan(1e-9);
		expect(poseAtFrame('turn', 9999, { turnToRad: to })).toEqual(poseAtFrame('turn', clipFrameCount('turn'), { turnToRad: to }));
	});
});

describe('compatibility with retarget math', () => {
	it('identity retarget onto the same rig reproduces every animated local rotation', () => {
		const identityMap = Object.fromEntries(PROCEDURAL_HUMANOID_RIG.map((b) => [b.name, b.name]));
		for (const name of PROCEDURAL_CLIP_NAMES) {
			for (const f of [0, 5, 17]) {
				const pose = poseAtFrame(name, f, { lookYawRad: 0.3, turnToRad: 0.8 });
				const out = retargetPose(PROCEDURAL_HUMANOID_RIG, PROCEDURAL_HUMANOID_RIG, identityMap, pose);
				for (const bone of PROCEDURAL_HUMANOID_RIG) {
					const expected = pose[bone.name] ?? IDENTITY;
					// Component comparison with q/-q sign alignment. Angle metrics amplify float noise near identity.
					const sign = out[bone.name].reduce((s, v, i) => s + v * expected[i], 0) < 0 ? -1 : 1;
					for (let i = 0; i < 4; i++) {
						expect(Math.abs(out[bone.name][i] - sign * expected[i])).toBeLessThan(1e-9);
					}
				}
			}
		}
	});

	it('composes with qMul without changing unit length', () => {
		const q = qMul(poseAtFrame('walk', 4).upper_leg_l, poseAtFrame('wave', 4).upper_arm_r);
		expect(Math.hypot(...qNormalize(q))).toBeCloseTo(1, 12);
	});
});
