/**
 * Procedural standing idle for a `J_Bip_*` humanoid, used because no idle clip exists: lowers the arms out of the
 * bind T-pose and adds a slow breathing motion. Pure math on the rig (no Babylon), so it is unit tested.
 *
 * Every adjustment is a WORLD-space rotation D applied to a bone's "follows its parent" orientation:
 *   local = inverse(P) * D * P * restLocal,  P = the bone's animated parent world rotation.
 * That keeps the arms attached to a breathing chest. The arm-lowering axis is derived from the bone's own rest
 * direction (child offset rotated into world), so it does not depend on which way the rig's local axes point.
 */
import type { GlbBone } from './glb-clip-sampler-v1.js';
import { qFromAxisAngle, qInv, qMul, qNormalize, type Quat, type Rig } from './rest-pose-retarget-v1.js';

export type Vec = readonly [number, number, number];

/** World-space rotation to add to named bones at `seconds` since the pose began (composed on top of the idle). */
export type PoseOverlay = (seconds: number) => Readonly<Record<string, Quat>>;

export interface IdleOptions {
	/** Extra per-bone world rotations, e.g. an emotion; the base idle (arms down, breathing) still applies. */
	overlay?: PoseOverlay;
	/** Seconds until a one-shot pose is finished; omit for a pose that loops forever. */
	durationSeconds?: number;
	/** Breaths per minute. */
	breathsPerMinute?: number;
	/** Peak chest pitch in degrees. */
	breathDegrees?: number;
	/** How far to swing each arm down from the T-pose, in degrees (90 = straight down). */
	armDownDegrees?: number;
}

const DEFAULTS: Required<Pick<IdleOptions, 'breathsPerMinute' | 'breathDegrees' | 'armDownDegrees'>> = { breathsPerMinute: 14, breathDegrees: 1.2, armDownDegrees: 68 };
const RAD = Math.PI / 180;

const ARMS: ReadonlyArray<{ upper: string; lower: string }> = [
	{ upper: 'J_Bip_L_UpperArm', lower: 'J_Bip_L_LowerArm' },
	{ upper: 'J_Bip_R_UpperArm', lower: 'J_Bip_R_LowerArm' },
];
/** Chest chain, with the share of the breath each bone takes (head counter-rotates to stay level). */
const BREATH: ReadonlyArray<readonly [string, number]> = [
	['J_Bip_C_Spine', 0.4],
	['J_Bip_C_Chest', 0.7],
	['J_Bip_C_UpperChest', 1],
	['J_Bip_C_Head', -0.5],
];

export function rotateVec(q: Quat, v: Vec): Vec {
	const [x, y, z, w] = q;
	const tx = 2 * (y * v[2] - z * v[1]);
	const ty = 2 * (z * v[0] - x * v[2]);
	const tz = 2 * (x * v[1] - y * v[0]);
	return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);

function worldOf(rig: Rig, localOf: (name: string, rest: Quat) => Quat): Map<string, Quat> {
	const world = new Map<string, Quat>();
	for (const b of rig) {
		const l = localOf(b.name, b.restLocal);
		const parent = b.parent ? world.get(b.parent) : undefined;
		world.set(b.name, parent ? qNormalize(qMul(parent, l)) : qNormalize(l));
	}
	return world;
}

export interface IdlePose {
	/** Local rotations (by bone name) at `seconds` since the idle began. Only bones it drives are returned. */
	at(seconds: number): Record<string, Quat>;
	/** Bones this idle drives. */
	bones: string[];
	/** Set for one-shot poses; the pose holds its last frame afterwards. */
	durationSeconds: number | null;
}

/** Returns null when the rig lacks the bones this idle needs (so the caller keeps the bind pose). */
export function makeIdlePose(rig: Rig, glbBones: readonly GlbBone[], options: IdleOptions = {}): IdlePose | null {
	const o = { ...DEFAULTS, ...options };
	const byName = new Map(rig.map((b) => [b.name, b]));
	const translation = new Map<string, Vec>();
	for (const b of glbBones) if (!translation.has(b.name)) translation.set(b.name, b.restTranslation);
	if (!ARMS.every((a) => byName.has(a.upper) && translation.has(a.lower))) return null;
	const breathBones = BREATH.filter(([n]) => byName.has(n));
	if (breathBones.length === 0) return null;

	const restWorld = worldOf(rig, (_n, rest) => rest);
	// World-space rotation that swings each arm from its rest direction toward straight down.
	const armDelta = new Map<string, Quat>();
	for (const { upper, lower } of ARMS) {
		const dir = rotateVec(restWorld.get(upper)!, translation.get(lower)!);
		const len = norm(dir);
		if (len < 1e-6) return null;
		const unit: Vec = [dir[0] / len, dir[1] / len, dir[2] / len];
		const axis = cross(unit, [0, -1, 0]);
		if (norm(axis) < 1e-6) continue; // already pointing down
		const toDown = Math.acos(Math.min(1, Math.max(-1, -unit[1])));
		armDelta.set(upper, qFromAxisAngle(axis, Math.min(o.armDownDegrees * RAD, toDown)));
	}

	const bones = [...armDelta.keys(), ...breathBones.map(([n]) => n)];
	const breathHz = o.breathsPerMinute / 60;

	return {
		bones,
		durationSeconds: o.durationSeconds ?? null,
		at(seconds: number): Record<string, Quat> {
			const breath = Math.sin(2 * Math.PI * breathHz * seconds) * o.breathDegrees * RAD;
			const delta = new Map<string, Quat>(armDelta);
			// Chest pitch about the world X axis (side to side), the axis a torso nods forward and back around.
			for (const [n, share] of breathBones) delta.set(n, qFromAxisAngle([1, 0, 0], breath * share));
			const extra = options.overlay?.(seconds);
			if (extra) {
				for (const [n, q] of Object.entries(extra)) {
					if (!byName.has(n)) continue;
					const base = delta.get(n);
					delta.set(n, base ? qNormalize(qMul(q, base)) : q);
				}
			}
			const out: Record<string, Quat> = {};
			const anim = new Map<string, Quat>();
			for (const b of rig) {
				const P = b.parent ? (anim.get(b.parent) ?? ([0, 0, 0, 1] as Quat)) : ([0, 0, 0, 1] as Quat);
				const D = delta.get(b.name);
				const local = D ? qNormalize(qMul(qInv(P), qMul(D, qMul(P, b.restLocal)))) : b.restLocal;
				if (D) out[b.name] = local;
				anim.set(b.name, qNormalize(qMul(P, local)));
			}
			return out;
		},
	};
}
