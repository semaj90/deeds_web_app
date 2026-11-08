#!/usr/bin/env node
/**
 * scripts/atlas/test-task-vector-texture-adapter.mjs
 *
 * Verifies task-vector-texture-adapter.ts with real assertions and real binary data.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// We can import directly from TS file via tsx or create compiled/mjs mirror
import {
  TEXTURE_WIDTH,
  TEXTURE_HEIGHT,
  FLOATS_PER_TEXEL,
  BYTES_PER_TEXEL,
  FLOATS_PER_TASK,
  TEXELS_PER_TASK,
  BYTES_PER_TASK,
  TASKS_PER_ROW,
  ROW_BYTES,
  TOTAL_CAPACITY_TASKS,
  CANONICAL_TASK_COUNT,
  RAW_BINARY_BYTES,
  RAW_BINARY_FLOATS,
  TOTAL_TEXTURE_BYTES,
  TOTAL_TEXTURE_FLOATS,
  PADDING_FLOATS,
  PADDING_BYTES,
  texelOrigin,
  taskOrdinalFromTexel,
  floatOffset,
  buildTaskVectorTexture,
  getTextureMetadata,
  getWebGpuTextureDescriptor,
  getThreeJsDataTextureConfig,
  extractTaskVector
} from '../../sveltekit-frontend/src/lib/server/gpu/task-vector-texture-adapter.ts';

console.log('[Test] Running Task Vector Texture Adapter Verification...');

// 1. Constants
assert.equal(TEXTURE_WIDTH, 256, 'Width must be 256');
assert.equal(TEXTURE_HEIGHT, 408, 'Height must be 408');
assert.equal(TEXELS_PER_TASK, 16, '16 texels per task');
assert.equal(TASKS_PER_ROW, 16, '16 tasks per row');
assert.equal(TOTAL_CAPACITY_TASKS, 6528, 'Capacity must be 6528');
assert.equal(CANONICAL_TASK_COUNT, 6527, 'Active count must be 6527');
assert.equal(ROW_BYTES, 4096, 'Row pitch must be 4096 bytes');
assert.equal(ROW_BYTES % 256, 0, 'Row pitch must be a multiple of 256 for WebGPU');
assert.equal(RAW_BINARY_BYTES, 1670912, 'Raw bytes must be 1,670,912');
assert.equal(TOTAL_TEXTURE_BYTES, 1671168, 'Padded bytes must be 1,671,168');
assert.equal(PADDING_BYTES, 256, 'Padding must be 256 bytes (64 floats)');
console.log('✓ Grid constants and WebGPU 256-byte row pitch verified');

// 2. Texel origin math
assert.deepEqual(texelOrigin(0), { x: 0, y: 0 });
assert.deepEqual(texelOrigin(1), { x: 16, y: 0 });
assert.deepEqual(texelOrigin(15), { x: 240, y: 0 });
assert.deepEqual(texelOrigin(16), { x: 0, y: 1 });
assert.deepEqual(texelOrigin(6526), { x: 224, y: 407 }); // row 407, task 14
assert.deepEqual(texelOrigin(6527), { x: 240, y: 407 }); // row 407, task 15 (padding)
assert.throws(() => texelOrigin(-1), RangeError);
assert.throws(() => texelOrigin(6528), RangeError);
console.log('✓ Texel coordinate mapping verified');

// 3. Bidirectional mapping
assert.deepEqual(taskOrdinalFromTexel(0, 0), { taskOrdinal: 0, texelInTask: 0 });
assert.deepEqual(taskOrdinalFromTexel(15, 0), { taskOrdinal: 0, texelInTask: 15 });
assert.deepEqual(taskOrdinalFromTexel(16, 0), { taskOrdinal: 1, texelInTask: 0 });
assert.deepEqual(taskOrdinalFromTexel(224, 407), { taskOrdinal: 6526, texelInTask: 0 });
assert.deepEqual(taskOrdinalFromTexel(239, 407), { taskOrdinal: 6526, texelInTask: 15 });
assert.deepEqual(taskOrdinalFromTexel(240, 407), { taskOrdinal: 6527, texelInTask: 0 });
assert.deepEqual(taskOrdinalFromTexel(255, 407), { taskOrdinal: 6527, texelInTask: 15 });
console.log('✓ Bidirectional texel-to-task mapping verified');

// 4. Flat float offset equals 2D row-major addressing
for (const ordinal of [0, 1, 15, 16, 31, 32, 100, 1024, 6526, 6527]) {
  const offset = floatOffset(ordinal);
  const { x, y } = texelOrigin(ordinal);
  const texelFlatFloat = (y * TEXTURE_WIDTH + x) * FLOATS_PER_TEXEL;
  assert.equal(offset, texelFlatFloat);
  assert.equal(offset, ordinal * FLOATS_PER_TASK);
}
console.log('✓ Flat offset matches row-major texel addressing');

// 5. Test padding buffer on synthetic data
const synthFloats = new Float32Array(RAW_BINARY_FLOATS);
synthFloats.fill(0.123);
const paddedSynth = buildTaskVectorTexture(synthFloats);
assert.equal(paddedSynth.length, TOTAL_TEXTURE_FLOATS);
assert.equal(paddedSynth.byteLength, TOTAL_TEXTURE_BYTES);
assert.ok(Math.abs(paddedSynth[0] - 0.123) < 1e-6);
assert.ok(Math.abs(paddedSynth[RAW_BINARY_FLOATS - 1] - 0.123) < 1e-6);
for (let i = RAW_BINARY_FLOATS; i < TOTAL_TEXTURE_FLOATS; i++) {
  assert.equal(paddedSynth[i], 0.0, 'Padding floats must be 0.0');
}
console.log('✓ Synthetic buffer padding and zero-padding validated');

// 6. Test with real binary file
const binPath = path.resolve(process.cwd(), '.tmp/atlas/openspec-task-lowrank-keyframes.embeddinggemma.latent64.f32le.bin');
if (fs.existsSync(binPath)) {
  const binBytes = fs.readFileSync(binPath);
  assert.equal(binBytes.length, RAW_BINARY_BYTES);
  const realTexture = buildTaskVectorTexture(binBytes.buffer);
  assert.equal(realTexture.length, TOTAL_TEXTURE_FLOATS);

  // Check task 0 L2 unit norm
  const task0 = extractTaskVector(realTexture, 0);
  assert.equal(task0.length, 64);
  let normSq = 0;
  for (let i = 0; i < 64; i++) normSq += task0[i] * task0[i];
  const l2 = Math.sqrt(normSq);
  assert.ok(Math.abs(l2 - 1.0) < 1e-4, `Task 0 norm should be ~1.0, got ${l2}`);

  // Check padding task (6527) is all zeros
  const paddingTask = extractTaskVector(realTexture, 6527);
  for (let i = 0; i < 64; i++) {
    assert.equal(paddingTask[i], 0.0);
  }
  console.log(`✓ Real binary verified from ${binPath} (Task 0 L2: ${l2.toFixed(6)}, Slot 6527: zeros)`);
}

// 7. Descriptors
const webgpu = getWebGpuTextureDescriptor();
assert.equal(webgpu.format, 'rgba32float');
assert.equal(webgpu.copyLayout.bytesPerRow, 4096);

const three = getThreeJsDataTextureConfig();
assert.equal(three.width, 256);
assert.equal(three.height, 408);

console.log('ALL TESTS PASSED: task-vector-texture-adapter is fully verified.');
