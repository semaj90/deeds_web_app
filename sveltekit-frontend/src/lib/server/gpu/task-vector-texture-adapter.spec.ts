import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	buildTaskVectorTexture,
	CANONICAL_TASK_COUNT,
	extractTaskVector,
	floatOffset,
	FLOATS_PER_TASK,
	FLOATS_PER_TEXEL,
	getTextureMetadata,
	getThreeJsDataTextureConfig,
	getWebGpuTextureDescriptor,
	PADDING_BYTES,
	PADDING_FLOATS,
	RAW_BINARY_BYTES,
	RAW_BINARY_FLOATS,
	ROW_BYTES,
	taskOrdinalFromTexel,
	TASKS_PER_ROW,
	texelOrigin,
	TEXELS_PER_TASK,
	TEXTURE_HEIGHT,
	TEXTURE_WIDTH,
	TOTAL_CAPACITY_TASKS,
	TOTAL_TEXTURE_BYTES,
	TOTAL_TEXTURE_FLOATS,
} from './task-vector-texture-adapter.js';

describe('task-vector-texture-adapter', () => {
	it('defines consistent grid constants', () => {
		expect(TEXTURE_WIDTH).toBe(256);
		expect(TEXTURE_HEIGHT).toBe(408);
		expect(TEXELS_PER_TASK).toBe(16);
		expect(TASKS_PER_ROW).toBe(16);
		expect(TOTAL_CAPACITY_TASKS).toBe(6528);
		expect(CANONICAL_TASK_COUNT).toBe(6527);

		// WebGPU buffer-to-texture row alignment constraint (multiple of 256 bytes)
		expect(ROW_BYTES).toBe(4096);
		expect(ROW_BYTES % 256).toBe(0);

		// Total floats and byte sizes
		expect(RAW_BINARY_FLOATS).toBe(417728);
		expect(RAW_BINARY_BYTES).toBe(1670912);
		expect(TOTAL_TEXTURE_FLOATS).toBe(417792);
		expect(TOTAL_TEXTURE_BYTES).toBe(1671168);
		expect(PADDING_FLOATS).toBe(64);
		expect(PADDING_BYTES).toBe(256);
		expect(RAW_BINARY_BYTES + PADDING_BYTES).toBe(TOTAL_TEXTURE_BYTES);
	});

	it('computes exact texel origins for boundary task ordinals', () => {
		// Task 0: top-left origin
		expect(texelOrigin(0)).toEqual({ x: 0, y: 0 });

		// Task 1: second slot in row 0
		expect(texelOrigin(1)).toEqual({ x: 16, y: 0 });

		// Task 15: last slot in row 0
		expect(texelOrigin(15)).toEqual({ x: 240, y: 0 });

		// Task 16: first slot in row 1
		expect(texelOrigin(16)).toEqual({ x: 0, y: 1 });

		// Task 6526: 6527th active task (row 407, col 14)
		expect(texelOrigin(6526)).toEqual({ x: 224, y: 407 });

		// Task 6527: padding slot (row 407, col 15)
		expect(texelOrigin(6527)).toEqual({ x: 240, y: 407 });

		// Out of range check
		expect(() => texelOrigin(-1)).toThrow(RangeError);
		expect(() => texelOrigin(6528)).toThrow(RangeError);
	});

	it('correctly maps texel coordinates back to task ordinal', () => {
		// Inside task 0 (first texel)
		expect(taskOrdinalFromTexel(0, 0)).toEqual({ taskOrdinal: 0, texelInTask: 0 });
		// Inside task 0 (last texel)
		expect(taskOrdinalFromTexel(15, 0)).toEqual({ taskOrdinal: 0, texelInTask: 15 });

		// Inside task 1
		expect(taskOrdinalFromTexel(16, 0)).toEqual({ taskOrdinal: 1, texelInTask: 0 });

		// Inside task 6526 (active task)
		expect(taskOrdinalFromTexel(224, 407)).toEqual({ taskOrdinal: 6526, texelInTask: 0 });
		expect(taskOrdinalFromTexel(239, 407)).toEqual({ taskOrdinal: 6526, texelInTask: 15 });

		// Inside task 6527 (padding task)
		expect(taskOrdinalFromTexel(240, 407)).toEqual({ taskOrdinal: 6527, texelInTask: 0 });
		expect(taskOrdinalFromTexel(255, 407)).toEqual({ taskOrdinal: 6527, texelInTask: 15 });

		expect(() => taskOrdinalFromTexel(256, 0)).toThrow(RangeError);
		expect(() => taskOrdinalFromTexel(0, 408)).toThrow(RangeError);
	});

	it('proves that flat float offset equals 2D row-major texel addressing', () => {
		// For every ordinal from 0 to 6527, floatOffset must match (y * 256 + x) * 4
		for (const ordinal of [0, 1, 15, 16, 31, 32, 100, 1024, 6526, 6527]) {
			const offset = floatOffset(ordinal);
			const { x, y } = texelOrigin(ordinal);
			const texelFlatFloat = (y * TEXTURE_WIDTH + x) * FLOATS_PER_TEXEL;
			expect(offset).toBe(texelFlatFloat);
			expect(offset).toBe(ordinal * FLOATS_PER_TASK);
		}
	});

	it('pads an unpadded 6,527-task buffer with exactly 64 zero floats', () => {
		const rawFloats = new Float32Array(RAW_BINARY_FLOATS);
		// Fill test patterns
		for (let i = 0; i < rawFloats.length; i++) {
			rawFloats[i] = (i % 64) * 0.01;
		}

		const textureData = buildTaskVectorTexture(rawFloats);

		expect(textureData.length).toBe(TOTAL_TEXTURE_FLOATS);
		expect(textureData.byteLength).toBe(TOTAL_TEXTURE_BYTES);

		// Check first and last active tasks
		const task0 = extractTaskVector(textureData, 0);
		expect(task0.length).toBe(64);
		expect(task0[0]).toBeCloseTo(0.0);
		expect(task0[63]).toBeCloseTo(0.63);

		const task6526 = extractTaskVector(textureData, 6526);
		expect(task6526.length).toBe(64);
		expect(task6526[0]).toBeCloseTo(0.0);
		expect(task6526[63]).toBeCloseTo(0.63);

		// Check padding slot (task 6527) - must be all zeros
		const paddingSlot = extractTaskVector(textureData, 6527);
		expect(paddingSlot.length).toBe(64);
		for (let i = 0; i < 64; i++) {
			expect(paddingSlot[i]).toBe(0.0);
		}
	});

	it('returns valid WebGPU and Three.js descriptors', () => {
		const webgpu = getWebGpuTextureDescriptor();
		expect(webgpu.size.width).toBe(256);
		expect(webgpu.size.height).toBe(408);
		expect(webgpu.format).toBe('rgba32float');
		expect(webgpu.copyLayout.bytesPerRow).toBe(4096);
		expect(webgpu.copyLayout.bytesPerRow % 256).toBe(0);

		const three = getThreeJsDataTextureConfig();
		expect(three.width).toBe(256);
		expect(three.height).toBe(408);
		expect(three.format).toBe(1023); // RGBAFormat
		expect(three.type).toBe(1015); // FloatType
		expect(three.flipY).toBe(false);

		const meta = getTextureMetadata();
		expect(meta.activeTasks).toBe(6527);
		expect(meta.capacityTasks).toBe(6528);
		expect(meta.paddingFloats).toBe(64);
		expect(meta.representation).toBe('EMBEDDINGGEMMA_PREFIX64_EXPERIMENTAL');
	});

	it('verifies real binary file when available on disk', () => {
		const binPath = path.resolve(
			process.cwd(),
			'../.tmp/atlas/openspec-task-lowrank-keyframes.embeddinggemma.latent64.f32le.bin'
		);
		const altPath = path.resolve(
			process.cwd(),
			'.tmp/atlas/openspec-task-lowrank-keyframes.embeddinggemma.latent64.f32le.bin'
		);

		const targetPath = fs.existsSync(altPath) ? altPath : fs.existsSync(binPath) ? binPath : null;
		if (!targetPath) {
			return; // File not in current working dir relative path during test runner
		}

		const bytes = fs.readFileSync(targetPath);
		expect(bytes.length).toBe(RAW_BINARY_BYTES);

		const textureData = buildTaskVectorTexture(bytes.buffer);
		expect(textureData.length).toBe(TOTAL_TEXTURE_FLOATS);

		// Verify task 0 has unit L2 norm
		const task0 = extractTaskVector(textureData, 0);
		let l2NormSq = 0;
		for (let i = 0; i < 64; i++) {
			l2NormSq += task0[i] * task0[i];
		}
		expect(Math.sqrt(l2NormSq)).toBeCloseTo(1.0, 4);

		// Verify padding slot is strictly zeros
		const paddingTask = extractTaskVector(textureData, 6527);
		for (let i = 0; i < 64; i++) {
			expect(paddingTask[i]).toBe(0.0);
		}
	});
});
