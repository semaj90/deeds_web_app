/**
 * scene-primitive-sync.ts
 * Synchronizes Three.js 3D scene primitives (OBB, marker tents, footprint cards, actor pawns)
 * directly into the N64 16 KB Float32Array memory arena without runtime GC allocations.
 *
 * Contract:
 * - The primary 16 KB arena contract is LOCAL transform space (mesh.matrix, 16 floats, column-major).
 * - syncLocalFromArena restores mesh.matrix directly and decomposes into position/quaternion/scale without parent inversion.
 * - syncWorldFromArena is an explicit world-space path that premultiplies by inverse parent transform when parented.
 */

import * as THREE from 'three';
import { sceneFsmCache, transitionState, TRANSFORM_CAPACITY, MATRIX_STRIDE } from './scene-fsm-cache.js';

export type ScenePrimitiveType = 'EXHIBIT_OBB' | 'MARKER_TENT' | 'FOOTPRINT_CARD' | 'ACTOR_PAWN' | 'CAMERA';

export type TransformSpace = 'local' | 'world';

export interface ScenePrimitiveConfig {
	id: string; // e.g. "EXHIBIT_E002", "MARKER_02", "INVESTIGATOR_PAWN"
	slotIndex: number; // 0..255 (maps to 64-byte chunk in the 16 KB Float32Array)
	type: ScenePrimitiveType;
	mesh: THREE.Object3D;
	/** Explicit transform space contract for the arena slot. Defaults to 'local'. */
	transformSpace?: TransformSpace;
	metadata?: {
		dimensions?: [number, number, number];
		position?: [number, number, number];
		label?: string;
		sha256?: string;
	};
}

export interface ScenePrimitiveSnapshot {
	id: string;
	type: ScenePrimitiveType;
	label: string;
	positionMeters: [number, number, number];
	rotationDeg: [number, number, number];
	dimensionsMeters: [number, number, number];
	anchorStatus: 'DEMONSTRATIVE_UNCALIBRATED';
}

export class ScenePrimitiveManager {
	private registered = new Map<string, ScenePrimitiveConfig>();

	constructor(private readonly transformArena: Float32Array = sceneFsmCache.transformArena) {
		if (transformArena.length < TRANSFORM_CAPACITY * MATRIX_STRIDE) {
			throw new RangeError(`Transform arena must contain at least ${TRANSFORM_CAPACITY * MATRIX_STRIDE} floats.`);
		}
	}

	register(config: ScenePrimitiveConfig): void {
		if (!Number.isInteger(config.slotIndex) || config.slotIndex < 0 || config.slotIndex >= TRANSFORM_CAPACITY) {
			throw new RangeError(`Transform slotIndex ${config.slotIndex} must be within 0..${TRANSFORM_CAPACITY - 1}.`);
		}
		const occupied = this.getAll().find((entry) => entry.slotIndex === config.slotIndex && entry.id !== config.id);
		if (occupied) {
			throw new Error(`Transform slot ${config.slotIndex} is already assigned to ${occupied.id}.`);
		}

		this.registered.set(config.id, config);

		if (config.transformSpace === 'world') {
			config.mesh.updateWorldMatrix(true, false);
			this.writeWorldMatrixToArena(config.slotIndex, config.mesh);
		} else {
			if (config.mesh.matrixAutoUpdate) config.mesh.updateMatrix();
			this.writeLocalMatrixToArena(config.slotIndex, config.mesh);
		}
	}

	unregister(id: string): boolean {
		return this.registered.delete(id);
	}

	get(id: string): ScenePrimitiveConfig | undefined {
		return this.registered.get(id);
	}

	getAll(): ScenePrimitiveConfig[] {
		return Array.from(this.registered.values());
	}

	getSnapshot(id: string): ScenePrimitiveSnapshot | undefined {
		const config = this.registered.get(id);
		if (!config) return undefined;
		const object = config.mesh;
		object.updateWorldMatrix(true, true);
		const position = object.getWorldPosition(new THREE.Vector3());
		const rotation = object.getWorldQuaternion(new THREE.Quaternion());
		const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');
		const bounds = new THREE.Box3().setFromObject(object);
		const size = bounds.getSize(new THREE.Vector3());
		const round3 = (value: number) => Number(value.toFixed(3));
		return {
			id: config.id,
			type: config.type,
			label: config.metadata?.label ?? config.id,
			positionMeters: [round3(position.x), round3(position.y), round3(position.z)],
			rotationDeg: [
				round3(THREE.MathUtils.radToDeg(euler.x)),
				round3(THREE.MathUtils.radToDeg(euler.y)),
				round3(THREE.MathUtils.radToDeg(euler.z))
			],
			dimensionsMeters: [round3(size.x), round3(size.y), round3(size.z)],
			anchorStatus: 'DEMONSTRATIVE_UNCALIBRATED'
		};
	}

	/**
	 * Synchronizes raw matrix elements directly into the 16 KB memory arena in-place.
	 * Matches the 64-byte alignment requirement (16 floats * 4 bytes = 64 bytes).
	 */
	writeMatrixToArena(slotIndex: number, matrix: THREE.Matrix4): void {
		const offset = slotIndex * MATRIX_STRIDE;
		this.transformArena.set(matrix.elements, offset);
	}

	/**
	 * Synchronizes local Three.js transform (mesh.matrix) directly into the memory arena.
	 * Explicitly respects matrixAutoUpdate flag before reading.
	 */
	writeLocalMatrixToArena(slotIndex: number, mesh: THREE.Object3D): void {
		if (mesh.matrixAutoUpdate) mesh.updateMatrix();
		const offset = slotIndex * MATRIX_STRIDE;
		this.transformArena.set(mesh.matrix.elements, offset);
	}

	/**
	 * Synchronizes world Three.js transform (mesh.matrixWorld) into the memory arena.
	 */
	writeWorldMatrixToArena(slotIndex: number, mesh: THREE.Object3D): void {
		mesh.updateWorldMatrix(true, false);
		const offset = slotIndex * MATRIX_STRIDE;
		this.transformArena.set(mesh.matrixWorld.elements, offset);
	}

	/**
	 * Restores a LOCAL transform from the arena directly into mesh.matrix and decomposes
	 * into local position, quaternion, and scale. No parent inversion is applied.
	 */
	syncLocalFromArena(config: ScenePrimitiveConfig): void {
		const mesh = config.mesh;
		const offset = config.slotIndex * MATRIX_STRIDE;

		mesh.matrix.fromArray(this.transformArena, offset);
		mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
		mesh.updateWorldMatrix(true, true);
	}

	/**
	 * Restores a WORLD-space matrix from the arena and converts it into local coordinates
	 * relative to the object's parent via inverse parent transform.
	 */
	syncWorldFromArena(config: ScenePrimitiveConfig): void {
		const mesh = config.mesh;
		const offset = config.slotIndex * MATRIX_STRIDE;
		const matrix = new THREE.Matrix4().fromArray(this.transformArena, offset);

		if (mesh.parent) {
			const parentInv = new THREE.Matrix4().copy(mesh.parent.matrixWorld).invert();
			matrix.premultiply(parentInv);
		}

		mesh.matrix.copy(matrix);
		mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
		mesh.updateWorldMatrix(true, true);
	}

	/**
	 * Standard sync dispatch: uses syncWorldFromArena if transformSpace === 'world',
	 * otherwise uses syncLocalFromArena (the canonical 16 KB contract).
	 */
	syncFromArena(config: ScenePrimitiveConfig): void {
		if (config.transformSpace === 'world') {
			this.syncWorldFromArena(config);
		} else {
			this.syncLocalFromArena(config);
		}
	}

	/**
	 * Triggered when clicking an exhibit or card on the Evidence Board or in the 3D scene.
	 */
	focusExhibit(exhibitId: string): void {
		const item = this.registered.get(exhibitId);
		if (!item) return;

		transitionState('INSPECT_EXHIBIT', exhibitId);
	}

	/**
	 * Clears all registered primitives and restores FSM state to IDLE.
	 */
	clear(resetSharedFsm = true): void {
		this.registered.clear();
		if (resetSharedFsm) transitionState('IDLE');
	}
}

export { ScenePrimitiveManager as PrimitiveArenaBridge };
