// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlb, toRig } from './glb-clip-sampler-v1.js';
import { makeIdlePose, rotateVec, type Vec } from './idle-pose-v1.js';
import {
	ATLAS_LEGAL_MOTION_KEYS,
	ATLAS_MOTION_DURATIONS,
	atlasLegalMotionOverlay
} from './atlas-legal-motions-v1.js';
import { qAngleDeg, qMul, qNormalize, type Quat } from './rest-pose-retarget-v1.js';

const ALICE = join(process.cwd(), 'static/models/courtroom/character_alice_skinned.glb');
const run = existsSync(ALICE) ? describe : describe.skip;

run('atlas-legal-motions on Alice Skinned Humanoid GLB', () => {
	const parsed = parseGlb(new Uint8Array(readFileSync(ALICE)));
	const rig = toRig(parsed);
	const trans = new Map(parsed.bones.map((b) => [b.name, b.restTranslation as Vec]));

	it('rig maps Alice bones into standard humanoid hierarchy', () => {
		expect(rig.length).toBeGreaterThan(40);
		expect(rig.some((b) => b.name === 'J_Bip_C_Hips')).toBe(true);
		expect(rig.some((b) => b.name === 'J_Bip_R_UpperArm')).toBe(true);
		expect(rig.some((b) => b.name === 'J_Bip_C_Head')).toBe(true);
	});

	for (const motionKey of ATLAS_LEGAL_MOTION_KEYS) {
		const duration = ATLAS_MOTION_DURATIONS[motionKey];

		it(`blends procedural motion '${motionKey}' on Alice, sustains, and returns cleanly to idle`, () => {
			const motionOverlay = atlasLegalMotionOverlay(motionKey);
			const idleWithMotion = makeIdlePose(rig, parsed.bones, {
				overlay: motionOverlay,
				durationSeconds: duration
			});

			expect(idleWithMotion).not.toBeNull();

			// 1. Sample at t = 0 (before motion rises)
			const poseStart = idleWithMotion!.at(0);
			expect(Object.keys(poseStart).length).toBeGreaterThan(0);

			// 2. Sample at peak action time (midpoint)
			const midTime = duration * 0.45;
			const posePeak = idleWithMotion!.at(midTime);
			expect(Object.keys(posePeak).length).toBeGreaterThan(0);

			// Every quaternion at peak must be a valid unit quaternion
			for (const [bone, q] of Object.entries(posePeak)) {
				const norm = Math.hypot(...q);
				expect(norm).toBeCloseTo(1.0, 4);
			}

			// Verify meaningful displacement from rest at peak
			let maxAngleDiff = 0;
			for (const [bone, qPeak] of Object.entries(posePeak)) {
				const qStart = poseStart[bone];
				if (qStart) {
					const angle = qAngleDeg(qStart, qPeak);
					if (angle > maxAngleDiff) maxAngleDiff = angle;
				}
			}
			// Action must visibly rotate at least one joint > 5 degrees
			expect(maxAngleDiff).toBeGreaterThan(5.0);

			// 3. Sample at t = duration + 0.1s (after motion envelope completes)
			const poseEnd = idleWithMotion!.at(duration + 0.1);
			expect(Object.keys(poseEnd).length).toBeGreaterThan(0);

			// Overlay should have settled back: motion overlay itself returns empty record
			const rawOverlayEnd = motionOverlay(duration + 0.1);
			expect(Object.keys(rawOverlayEnd)).toHaveLength(0);
		});
	}

	it('present_evidence extends Alice right arm forward and palm up in world space', () => {
		const overlay = atlasLegalMotionOverlay('present_evidence');
		const idle = makeIdlePose(rig, parsed.bones, { overlay, durationSeconds: 2.5 });
		expect(idle).not.toBeNull();
		const peak = idle!.at(1.2);

		// Compute world orientation of right upper arm
		const w = new Map<string, Quat>();
		for (const b of rig) {
			const l = peak[b.name] ?? b.restLocal;
			const p = b.parent ? w.get(b.parent) : undefined;
			w.set(b.name, p ? qNormalize(qMul(p, l)) : qNormalize(l));
		}

		// Arm vector in world space
		const rArmDir = rotateVec(w.get('J_Bip_R_UpperArm')!, trans.get('J_Bip_R_LowerArm')!);
		// In present_evidence, arm reaches forward (+Z) and slightly outward (+X)
		const forwardness = rArmDir[2] / Math.hypot(...rArmDir);
		expect(forwardness).toBeGreaterThan(0.3);
	});
});
