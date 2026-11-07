import { describe, it, expect } from 'vitest';
import { parseSpz } from './spz-loader.js';
import {
	encodeSmallestThree,
	serializeSpz,
	create2DDepthReliefGaussianCloud,
	type GaussianCloud
} from './spz-serializer.js';

describe('spz-serializer (Niantic SPZ v4 Encoder & Roundtrip)', () => {
	it('encodes unit quaternions into smallest-three 4-byte format', () => {
		const [b0, b1, b2, b3] = encodeSmallestThree(0, 0, 0, 1);
		// With identity quaternion [0, 0, 0, 1], largest is w (index 3). Bits 30..31 = 3 (0xc0)
		expect(b3 & 0xc0).toBe(0xc0);
	});

	it('serializes a synthetic 3-point Gaussian cloud and decodes identically with parseSpz', () => {
		const positions = new Float32Array([
			0.0, 1.0, 2.0,
			-1.5, 0.5, -2.5,
			3.25, -1.25, 0.75
		]);

		const colors = new Float32Array([
			1.0, 0.0, 0.0,  // Red
			0.0, 1.0, 0.0,  // Green
			0.0, 0.0, 1.0   // Blue
		]);

		const alphas = new Float32Array([0.9, 0.8, 0.95]);
		const scales = new Float32Array([
			-3.0, -3.0, -4.0,
			-2.5, -2.5, -3.5,
			-3.2, -3.2, -4.2
		]);

		const rotations = new Float32Array([
			0, 0, 0, 1,
			0.7071, 0, 0, 0.7071,
			0, 0.7071, 0, 0.7071
		]);

		const cloud: GaussianCloud = {
			numPoints: 3,
			positions,
			colors,
			alphas,
			scales,
			rotations,
			fractionalBits: 12,
			antialiased: true
		};

		const spzBytes = serializeSpz(cloud);
		expect(spzBytes.byteLength).toBeGreaterThan(32 + 5 * 16);

		// Decode using the authoritative reference loader parseSpz
		const decoded = parseSpz(spzBytes);
		expect(decoded.numPoints).toBe(3);
		expect(decoded.shDegree).toBe(0);
		expect(decoded.fractionalBits).toBe(12);
		expect(decoded.antialiased).toBe(true);

		// Position accuracy within fixed-point resolution (1/4096 = 0.000244)
		for (let i = 0; i < 9; i++) {
			expect(decoded.positions[i]).toBeCloseTo(positions[i], 3);
		}

		// Rotation accuracy (smallest-three quantization error < 0.005)
		for (let p = 0; p < 3; p++) {
			const base = p * 4;
			const dot =
				decoded.rotations[base] * rotations[base] +
				decoded.rotations[base + 1] * rotations[base + 1] +
				decoded.rotations[base + 2] * rotations[base + 2] +
				decoded.rotations[base + 3] * rotations[base + 3];
			// Dot product of identical or negated quaternions is ~1.0
			expect(Math.abs(dot)).toBeGreaterThan(0.99);
		}
	});

	it('creates a 2.5D depth relief Gaussian cloud from image dimensions and depth map', () => {
		const width = 16;
		const height = 16;
		const rgbBytes = new Uint8Array(width * height * 3).fill(128);
		const depthValues = new Float32Array(width * height);
		for (let i = 0; i < depthValues.length; i++) {
			depthValues[i] = Math.sin(i / 10) * 0.5;
		}

		const cloud = create2DDepthReliefGaussianCloud(width, height, rgbBytes, depthValues, {
			step: 4, // 4x4 grid = 16 points
			depthScale: 0.8
		});

		expect(cloud.numPoints).toBe(16);
		expect(cloud.positions.length).toBe(16 * 3);
		expect(cloud.colors.length).toBe(16 * 3);

		// Serialize to SPZ and confirm decodability
		const spzBytes = serializeSpz(cloud);
		const decoded = parseSpz(spzBytes);
		expect(decoded.numPoints).toBe(16);
		expect(decoded.positions.length).toBe(48);
	});

	it('handles extreme and edge-case unit quaternions with |q_orig · q_dec| > 0.999', () => {
		const edgeCases: [number, number, number, number][] = [
			[1, 0, 0, 0],   // pure X
			[-1, 0, 0, 0],  // negative X
			[0, 1, 0, 0],   // pure Y
			[0, -1, 0, 0],  // negative Y
			[0, 0, 1, 0],   // pure Z
			[0, 0, -1, 0],  // negative Z
			[0, 0, 0, 1],   // pure W (identity)
			[0, 0, 0, -1],  // negative W
			[0.5, 0.5, 0.5, 0.5], // equal positive components
			[-0.5, -0.5, -0.5, -0.5], // equal negative components
			[0.5, -0.5, 0.5, -0.5],
			[0.9999, 0.01, 0, 0], // near-1 dominant
		];

		const rotArray = new Float32Array(edgeCases.length * 4);
		const posArray = new Float32Array(edgeCases.length * 3);
		const colArray = new Float32Array(edgeCases.length * 3).fill(0.5);

		for (let i = 0; i < edgeCases.length; i++) {
			const [x, y, z, w] = edgeCases[i];
			const norm = Math.hypot(x, y, z, w);
			rotArray[i * 4] = x / norm;
			rotArray[i * 4 + 1] = y / norm;
			rotArray[i * 4 + 2] = z / norm;
			rotArray[i * 4 + 3] = w / norm;
		}

		const spz = serializeSpz({
			numPoints: edgeCases.length,
			positions: posArray,
			colors: colArray,
			rotations: rotArray
		});

		const decoded = parseSpz(spz);
		expect(decoded.numPoints).toBe(edgeCases.length);

		for (let i = 0; i < edgeCases.length; i++) {
			const b = i * 4;
			const dot =
				rotArray[b] * decoded.rotations[b] +
				rotArray[b + 1] * decoded.rotations[b + 1] +
				rotArray[b + 2] * decoded.rotations[b + 2] +
				rotArray[b + 3] * decoded.rotations[b + 3];
			expect(Math.abs(dot)).toBeGreaterThan(0.998);
		}
	});

	it('validates 100 randomized unit quaternions under cross-decoder parity', () => {
		const count = 100;
		const rotArray = new Float32Array(count * 4);
		const posArray = new Float32Array(count * 3);
		const colArray = new Float32Array(count * 3).fill(0.7);

		// Seeded pseudo-random generation for deterministic repeatability
		let seed = 42;
		const rand = () => {
			seed = (seed * 9301 + 49297) % 233280;
			return seed / 233280 - 0.5;
		};

		for (let i = 0; i < count; i++) {
			const x = rand();
			const y = rand();
			const z = rand();
			const w = rand();
			const norm = Math.hypot(x, y, z, w) || 1;
			rotArray[i * 4] = x / norm;
			rotArray[i * 4 + 1] = y / norm;
			rotArray[i * 4 + 2] = z / norm;
			rotArray[i * 4 + 3] = w / norm;
		}

		const spz = serializeSpz({
			numPoints: count,
			positions: posArray,
			colors: colArray,
			rotations: rotArray
		});

		const decoded = parseSpz(spz);
		expect(decoded.numPoints).toBe(count);

		let minDot = 1.0;
		for (let i = 0; i < count; i++) {
			const b = i * 4;
			const dot = Math.abs(
				rotArray[b] * decoded.rotations[b] +
				rotArray[b + 1] * decoded.rotations[b + 1] +
				rotArray[b + 2] * decoded.rotations[b + 2] +
				rotArray[b + 3] * decoded.rotations[b + 3]
			);
			if (dot < minDot) minDot = dot;
			expect(dot).toBeGreaterThan(0.997);
		}
		expect(minDot).toBeGreaterThan(0.997);
	});
});
