/**
 * Flat-shaded hexagonal prism proxy, 8 floats per vertex (position, normal, uv) to match the
 * crime-reconstruction OBJ layout. Centre-fan caps: 24 triangles. This is a stand-in for placing
 * an object in a scene. It is not derived from image depth and not evidence.
 */

export const PLACEHOLDER_PROXY_RADIUS_M_V1 = 0.25;
export const PLACEHOLDER_PROXY_DEPTH_M_V1 = 0.08;
export const PLACEHOLDER_PROXY_TRIANGLES_V1 = 24;

export function buildPlaceholderProxyV1(
	radius: number = PLACEHOLDER_PROXY_RADIUS_M_V1,
	depth: number = PLACEHOLDER_PROXY_DEPTH_M_V1
): { vertices: Float32Array; indices: Uint32Array } {
	if (!(radius > 0) || !(depth > 0) || !Number.isFinite(radius) || !Number.isFinite(depth)) {
		throw new Error('PLACEHOLDER_PROXY_DIMENSIONS_INVALID');
	}
	const ring = Array.from({ length: 6 }, (_, i) => {
		const a = (Math.PI / 3) * i;
		return [radius * Math.cos(a), radius * Math.sin(a)] as const;
	});
	const verts: number[] = [];
	const idx: number[] = [];
	const tri = (a: number[], b: number[], c: number[], n: number[]) => {
		for (const p of [a, b, c]) {
			verts.push(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0);
			idx.push(idx.length);
		}
	};
	const top = [0, 0, depth / 2];
	const bot = [0, 0, -depth / 2];
	for (let i = 0; i < 6; i++) {
		const [x0, y0] = ring[i];
		const [x1, y1] = ring[(i + 1) % 6];
		tri(top, [x0, y0, depth / 2], [x1, y1, depth / 2], [0, 0, 1]);
		tri(bot, [x1, y1, -depth / 2], [x0, y0, -depth / 2], [0, 0, -1]);
		// Side quad split into two triangles; normal points outward from the edge midpoint.
		const mx = (x0 + x1) / 2;
		const my = (y0 + y1) / 2;
		const len = Math.hypot(mx, my) || 1;
		const n = [mx / len, my / len, 0];
		tri([x0, y0, -depth / 2], [x1, y1, -depth / 2], [x1, y1, depth / 2], n);
		tri([x0, y0, -depth / 2], [x1, y1, depth / 2], [x0, y0, depth / 2], n);
	}
	return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}
