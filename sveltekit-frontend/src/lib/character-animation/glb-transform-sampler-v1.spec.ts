// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseGlb, sampleClip, sampleTransformClip, sampleVector, toRig } from './glb-clip-sampler-v1.js';

/** Minimal in-memory GLB writer: float accessors only, enough for translation, scale and rotation channels. */
class GlbBuilder {
	private chunks: Uint8Array[] = [];
	private length = 0;
	bufferViews: any[] = [];
	accessors: any[] = [];

	accessor(values: number[], type: 'SCALAR' | 'VEC3' | 'VEC4'): number {
		const f = new Float32Array(values);
		const bytes = new Uint8Array(f.buffer.slice(0));
		this.chunks.push(bytes);
		this.bufferViews.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength });
		this.length += bytes.byteLength;
		const n = type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 4;
		this.accessors.push({ bufferView: this.bufferViews.length - 1, componentType: 5126, count: values.length / n, type });
		return this.accessors.length - 1;
	}

	bin(): Uint8Array {
		const out = new Uint8Array(this.length);
		let o = 0;
		for (const c of this.chunks) { out.set(c, o); o += c.length; }
		return out;
	}
}

function assemble(gltf: object, bin: Uint8Array): ArrayBuffer {
	const json = new TextEncoder().encode(JSON.stringify(gltf));
	const jsonPad = (4 - (json.length % 4)) % 4;
	const jsonChunk = new Uint8Array(json.length + jsonPad).fill(0x20);
	jsonChunk.set(json, 0);
	const binPad = (4 - (bin.length % 4)) % 4;
	const binChunk = new Uint8Array(bin.length + binPad);
	binChunk.set(bin, 0);
	const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
	const buf = new ArrayBuffer(total);
	const dv = new DataView(buf);
	dv.setUint32(0, 0x46546c67, true);
	dv.setUint32(4, 2, true);
	dv.setUint32(8, total, true);
	dv.setUint32(12, jsonChunk.length, true);
	dv.setUint32(16, 0x4e4f534a, true);
	new Uint8Array(buf, 20, jsonChunk.length).set(jsonChunk);
	const binOff = 20 + jsonChunk.length;
	dv.setUint32(binOff, binChunk.length, true);
	dv.setUint32(binOff + 4, 0x004e4942, true);
	new Uint8Array(buf, binOff + 8, binChunk.length).set(binChunk);
	return buf;
}

const SQ2 = Math.SQRT1_2;

/** Two nodes: hips (translated, animated translation+scale), spine (animated rotation). */
function transformGlb(): ArrayBuffer {
	const b = new GlbBuilder();
	const times = b.accessor([0, 1, 2], 'SCALAR');
	const trans = b.accessor([0, 0, 0, 1, 2, 3, 2, 4, 6], 'VEC3');
	const scale = b.accessor([1, 1, 1, 2, 2, 2, 4, 4, 4], 'VEC3');
	const rot = b.accessor([0, 0, 0, 1, 0, SQ2, 0, SQ2, 0, 0, 0, 1], 'VEC4');
	const gltf = {
		asset: { version: '2.0' },
		nodes: [
			{ name: 'hips', translation: [0, 1, 0], children: [1] },
			{ name: 'spine' },
		],
		buffers: [{ byteLength: b.bin().length }],
		bufferViews: b.bufferViews,
		accessors: b.accessors,
		animations: [
			{
				name: 'root_motion',
				samplers: [
					{ input: times, output: trans, interpolation: 'LINEAR' },
					{ input: times, output: scale, interpolation: 'STEP' },
					{ input: times, output: rot, interpolation: 'LINEAR' },
				],
				channels: [
					{ sampler: 0, target: { node: 0, path: 'translation' } },
					{ sampler: 1, target: { node: 0, path: 'scale' } },
					{ sampler: 2, target: { node: 1, path: 'rotation' } },
				],
			},
		],
	};
	return assemble(gltf, b.bin());
}

function badTranslationGlb(): ArrayBuffer {
	const b = new GlbBuilder();
	const times = b.accessor([0, 1], 'SCALAR');
	const out = b.accessor([1, 2], 'SCALAR'); // translation must be VEC3: 2 keys need 6 floats
	const gltf = {
		asset: { version: '2.0' },
		nodes: [{ name: 'hips' }],
		buffers: [{ byteLength: b.bin().length }],
		bufferViews: b.bufferViews,
		accessors: b.accessors,
		animations: [
			{
				name: 'bad',
				samplers: [{ input: times, output: out, interpolation: 'LINEAR' }],
				channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
			},
		],
	};
	return assemble(gltf, b.bin());
}

describe('sampleVector', () => {
	const track = { node: 0, times: new Float32Array([0, 1]), values: new Float32Array([0, 0, 0, 2, 4, 6]), step: false };

	it('interpolates linearly and clamps outside the key range', () => {
		expect(sampleVector(track, 0.5)).toEqual([1, 2, 3]);
		expect(sampleVector(track, -5)).toEqual([0, 0, 0]);
		expect(sampleVector(track, 9)).toEqual([2, 4, 6]);
	});

	it('holds the previous key for STEP tracks', () => {
		expect(sampleVector({ ...track, step: true }, 0.99)).toEqual([0, 0, 0]);
	});
});

describe('parseGlb translation and scale channels', () => {
	it('exposes translation, scale and rotation tracks and a duration covering all of them', () => {
		const parsed = parseGlb(transformGlb());
		const clip = parsed.animations[0];
		expect(clip.name).toBe('root_motion');
		expect(clip.translations.map((t) => t.node)).toEqual([0]);
		expect(clip.scales.map((t) => t.node)).toEqual([0]);
		expect(clip.rotations.map((t) => t.node)).toEqual([1]);
		expect(clip.duration).toBe(2);
	});

	it('keeps the rest rig unchanged for the retarget path', () => {
		const rig = toRig(parseGlb(transformGlb()));
		expect(rig.map((b) => [b.name, b.parent])).toEqual([
			['hips', null],
			['spine', 'hips'],
		]);
	});

	it('rejects a translation channel that is not a float VEC3 track', () => {
		expect(() => parseGlb(badTranslationGlb())).toThrow(/not a float VEC3 track/);
	});
});

describe('sampleTransformClip', () => {
	const parsed = parseGlb(transformGlb());

	it('samples translation linearly and scale with STEP interpolation', () => {
		const at05 = sampleTransformClip(parsed, 0, 0.5).get(0)!;
		expect(at05.translation).toEqual([0.5, 1, 1.5]);
		expect(at05.scale).toEqual([1, 1, 1]);

		const at15 = sampleTransformClip(parsed, 0, 1.5).get(0)!;
		expect(at15.translation?.[0]).toBeCloseTo(1.5, 6);
		expect(at15.translation?.[1]).toBeCloseTo(3, 6);
		expect(at15.translation?.[2]).toBeCloseTo(4.5, 6);
		expect(at15.scale).toEqual([2, 2, 2]);
	});

	it('clamps to the first and last keys', () => {
		expect(sampleTransformClip(parsed, 0, -1).get(0)).toEqual({ translation: [0, 0, 0], scale: [1, 1, 1] });
		expect(sampleTransformClip(parsed, 0, 10).get(0)).toEqual({ translation: [2, 4, 6], scale: [4, 4, 4] });
	});

	it('reports only channels the clip animates', () => {
		const samples = sampleTransformClip(parsed, 0, 1);
		expect(samples.get(1)).toEqual({ rotation: expect.any(Array) });
		expect(samples.get(1)?.translation).toBeUndefined();
		expect(samples.get(1)?.scale).toBeUndefined();
	});

	it('rotation matches the rotation-only sampleClip view', () => {
		const rotOnly = sampleClip(parsed, 0, 0.75).get(1)!;
		const full = sampleTransformClip(parsed, 0, 0.75).get(1)!.rotation!;
		rotOnly.forEach((v, i) => expect(full[i]).toBeCloseTo(v, 12));
		expect(sampleClip(parsed, 0, 0.75).has(0)).toBe(false);
	});

	it('a 90 degree yaw key at t=1 is reproduced after parsing', () => {
		const q = sampleTransformClip(parsed, 0, 1).get(1)!.rotation!;
		expect(q[1]).toBeCloseTo(SQ2, 6);
		expect(q[3]).toBeCloseTo(SQ2, 6);
	});
});
