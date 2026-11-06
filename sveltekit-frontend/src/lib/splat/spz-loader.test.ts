import { describe, it, expect } from 'vitest';
import * as zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estimateSpzDecodedByteLength, parseSpz, SpzError, sha256Hex, shCoeffsForDegree, zstdWindowSize } from './spz-loader.js';

// Node 22.15+ ships ZSTD in zlib, but the installed @types/node does not declare it yet.
const zstdCompressSync = (zlib as unknown as { zstdCompressSync: (d: Uint8Array) => Buffer }).zstdCompressSync;

/**
 * Minimal ZSTD frame with one raw (uncompressed) block. Valid per RFC 8878 for content <= 255 bytes
 * (single-segment header, 1-byte content size). Test-only: production streams are real ZSTD output.
 */
function zstdRawFrame(data: Uint8Array): Uint8Array {
	if (data.length > 255) throw new Error('test helper: content must be <= 255 bytes');
	const out = new Uint8Array(4 + 1 + 1 + 3 + data.length);
	out.set([0x28, 0xb5, 0x2f, 0xfd], 0); // ZSTD magic
	out[4] = 0x20; // single-segment, no FCS flag => 1-byte content size
	out[5] = data.length;
	const blockHeader = (data.length << 3) | 1; // raw block (type 0), last block
	out[6] = blockHeader & 0xff;
	out[7] = (blockHeader >> 8) & 0xff;
	out[8] = (blockHeader >> 16) & 0xff;
	out.set(data, 9);
	return out;
}

interface BuildOpts {
	version?: number;
	numPoints?: number;
	shDegree?: number;
	fractionalBits?: number;
	flags?: number;
	numStreams?: number;
	magic?: number;
	streams: Uint8Array[];
	/** Overrides for TOC uncompressed sizes (test negative cases). */
	uncompressedOverride?: Record<number, number>;
	trailing?: number;
	/** Frame encoder. Defaults to the raw-block helper; use real ZSTD for SPZ-04 tests. */
	frame?: (data: Uint8Array) => Uint8Array;
}

function buildSpz(o: BuildOpts): Uint8Array {
	const encode = o.frame ?? zstdRawFrame;
	const frames = o.streams.map((s) => encode(s));
	const tocBytes = 6 * 16;
	const total = 32 + tocBytes + frames.reduce((a, f) => a + f.length, 0) + (o.trailing ?? 0);
	const buf = new Uint8Array(total);
	const dv = new DataView(buf.buffer);
	dv.setUint32(0, o.magic ?? 0x5053474e, true);
	dv.setUint32(4, o.version ?? 4, true);
	dv.setUint32(8, o.numPoints ?? 3, true);
	buf[12] = o.shDegree ?? 1;
	buf[13] = o.fractionalBits ?? 12;
	buf[14] = o.flags ?? 0;
	buf[15] = o.numStreams ?? 6;
	dv.setUint32(16, 32, true);
	let cursor = 32 + tocBytes;
	frames.forEach((f, i) => {
		const e = 32 + i * 16;
		dv.setBigUint64(e, BigInt(f.length), true);
		const unc = o.uncompressedOverride?.[i] ?? o.streams[i].length;
		dv.setBigUint64(e + 8, BigInt(unc), true);
		buf.set(f, cursor);
		cursor += f.length;
	});
	return buf;
}

// Three points, SH degree 1 (3 coefficients per channel => 9 bytes per point).
function validStreams(): Uint8Array[] {
	const positions = new Uint8Array(27);
	// point 0: x = 4096 (1.0 at 12 fractional bits), y = -1 (24-bit 0xFFFFFF), z = 0
	positions.set([0x00, 0x10, 0x00], 0);
	positions.set([0xff, 0xff, 0xff], 3);
	const alphas = new Uint8Array([128, 0, 255]);
	const colors = new Uint8Array(9).fill(128);
	const scales = new Uint8Array(9).fill(160); // 160/16 - 10 = 0
	const rotations = new Uint8Array(12);
	// point 0: identity, largest index 3 (w), all other magnitudes zero
	rotations.set([0, 0, 0, 0xc0], 0);
	// point 1: q = (0.6, 0, 0, 0.8). Largest = index 3. Non-largest entries come out in order 2, 1, 0.
	// Index 0's entry sits in the top 10 bits below the largest index: mag 434, sign 0.
	const mag = Math.round((511 * 0.6) / 0.707106781186547524401); // 434
	const comp = ((3 << 30) | (mag << 20)) >>> 0;
	new DataView(rotations.buffer).setUint32(4, comp, true);
	const sh = new Uint8Array(27).fill(128);
	sh[0] = 255; // first coefficient => (255-128)/128
	return [positions, alphas, colors, scales, rotations, sh];
}

describe('parseSpz: valid synthetic v4 file', () => {
	it('decodes header fields and reports RUB coordinates', () => {
		const d = parseSpz(buildSpz({ streams: validStreams() }));
		expect(d.numPoints).toBe(3);
		expect(d.shDegree).toBe(1);
		expect(d.shCoeffs).toBe(3);
		expect(d.fractionalBits).toBe(12);
		expect(d.antialiased).toBe(false);
		expect(d.coordinateSystem).toBe('RUB');
	});

	it('decodes 24-bit fixed-point positions with sign extension', () => {
		const d = parseSpz(buildSpz({ streams: validStreams() }));
		expect(d.positions[0]).toBeCloseTo(1.0, 6);
		expect(d.positions[1]).toBeCloseTo(-1 / 4096, 9);
		expect(d.positions[2]).toBe(0);
	});

	it('decodes opacity as a logit and keeps the reference infinities at the extremes', () => {
		const d = parseSpz(buildSpz({ streams: validStreams() }));
		expect(d.alphas[0]).toBeCloseTo(Math.log((128 / 255) / (1 - 128 / 255)), 6);
		expect(d.alphas[1]).toBe(-Infinity);
		expect(d.alphas[2]).toBe(Infinity);
	});

	it('decodes log scales and the SH degree-0 color term', () => {
		const d = parseSpz(buildSpz({ streams: validStreams() }));
		expect(d.scales[0]).toBe(0);
		expect(d.colors[0]).toBeCloseTo((128 / 255 - 0.5) / 0.15, 6);
	});

	it('decodes smallest-three quaternions to unit xyzw', () => {
		const d = parseSpz(buildSpz({ streams: validStreams() }));
		expect([...d.rotations.slice(0, 4)]).toEqual([0, 0, 0, 1]);
		const q1 = [...d.rotations.slice(4, 8)];
		expect(q1[0]).toBeCloseTo(0.6, 2);
		expect(q1[1]).toBeCloseTo(0, 6);
		expect(q1[2]).toBeCloseTo(0, 6);
		expect(q1[3]).toBeCloseTo(0.8, 2);
		const norm = Math.hypot(...q1);
		expect(norm).toBeCloseTo(1, 6);
	});

	it('decodes SH coefficients to (b-128)/128', () => {
		const d = parseSpz(buildSpz({ streams: validStreams() }));
		expect(d.sh[0]).toBeCloseTo(127 / 128, 9);
		expect(d.sh[1]).toBe(0);
		expect(d.sh.length).toBe(3 * 3 * 3);
	});

	it('computes a SHA-256 of the raw bytes for the manifest', async () => {
		const bytes = buildSpz({ streams: validStreams() });
		const hex = await sha256Hex(bytes);
		expect(hex).toMatch(/^[a-f0-9]{64}$/);
		expect(await sha256Hex(bytes)).toBe(hex);
	});
});

describe('parseSpz: fail-closed cases', () => {
	const expectCode = (bytes: Uint8Array, code: string, opts?: { maxPoints?: number; maxDecodedBytes?: number }) => {
		try {
			parseSpz(bytes, opts);
		} catch (e) {
			expect(e).toBeInstanceOf(SpzError);
			expect((e as SpzError).code).toBe(code);
			return;
		}
		throw new Error(`expected SpzError ${code}`);
	};

	it('rejects a gzip (legacy v1-3) file', () => {
		expectCode(new Uint8Array([0x1f, 0x8b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'SPZ_LEGACY_GZIP_UNSUPPORTED');
	});

	it('rejects bad magic', () => {
		expectCode(buildSpz({ streams: validStreams(), magic: 0x12345678 }), 'SPZ_BAD_MAGIC');
	});

	it('rejects versions other than 4', () => {
		expectCode(buildSpz({ streams: validStreams(), version: 3 }), 'SPZ_VERSION_UNSUPPORTED');
	});

	it('rejects extension records (flag 0x2) rather than decoding them incorrectly', () => {
		expectCode(buildSpz({ streams: validStreams(), flags: 0x2 }), 'SPZ_EXTENSIONS_UNSUPPORTED');
	});

	it('rejects a stream count other than six', () => {
		expectCode(buildSpz({ streams: validStreams(), numStreams: 5 }), 'SPZ_STREAM_COUNT_UNEXPECTED');
	});

	it('rejects a TOC uncompressed size that does not match numPoints and shDegree', () => {
		expectCode(buildSpz({ streams: validStreams(), uncompressedOverride: { 0: 28 } }), 'SPZ_STREAM_SIZE_MISMATCH');
	});

	it('rejects trailing bytes after the last stream', () => {
		expectCode(buildSpz({ streams: validStreams(), trailing: 4 }), 'SPZ_TRAILING_BYTES');
	});

	it('rejects a point count above the operator cap', () => {
		expectCode(buildSpz({ streams: validStreams() }), 'SPZ_TOO_MANY_POINTS', { maxPoints: 2 });
	});

	it('rejects decoded output above its byte cap before decompressing any stream', () => {
		const bytes = buildSpz({ streams: validStreams(), numPoints: 3 });
		expectCode(bytes, 'SPZ_DECODED_TOO_LARGE', { maxDecodedBytes: 275 });
	});

	it('rejects truncated input', () => {
		expectCode(new Uint8Array(10), 'SPZ_TRUNCATED_HEADER');
	});

	it('rejects a corrupt ZSTD stream', () => {
		const bytes = buildSpz({ streams: validStreams() });
		// Corrupt the first stream's ZSTD magic (it starts right after the 32-byte header and 96-byte TOC)
		bytes[128] = 0x00;
		expectCode(bytes, 'SPZ_ZSTD_DECODE_FAILED');
	});
});

/** Deterministic PRNG so the large-stream test is reproducible. */
function prng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

describe('parseSpz: real ZSTD frames (Node zlib encoder, decoded by fzstd)', () => {
	const realZstd = (d: Uint8Array) => new Uint8Array(zstdCompressSync(d));

	it('decodes the same three-point file through real ZSTD frames', () => {
		const d = parseSpz(buildSpz({ streams: validStreams(), frame: realZstd }));
		expect(d.positions[0]).toBeCloseTo(1.0, 6);
		expect(d.positions[1]).toBeCloseTo(-1 / 4096, 9);
		expect([...d.rotations.slice(0, 4)]).toEqual([0, 0, 0, 1]);
		expect(d.sh[0]).toBeCloseTo(127 / 128, 9);
	});

	it('decodes multi-block streams (degree 2, 2000 points) and matches per-field formulas', () => {
		const n = 2000;
		const coeffs = shCoeffsForDegree(2); // 8 per channel, 24 bytes per point
		const rnd = prng(12345);
		const bytes = (len: number) => Uint8Array.from({ length: len }, () => Math.floor(rnd() * 256));
		const positions = bytes(n * 9);
		const alphas = bytes(n);
		const colors = bytes(n * 3);
		const scales = bytes(n * 3);
		const rotations = bytes(n * 4);
		const sh = bytes(n * coeffs * 3);
		const bytesIn = buildSpz({
			numPoints: n,
			shDegree: 2,
			fractionalBits: 12,
			streams: [positions, alphas, colors, scales, rotations, sh],
			frame: realZstd
		});

		const d = parseSpz(bytesIn);
		expect(d.numPoints).toBe(n);
		expect(d.shCoeffs).toBe(coeffs);
		expect(d.sh.length).toBe(n * coeffs * 3);

		// Independent check of a few sampled entries against the reference formulas.
		for (const i of [0, 1, 777, n * 3 - 1]) {
			const b = i * 3;
			const raw = ((positions[b + 2] << 24) | (positions[b + 1] << 16) | (positions[b] << 8)) >> 8;
			expect(d.positions[i]).toBeCloseTo(raw / 4096, 9);
		}
		for (const i of [0, 999, n - 1]) {
			expect(d.alphas[i]).toBeCloseTo(Math.log((alphas[i] / 255) / (1 - alphas[i] / 255)), 6);
		}
		const k = 1234;
		expect(d.scales[k]).toBeCloseTo(scales[k] / 16 - 10, 6);
		expect(d.colors[k]).toBeCloseTo((colors[k] / 255 - 0.5) / 0.15, 6);
		expect(d.sh[k]).toBeCloseTo((sh[k] - 128) / 128, 6);

		// Quaternions from arbitrary bytes are not always unit length (the reference clamps the largest term),
		// so only check that every component is finite and within [-1, 1].
		for (const v of d.rotations) {
			expect(Number.isFinite(v)).toBe(true);
			expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-6);
		}
	});

	it('rejects a real ZSTD stream whose decompressed size differs from the TOC', () => {
		const bad = buildSpz({
			streams: validStreams(),
			frame: realZstd,
			uncompressedOverride: { 2: 10 }
		});
		expect(() => parseSpz(bad)).toThrow(SpzError);
	});
});

/**
 * Files produced by Niantic's official C++ encoder (ply_to_spz, nianticlabs/spz commit
 * 11312e4ad836ed06e3da2f3d5b633688d17ebebb, MIT), from binary PLY inputs. Expected values are the
 * official spz_to_ply decode of the same files. Degree 0 has 5 streams (no SH stream); degree 1 has 6.
 */
describe('parseSpz: official Niantic encoder fixtures (SPZ-05 evidence)', () => {
	const fixture = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), `src/lib/splat/fixtures/${name}`)));
	const expected0 = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/splat/fixtures/expected-degree0.json'), 'utf8')) as {
		points: Array<{ pos: number[]; alpha: number; color: number[]; scale: number[]; rot_xyzw: number[] }>;
	};
	const expected1 = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/splat/fixtures/expected-degree1.json'), 'utf8')) as {
		points: Array<{ pos: number[]; alpha: number; color: number[]; scale: number[]; rot_xyzw: number[]; sh_channel_major: number[] }>;
	};

	it('degree 0 (5 streams): every field matches the official decode', () => {
		const d = parseSpz(fixture('niantic-official-degree0-5pt.spz'));
		expect(d.numPoints).toBe(5);
		expect(d.shDegree).toBe(0);
		expect(d.shCoeffs).toBe(0);
		expect(d.sh.length).toBe(0);
		expected0.points.forEach((e, i) => {
			for (let k = 0; k < 3; k++) {
				expect(d.positions[i * 3 + k]).toBeCloseTo(e.pos[k], 6);
				expect(d.colors[i * 3 + k]).toBeCloseTo(e.color[k], 6);
				expect(d.scales[i * 3 + k]).toBeCloseTo(e.scale[k], 6);
			}
			expect(d.alphas[i]).toBeCloseTo(e.alpha, 6);
			for (let k = 0; k < 4; k++) expect(d.rotations[i * 4 + k]).toBeCloseTo(e.rot_xyzw[k], 6);
		});
	});

	it('degree 1 (6 streams): fields match and SH follows the SPZ coefficient-major, RGB-interleaved layout', () => {
		const d = parseSpz(fixture('niantic-official-degree1-3pt.spz'));
		expect(d.numPoints).toBe(3);
		expect(d.shCoeffs).toBe(3);
		expected1.points.forEach((e, i) => {
			for (let k = 0; k < 3; k++) expect(d.positions[i * 3 + k]).toBeCloseTo(e.pos[k], 6);
			expect(d.alphas[i]).toBeCloseTo(e.alpha, 6);
			// Reference PLY stores f_rest channel-major: index = channel * coeffs + coeff.
			// SPZ stores coefficient-major with RGB interleaved: index = coeff * 3 + channel.
			for (let coeff = 0; coeff < 3; coeff++) {
				for (let channel = 0; channel < 3; channel++) {
					const ours = d.sh[i * 9 + coeff * 3 + channel];
					const ref = e.sh_channel_major[channel * 3 + coeff];
					expect(Math.abs(ours - ref)).toBeLessThanOrEqual(1 / 128 + 1e-9);
				}
			}
		});
	});

	it.each([2, 3, 4])('degree %i: fields and SH match the official decode', (deg) => {
		const d = parseSpz(fixture(`niantic-official-degree${deg}-3pt.spz`));
		const exp = JSON.parse(readFileSync(resolve(process.cwd(), `src/lib/splat/fixtures/expected-degree${deg}.json`), 'utf8')) as {
			points: Array<{ pos: number[]; alpha: number; color: number[]; scale: number[]; rot_xyzw: number[]; sh_channel_major: number[] }>;
		};
		const K = shCoeffsForDegree(deg);
		expect(d.shDegree).toBe(deg);
		expect(d.shCoeffs).toBe(K);
		expect(d.sh.length).toBe(exp.points.length * K * 3);
		exp.points.forEach((e, i) => {
			for (let k = 0; k < 3; k++) expect(d.positions[i * 3 + k]).toBeCloseTo(e.pos[k], 6);
			expect(d.alphas[i]).toBeCloseTo(e.alpha, 6);
			for (let coeff = 0; coeff < K; coeff++) {
				for (let channel = 0; channel < 3; channel++) {
					const ours = d.sh[i * K * 3 + coeff * 3 + channel];
					const ref = e.sh_channel_major[channel * K + coeff];
					expect(Math.abs(ours - ref)).toBeLessThanOrEqual(1e-6);
				}
			}
		});
	});

	it('rejects a degree-0 file that declares six streams', () => {
		const bytes = fixture('niantic-official-degree0-5pt.spz');
		bytes[15] = 6; // numStreams byte in the header
		expect(() => parseSpz(bytes)).toThrow(SpzError);
	});
});

describe('ZSTD window guard (fzstd 2^25 back-reference limit)', () => {
	it('reads the window from a single-segment frame (content size) and a window descriptor', () => {
		expect(zstdWindowSize(zstdRawFrame(new Uint8Array(40)))).toBe(40);
		expect(zstdWindowSize(new Uint8Array(zstdCompressSync(new Uint8Array(1000))))).toBe(1000);
		// Window descriptor: exponent 15 (windowLog 25), mantissa 0 => 2^25
		expect(zstdWindowSize(Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 15 << 3, 0, 0, 0]))).toBe(2 ** 25);
	});

	it('rejects a frame whose window exceeds 2^25 before decompressing', () => {
		// exponent 16 (windowLog 26), mantissa 0 => 2^26
		const bytes = buildSpz({
			streams: validStreams(),
			frame: () => Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 16 << 3, 0, 0, 0])
		});
		try {
			parseSpz(bytes);
			throw new Error('expected rejection');
		} catch (e) {
			expect((e as SpzError).code).toBe('SPZ_ZSTD_WINDOW_TOO_LARGE');
		}
	});

	it('allows a window of exactly 2^25 (the check passes; decoding then fails on the fake payload)', () => {
		const bytes = buildSpz({
			streams: validStreams(),
			frame: () => Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 15 << 3, 0, 0, 0])
		});
		try {
			parseSpz(bytes);
			throw new Error('expected a decode failure');
		} catch (e) {
			expect((e as SpzError).code).toBe('SPZ_ZSTD_DECODE_FAILED');
		}
	});
});

describe('shCoeffsForDegree', () => {
	it('matches the reference dimForDegree for degrees 0-4', () => {
		expect([0, 1, 2, 3, 4].map(shCoeffsForDegree)).toEqual([0, 3, 8, 15, 24]);
	});

	it('estimates the decoded Float32 payload from the SPZ v4 header', () => {
		const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/splat/fixtures/niantic-official-degree1-3pt.spz')));
		expect(estimateSpzDecodedByteLength(bytes)).toBe(3 * 23 * Float32Array.BYTES_PER_ELEMENT);
	});
});
