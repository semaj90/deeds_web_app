/**
 * task-vector-texture-adapter.ts
 *
 * WebGL / Three.js / WebGPU texture adapter for Parent Atlas
 * EmbeddingGemma prefix-64 low-rank task vectors (EMBEDDINGGEMMA_PREFIX64_EXPERIMENTAL).
 *
 * Grid Layout Architecture:
 * - Texture Dimensions: 256 texels wide x 408 rows high
 * - Format: RGBA32F (4 float32 channels per texel = 16 bytes per texel)
 * - Per-Task Stride: 16 texels = 64 float32 values (256 bytes)
 * - Row Capacity: 256 texels / 16 texels-per-task = 16 tasks per row
 * - Row Byte Pitch: 256 texels * 16 bytes = 4,096 bytes (satisfies WebGPU bytesPerRow % 256 === 0)
 * - Grid Capacity: 16 tasks/row * 408 rows = 6,528 task slots
 * - Canonical Corpus: 6,527 tasks (indices 0..6526)
 * - Final Row: 15 active tasks (slots 6512..6526) + 1 zero-padded task slot (slot 6527)
 * - Raw Vector Buffer: 6,527 * 64 * 4 = 1,670,912 bytes (417,728 float32s)
 * - Full Padded Grid: 6,528 * 64 * 4 = 1,671,168 bytes (417,792 float32s)
 * - Padding Required: 64 float32s (256 bytes) appended at slot 6527
 */

export const TEXTURE_WIDTH = 256;
export const TEXTURE_HEIGHT = 408;
export const FLOATS_PER_TEXEL = 4; // RGBA
export const BYTES_PER_TEXEL = 16; // 4 * 4
export const FLOATS_PER_TASK = 64;
export const TEXELS_PER_TASK = 16; // 64 / 4
export const BYTES_PER_TASK = 256; // 64 * 4
export const TASKS_PER_ROW = 16; // 256 / 16
export const ROW_BYTES = 4096; // 256 texels * 16 bytes (WebGPU 256-byte pitch multiple)
export const TOTAL_CAPACITY_TASKS = 6528; // 16 * 408
export const CANONICAL_TASK_COUNT = 6527;

export const RAW_BINARY_BYTES = 1670912; // 6,527 * 256
export const RAW_BINARY_FLOATS = 417728; // 6,527 * 64
export const TOTAL_TEXTURE_BYTES = 1671168; // 6,528 * 256
export const TOTAL_TEXTURE_FLOATS = 417792; // 6,528 * 64
export const PADDING_FLOATS = 64;
export const PADDING_BYTES = 256;

export interface TexelCoordinates {
	x: number;
	y: number;
}

export interface TaskVectorTextureMetadata {
	width: number;
	height: number;
	format: 'rgba32float';
	bytesPerRow: number;
	rowsPerImage: number;
	totalFloats: number;
	totalBytes: number;
	activeTasks: number;
	capacityTasks: number;
	paddingFloats: number;
	representation: 'EMBEDDINGGEMMA_PREFIX64_EXPERIMENTAL';
}

/**
 * Calculates the top-left texel origin (x, y) for a task ordinal within the 256x408 grid.
 */
export function texelOrigin(taskOrdinal: number): TexelCoordinates {
	if (taskOrdinal < 0 || taskOrdinal >= TOTAL_CAPACITY_TASKS) {
		throw new RangeError(
			`Task ordinal ${taskOrdinal} out of range [0, ${TOTAL_CAPACITY_TASKS - 1}]`
		);
	}
	const x = (taskOrdinal % TASKS_PER_ROW) * TEXELS_PER_TASK;
	const y = Math.floor(taskOrdinal / TASKS_PER_ROW);
	return { x, y };
}

/**
 * Maps texel coordinates back to task ordinal and local texel index.
 */
export function taskOrdinalFromTexel(x: number, y: number): {
	taskOrdinal: number;
	texelInTask: number;
} {
	if (x < 0 || x >= TEXTURE_WIDTH || y < 0 || y >= TEXTURE_HEIGHT) {
		throw new RangeError(
			`Texel coordinates (${x}, ${y}) out of texture bounds [0..${TEXTURE_WIDTH - 1}, 0..${TEXTURE_HEIGHT - 1}]`
		);
	}
	const colTask = Math.floor(x / TEXELS_PER_TASK);
	const texelInTask = x % TEXELS_PER_TASK;
	const taskOrdinal = y * TASKS_PER_ROW + colTask;
	return { taskOrdinal, texelInTask };
}

/**
 * Calculates the flat float32 array index offset for a task ordinal.
 * Because 16 tasks per row * 16 texels * 4 floats = 1024 floats per row,
 * (y * 256 + x) * 4 == taskOrdinal * 64 floats.
 */
export function floatOffset(taskOrdinal: number): number {
	if (taskOrdinal < 0 || taskOrdinal >= TOTAL_CAPACITY_TASKS) {
		throw new RangeError(
			`Task ordinal ${taskOrdinal} out of range [0, ${TOTAL_CAPACITY_TASKS - 1}]`
		);
	}
	return taskOrdinal * FLOATS_PER_TASK;
}

/**
 * Converts a raw binary buffer (1,670,912 bytes / 417,728 floats) into the fully-padded
 * 256x408 texture buffer (1,671,168 bytes / 417,792 floats), appending 64 float zeros.
 */
export function buildTaskVectorTexture(
	input: ArrayBuffer | ArrayBufferView,
	options: {
		expectedCount?: number;
		validateFinite?: boolean;
	} = {}
): Float32Array {
	const expectedCount = options.expectedCount ?? CANONICAL_TASK_COUNT;
	const validateFinite = options.validateFinite ?? true;

	let sourceFloats: Float32Array;
	if (input instanceof Float32Array) {
		sourceFloats = input;
	} else if (ArrayBuffer.isView(input)) {
		sourceFloats = new Float32Array(
			input.buffer,
			input.byteOffset,
			Math.floor(input.byteLength / 4)
		);
	} else if (input instanceof ArrayBuffer) {
		sourceFloats = new Float32Array(input);
	} else {
		throw new TypeError('Invalid input type: expected ArrayBuffer or ArrayBufferView');
	}

	const expectedFloats = expectedCount * FLOATS_PER_TASK;
	const paddedFloats = TOTAL_TEXTURE_FLOATS;

	let target: Float32Array;

	if (sourceFloats.length === paddedFloats) {
		// Already padded to full texture dimensions
		target = new Float32Array(sourceFloats);
	} else if (sourceFloats.length === expectedFloats) {
		// Needs 1-task padding (64 floats / 256 bytes) to complete row 408
		target = new Float32Array(paddedFloats);
		target.set(sourceFloats, 0);
		// Remaining 64 floats (index 417,728 to 417,791) are automatically 0.0
	} else {
		throw new Error(
			`Unexpected vector buffer size: got ${sourceFloats.length} floats (${sourceFloats.byteLength} bytes), ` +
				`expected either unpadded ${expectedFloats} floats (${expectedFloats * 4} bytes) ` +
				`or padded ${paddedFloats} floats (${paddedFloats * 4} bytes)`
		);
	}

	if (validateFinite) {
		for (let i = 0; i < expectedFloats; i++) {
			const v = target[i];
			if (!Number.isFinite(v)) {
				throw new Error(`Non-finite float value ${v} detected at float offset ${i}`);
			}
		}
	}

	return target;
}

/**
 * Returns canonical metadata describing the 256x408 vector texture layout.
 */
export function getTextureMetadata(): TaskVectorTextureMetadata {
	return {
		width: TEXTURE_WIDTH,
		height: TEXTURE_HEIGHT,
		format: 'rgba32float',
		bytesPerRow: ROW_BYTES,
		rowsPerImage: TEXTURE_HEIGHT,
		totalFloats: TOTAL_TEXTURE_FLOATS,
		totalBytes: TOTAL_TEXTURE_BYTES,
		activeTasks: CANONICAL_TASK_COUNT,
		capacityTasks: TOTAL_CAPACITY_TASKS,
		paddingFloats: PADDING_FLOATS,
		representation: 'EMBEDDINGGEMMA_PREFIX64_EXPERIMENTAL',
	};
}

/**
 * Returns WebGPU-compliant texture descriptor and copy layout.
 * Note: bytesPerRow is 4,096, which satisfies the WebGPU 256-byte alignment requirement.
 */
export function getWebGpuTextureDescriptor(): {
	size: { width: number; height: number; depthOrArrayLayers: number };
	format: 'rgba32float';
	usage: number;
	copyLayout: { bytesPerRow: number; rowsPerImage: number; offset: number };
} {
	// GPUTextureUsage constants: TEXTURE_BINDING (0x04) | COPY_DST (0x02)
	const TEXTURE_BINDING = 0x04;
	const COPY_DST = 0x02;

	return {
		size: {
			width: TEXTURE_WIDTH,
			height: TEXTURE_HEIGHT,
			depthOrArrayLayers: 1,
		},
		format: 'rgba32float',
		usage: TEXTURE_BINDING | COPY_DST,
		copyLayout: {
			bytesPerRow: ROW_BYTES,
			rowsPerImage: TEXTURE_HEIGHT,
			offset: 0,
		},
	};
}

/**
 * Returns Three.js DataTexture constructor parameters and config.
 */
export function getThreeJsDataTextureConfig(): {
	width: number;
	height: number;
	format: number; // THREE.RGBAFormat = 1023
	type: number; // THREE.FloatType = 1015
	magFilter: number; // THREE.NearestFilter = 1003
	minFilter: number; // THREE.NearestFilter = 1003
	generateMipmaps: boolean;
	flipY: boolean;
} {
	return {
		width: TEXTURE_WIDTH,
		height: TEXTURE_HEIGHT,
		format: 1023, // THREE.RGBAFormat
		type: 1015, // THREE.FloatType
		magFilter: 1003, // THREE.NearestFilter
		minFilter: 1003, // THREE.NearestFilter
		generateMipmaps: false,
		flipY: false,
	};
}

/**
 * Extracts the 64-D vector for a single task ordinal from the texture Float32Array.
 */
export function extractTaskVector(
	textureBuffer: Float32Array,
	taskOrdinal: number
): Float32Array {
	const offset = floatOffset(taskOrdinal);
	return textureBuffer.slice(offset, offset + FLOATS_PER_TASK);
}
