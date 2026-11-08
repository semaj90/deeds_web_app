/**
 * Original procedural humanoid clips (idle, walk, wave, look_at, turn).
 *
 * Every pose is a pure function of an integer frame index (fixed CLIP_FPS), so the same frame always yields the same
 * local rotations. No external character, motion capture, or third-party animation data is used. Output is a
 * parents-first local-rotation map compatible with `retargetPose` (rest-pose-retarget-v1.ts). Rotation only: root
 * translation and bone scale are not produced here.
 */
import { qFromAxisAngle, type Quat, type Rig } from './rest-pose-retarget-v1.js';

export const CLIP_FPS = 24;

export type ClipName = 'idle' | 'walk' | 'wave' | 'look_at' | 'turn';

export const PROCEDURAL_CLIP_NAMES: readonly ClipName[] = ['idle', 'walk', 'wave', 'look_at', 'turn'];

export const PROCEDURAL_CLIPS: Readonly<Record<ClipName, { durationSec: number; loop: boolean }>> = {
	idle: { durationSec: 4, loop: true },
	walk: { durationSec: 1, loop: true },
	wave: { durationSec: 2, loop: true },
	look_at: { durationSec: 1.5, loop: false },
	turn: { durationSec: 1.5, loop: false },
};

/** Original 18-bone humanoid skeleton. Parents are listed before children. All rest rotations are identity. */
export const PROCEDURAL_HUMANOID_RIG: Rig = [
	{ name: 'hips', parent: null, restLocal: [0, 0, 0, 1] },
	{ name: 'spine', parent: 'hips', restLocal: [0, 0, 0, 1] },
	{ name: 'chest', parent: 'spine', restLocal: [0, 0, 0, 1] },
	{ name: 'neck', parent: 'chest', restLocal: [0, 0, 0, 1] },
	{ name: 'head', parent: 'neck', restLocal: [0, 0, 0, 1] },
	{ name: 'shoulder_l', parent: 'chest', restLocal: [0, 0, 0, 1] },
	{ name: 'upper_arm_l', parent: 'shoulder_l', restLocal: [0, 0, 0, 1] },
	{ name: 'forearm_l', parent: 'upper_arm_l', restLocal: [0, 0, 0, 1] },
	{ name: 'shoulder_r', parent: 'chest', restLocal: [0, 0, 0, 1] },
	{ name: 'upper_arm_r', parent: 'shoulder_r', restLocal: [0, 0, 0, 1] },
	{ name: 'forearm_r', parent: 'upper_arm_r', restLocal: [0, 0, 0, 1] },
	{ name: 'upper_leg_l', parent: 'hips', restLocal: [0, 0, 0, 1] },
	{ name: 'lower_leg_l', parent: 'upper_leg_l', restLocal: [0, 0, 0, 1] },
	{ name: 'foot_l', parent: 'lower_leg_l', restLocal: [0, 0, 0, 1] },
	{ name: 'upper_leg_r', parent: 'hips', restLocal: [0, 0, 0, 1] },
	{ name: 'lower_leg_r', parent: 'upper_leg_r', restLocal: [0, 0, 0, 1] },
	{ name: 'foot_r', parent: 'lower_leg_r', restLocal: [0, 0, 0, 1] },
];

export type Pose = Record<string, Quat>;

export interface ClipOptions {
	/** look_at: target yaw in radians (clamped to ±0.9 rad). */
	lookYawRad?: number;
	/** turn: final hips yaw in radians. */
	turnToRad?: number;
}

const AXIS_X: [number, number, number] = [1, 0, 0];
const AXIS_Y: [number, number, number] = [0, 1, 0];
const AXIS_Z: [number, number, number] = [0, 0, 1];
const TAU = 2 * Math.PI;

function rot(axis: readonly [number, number, number], radians: number): Quat {
	return qFromAxisAngle(axis, radians);
}

function smoothstep01(u: number): number {
	const x = Math.min(1, Math.max(0, u));
	return x * x * (3 - 2 * x);
}

/** Frame count for a clip at CLIP_FPS. */
export function clipFrameCount(name: ClipName): number {
	return Math.round(PROCEDURAL_CLIPS[name].durationSec * CLIP_FPS);
}

function idlePose(t: number): Pose {
	const b = (TAU * t) / 4; // 4 s loop
	return {
		spine: rot(AXIS_X, 0.025 * Math.sin(b)),
		chest: rot(AXIS_X, 0.02 * Math.sin(b - 0.3)),
		neck: rot(AXIS_Y, 0.03 * Math.sin(2 * b)),
		head: rot(AXIS_Y, 0.05 * Math.sin(2 * b)),
		shoulder_l: rot(AXIS_Z, 0.015 * Math.sin(b)),
		shoulder_r: rot(AXIS_Z, -0.015 * Math.sin(b)),
	};
}

function walkPose(t: number): Pose {
	const p = TAU * t; // 1 s stride cycle
	return {
		upper_leg_l: rot(AXIS_X, 0.45 * Math.sin(p)),
		upper_leg_r: rot(AXIS_X, -0.45 * Math.sin(p)),
		lower_leg_l: rot(AXIS_X, -0.35 * ((1 + Math.cos(p)) / 2)),
		lower_leg_r: rot(AXIS_X, -0.35 * ((1 - Math.cos(p)) / 2)),
		upper_arm_l: rot(AXIS_X, -0.35 * Math.sin(p)),
		upper_arm_r: rot(AXIS_X, 0.35 * Math.sin(p)),
		hips: rot(AXIS_Z, 0.03 * Math.sin(2 * p)),
	};
}

function wavePose(t: number): Pose {
	const w = (TAU * t) / 2; // 2 s loop, two wave strokes per loop
	return {
		upper_arm_r: rot(AXIS_Z, -2.3),
		forearm_r: rot(AXIS_Z, 0.35 * Math.sin(2 * w)),
		upper_arm_l: rot(AXIS_Z, 0.08),
	};
}

function lookAtPose(t: number, opts: ClipOptions): Pose {
	const target = Math.min(0.9, Math.max(-0.9, opts.lookYawRad ?? 0));
	const k = smoothstep01(t / PROCEDURAL_CLIPS.look_at.durationSec);
	return {
		neck: rot(AXIS_Y, target * 0.4 * k),
		head: rot(AXIS_Y, target * 0.6 * k),
	};
}

function turnPose(t: number, opts: ClipOptions): Pose {
	const to = opts.turnToRad ?? Math.PI / 2;
	const k = smoothstep01(t / PROCEDURAL_CLIPS.turn.durationSec);
	return { hips: rot(AXIS_Y, to * k) };
}

/**
 * Local rotations at an integer frame. Loop clips wrap the frame index; one-shot clips clamp to their last frame.
 * Throws RangeError for negative or non-finite frames.
 */
export function poseAtFrame(name: ClipName, frame: number, opts: ClipOptions = {}): Pose {
	if (!Number.isFinite(frame) || frame < 0) throw new RangeError(`frame must be a non-negative finite number, got ${frame}`);
	const total = clipFrameCount(name);
	const f = PROCEDURAL_CLIPS[name].loop ? Math.trunc(frame) % total : Math.min(Math.trunc(frame), total);
	const t = f / CLIP_FPS;
	switch (name) {
		case 'idle':
			return idlePose(t);
		case 'walk':
			return walkPose(t);
		case 'wave':
			return wavePose(t);
		case 'look_at':
			return lookAtPose(t, opts);
		case 'turn':
			return turnPose(t, opts);
	}
}
