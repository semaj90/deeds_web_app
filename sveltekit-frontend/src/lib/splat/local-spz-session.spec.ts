// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	createLocalSpzSession,
	LocalSpzSessionError,
	validateSpzV4UncompressedSize
} from './local-spz-session.js';
import { create2DDepthReliefGaussianCloud, serializeSpz } from './spz-serializer.js';
import { parseSpz } from './spz-loader.js';

describe('Local SPZ Viewer Integration Bridge', () => {
	it('validateSpzV4UncompressedSize calculates 20 bytes/point', () => {
		expect(validateSpzV4UncompressedSize(100, 2000)).toBe(true);
		expect(validateSpzV4UncompressedSize(100, 1999)).toBe(false);
	});

	it('processes 2.5D cloud through serialize -> sha256 -> parseSpz round trip', async () => {
		const session = createLocalSpzSession({
			serialize: (cloud) => serializeSpz(cloud),
			decode: (bytes) => parseSpz(bytes),
			decodedPointCount: (decoded) => decoded.positions.length / 3
		});

		const w = 8;
		const h = 8;
		const rgb = new Uint8Array(w * h * 3);
		const depth = new Float32Array(w * h);
		for (let i = 0; i < w * h; i++) {
			rgb[i * 3] = 128;
			rgb[i * 3 + 1] = 64;
			rgb[i * 3 + 2] = 200;
			depth[i] = (i % w) / w;
		}

		const cloud = create2DDepthReliefGaussianCloud(w, h, rgb, depth, { step: 1 });
		const result = await session.process(cloud);

		expect(result).not.toBeNull();
		expect(result!.pointCount).toBe(64);
		expect(result!.sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(result!.uncompressedBytes).toBe(64 * 20);
		expect(result!.decoded.positions.length).toBe(64 * 3);
		expect(typeof result!.download).toBe('function');
	});

	it('enforces point-count safety cap', async () => {
		const session = createLocalSpzSession({
			serialize: (cloud) => serializeSpz(cloud),
			decode: (bytes) => parseSpz(bytes),
			decodedPointCount: (decoded) => decoded.positions.length / 3,
			maxPoints: 50
		});

		const w = 10;
		const h = 10;
		const cloud = create2DDepthReliefGaussianCloud(w, h, new Uint8Array(w * h * 3), new Float32Array(w * h), { step: 1 });
		await expect(session.process(cloud)).rejects.toThrow(LocalSpzSessionError);
	});

	it('enforces byte budget safety cap', async () => {
		const session = createLocalSpzSession({
			serialize: (cloud) => serializeSpz(cloud),
			decode: (bytes) => parseSpz(bytes),
			decodedPointCount: (decoded) => decoded.positions.length / 3,
			maxByteBudget: 10
		});

		const w = 4;
		const h = 4;
		const cloud = create2DDepthReliefGaussianCloud(w, h, new Uint8Array(w * h * 3), new Float32Array(w * h), { step: 1 });
		await expect(session.process(cloud)).rejects.toThrow(LocalSpzSessionError);
	});

	it('cancels previous generation when cancel() is triggered', async () => {
		const session = createLocalSpzSession({
			serialize: (cloud) => {
				// simulate concurrent cancellation
				session.cancel();
				return serializeSpz(cloud);
			},
			decode: (bytes) => parseSpz(bytes),
			decodedPointCount: (decoded) => decoded.positions.length / 3
		});

		const w = 4;
		const h = 4;
		const cloud = create2DDepthReliefGaussianCloud(w, h, new Uint8Array(w * h * 3), new Float32Array(w * h), { step: 1 });
		const result = await session.process(cloud);
		expect(result).toBeNull();
	});
});
