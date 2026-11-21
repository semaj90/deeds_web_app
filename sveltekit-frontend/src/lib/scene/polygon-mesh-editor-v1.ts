/**
 * Parent Atlas Editable Polygon-Prism Geometry Manager (v1)
 *
 * Extends the scene-editing system with interactive polygon mesh editing:
 * 1. Move individual vertices.
 * 2. Adjust extrusion depth.
 * 3. Validate topology (non-intersecting simple polygon, min 3 vertices, bounded coords).
 * 4. Generate 3D buffer attributes (positions, normals, indices).
 * 5. Undo/Redo integration with SceneControllerV1 via SceneCommand.
 */

import { type PolygonPointV1, triangulateSimplePolygonV1 } from '$lib/splat/polygon-prism-validation-v1.js';
import type { SceneCommand, SceneExecutionContext } from './scene-controller-v1.js';

export interface PolygonPrismMeshBuffersV1 {
	positions: Float32Array;
	normals: Float32Array;
	indices: Uint16Array;
	vertexCount: number;
	triangleCount: number;
}

/**
 * Builds full 3D watertight prism mesh buffers (top cap, bottom cap, side walls)
 * from a 2D CCW simple polygon and extrusion depth.
 */
export function buildPolygonPrismBuffersV1(
	points: readonly PolygonPointV1[],
	extrusionDepth: number
): PolygonPrismMeshBuffersV1 {
	const n = points.length;
	if (n < 3) throw new RangeError('polygon must have at least 3 vertices');
	if (!Number.isFinite(extrusionDepth) || extrusionDepth <= 0) {
		throw new RangeError('extrusionDepth must be a positive finite number');
	}

	// Triangulate 2D cap
	const capIndices = triangulateSimplePolygonV1(points);
	const capTriCount = capIndices.length / 3;

	// Total vertices:
	// - Bottom cap: n vertices (y = 0)
	// - Top cap: n vertices (y = extrusionDepth)
	// - Side walls: 4 vertices per side * n sides = 4n vertices
	const totalVerts = n + n + 4 * n;
	const positions = new Float32Array(totalVerts * 3);
	const normals = new Float32Array(totalVerts * 3);

	// 1. Bottom cap vertices (normals pointing down [0, -1, 0])
	for (let i = 0; i < n; i++) {
		const [x, z] = points[i];
		positions[i * 3 + 0] = x;
		positions[i * 3 + 1] = 0;
		positions[i * 3 + 2] = z;

		normals[i * 3 + 0] = 0;
		normals[i * 3 + 1] = -1;
		normals[i * 3 + 2] = 0;
	}

	// 2. Top cap vertices (normals pointing up [0, 1, 0])
	const topOffset = n;
	for (let i = 0; i < n; i++) {
		const [x, z] = points[i];
		const idx = (topOffset + i) * 3;
		positions[idx + 0] = x;
		positions[idx + 1] = extrusionDepth;
		positions[idx + 2] = z;

		normals[idx + 0] = 0;
		normals[idx + 1] = 1;
		normals[idx + 2] = 0;
	}

	// 3. Side wall vertices
	const sideOffset = topOffset + n;
	for (let i = 0; i < n; i++) {
		const next = (i + 1) % n;
		const [x0, z0] = points[i];
		const [x1, z1] = points[next];

		// Outward face normal in XZ plane
		const dx = x1 - x0;
		const dz = z1 - z0;
		const len = Math.hypot(dx, dz) || 1;
		const nx = dz / len;
		const nz = -dx / len;

		const base = (sideOffset + i * 4) * 3;

		// v0: bottom-left
		positions[base + 0] = x0; positions[base + 1] = 0; positions[base + 2] = z0;
		normals[base + 0] = nx; normals[base + 1] = 0; normals[base + 2] = nz;

		// v1: bottom-right
		positions[base + 3] = x1; positions[base + 4] = 0; positions[base + 5] = z1;
		normals[base + 3] = nx; normals[base + 4] = 0; normals[base + 5] = nz;

		// v2: top-right
		positions[base + 6] = x1; positions[base + 7] = extrusionDepth; positions[base + 8] = z1;
		normals[base + 6] = nx; normals[base + 7] = 0; normals[base + 8] = nz;

		// v3: top-left
		positions[base + 9] = x0; positions[base + 10] = extrusionDepth; positions[base + 11] = z0;
		normals[base + 9] = nx; normals[base + 10] = 0; normals[base + 11] = nz;
	}

	// Total triangles:
	// - Bottom cap: capTriCount
	// - Top cap: capTriCount
	// - Sides: 2 triangles per side * n sides = 2n
	const totalTriangles = capTriCount * 2 + n * 2;
	const indices = new Uint16Array(totalTriangles * 3);
	let ptr = 0;

	// Bottom cap indices (flipped winding for downward normal)
	for (let i = 0; i < capIndices.length; i += 3) {
		indices[ptr++] = capIndices[i + 0];
		indices[ptr++] = capIndices[i + 2];
		indices[ptr++] = capIndices[i + 1];
	}

	// Top cap indices (standard CCW)
	for (let i = 0; i < capIndices.length; i += 3) {
		indices[ptr++] = topOffset + capIndices[i + 0];
		indices[ptr++] = topOffset + capIndices[i + 1];
		indices[ptr++] = topOffset + capIndices[i + 2];
	}

	// Side wall quads (2 triangles per quad)
	for (let i = 0; i < n; i++) {
		const v0 = sideOffset + i * 4 + 0;
		const v1 = sideOffset + i * 4 + 1;
		const v2 = sideOffset + i * 4 + 2;
		const v3 = sideOffset + i * 4 + 3;

		// Triangle 1: v0, v1, v2
		indices[ptr++] = v0;
		indices[ptr++] = v1;
		indices[ptr++] = v2;

		// Triangle 2: v0, v2, v3
		indices[ptr++] = v0;
		indices[ptr++] = v2;
		indices[ptr++] = v3;
	}

	return {
		positions,
		normals,
		indices,
		vertexCount: totalVerts,
		triangleCount: totalTriangles
	};
}

// ============================================================================
// Scene Commands for Undo/Redo
// ============================================================================

export interface PolygonEditorTargetV1 {
	recipeId: string;
	getVertices(): PolygonPointV1[];
	setVertices(vertices: PolygonPointV1[]): void;
	getExtrusionDepth(): number;
	setExtrusionDepth(depth: number): void;
}

export class MovePolygonVertexCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'MovePolygonVertexCommand';
	readonly timestampMs: number;
	private readonly previousVertices: PolygonPointV1[];

	constructor(
		private readonly target: PolygonEditorTargetV1,
		private readonly vertexIndex: number,
		private readonly newPosition: PolygonPointV1
	) {
		this.id = crypto.randomUUID();
		this.timestampMs = Date.now();
		this.previousVertices = [...target.getVertices()];
	}

	execute(context: SceneExecutionContext): void {
		const updated = [...this.previousVertices];
		if (this.vertexIndex < 0 || this.vertexIndex >= updated.length) {
			throw new RangeError(`invalid vertexIndex ${this.vertexIndex}`);
		}
		updated[this.vertexIndex] = this.newPosition;
		// Validate topology before applying
		triangulateSimplePolygonV1(updated);
		this.target.setVertices(updated);
	}

	undo(context: SceneExecutionContext): void {
		this.target.setVertices(this.previousVertices);
	}

	toSerializable(): Record<string, unknown> {
		return {
			type: this.type,
			recipeId: this.target.recipeId,
			vertexIndex: this.vertexIndex,
			previousPosition: this.previousVertices[this.vertexIndex],
			newPosition: this.newPosition
		};
	}
}

export class SetPolygonExtrusionCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'SetPolygonExtrusionCommand';
	readonly timestampMs: number;
	private readonly previousDepth: number;

	constructor(
		private readonly target: PolygonEditorTargetV1,
		private readonly newDepth: number
	) {
		this.id = crypto.randomUUID();
		this.timestampMs = Date.now();
		this.previousDepth = target.getExtrusionDepth();
	}

	execute(context: SceneExecutionContext): void {
		if (this.newDepth <= 0 || !Number.isFinite(this.newDepth)) {
			throw new RangeError('extrusion depth must be a positive finite number');
		}
		this.target.setExtrusionDepth(this.newDepth);
	}

	undo(context: SceneExecutionContext): void {
		this.target.setExtrusionDepth(this.previousDepth);
	}

	toSerializable(): Record<string, unknown> {
		return {
			type: this.type,
			recipeId: this.target.recipeId,
			previousDepth: this.previousDepth,
			newDepth: this.newDepth
		};
	}
}
