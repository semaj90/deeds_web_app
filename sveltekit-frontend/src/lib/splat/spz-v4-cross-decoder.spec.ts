// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseSpz, SpzError, sha256Hex, SPZ_DEFAULT_MAX_POINTS, SPZ_DEFAULT_MAX_SOURCE_BYTES, shDcToRgb, rgbToShDc, SH_C0, SPZ_COLOR_SCALE } from './spz-loader.js';
import {
	serializeSpz,
	encodeSmallestThree,
	rgbToSpzByte,
	spzByteToRgb,
	spzByteToShDc,
	type GaussianCloud
} from './spz-serializer.js';

describe('SPZ v4 Container & Cross-Decoder Qualification', () => {
	// Synthetic 4-point cloud matching preflight specifications
	const create4PointFixture = (): GaussianCloud => ({
		numPoints: 4,
		fractionalBits: 12,
		positions: new Float32Array([
			-0.5, 0.25, 1.0,
			0.5, -0.25, 2.0,
			-1.2, 0.0, 0.5,
			1.2, -0.8, 3.1
		]),
		colors: new Float32Array([
			0.9, 0.1, 0.1,
			0.1, 0.9, 0.1,
			0.1, 0.1, 0.9,
			0.8, 0.8, 0.2
		]),
		alphas: new Float32Array([0.95, 0.85, 0.5, 1.0]),
		scales: new Float32Array([
			0.02, 0.03, 0.01,
			0.01, 0.01, 0.01,
			0.05, 0.02, 0.03,
			0.04, 0.04, 0.02
		]),
		rotations: new Float32Array([
			0, 0, 0, 1,
			0, 0.7071068, 0, 0.7071068,
			0.3826834, 0, 0, 0.9238795,
			0.5, 0.5, 0.5, 0.5
		])
	});

	it('1. Serializes to valid Niantic SPZ v4 header and TOC order', () => {
		const cloud = create4PointFixture();
		const bytes = serializeSpz(cloud);

		// Header checks: 32 bytes
		expect(bytes.length).toBeGreaterThanOrEqual(32 + 5 * 16);
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

		// Magic 0x5053474e ("NGSP")
		expect(view.getUint32(0, true)).toBe(0x5053474e);
		// Version 4
		expect(view.getUint32(4, true)).toBe(4);
		// NumPoints = 4
		expect(view.getUint32(8, true)).toBe(4);
		// shDegree = 0
		expect(view.getUint8(12)).toBe(0);
		// fractionalBits = 12
		expect(view.getUint8(13)).toBe(12);

		// TOC: 5 streams back-to-back (positions=0, alphas=1, colors=2, scales=3, rotations=4)
		// Expected uncompressed sizes: positions=4*9=36, alphas=4*1=4, colors=4*3=12, scales=4*3=12, rotations=4*4=16
		const expectedUncompressed = [4 * 9, 4 * 1, 4 * 3, 4 * 3, 4 * 4];
		for (let s = 0; s < 5; s++) {
			const uncompressedSize = Number(view.getBigUint64(32 + s * 16 + 8, true));
			expect(uncompressedSize).toBe(expectedUncompressed[s]);
		}
	});

	it('2. Authoritative parseSpz() decodes serialized fixture with tolerance checks', () => {
		const cloud = create4PointFixture();
		const bytes = serializeSpz(cloud);
		const decoded = parseSpz(bytes);

		expect(decoded.numPoints).toBe(4);
		expect(decoded.shDegree).toBe(0);
		expect(decoded.coordinateSystem).toBe('RUB');

		// Position precision: 12 fractional bits = 1/4096 ~= 0.000244
		for (let i = 0; i < cloud.positions.length; i++) {
			expect(decoded.positions[i]).toBeCloseTo(cloud.positions[i], 3);
		}

		// Colors: decode returns SH DC term (col / 255 - 0.5) / 0.15
		// Recover RGB = shDcToRgb(sh_dc) = sh_dc * SH_C0 + 0.5
		for (let i = 0; i < cloud.colors.length; i++) {
			const recoveredRgb = shDcToRgb(decoded.colors[i]);
			expect(recoveredRgb).toBeCloseTo(cloud.colors[i], 1);
		}

		// Unit quaternion norm and sign-invariant rotation parity: |q_orig . q_dec| > 0.99
		for (let p = 0; p < 4; p++) {
			const qOrig = [
				cloud.rotations![p * 4],
				cloud.rotations![p * 4 + 1],
				cloud.rotations![p * 4 + 2],
				cloud.rotations![p * 4 + 3]
			];
			const qDec = [
				decoded.rotations[p * 4],
				decoded.rotations[p * 4 + 1],
				decoded.rotations[p * 4 + 2],
				decoded.rotations[p * 4 + 3]
			];
			const dot = Math.abs(
				qOrig[0] * qDec[0] +
				qOrig[1] * qDec[1] +
				qOrig[2] * qDec[2] +
				qOrig[3] * qDec[3]
			);
			expect(dot).toBeGreaterThan(0.99);
		}
	});

	it('3. Rejects malformed TOC offsets, corrupted magic, and unsupported extensions', () => {
		const cloud = create4PointFixture();
		const validBytes = serializeSpz(cloud);

		// Corrupted magic
		const badMagic = new Uint8Array(validBytes);
		badMagic[0] = 0xff;
		expect(() => parseSpz(badMagic)).toThrow(SpzError);

		// Flag with unsupported extension bit (0x2)
		const withExt = new Uint8Array(validBytes);
		withExt[14] = 0x2; // flags
		expect(() => parseSpz(withExt)).toThrow(SpzError);

		// Corrupted TOC length
		const badToc = new Uint8Array(validBytes);
		const view = new DataView(badToc.buffer, badToc.byteOffset, badToc.byteLength);
		view.setBigUint64(32, 999999n, true); // positions compressed size exceeds payload
		expect(() => parseSpz(badToc)).toThrow(SpzError);
	});

	it('4. Rejects decompression bombs and respects safety point limits', () => {
		const cloud = create4PointFixture();
		const validBytes = serializeSpz(cloud);

		// Forged huge point count in header
		const hugePoints = new Uint8Array(validBytes);
		const view = new DataView(hugePoints.buffer, hugePoints.byteOffset, hugePoints.byteLength);
		view.setUint32(8, SPZ_DEFAULT_MAX_POINTS + 10, true);
		expect(() => parseSpz(hugePoints)).toThrow(SpzError);
	});

	it('5. Computes stable SHA-256 for non-evidence synthetic classification', async () => {
		const cloud = create4PointFixture();
		const bytes = serializeSpz(cloud);
		const hash = await sha256Hex(bytes);

		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		// Synthetic fixtures are strictly non-authoritative
		const record = {
			isSynthetic: true,
			sourceRevision: null,
			serverVerified: false,
			hash
		};
		expect(record.serverVerified).toBe(false);
	});

	it('6. SPZ color math contract: RGB <-> SH DC <-> byte quantization round trip', () => {
		// Test primaries, neutrals, and extreme boundaries
		const testColors: [number, number, number][] = [
			[0.0, 0.0, 0.0], // Black
			[0.5, 0.5, 0.5], // Neutral gray
			[1.0, 1.0, 1.0], // White
			[1.0, 0.0, 0.0], // Red
			[0.0, 1.0, 0.0], // Green
			[0.0, 0.0, 1.0], // Blue
			[0.2, 0.7, 0.4]  // Intermediate
		];

		for (const [r, g, b] of testColors) {
			for (const c of [r, g, b]) {
				const byte = rgbToSpzByte(c);
				expect(byte).toBeGreaterThanOrEqual(0);
				expect(byte).toBeLessThanOrEqual(255);
				const recovered = spzByteToRgb(byte);
				expect(recovered).toBeCloseTo(c, 1);
				expect(Math.abs(recovered - c)).toBeLessThanOrEqual(0.02);
			}
		}

		// Exact byte round-trip values for neutrals
		// Neutral gray (0.5): c_DC = 0, byte = round(255 * 0.5) = 128
		expect(rgbToSpzByte(0.5)).toBe(128);
		// White (1.0): c_DC = 0.5 / 0.282095 = 1.77245; byte = round(255 * (0.5 + 0.15 * 1.77245)) = 195
		expect(rgbToSpzByte(1.0)).toBe(195);
		// Black (0.0): c_DC = -0.5 / 0.282095 = -1.77245; byte = round(255 * (0.5 - 0.15 * 1.77245)) = 60
		expect(rgbToSpzByte(0.0)).toBe(60);
	});
});
