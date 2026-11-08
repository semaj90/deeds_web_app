/**
 * Parent Atlas Legal-AI Custom Motion & Gesture Library (v1)
 *
 * Procedural humanoid animation overlays and keyframe blending for legal and detective simulations:
 * - `present_evidence`: Exhibiting evidence documents/objects to the bench or jury.
 * - `objection_dramatic`: Sharp, accusatory forward point with forward chest lean.
 * - `cross_examine`: Stern cross-examination posture with hand on hip and deliberative gestures.
 * - `forensic_inspect`: Detective crouch inspecting footprints, ballistics, or scene markers.
 * - `gavel_strike`: Judicial impact strike with rebound envelope.
 * - `witness_oath`: Right hand raised swearing sworn testimony.
 *
 * Operates on standard humanoid VRM bones (J_Bip_* hierarchy) using rest-pose quaternion math.
 */

import { qFromAxisAngle, qMul, type Quat } from '../character-animation/rest-pose-retarget-v1.js';
import type { PoseOverlay } from './idle-pose-v1.js';

export const ATLAS_LEGAL_MOTION_KEYS = [
	'present_evidence',
	'objection_dramatic',
	'cross_examine',
	'forensic_inspect',
	'gavel_strike',
	'witness_oath'
] as const;

export type AtlasLegalMotionKey = (typeof ATLAS_LEGAL_MOTION_KEYS)[number];

export const ATLAS_MOTION_DURATIONS: Record<AtlasLegalMotionKey, number> = {
	present_evidence: 2.5,
	objection_dramatic: 1.8,
	cross_examine: 3.2,
	forensic_inspect: 3.5,
	gavel_strike: 1.6,
	witness_oath: 3.0
};

// Bone identifier constants matching J_Bip_* Alice/VRM standards
const HEAD = 'J_Bip_C_Head';
const NECK = 'J_Bip_C_Neck';
const SPINE = 'J_Bip_C_Spine';
const CHEST = 'J_Bip_C_Chest';
const UPPER_CHEST = 'J_Bip_C_UpperChest';

const L_UPPER_ARM = 'J_Bip_L_UpperArm';
const L_LOWER_ARM = 'J_Bip_L_LowerArm';
const L_HAND = 'J_Bip_L_Hand';

const R_UPPER_ARM = 'J_Bip_R_UpperArm';
const R_LOWER_ARM = 'J_Bip_R_LowerArm';
const R_HAND = 'J_Bip_R_Hand';

const L_UPPER_LEG = 'J_Bip_L_UpperLeg';
const L_LOWER_LEG = 'J_Bip_L_LowerLeg';
const R_UPPER_LEG = 'J_Bip_R_UpperLeg';
const R_LOWER_LEG = 'J_Bip_R_LowerLeg';

/** Hermite smoothstep envelope with configurable attack, sustain, and release */
export function legalMotionEnvelope(t: number, total: number, rise = 0.35, fall = 0.5): number {
	if (!Number.isFinite(t) || t <= 0 || t >= total) return 0;
	const up = Math.min(1, t / rise);
	const down = Math.min(1, (total - t) / fall);
	const e = Math.min(up, down);
	return e * e * (3 - 2 * e);
}

const pitch = (rad: number): Quat => qFromAxisAngle([1, 0, 0], rad);
const yaw = (rad: number): Quat => qFromAxisAngle([0, 1, 0], rad);
const roll = (rad: number): Quat => qFromAxisAngle([0, 0, 1], rad);

/**
 * Returns a procedural PoseOverlay function for the requested legal motion key.
 * Can be composed on top of the base breathing idle or walk cycle.
 */
export function atlasLegalMotionOverlay(key: AtlasLegalMotionKey): PoseOverlay {
	const duration = ATLAS_MOTION_DURATIONS[key];

	return (t: number) => {
		const env = legalMotionEnvelope(t, duration);
		if (env === 0) return {};

		switch (key) {
			case 'present_evidence': {
				// Right arm outstretched forward-right, palm up, chest turned slightly to jury
				return {
					[CHEST]: yaw(0.12 * env),
					[UPPER_CHEST]: pitch(0.06 * env),
					[HEAD]: qMul(yaw(-0.15 * env), pitch(0.1 * env)),
					[R_UPPER_ARM]: qMul(pitch(-0.85 * env), roll(-0.25 * env)),
					[R_LOWER_ARM]: pitch(-0.35 * env),
					[R_HAND]: roll(-0.4 * env) // palm face-up
				};
			}

			case 'objection_dramatic': {
				// Rapid thrust point forward, stern chest lean and focused head angle
				const snap = Math.min(1, t / 0.22);
				const snapEnv = snap * env;
				return {
					[SPINE]: pitch(0.12 * snapEnv),
					[CHEST]: pitch(0.15 * snapEnv),
					[HEAD]: pitch(0.18 * snapEnv),
					[R_UPPER_ARM]: pitch(-1.45 * snapEnv), // point forward 83 deg
					[R_LOWER_ARM]: pitch(-0.1 * snapEnv),
					[R_HAND]: pitch(-0.15 * snapEnv),
					[L_UPPER_ARM]: roll(0.3 * snapEnv) // left arm balances back
				};
			}

			case 'cross_examine': {
				// Left hand resting on hip, deliberate pacing rhythm with head inquiry tilt
				const inquiry = Math.sin(2 * Math.PI * 0.8 * t);
				return {
					[SPINE]: qMul(yaw(0.08 * env), pitch(0.05 * env)),
					[HEAD]: qMul(yaw(0.15 * env * inquiry), pitch(0.08 * env)),
					[L_UPPER_ARM]: qMul(roll(0.45 * env), pitch(0.2 * env)),
					[L_LOWER_ARM]: pitch(-0.75 * env), // elbow tucked
					[R_UPPER_ARM]: pitch(-0.4 * env * (1 + 0.3 * inquiry)),
					[R_LOWER_ARM]: pitch(-0.3 * env)
				};
			}

			case 'forensic_inspect': {
				// Detective crouch inspecting floor marker / footprint evidence
				return {
					[SPINE]: pitch(0.38 * env),
					[CHEST]: pitch(0.25 * env),
					[NECK]: pitch(0.15 * env),
					[HEAD]: pitch(0.45 * env), // looking directly down
					[R_UPPER_ARM]: pitch(-0.3 * env),
					[R_LOWER_ARM]: pitch(-0.6 * env), // hand reaching toward ground
					[L_UPPER_LEG]: pitch(0.4 * env), // knees bent crouch
					[L_LOWER_LEG]: pitch(-0.55 * env),
					[R_UPPER_LEG]: pitch(0.4 * env),
					[R_LOWER_LEG]: pitch(-0.55 * env)
				};
			}

			case 'gavel_strike': {
				// Judicial strike: arm raises high, strikes down at t=0.6s, rebounds
				const strikePhase = t < 0.6 ? t / 0.6 : (t - 0.6) / (duration - 0.6);
				const armAngle = t < 0.6 
					? -0.4 - 0.7 * Math.sin(strikePhase * Math.PI * 0.5) // wind up
					: -1.1 + 0.9 * Math.min(1, strikePhase * 2.5); // snap down
				const impactVibration = t >= 0.6 && t < 0.85 
					? Math.sin((t - 0.6) * 45) * 0.05 * (1 - (t - 0.6) / 0.25)
					: 0;

				return {
					[CHEST]: pitch((0.08 + impactVibration) * env),
					[HEAD]: pitch(0.15 * env),
					[R_UPPER_ARM]: pitch(armAngle * env),
					[R_LOWER_ARM]: pitch(-0.4 * env),
					[R_HAND]: pitch(impactVibration * 2)
				};
			}

			case 'witness_oath': {
				// Sworn witness oath: right hand raised to shoulder height with palm open
				return {
					[SPINE]: pitch(-0.04 * env), // erect posture
					[CHEST]: pitch(-0.05 * env),
					[HEAD]: yaw(0.0), // looking straight at court clerk
					[R_UPPER_ARM]: qMul(pitch(-1.1 * env), roll(-0.25 * env)),
					[R_LOWER_ARM]: pitch(-0.75 * env), // forearm upright
					[R_HAND]: roll(-0.3 * env), // palm open forward
					[L_UPPER_ARM]: pitch(0.05 * env) // left arm at side
				};
			}
		}
	};
}
