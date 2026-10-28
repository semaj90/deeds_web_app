// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RetargetRuntime } from './character-retarget-runtime-v1.js';

const dir = path.resolve('static/models/courtroom');
const have = (f: string) => existsSync(path.join(dir, f));
const fileFetcher = async (url: string) => {
	const p = path.join(dir, path.basename(url));
	if (!existsSync(p)) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
	const b = readFileSync(p);
	return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};

describe('RetargetRuntime', () => {
	it('is unusable (not ready) when the character fetch fails', async () => {
		const rt = new RetargetRuntime(fileFetcher);
		expect(await rt.init('/models/courtroom/does_not_exist.glb')).toBe(false);
		expect(rt.ready).toBe(false);
		await expect(rt.addClip('x', '/a.glb')).rejects.toThrow(/not initialised/);
	});

	describe.skipIf(!have('character_alice.glb') || !have('objection_dramatic.glb') || !have('speaking_crossstage.glb'))('real assets', () => {
		it('loads a plain and a Mixamo clip, plays them, loops, and stops', async () => {
			const rt = new RetargetRuntime(fileFetcher);
			expect(await rt.init('/models/courtroom/character_alice.glb')).toBe(true);
			const plain = await rt.addClip('speaking', '/models/courtroom/speaking_crossstage.glb');
			const mixamo = await rt.addClip('objection', '/models/courtroom/objection_dramatic.glb');
			expect(plain.mapped).toBeGreaterThan(15);
			expect(mixamo.mapped).toBe(52);
			expect(rt.frame(0)).toBeNull(); // nothing playing yet
			expect(rt.play('nope', 0)).toBe(false);
			expect(rt.play('objection', 1000)).toBe(true);
			const a = rt.frame(1000 + 500)!;
			const b = rt.frame(1000 + 5000)!;
			expect(Object.keys(a)).toHaveLength(52);
			expect(a['J_Bip_L_UpperArm']).not.toEqual(b['J_Bip_L_UpperArm']); // pose changes over time
			for (const q of Object.values(a)) expect(Math.hypot(...q)).toBeCloseTo(1, 5); // unit quaternions
			const loopA = rt.frame(1000 + 2000)!;
			const loopB = rt.frame(1000 + 2000 + 30000)!; // objection_dramatic animation 0 lasts 30 s
			expect(loopB['J_Bip_C_Hips'][0]).toBeCloseTo(loopA['J_Bip_C_Hips'][0], 3);
			rt.stop();
			expect(rt.frame(2000)).toBeNull();
		});

		it('rejects a clip whose bones do not map (synthetic GLB with unrelated node names)', async () => {
			const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, nodes: [{ name: 'foo' }, { name: 'bar' }], animations: [{ name: 'a', channels: [], samplers: [] }] }));
			const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
			padded.set(json);
			const glb = new Uint8Array(12 + 8 + padded.length);
			const dv = new DataView(glb.buffer);
			dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
			dv.setUint32(12, padded.length, true); dv.setUint32(16, 0x4e4f534a, true);
			glb.set(padded, 20);
			const fetcher = async (url: string) => url.includes('synthetic')
				? { ok: true, arrayBuffer: async () => glb.buffer }
				: fileFetcher(url);
			const rt = new RetargetRuntime(fetcher);
			await rt.init('/models/courtroom/character_alice.glb');
			await expect(rt.addClip('bad', '/synthetic.glb')).rejects.toThrow(/only 0 bones map/);
			expect(rt.has('bad')).toBe(false);
		});
	});
});
