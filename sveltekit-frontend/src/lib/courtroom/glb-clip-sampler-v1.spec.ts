// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseGlb, sampleClip, toRig, type ParsedGlb } from './glb-clip-sampler-v1.js';
import { aliceBoneForAnyClipNode } from './bone-retarget-v1.js';
import { retargetPose, type Quat } from './rest-pose-retarget-v1.js';

// static/models is gitignored (assets are local); these checks run only where the GLBs exist.
const dir = path.resolve('static/models/courtroom');
const ALICE = ['character_alice_skinned.glb', 'character_alice.glb'].map((f) => path.join(dir, f)).find(existsSync);
const have = (f: string) => existsSync(path.join(dir, f));
const load = (p: string) => parseGlb(new Uint8Array(readFileSync(p)));

function qRot(q: Quat, v: number[]): number[] {
	const [x, y, z, w] = q;
	const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
	return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}
function qMulV(a: Quat, b: Quat): Quat {
	return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
/** Forward kinematics of joint positions by name (rotations override rest; translations stay at rest; uniform scale ignored). */
function fk(parsed: ParsedGlb, rot: Map<string, Quat>): Map<string, number[]> {
	const worldQ = new Map<number, Quat>();
	const worldP = new Map<number, number[]>();
	const visit = (i: number) => {
		if (worldQ.has(i)) return;
		const b = parsed.bones[i];
		const local = rot.get(b.name) ?? b.restRotation;
		if (b.parent < 0) { worldQ.set(i, local); worldP.set(i, [...b.restTranslation]); return; }
		visit(b.parent);
		const pq = worldQ.get(b.parent)!;
		const off = qRot(pq, [...b.restTranslation]);
		const pp = worldP.get(b.parent)!;
		worldQ.set(i, qMulV(pq, local));
		worldP.set(i, [pp[0] + off[0], pp[1] + off[1], pp[2] + off[2]]);
	};
	parsed.bones.forEach((_, i) => visit(i));
	const out = new Map<string, number[]>();
	parsed.bones.forEach((b, i) => { if (!out.has(b.name)) out.set(b.name, worldP.get(i)!); });
	return out;
}
const dirDeg = (a: number[], b: number[], c: number[], d: number[]) => {
	const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
	const nu = Math.hypot(...u), nv = Math.hypot(...v);
	return (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv)))) * 180) / Math.PI;
};

function armError(clipFile: string, prefix: string, time: number): { errors: number[]; mapped: number; srcDirs: number[][] } {
	const clip = load(path.join(dir, clipFile));
	const alice = load(ALICE!);
	const srcRig = toRig(clip);
	const tgtRig = toRig(alice);
	const tgtNames = new Set(tgtRig.map((b) => b.name));
	const map: Record<string, string> = {};
	for (const b of srcRig) { const t = aliceBoneForAnyClipNode(b.name); if (t && tgtNames.has(t)) map[b.name] = t; }
	const sampled = sampleClip(clip, 0, time);
	const srcLocal: Record<string, Quat> = {};
	sampled.forEach((q, node) => { srcLocal[clip.bones[node].name] = q; });
	const out = retargetPose(srcRig, tgtRig, map, srcLocal);
	const clipPos = fk(clip, new Map(Object.entries(srcLocal)));
	const alicePos = fk(alice, new Map(Object.entries(out)));
	const pairs = [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand']];
	const errors = pairs.map(([a, b]) => {
		const sa = clipPos.get(prefix + a)!, sb = clipPos.get(prefix + b)!;
		const ta = alicePos.get(map[prefix + a])!, tb = alicePos.get(map[prefix + b])!;
		return dirDeg(sa, sb, ta, tb);
	});
	const srcDirs = pairs.map(([a, b]) => { const sa = clipPos.get(prefix + a)!, sb = clipPos.get(prefix + b)!; const v = [sb[0] - sa[0], sb[1] - sa[1], sb[2] - sa[2]]; const n = Math.hypot(...v) || 1; return v.map((x) => x / n); });
	return { errors, mapped: Object.keys(map).length, srcDirs };
}
const angle = (u: number[], v: number[]) => (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * 180) / Math.PI;

describe.skipIf(!ALICE || !have('speaking_crossstage.glb') || !have('objection_dramatic.glb'))('glb clip sampler + retarget (real assets)', () => {
	it('parses both clip families and exposes rotation tracks', () => {
		const mvn = load(path.join(dir, 'speaking_crossstage.glb'));
		const mixamo = load(path.join(dir, 'objection_dramatic.glb'));
		expect(mvn.animations.length).toBeGreaterThan(0);
		expect(mixamo.animations.length).toBe(21);
		expect(mixamo.bones.some((b) => b.name === 'mixamorig:Hips')).toBe(true);
		expect(mvn.animations[0].rotations.length).toBeGreaterThan(20);
	});

	it('plain motion-capture clip: retargeted arm directions match the clip skeleton', () => {
		for (const t of [0.5, 3, 10]) {
			const { errors, mapped } = armError('speaking_crossstage.glb', '', t);
			expect(mapped).toBeGreaterThan(15);
			expect(Math.max(...errors), `t=${t}`).toBeLessThan(3);
		}
	});

	it('Mixamo clip (objection_dramatic): 52 bones map and retargeted arm directions match the clip skeleton', () => {
		const rows = [0.5, 3, 10].map((t) => ({ t, ...armError('objection_dramatic.glb', 'mixamorig:', t) }));
		for (const r of rows) {
			expect(r.mapped).toBe(52);
			expect(Math.max(...r.errors), `t=${r.t}`).toBeLessThan(3);
		}
	});

	it('the zero error is not trivial: the clip arms really move between sampled times', () => {
		for (const [file, prefix] of [['speaking_crossstage.glb', ''], ['objection_dramatic.glb', 'mixamorig:']] as const) {
			const a = armError(file, prefix, 0.5).srcDirs;
			const b = armError(file, prefix, 10).srcDirs;
			const moved = a.map((v, i) => angle(v, b[i]));
			expect(Math.max(...moved), file).toBeGreaterThan(5);
		}
	});
});
