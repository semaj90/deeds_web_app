/**
 * Procedural one-shot emotion poses layered on the breathing idle, so the move set needs no emotion clip files
 * (courtroom-move-set-v1). Every pose is a small world-space rotation of the head, spine or arms with a short envelope that
 * rises, holds and settles back to the idle. +X is the character's lateral axis (positive pitch tips the head forward and
 * down for a character facing +Z), +Y is vertical (yaw), +Z is forward (roll).
 */
import { qFromAxisAngle, qMul, type Quat } from './rest-pose-retarget-v1.js';
import type { PoseOverlay } from './idle-pose-v1.js';

export const EMOTION_POSE_KEYS = ['nod', 'shake_head', 'react_sad', 'react_angry', 'react_surprised'] as const;
export type EmotionPoseKey = (typeof EMOTION_POSE_KEYS)[number];

export const EMOTION_POSE_SECONDS: Record<EmotionPoseKey, number> = {
	nod: 1.4,
	shake_head: 1.6,
	react_sad: 3,
	react_angry: 2.4,
	react_surprised: 1.8,
};

const HEAD = 'J_Bip_C_Head';
const NECK = 'J_Bip_C_Neck';
const SPINE = 'J_Bip_C_Spine';
const CHEST = 'J_Bip_C_Chest';
const UPPER = 'J_Bip_C_UpperChest';
const L_ARM = 'J_Bip_L_UpperArm';
const R_ARM = 'J_Bip_R_UpperArm';

/** 0 -> 1 over `rise` seconds, hold, then 1 -> 0 over the last `fall` seconds. */
export function envelope(t: number, total: number, rise = 0.3, fall = 0.6): number {
	if (!Number.isFinite(t) || t <= 0 || t >= total) return 0;
	const up = Math.min(1, t / rise);
	const down = Math.min(1, (total - t) / fall);
	const e = Math.min(up, down);
	return e * e * (3 - 2 * e); // smoothstep
}

const pitch = (rad: number): Quat => qFromAxisAngle([1, 0, 0], rad);
const yaw = (rad: number): Quat => qFromAxisAngle([0, 1, 0], rad);
const roll = (rad: number): Quat => qFromAxisAngle([0, 0, 1], rad);

export function emotionOverlay(key: EmotionPoseKey): PoseOverlay {
	const total = EMOTION_POSE_SECONDS[key];
	return (t: number) => {
		const e = envelope(t, total);
		if (e === 0) return {};
		switch (key) {
			case 'nod':
				return { [HEAD]: pitch(0.28 * e * Math.sin(2 * Math.PI * 1.7 * t)) };
			case 'shake_head':
				return { [HEAD]: yaw(0.32 * e * Math.sin(2 * Math.PI * 2.2 * t)) };
			case 'react_sad': // slump forward, head down
				return { [SPINE]: pitch(0.1 * e), [CHEST]: pitch(0.12 * e), [HEAD]: pitch(0.3 * e), [NECK]: pitch(0.1 * e) };
			case 'react_angry': // lean in, chin down, a small tremor in the arms
				return {
					[CHEST]: pitch(0.1 * e),
					[HEAD]: pitch(0.12 * e),
					[UPPER]: roll(0.03 * e * Math.sin(2 * Math.PI * 9 * t)),
					[L_ARM]: roll(0.04 * e * Math.sin(2 * Math.PI * 11 * t)),
					[R_ARM]: roll(-0.04 * e * Math.sin(2 * Math.PI * 11 * t)),
				};
			case 'react_surprised': // lean back, head up, a quick flinch
				return { [SPINE]: pitch(-0.08 * e), [CHEST]: pitch(-0.1 * e), [HEAD]: pitch(-0.2 * e), [UPPER]: pitch(-0.05 * e * (1 + Math.sin(2 * Math.PI * 4 * t) * 0.3)) };
		}
	};
}

/** Compose two overlays (the second applied on top). */
export function composeOverlays(a: PoseOverlay, b: PoseOverlay): PoseOverlay {
	return (t) => {
		const out: Record<string, Quat> = { ...a(t) };
		for (const [bone, q] of Object.entries(b(t))) out[bone] = out[bone] ? qMul(q, out[bone]) : q;
		return out;
	};
}
