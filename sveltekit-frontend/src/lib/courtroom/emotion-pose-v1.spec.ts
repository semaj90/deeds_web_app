// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMOTION_POSE_KEYS, EMOTION_POSE_SECONDS, emotionOverlay, envelope } from './emotion-pose-v1.js';
import { parseGlb, toRig } from './glb-clip-sampler-v1.js';
import { makeIdlePose, rotateVec, type Vec } from './idle-pose-v1.js';
import { qAngleDeg, qMul, qNormalize, type Quat } from './rest-pose-retarget-v1.js';
import { RetargetRuntime } from './character-retarget-runtime-v1.js';

describe('envelope', () => {
	it('is 0 outside the window, 1 in the middle, and smooth', () => {
		expect(envelope(-1, 2)).toBe(0);
		expect(envelope(0, 2)).toBe(0);
		expect(envelope(2, 2)).toBe(0);
		expect(envelope(5, 2)).toBe(0);
		expect(envelope(1, 2)).toBe(1);
		expect(envelope(NaN, 2)).toBe(0);
		expect(envelope(0.15, 2)).toBeGreaterThan(0);
		expect(envelope(0.15, 2)).toBeLessThan(1);
	});
});

const ALICE = join(process.cwd(), 'static/models/courtroom/character_alice_n64.glb');
(existsSync(ALICE) ? describe : describe.skip)('emotion poses on Alice (static/models is gitignored)', () => {
	const parsed = parseGlb(new Uint8Array(readFileSync(ALICE)));
	const rig = toRig(parsed);
	const trans = new Map(parsed.bones.map((b) => [b.name, b.restTranslation as Vec]));
	const worldHead = (pose: Record<string, Quat>, dir: Vec = [0, 1, 0]): Vec => {
		const w = new Map<string, Quat>();
		for (const b of rig) {
			const l = pose[b.name] ?? b.restLocal;
			const p = b.parent ? w.get(b.parent) : undefined;
			w.set(b.name, p ? qNormalize(qMul(p, l)) : qNormalize(l));
		}
		return rotateVec(w.get('J_Bip_C_Head')!, dir);
	};
	const poseAt = (key: (typeof EMOTION_POSE_KEYS)[number], t: number) =>
		makeIdlePose(rig, parsed.bones, { overlay: emotionOverlay(key), durationSeconds: EMOTION_POSE_SECONDS[key] })!.at(t);
	void trans;

	it('every emotion returns to the plain idle by its end', () => {
		const idle = makeIdlePose(rig, parsed.bones)!;
		for (const key of EMOTION_POSE_KEYS) {
			const end = EMOTION_POSE_SECONDS[key];
			const a = poseAt(key, end + 0.5);
			const b = idle.at(end + 0.5);
			for (const bone of Object.keys(b)) expect(qAngleDeg(a[bone], b[bone]), `${key} ${bone}`).toBeLessThan(0.01);
		}
	});

	it('moves the head the way the name says', () => {
		const up = (key: (typeof EMOTION_POSE_KEYS)[number], t: number) => worldHead(poseAt(key, t));
		const facing = (key: (typeof EMOTION_POSE_KEYS)[number], t: number) => worldHead(poseAt(key, t), [0, 0, 1]);
		const rest = worldHead(makeIdlePose(rig, parsed.bones)!.at(1.5));
		expect(up('react_sad', 1.5)[2] - rest[2]).toBeGreaterThan(0.2); // head tips forward (+Z), facing down
		expect(up('react_surprised', 0.9)[2] - rest[2]).toBeLessThan(-0.1); // head tips back
		let maxYawX = 0;
		for (let t = 0.2; t < 1.4; t += 0.05) maxYawX = Math.max(maxYawX, Math.abs(facing('shake_head', t)[0]));
		expect(maxYawX).toBeGreaterThan(0.1); // shake swings where the face points, side to side
		let maxNodZ = 0;
		for (let t = 0.2; t < 1.2; t += 0.05) maxNodZ = Math.max(maxNodZ, Math.abs(up('nod', t)[2] - rest[2]));
		expect(maxNodZ).toBeGreaterThan(0.1); // nod swings the head forward and back
	});

	it('the runtime plays them as one-shots that report finished, and nothing is fetched per emotion', async () => {
		let fetches = 0;
		const b = readFileSync(ALICE);
		const rt = new RetargetRuntime(async () => { fetches++; return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }; });
		expect(await rt.init('/alice')).toBe(true);
		for (const key of EMOTION_POSE_KEYS) {
			expect(rt.has(key), key).toBe(true);
			rt.play(key, 1000, false);
			expect(rt.isFinished(1000 + 100)).toBe(false);
			expect(rt.isFinished(1000 + EMOTION_POSE_SECONDS[key] * 1000 + 1)).toBe(true);
			expect(rt.frame(1000 + 200)).not.toBeNull();
		}
		rt.play('idle', 0, true);
		expect(rt.isFinished(1e9)).toBe(false); // idle loops forever
		expect(fetches).toBe(1);
	});
});
