import { describe, it, expect } from 'vitest';
import {
	ATLAS_LEGAL_MOTION_KEYS,
	ATLAS_MOTION_DURATIONS,
	atlasLegalMotionOverlay,
	legalMotionEnvelope,
	type AtlasLegalMotionKey
} from './atlas-legal-motions-v1.js';

describe('atlas-legal-motions-v1 (Custom Legal-AI Procedural Motions)', () => {
	it('defines all 6 standard legal and detective motion keys', () => {
		expect(ATLAS_LEGAL_MOTION_KEYS).toEqual([
			'present_evidence',
			'objection_dramatic',
			'cross_examine',
			'forensic_inspect',
			'gavel_strike',
			'witness_oath'
		]);
	});

	it('envelope rises smoothly, holds, and returns to 0 at boundaries', () => {
		expect(legalMotionEnvelope(0, 2.5)).toBe(0);
		expect(legalMotionEnvelope(-0.5, 2.5)).toBe(0);
		expect(legalMotionEnvelope(2.5, 2.5)).toBe(0);
		expect(legalMotionEnvelope(3.0, 2.5)).toBe(0);

		// Mid-point should be close to 1.0 sustain
		const mid = legalMotionEnvelope(1.25, 2.5);
		expect(mid).toBeGreaterThan(0.95);
		expect(mid).toBeLessThanOrEqual(1.0);
	});

	it('produces valid unit quaternions for all motion keys across timeline samples', () => {
		for (const key of ATLAS_LEGAL_MOTION_KEYS) {
			const overlay = atlasLegalMotionOverlay(key);
			const duration = ATLAS_MOTION_DURATIONS[key];

			// Sample at 0.25s, midpoint, and near end
			const sampleTimes = [0.25, duration * 0.5, duration - 0.2];

			for (const t of sampleTimes) {
				const pose = overlay(t);
				expect(Object.keys(pose).length).toBeGreaterThan(0);

				for (const [boneName, q] of Object.entries(pose)) {
					expect(boneName).toMatch(/^J_Bip_/);
					expect(q).toHaveLength(4);
					const norm = Math.hypot(q[0], q[1], q[2], q[3]);
					expect(norm).toBeCloseTo(1.0, 4);
				}
			}
		}
	});

	it('present_evidence exhibits evidence by extending right arm and pitching hand up', () => {
		const overlay = atlasLegalMotionOverlay('present_evidence');
		const pose = overlay(1.25);

		expect(pose['J_Bip_R_UpperArm']).toBeDefined();
		expect(pose['J_Bip_R_LowerArm']).toBeDefined();
		expect(pose['J_Bip_R_Hand']).toBeDefined();
		expect(pose['J_Bip_C_Chest']).toBeDefined();

		// Right upper arm should have significant pitch rotation
		const rArm = pose['J_Bip_R_UpperArm'];
		expect(Math.abs(rArm[0])).toBeGreaterThan(0.2); // pitch axis
	});

	it('objection_dramatic produces forward point and chest lean', () => {
		const overlay = atlasLegalMotionOverlay('objection_dramatic');
		const pose = overlay(0.8);

		expect(pose['J_Bip_R_UpperArm']).toBeDefined();
		expect(pose['J_Bip_C_Chest']).toBeDefined();
		expect(pose['J_Bip_C_Head']).toBeDefined();

		// Arm reaches forward pitch
		const armQ = pose['J_Bip_R_UpperArm'];
		expect(Math.abs(armQ[0])).toBeGreaterThan(0.4);
	});

	it('forensic_inspect pitches spine, head, and bends knee joints', () => {
		const overlay = atlasLegalMotionOverlay('forensic_inspect');
		const pose = overlay(1.75);

		expect(pose['J_Bip_C_Head']).toBeDefined();
		expect(pose['J_Bip_C_Spine']).toBeDefined();
		expect(pose['J_Bip_L_UpperLeg']).toBeDefined();
		expect(pose['J_Bip_R_UpperLeg']).toBeDefined();

		// Head pitches down (looking at floor)
		const headQ = pose['J_Bip_C_Head'];
		expect(headQ[0]).toBeGreaterThan(0.1);
	});

	it('gavel_strike demonstrates impact phase transition', () => {
		const overlay = atlasLegalMotionOverlay('gavel_strike');
		const windupPose = overlay(0.4);
		const strikePose = overlay(0.7);

		expect(windupPose['J_Bip_R_UpperArm']).toBeDefined();
		expect(strikePose['J_Bip_R_UpperArm']).toBeDefined();

		// Quaternions should differ substantially between windup and strike
		const windupArm = windupPose['J_Bip_R_UpperArm'];
		const strikeArm = strikePose['J_Bip_R_UpperArm'];
		expect(windupArm).not.toEqual(strikeArm);
	});

	it('witness_oath elevates right forearm upright with erect posture', () => {
		const overlay = atlasLegalMotionOverlay('witness_oath');
		const pose = overlay(1.5);

		expect(pose['J_Bip_R_UpperArm']).toBeDefined();
		expect(pose['J_Bip_R_LowerArm']).toBeDefined();
		expect(pose['J_Bip_R_Hand']).toBeDefined();
		expect(pose['J_Bip_C_Spine']).toBeDefined();
	});
});
