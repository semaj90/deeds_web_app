import * as THREE from 'three';

/**
 * CPU-displaced relief grid. The SAME geometry is rendered, lit and raycast, so marker positions, surface normals
 * and picking all agree (a GPU displacementMap moves only the rendered vertices; raycasts and markers would still
 * hit the flat plane). Height is local +z: z = (depth - 0.5) * scale + bias, depth in 0..1 (bright = near).
 *
 * Grid layout matches THREE.PlaneGeometry: (cols+1) x (rows+1) vertices, row 0 at the TOP of the image.
 * Estimated relief only: not a measured 3D reconstruction.
 */
export interface ReliefGrid {
	geometry: THREE.PlaneGeometry;
	cols: number;
	rows: number;
	depth: Float32Array;
	bias: number;
	/** Re-displace every vertex for a new relief scale, then refresh normals and bounds (needed for raycasting). */
	apply(scale: number): void;
}

export function buildReliefGrid(
	width: number,
	height: number,
	cols: number,
	rows: number,
	depth: Float32Array,
	bias = 0
): ReliefGrid {
	if (cols < 1 || rows < 1) throw new Error('cols and rows must be >= 1');
	if (depth.length !== (cols + 1) * (rows + 1)) throw new Error('depth sample count must equal (cols+1)*(rows+1)');
	const geometry = new THREE.PlaneGeometry(width, height, cols, rows);
	const pos = geometry.getAttribute('position');
	const apply = (scale: number) => {
		for (let i = 0; i < depth.length; i++) pos.setZ(i, (depth[i] - 0.5) * scale + bias);
		pos.needsUpdate = true;
		geometry.computeVertexNormals();
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
	};
	return { geometry, cols, rows, depth, bias, apply };
}

/**
 * Surface height at normalized image coordinates (u left-to-right, v top-to-bottom, both 0..1), bilinear between
 * the four surrounding vertices. Equals the rendered/raycast surface because triangles interpolate vertex z the
 * same way along each cell's edges (exact at vertices and along grid lines; within one cell diagonal otherwise).
 */
export function heightAt(grid: Pick<ReliefGrid, 'depth' | 'cols' | 'rows' | 'bias'>, u: number, v: number, scale: number): number {
	const { depth, cols, rows, bias } = grid;
	const fx = Math.min(1, Math.max(0, u)) * cols;
	const fy = Math.min(1, Math.max(0, v)) * rows;
	const x0 = Math.min(Math.floor(fx), cols - 1);
	const y0 = Math.min(Math.floor(fy), rows - 1);
	const tx = fx - x0;
	const ty = fy - y0;
	const at = (x: number, y: number) => depth[y * (cols + 1) + x];
	const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
	const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
	const d = top * (1 - ty) + bottom * ty;
	return (d - 0.5) * scale + bias;
}

/**
 * Sample a depth source (image or canvas) onto the grid: one red-channel sample per vertex, 0..1. Browser only.
 * Throws if the canvas is tainted (cross-origin pixels), so callers can fall back to a flat surface.
 */
export function sampleDepthGrid(source: CanvasImageSource, cols: number, rows: number): Float32Array {
	const c = document.createElement('canvas');
	c.width = cols + 1;
	c.height = rows + 1;
	const ctx = c.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('2D canvas unavailable');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(source, 0, 0, c.width, c.height);
	const data = ctx.getImageData(0, 0, c.width, c.height).data;
	const out = new Float32Array(c.width * c.height);
	for (let i = 0; i < out.length; i++) out[i] = data[i * 4] / 255;
	return out;
}

/** Bilinear resample of a (cols+1)x(rows+1) depth grid to (newCols+1)x(newRows+1), e.g. for the coarse wireframe. */
export function resampleDepth(depth: Float32Array, cols: number, rows: number, newCols: number, newRows: number): Float32Array {
	const grid = { depth, cols, rows, bias: 0 };
	const out = new Float32Array((newCols + 1) * (newRows + 1));
	for (let y = 0; y <= newRows; y++) {
		for (let x = 0; x <= newCols; x++) out[y * (newCols + 1) + x] = heightAt(grid, x / newCols, y / newRows, 1) + 0.5;
	}
	return out;
}
