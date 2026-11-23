import assert from 'node:assert/strict';
import * as wasm from '../static/wasm/vector-ops.js';

const close = (actual, expected, tolerance = 1e-5) => {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
};

const batchPtr = wasm.allocateVectorMemory(4);
const inputPtr = wasm.allocateVectorMemory(2);
const outputPtr = wasm.allocateVectorMemory(2);
const gradOutputPtr = wasm.allocateVectorMemory(2);
const gradInputPtr = wasm.allocateVectorMemory(2);

try {
  const values = new Float32Array(wasm.memory.buffer);
  values.set([3, 4, 0, 0], batchPtr >>> 2);
  wasm.batchNormalizeVectors(batchPtr, 2, 2);
  const normalized = Array.from(values.slice(batchPtr >>> 2, (batchPtr >>> 2) + 4));
  close(normalized[0], 0.6);
  close(normalized[1], 0.8);
  assert.deepEqual(normalized.slice(2), [0, 0]);

  const x = [1e-7, 0];
  const g = [1, 1];
  const epsilon = 1e-12;
  values.set(x, inputPtr >>> 2);
  values.set(x, outputPtr >>> 2);
  values.set(g, gradOutputPtr >>> 2);
  const radius = wasm.normalizeWithEpsilon(outputPtr, x.length, epsilon);
  wasm.l2NormalizeBackwardWithEpsilon(inputPtr, gradOutputPtr, gradInputPtr, x.length, epsilon);

  const expectedRadius = Math.sqrt(x.reduce((sum, value) => sum + value * value, epsilon));
  const xDotG = x.reduce((sum, value, index) => sum + value * g[index], 0);
  const expectedGradient = x.map((value, index) => g[index] / expectedRadius - value * xDotG / (expectedRadius ** 3));
  const actualForward = Array.from(values.slice(outputPtr >>> 2, (outputPtr >>> 2) + x.length));
  const actualGradient = Array.from(values.slice(gradInputPtr >>> 2, (gradInputPtr >>> 2) + x.length));

  close(radius, expectedRadius, 1e-9);
  actualForward.forEach((value, index) => close(value, x[index] / expectedRadius, 1e-6));
  actualGradient.forEach((value, index) => close(value, expectedGradient[index], 1e-6));

  console.log(JSON.stringify({ status: 'PASS', batchL2: true, stabilizedForward: true, stabilizedBackward: true }));
} finally {
  for (const ptr of [batchPtr, inputPtr, outputPtr, gradOutputPtr, gradInputPtr]) {
    wasm.freeVectorMemory(ptr);
  }
}
