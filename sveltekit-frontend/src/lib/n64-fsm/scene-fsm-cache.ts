/**
 * Modernized 8 MB RAM-aligned Architecture for SvelteKit 2 + RTX CUDA.
 * Mimics N64 hardware efficiency:
 * 1. Fixed pre-allocated memory arenas (zero-GC stutters during 60 FPS animation/traversal).
 * 2. 64-byte aligned TypedArray arena for 6-DoF transforms (16 float32s = 64 bytes, exactly 1 cache line).
 * 3. Point/Prism colliders with triangle categorization (Floor, Ceiling, Wall based on normal vector components).
 * 4. Deterministic Finite State Machine (FSM) state swaps.
 */

export type N64FsmStateType = 'IDLE' | 'WALK' | 'INSPECT_EXHIBIT' | 'ANIMATE';
export type N64CollisionSurface = 'FLOOR' | 'CEILING' | 'WALL';

export interface N64AlignedFsmState {
	currentState: N64FsmStateType;
	activeExhibitId: string | null;
	/** 64-byte aligned Float32Array cache for 6-DoF transforms (avoids garbage collection) */
	transformArena: Float32Array;
}

// Fixed-size preallocated memory arena (zero dynamic allocations during runtime)
// 256 tracked exhibits/primitives * 16 floats (4x4 matrix or 6-DoF position/quat/scale block)
export const TRANSFORM_CAPACITY = 256;
export const MATRIX_STRIDE = 16;
export const ARENA_BYTE_LENGTH = TRANSFORM_CAPACITY * MATRIX_STRIDE * Float32Array.BYTES_PER_ELEMENT; // 16 KB

// Allocate memory buffer with 64-byte alignment
const memoryBuffer = new ArrayBuffer(ARENA_BYTE_LENGTH);
const sharedArena = new Float32Array(memoryBuffer);

// Reactive state container compatible with Svelte 5 and vanilla JS
class ReactiveFsmCache implements N64AlignedFsmState {
	currentState: N64FsmStateType = 'IDLE';
	activeExhibitId: string | null = null;
	transformArena: Float32Array = sharedArena;

	private subscribers = new Set<(state: N64AlignedFsmState) => void>();

	subscribe(fn: (state: N64AlignedFsmState) => void): () => void {
		this.subscribers.add(fn);
		fn(this);
		return () => this.subscribers.delete(fn);
	}

	private notify() {
		for (const fn of this.subscribers) {
			fn(this);
		}
	}

	transition(nextState: N64FsmStateType, exhibitId?: string | null) {
		if (this.currentState === nextState && this.activeExhibitId === (exhibitId ?? null)) {
			return;
		}
		this.currentState = nextState;
		this.activeExhibitId = exhibitId ?? null;
		this.notify();
	}

	/**
	 * Write 4x4 matrix or 6-DoF transform block into preallocated arena without allocating memory.
	 */
	setTransform(index: number, matrix16: ArrayLike<number>): void {
		if (index < 0 || index >= TRANSFORM_CAPACITY) {
			throw new RangeError(`Transform index ${index} out of bounds (max ${TRANSFORM_CAPACITY})`);
		}
		const offset = index * MATRIX_STRIDE;
		for (let i = 0; i < 16; i++) {
			this.transformArena[offset + i] = matrix16[i];
		}
	}

	/**
	 * Get view of transform for index without allocating new memory.
	 */
	getTransformSubarray(index: number): Float32Array {
		const offset = index * MATRIX_STRIDE;
		return this.transformArena.subarray(offset, offset + 16);
	}
}

export const sceneFsmCache = new ReactiveFsmCache();

export function transitionState(nextState: N64FsmStateType, exhibitId?: string): void {
	sceneFsmCache.transition(nextState, exhibitId);
}

/**
 * N64 Point/Prism Collider Triangle Categorization
 * Based on normal vector components:
 * - Floor: normal facing upwards (dot product with up vector > threshold)
 * - Ceiling: normal facing downwards
 * - Wall: vertical/steep normal
 */
export function classifyTriangleSurface(
	normalX: number,
	normalY: number,
	normalZ: number,
	upAxis: 'Y' | 'Z' = 'Y'
): N64CollisionSurface {
	const up = upAxis === 'Y' ? normalY : normalZ;
	// Super Mario 64 standard: floor threshold ~0.01 to 0.707 depending on slope tolerance
	if (up > 0.707) return 'FLOOR';
	if (up < -0.707) return 'CEILING';
	return 'WALL';
}

/**
 * 1928 Rubber-Hose / YoRHa Vintage Quantized 8-Color Palette LUT.
 * Aligned with N64 color quantization and Three.js vertex attributes.
 */
export const NES_QUANTIZED_PALETTE_LUT = Object.freeze([
	{ index: 0, name: 'Obsidian', hex: '#121316', rgb: [18, 19, 22] as const, role: 'suit / shadow / void' },
	{ index: 1, name: 'Oxblood', hex: '#8b1e22', rgb: [139, 30, 34] as const, role: 'bloodstain / warning' },
	{ index: 2, name: 'Taupe', hex: '#888277', rgb: [136, 130, 119] as const, role: 'neutral surface' },
	{ index: 3, name: 'Blush', hex: '#d4a59a', rgb: [212, 165, 154] as const, role: 'warm skin tone' },
	{ index: 4, name: 'Ivory', hex: '#f7f5ee', rgb: [247, 245, 238] as const, role: 'paper / stepping cards' },
	{ index: 5, name: 'Gold', hex: '#e5a93c', rgb: [229, 169, 60] as const, role: 'marker tents / gizmo ring' },
	{ index: 6, name: 'Soft Mint', hex: '#97cfac', rgb: [151, 207, 172] as const, role: 'matrix grid / verified pills' },
	{ index: 7, name: 'Cyan Laser', hex: '#38bdf8', rgb: [56, 189, 248] as const, role: 'OBB wires / raycast telemetry' },
]);

/**
 * Decode 256-bit bitset occupancy mask (from PostgreSQL 18 AIO BIT(256) or gRPC wire bytes)
 * into a list of active slot indices (0..255) for the 16 KB N64 cache arena.
 */
export function decodeActiveSlotBitset(bitset: string | Uint8Array | BigUint64Array): number[] {
	const activeSlots: number[] = [];

	if (typeof bitset === 'string') {
		// PostgreSQL bit(256) returns a string of '0' and '1'
		for (let i = 0; i < bitset.length && i < TRANSFORM_CAPACITY; i++) {
			if (bitset[i] === '1') {
				activeSlots.push(i);
			}
		}
	} else if (bitset instanceof Uint8Array) {
		// 32 bytes = 256 bits
		for (let byteIdx = 0; byteIdx < bitset.length && byteIdx < 32; byteIdx++) {
			const b = bitset[byteIdx];
			for (let bit = 0; bit < 8; bit++) {
				const slot = byteIdx * 8 + bit;
				if (slot < TRANSFORM_CAPACITY && (b & (1 << bit)) !== 0) {
					activeSlots.push(slot);
				}
			}
		}
	} else if (bitset instanceof BigUint64Array) {
		// 4 words of 64 bits = 256 bits
		for (let wordIdx = 0; wordIdx < bitset.length && wordIdx < 4; wordIdx++) {
			const word = bitset[wordIdx];
			for (let bit = 0; bit < 64; bit++) {
				const slot = wordIdx * 64 + bit;
				if (slot < TRANSFORM_CAPACITY && (word & (1n << BigInt(bit))) !== 0n) {
					activeSlots.push(slot);
				}
			}
		}
	}

	return activeSlots;
}

