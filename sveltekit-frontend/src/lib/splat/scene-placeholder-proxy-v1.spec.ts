import { describe, expect, it } from 'vitest';
import {
	PLACEHOLDER_PROXY_TRIANGLES_V1,
	buildPlaceholderProxyV1
} from './scene-placeholder-proxy-v1.js';

describe('placeholder proxy v1', () => {
	const proxy = buildPlaceholderProxyV1();

	it('produces 24 triangles with 8 floats per vertex', () => {
		expect(proxy.indices.length / 3).toBe(PLACEHOLDER_PROXY_TRIANGLES_V1);
		expect(proxy.vertices.length / 8).toBe(proxy.indices.length);
	});

	it('uses only valid, in-range indices', () => {
		const vertexCount = proxy.vertices.length / 8;
		for (const i of proxy.indices) {
			expect(i).toBeLessThan(vertexCount);
		}
	});

	it('has unit-length normals on every vertex', () => {
		for (let v = 0; v < proxy.vertices.length; v += 8) {
			const len = Math.hypot(proxy.vertices[v + 3], proxy.vertices[v + 4], proxy.vertices[v + 5]);
			expect(Math.abs(len - 1)).toBeLessThan(1e-6);
		}
	});

	it('stays within the declared radius and half-depth', () => {
		for (let v = 0; v < proxy.vertices.length; v += 8) {
			const x = proxy.vertices[v];
			const y = proxy.vertices[v + 1];
			const z = proxy.vertices[v + 2];
			expect(Math.hypot(x, y)).toBeLessThanOrEqual(0.25 + 1e-6);
			expect(Math.abs(z)).toBeLessThanOrEqual(0.04 + 1e-6);
		}
	});

	it('rejects non-positive or non-finite dimensions', () => {
		expect(() => buildPlaceholderProxyV1(0, 0.08)).toThrow('PLACEHOLDER_PROXY_DIMENSIONS_INVALID');
		expect(() => buildPlaceholderProxyV1(0.25, -1)).toThrow('PLACEHOLDER_PROXY_DIMENSIONS_INVALID');
		expect(() => buildPlaceholderProxyV1(Number.NaN, 0.08)).toThrow('PLACEHOLDER_PROXY_DIMENSIONS_INVALID');
	});
});
