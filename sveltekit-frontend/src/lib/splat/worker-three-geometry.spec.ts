import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SPZLoader } from 'three/addons/loaders/SPZLoader.js';
import { decodeSpz } from './spz-decode-core.js';
import { workerPayloadToGaussianGeometry } from './worker-three-geometry.js';

const fixture = (degree: number) => new Uint8Array(readFileSync(resolve(process.cwd(), `src/lib/splat/fixtures/niantic-official-degree${degree}-${degree === 0 ? '5pt' : '3pt'}.spz`)));

async function directThreeGeometry(bytes: Uint8Array) {
	const owned = bytes.slice();
	const result = await new SPZLoader().parse(owned.buffer);
	if (!result) throw new Error('Three.js SPZLoader returned no geometry');
	return result;
}

describe('SPZ worker payload to Three.js GaussianSplat geometry', () => {
	it.each([0, 1, 2, 3])('matches Three.js SPZLoader attributes for official SH degree %i fixture', async (degree) => {
		const bytes = fixture(degree);
		const [workerPayload, reference] = await Promise.all([decodeSpz(bytes), directThreeGeometry(bytes)]);
		const adapted = workerPayloadToGaussianGeometry(workerPayload);
		for (const name of ['position', 'covariance', 'color', 'sphericalHarmonics1', 'sphericalHarmonics2', 'sphericalHarmonics3']) {
			const expected = reference.getAttribute(name);
			const actual = adapted.getAttribute(name);
			expect(actual?.array.length).toBe(expected?.array.length);
			if (actual?.array instanceof Float32Array && expected?.array instanceof Float32Array) {
				for (let index = 0; index < actual.array.length; index++) {
					expect(Math.abs(actual.array[index] - expected.array[index])).toBeLessThanOrEqual(1e-6);
				}
			} else {
				expect(actual?.array).toEqual(expected?.array);
			}
		}
		adapted.dispose();
		reference.dispose();
	});

	it('rejects degree 4 instead of silently truncating a scene for Three.js', async () => {
		const payload = await decodeSpz(fixture(4));
		expect(() => workerPayloadToGaussianGeometry(payload)).toThrow('THREE_SPZ_SH_DEGREE_UNSUPPORTED');
	});
});
