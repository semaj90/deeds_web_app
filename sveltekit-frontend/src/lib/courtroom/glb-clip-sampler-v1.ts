/**
 * Reads skeleton rest data and rotation tracks straight from a GLB (JSON + BIN chunks), so clip retargeting does
 * not depend on a renderer importing animations by node name (which fails for Mixamo clips whose `mixamorig:*`
 * nodes are absent from the character scene). Pure TypeScript, no Babylon/Three dependency.
 *
 * Supports rotation channels (float or normalized integer accessors, LINEAR and STEP interpolation). Translation,
 * scale, morph weights and CUBICSPLINE tracks are ignored. Quaternions are [x, y, z, w] in glTF space.
 */
import type { Quat, Rig } from './rest-pose-retarget-v1.js';

export interface GlbBone {
	name: string;
	parent: number; // node index or -1
	restRotation: Quat;
	restTranslation: readonly [number, number, number];
}

export interface RotationTrack {
	node: number;
	times: Float32Array;
	values: Float32Array; // 4 per key
	step: boolean;
}

export interface ParsedGlb {
	bones: GlbBone[]; // indexed by glTF node index
	animations: { name: string; duration: number; rotations: RotationTrack[] }[];
}

const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5126: 4 };
const TYPE_COUNT: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };

function readAccessor(gltf: any, bin: DataView, index: number): Float32Array {
	const acc = gltf.accessors[index];
	const view = gltf.bufferViews[acc.bufferView];
	const n = TYPE_COUNT[acc.type];
	const size = COMPONENT_SIZE[acc.componentType];
	if (!n || !size) throw new Error(`unsupported accessor ${acc.type}/${acc.componentType}`);
	const stride = view.byteStride ?? n * size;
	const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
	const out = new Float32Array(acc.count * n);
	for (let i = 0; i < acc.count; i++) {
		for (let k = 0; k < n; k++) {
			const o = base + i * stride + k * size;
			let v: number;
			switch (acc.componentType) {
				case 5126: v = bin.getFloat32(o, true); break;
				case 5122: v = acc.normalized ? Math.max(bin.getInt16(o, true) / 32767, -1) : bin.getInt16(o, true); break;
				case 5123: v = acc.normalized ? bin.getUint16(o, true) / 65535 : bin.getUint16(o, true); break;
				case 5120: v = acc.normalized ? Math.max(bin.getInt8(o) / 127, -1) : bin.getInt8(o); break;
				default: v = acc.normalized ? bin.getUint8(o) / 255 : bin.getUint8(o);
			}
			out[i * n + k] = v;
		}
	}
	return out;
}

export function parseGlb(input: ArrayBuffer | Uint8Array): ParsedGlb {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error('not a GLB v2 file');
	let off = 12;
	let gltf: any = null;
	let bin: DataView | null = null;
	while (off + 8 <= bytes.byteLength) {
		const len = dv.getUint32(off, true);
		const type = dv.getUint32(off + 4, true);
		const start = bytes.byteOffset + off + 8;
		if (type === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(off + 8, off + 8 + len)));
		else if (type === 0x004e4942) bin = new DataView(bytes.buffer, start, len);
		off += 8 + len;
	}
	if (!gltf) throw new Error('GLB has no JSON chunk');
	const nodes: any[] = gltf.nodes ?? [];
	const parent = new Array<number>(nodes.length).fill(-1);
	nodes.forEach((n, i) => (n.children ?? []).forEach((c: number) => (parent[c] = i)));
	const bones: GlbBone[] = nodes.map((n, i) => ({
		name: n.name ?? `node_${i}`,
		parent: parent[i],
		restRotation: (n.rotation ?? [0, 0, 0, 1]) as Quat,
		restTranslation: (n.translation ?? [0, 0, 0]) as [number, number, number],
	}));
	const animations = (gltf.animations ?? []).map((a: any) => {
		const rotations: RotationTrack[] = [];
		let duration = 0;
		for (const ch of a.channels) {
			if (ch.target.path !== 'rotation' || ch.target.node == null) continue;
			const sampler = a.samplers[ch.sampler];
			if (sampler.interpolation === 'CUBICSPLINE' || !bin) continue;
			const times = readAccessor(gltf, bin, sampler.input);
			const values = readAccessor(gltf, bin, sampler.output);
			if (times.length) duration = Math.max(duration, times[times.length - 1]);
			rotations.push({ node: ch.target.node, times, values, step: sampler.interpolation === 'STEP' });
		}
		return { name: a.name ?? 'animation', duration, rotations };
	});
	return { bones, animations };
}

function slerp(a: Quat, b: Quat, t: number): Quat {
	let [bx, by, bz, bw] = b;
	let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
	if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
	if (dot > 0.9995) {
		const q: Quat = [a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t];
		const n = Math.hypot(...q) || 1;
		return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
	}
	const theta = Math.acos(dot);
	const s = Math.sin(theta);
	const wa = Math.sin((1 - t) * theta) / s;
	const wb = Math.sin(t * theta) / s;
	return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export function sampleRotation(track: RotationTrack, time: number): Quat {
	const { times, values } = track;
	const n = times.length;
	const q = (i: number): Quat => [values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3]];
	if (n === 0) return [0, 0, 0, 1];
	if (time <= times[0]) return q(0);
	if (time >= times[n - 1]) return q(n - 1);
	let lo = 0;
	let hi = n - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (times[mid] <= time) lo = mid; else hi = mid;
	}
	if (track.step) return q(lo);
	return slerp(q(lo), q(hi), (time - times[lo]) / (times[hi] - times[lo] || 1));
}

/** Local rotations by node index at `time` (animated nodes only). */
export function sampleClip(parsed: ParsedGlb, animation: number, time: number): Map<number, Quat> {
	const out = new Map<number, Quat>();
	for (const track of parsed.animations[animation]?.rotations ?? []) out.set(track.node, sampleRotation(track, time));
	return out;
}

/** Parents-first rig for `retargetPose`; node names are the rig keys. Duplicate names keep the first node. */
export function toRig(parsed: ParsedGlb): Rig {
	const order: number[] = [];
	const seen = new Set<number>();
	const visit = (i: number) => {
		if (seen.has(i)) return;
		const p = parsed.bones[i].parent;
		if (p >= 0) visit(p);
		seen.add(i);
		order.push(i);
	};
	parsed.bones.forEach((_, i) => visit(i));
	const firstByName = new Map<string, number>();
	for (const i of order) if (!firstByName.has(parsed.bones[i].name)) firstByName.set(parsed.bones[i].name, i);
	const keep = order.filter((i) => firstByName.get(parsed.bones[i].name) === i);
	const keepSet = new Set(keep);
	const nearestKept = (i: number): number => { let p = parsed.bones[i].parent; while (p >= 0 && !keepSet.has(p)) p = parsed.bones[p].parent; return p; };
	return keep.map((i) => {
		const p = nearestKept(i);
		return { name: parsed.bones[i].name, parent: p >= 0 ? parsed.bones[p].name : null, restLocal: parsed.bones[i].restRotation };
	});
}
