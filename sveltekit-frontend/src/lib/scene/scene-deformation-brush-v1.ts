/**
 * Parent Atlas Level B Soft Deformation Brush & Incremental BVH Refit (v1)
 *
 * Implements ENG-04:
 *   p_i' = p_i + w_i * deltaP_i,  where w_i = max(0, 1 - ||p_i - c|| / R)^gamma
 *
 * Invariants:
 * - Original evidence geometry and point clouds (readOnlyEvidence / point cloud) are strictly immutable.
 * - Deformation deltas are captured as sparse binary revisions (atlas-artifacts/deformations/{uuid}.bin)
 *   for SeaweedFS persistence and full undo/redo without mutating original source bytes.
 * - On brush stroke release, surface normals are recomputed and SpatialBvhManagerV1.refit() is invoked
 *   for O(K log N) incremental BVH refit rather than a full tree rebuild.
 */

import * as THREE from 'three';
import type { SpatialBvhManagerV1 } from '$lib/splat/spatial-bvh-manager-v1.js';

export const DEFORMATION_DELTA_MAGIC_V1 = 0x50414446; // 'PADF'
export const DEFORMATION_DELTA_VERSION_V1 = 1;

export interface SoftDeformationStrokeInputV1 {
	center: readonly [number, number, number];
	delta: readonly [number, number, number];
	radius: number;
	falloffExponent?: number;
}

export interface SparseVertexDeltaV1 {
	readonly vertexIndex: number;
	readonly dx: number;
	readonly dy: number;
	readonly dz: number;
}

export interface DeformationRevisionReceiptV1 {
	readonly revisionId: string;
	readonly storageKey: string;
	readonly affectedVertexCount: number;
	readonly byteLength: number;
	readonly bvhRefitted: boolean;
}

function assertMutableTarget(object: THREE.Object3D): asserts object is THREE.Mesh {
	if (object.userData?.readOnlyEvidence === true || object.userData?.immutableSource === true) {
		throw new Error('IMMUTABLE_EVIDENCE_GEOMETRY: Original evidence geometry is strictly read-only');
	}
	if ((object as THREE.Points).isPoints) {
		throw new Error('IMMUTABLE_POINT_CLOUD: Point clouds cannot be deformed by Level B brush');
	}
	if (!(object as THREE.Mesh).isMesh) {
		throw new Error('INVALID_DEFORMATION_TARGET: Target must be a THREE.Mesh');
	}
	const mesh = object as THREE.Mesh;
	if (!mesh.geometry?.getAttribute('position')) {
		throw new Error('INVALID_DEFORMATION_GEOMETRY: Mesh geometry lacks a position attribute');
	}
}

export function computeSoftFalloffWeightV1(distance: number, radius: number, gamma = 2.0): number {
	if (!Number.isFinite(radius) || radius <= 0) {
		throw new RangeError('Brush radius must be positive and finite');
	}
	if (!Number.isFinite(gamma) || gamma <= 0) {
		throw new RangeError('Falloff exponent gamma must be positive and finite');
	}
	if (distance >= radius) return 0;
	const linear = Math.max(0, 1 - distance / radius);
	return Math.pow(linear, gamma);
}

/**
 * Serializes sparse vertex deltas into a compact little-endian binary packet
 * suitable for SeaweedFS `atlas-artifacts/deformations/{uuid}.bin`.
 * Header (16 bytes): magic(u32), version(u32), count(u32), reserved(u32).
 * Body (16 bytes/entry): vertexIndex(u32), dx(f32), dy(f32), dz(f32).
 */
export function encodeDeformationDeltaBinaryV1(deltas: readonly SparseVertexDeltaV1[]): Uint8Array {
	const headerBytes = 16;
	const entryBytes = 16;
	const buffer = new ArrayBuffer(headerBytes + deltas.length * entryBytes);
	const view = new DataView(buffer);

	view.setUint32(0, DEFORMATION_DELTA_MAGIC_V1, true);
	view.setUint32(4, DEFORMATION_DELTA_VERSION_V1, true);
	view.setUint32(8, deltas.length, true);
	view.setUint32(12, 0, true);

	for (let i = 0; i < deltas.length; i++) {
		const offset = headerBytes + i * entryBytes;
		const d = deltas[i];
		view.setUint32(offset, d.vertexIndex, true);
		view.setFloat32(offset + 4, d.dx, true);
		view.setFloat32(offset + 8, d.dy, true);
		view.setFloat32(offset + 12, d.dz, true);
	}

	return new Uint8Array(buffer);
}

export function decodeDeformationDeltaBinaryV1(bytes: Uint8Array): SparseVertexDeltaV1[] {
	if (bytes.byteLength < 16) {
		throw new Error('INVALID_DEFORMATION_BINARY: Header truncated');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const magic = view.getUint32(0, true);
	const version = view.getUint32(4, true);
	const count = view.getUint32(8, true);

	if (magic !== DEFORMATION_DELTA_MAGIC_V1 || version !== DEFORMATION_DELTA_VERSION_V1) {
		throw new Error('INVALID_DEFORMATION_BINARY: Unsupported magic or version');
	}
	if (bytes.byteLength !== 16 + count * 16) {
		throw new Error('INVALID_DEFORMATION_BINARY: Byte length mismatch');
	}

	const deltas: SparseVertexDeltaV1[] = [];
	for (let i = 0; i < count; i++) {
		const offset = 16 + i * 16;
		deltas.push({
			vertexIndex: view.getUint32(offset, true),
			dx: view.getFloat32(offset + 4, true),
			dy: view.getFloat32(offset + 8, true),
			dz: view.getFloat32(offset + 12, true)
		});
	}
	return deltas;
}

export class SceneDeformationBrushV1 {
	private activeMesh: THREE.Mesh | null = null;
	private activeStrokeDeltas = new Map<number, [number, number, number]>();

	constructor(private readonly bvhManager?: SpatialBvhManagerV1) {}

	/**
	 * Applies an incremental soft-falloff displacement to vertices within `radius`
	 * of `center`, accumulating sparse deltas for the active brush stroke.
	 */
	applyStrokeStep(target: THREE.Object3D, input: SoftDeformationStrokeInputV1): number {
		assertMutableTarget(target);
		const gamma = input.falloffExponent ?? 2.0;
		const pos = target.geometry.getAttribute('position') as THREE.BufferAttribute;
		const [cx, cy, cz] = input.center;
		const [dx, dy, dz] = input.delta;

		if (
			!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) ||
			!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)
		) {
			throw new RangeError('Stroke center and delta must be finite numbers');
		}

		if (this.activeMesh && this.activeMesh !== target) {
			throw new Error('STROKE_TARGET_CHANGED: Commit or cancel active stroke before switching meshes');
		}
		this.activeMesh = target;

		const rSq = input.radius * input.radius;
		let touched = 0;

		for (let i = 0; i < pos.count; i++) {
			const vx = pos.getX(i);
			const vy = pos.getY(i);
			const vz = pos.getZ(i);

			const distSq = (vx - cx) ** 2 + (vy - cy) ** 2 + (vz - cz) ** 2;
			if (distSq >= rSq) continue;

			const w = computeSoftFalloffWeightV1(Math.sqrt(distSq), input.radius, gamma);
			if (w <= 0) continue;

			const stepX = w * dx;
			const stepY = w * dy;
			const stepZ = w * dz;

			pos.setXYZ(i, vx + stepX, vy + stepY, vz + stepZ);

			const prev = this.activeStrokeDeltas.get(i);
			if (prev) {
				prev[0] += stepX;
				prev[1] += stepY;
				prev[2] += stepZ;
			} else {
				this.activeStrokeDeltas.set(i, [stepX, stepY, stepZ]);
			}
			touched++;
		}

		if (touched > 0) {
			pos.needsUpdate = true;
		}
		return touched;
	}

	/**
	 * Finalizes the stroke on pointer release: recomputes normals, updates bounds,
	 * invokes O(K log N) BVH refit, and returns the derived SeaweedFS binary revision.
	 */
	commitStroke(revisionId = crypto.randomUUID()): {
		receipt: DeformationRevisionReceiptV1;
		deltas: SparseVertexDeltaV1[];
		binary: Uint8Array;
	} {
		const mesh = this.activeMesh;
		if (!mesh) {
			return {
				receipt: {
					revisionId,
					storageKey: `atlas-artifacts/deformations/${revisionId}.bin`,
					affectedVertexCount: 0,
					byteLength: 16,
					bvhRefitted: false
				},
				deltas: [],
				binary: encodeDeformationDeltaBinaryV1([])
			};
		}

		const deltas: SparseVertexDeltaV1[] = [];
		for (const [vertexIndex, [dx, dy, dz]] of this.activeStrokeDeltas.entries()) {
			if (dx !== 0 || dy !== 0 || dz !== 0) {
				deltas.push({ vertexIndex, dx, dy, dz });
			}
		}
		deltas.sort((a, b) => a.vertexIndex - b.vertexIndex);

		mesh.geometry.computeVertexNormals();
		mesh.geometry.computeBoundingBox();
		mesh.geometry.computeBoundingSphere();

		let bvhRefitted = false;
		if (this.bvhManager) {
			this.bvhManager.refit();
			bvhRefitted = true;
		}

		const binary = encodeDeformationDeltaBinaryV1(deltas);
		this.activeMesh = null;
		this.activeStrokeDeltas.clear();

		return {
			receipt: {
				revisionId,
				storageKey: `atlas-artifacts/deformations/${revisionId}.bin`,
				affectedVertexCount: deltas.length,
				byteLength: binary.byteLength,
				bvhRefitted
			},
			deltas,
			binary
		};
	}

	/** Replays or undoes a persisted deformation delta revision against a mutable mesh. */
	applyDeltaRevision(
		target: THREE.Object3D,
		deltas: readonly SparseVertexDeltaV1[],
		direction: 1 | -1 = 1
	): void {
		assertMutableTarget(target);
		const pos = target.geometry.getAttribute('position') as THREE.BufferAttribute;

		for (const d of deltas) {
			if (d.vertexIndex < 0 || d.vertexIndex >= pos.count) {
				throw new RangeError(`Vertex index ${d.vertexIndex} out of bounds [0, ${pos.count})`);
			}
			const x = pos.getX(d.vertexIndex) + direction * d.dx;
			const y = pos.getY(d.vertexIndex) + direction * d.dy;
			const z = pos.getZ(d.vertexIndex) + direction * d.dz;
			pos.setXYZ(d.vertexIndex, x, y, z);
		}

		pos.needsUpdate = true;
		target.geometry.computeVertexNormals();
		target.geometry.computeBoundingBox();
		target.geometry.computeBoundingSphere();
		this.bvhManager?.refit();
	}
}
