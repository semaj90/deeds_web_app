import { describe, expect, it } from 'vitest';
import { pcaProjectJson } from './topology-projection.js';

describe('pcaProjectJson', () => {
	it('extracts a JSON matrix and sends bounded Float32 rows through the existing projection owner', async () => {
		const result = await pcaProjectJson(
			'{"vectors":[1,2,3,4]}',
			'/vectors',
			new Float32Array([0, 0]),
			new Float32Array([1, 0, 0, 1]),
			{ n: 2, dim: 2, outDim: 2, maxN: 1, preferGpu: false }
		);

		expect(result.ok).toBe(true);
		expect(result.source).toBe('cpu-fallback');
		expect(result.n).toBe(1);
		expect(Array.from(result.projected)).toEqual([1, 2]);
	});

	it('rejects mismatched matrix lengths', async () => {
		await expect(pcaProjectJson(
			'{"vectors":[1,2,3]}',
			'/vectors',
			new Float32Array([0, 0]),
			new Float32Array([1, 0, 0, 1]),
			{ n: 2, dim: 2, outDim: 2, preferGpu: false }
		)).rejects.toThrow(/length/);
	});

	it('rejects values outside finite Float32 range', async () => {
		await expect(pcaProjectJson(
			'{"vectors":[3.5e38]}',
			'/vectors',
			new Float32Array([0]),
			new Float32Array([1]),
			{ n: 1, dim: 1, outDim: 1, preferGpu: false }
		)).rejects.toThrow(/Float32 range/);
	});
});
