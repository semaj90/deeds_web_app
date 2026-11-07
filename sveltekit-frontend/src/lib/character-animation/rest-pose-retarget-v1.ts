/**
 * Rest-relative pose retargeting between two humanoid skeletons whose bones share a name table
 * (see bone-retarget-v1.ts) and whose WORLD rest poses are aligned (both T-pose) but whose LOCAL
 * bone axes differ.
 *
 * For each mapped bone: D = worldAnim_src * inverse(worldRest_src); worldAnim_tgt = D * worldRest_tgt;
 * the target local rotation is inverse(worldAnim_tgt_parent) * worldAnim_tgt. Unmapped target bones
 * keep their rest rotation. Quaternions are [x, y, z, w], Hamilton product, world = parent * local.
 *
 * Pure math: no Babylon dependency, so it can be unit tested. It rotates joints only (no translation,
 * scale or bone-length compensation) and has NOT been verified against a rendered character.
 */

export type Quat = readonly [number, number, number, number];

export interface RigBone {
	name: string;
	parent: string | null;
	restLocal: Quat;
}

/** Bones must be listed parents-first. */
export type Rig = readonly RigBone[];

const IDENTITY: Quat = [0, 0, 0, 1];

export function qMul(a: Quat, b: Quat): Quat {
	const [ax, ay, az, aw] = a;
	const [bx, by, bz, bw] = b;
	return [
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
		aw * bw - ax * bx - ay * by - az * bz,
	];
}

export function qInv(q: Quat): Quat {
	const n = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
	return [-q[0] / n, -q[1] / n, -q[2] / n, q[3] / n];
}

export function qNormalize(q: Quat): Quat {
	const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
	return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function qFromAxisAngle(axis: readonly [number, number, number], radians: number): Quat {
	const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
	const s = Math.sin(radians / 2) / l;
	return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(radians / 2)];
}

/** Rotation angle in degrees between two quaternions (sign of q and -q is the same rotation). */
export function qAngleDeg(a: Quat, b: Quat): number {
	const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
	return (2 * Math.acos(d) * 180) / Math.PI;
}

function worldRotations(rig: Rig, local: (b: RigBone) => Quat): Map<string, Quat> {
	const world = new Map<string, Quat>();
	for (const bone of rig) {
		const l = local(bone);
		const parent = bone.parent ? world.get(bone.parent) : undefined;
		if (bone.parent && !parent) throw new Error(`rig is not parents-first at ${bone.name}`);
		world.set(bone.name, parent ? qNormalize(qMul(parent, l)) : qNormalize(l));
	}
	return world;
}

/**
 * Convert one frame of source local rotations to target local rotations.
 * `map` is source bone name to target bone name; only mapped target bones are returned.
 */
export function retargetPose(
	src: Rig,
	tgt: Rig,
	map: Readonly<Record<string, string>>,
	srcLocal: Readonly<Record<string, Quat>>,
): Record<string, Quat> {
	const srcRest = worldRotations(src, (b) => b.restLocal);
	const srcAnim = worldRotations(src, (b) => srcLocal[b.name] ?? b.restLocal);
	const tgtRest = worldRotations(tgt, (b) => b.restLocal);
	const targetToSource = new Map<string, string>();
	for (const [s, t] of Object.entries(map)) targetToSource.set(t, s);

	const tgtAnim = new Map<string, Quat>();
	const out: Record<string, Quat> = {};
	for (const bone of tgt) {
		const parentWorld = bone.parent ? (tgtAnim.get(bone.parent) ?? IDENTITY) : IDENTITY;
		const srcName = targetToSource.get(bone.name);
		const sRest = srcName ? srcRest.get(srcName) : undefined;
		const sAnim = srcName ? srcAnim.get(srcName) : undefined;
		if (!srcName || !sRest || !sAnim) {
			tgtAnim.set(bone.name, qNormalize(qMul(parentWorld, bone.restLocal)));
			continue;
		}
		const delta = qMul(sAnim, qInv(sRest));
		const world = qNormalize(qMul(delta, tgtRest.get(bone.name) as Quat));
		const local = qNormalize(qMul(qInv(parentWorld), world));
		tgtAnim.set(bone.name, world);
		out[bone.name] = local;
	}
	return out;
}
