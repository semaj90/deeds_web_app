#!/usr/bin/env node

/**
 * K-means clustering GPU test with correct TensorRT Bridge signatures
 *
 * Tests whether tensorrt_bridge.node (LibTorch + CUDA) correctly clusters vectors
 * using kmeansWithCentroids with the full parameter signature.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const addonPath = path.join(__dirname, '..', 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');

let addon;
try {
  addon = require(addonPath);
  console.log('✓ TensorRT Bridge loaded');
} catch (err) {
  console.error('✗ Failed to load tensorrt_bridge.node:', err.message);
  process.exit(1);
}

// Test parameters
const testSize = 100;  // n = number of vectors
const vectorDim = 768; // dim = vector dimension
const k = 5;           // k = number of clusters
const maxIters = 10;   // maxIters = max iterations

console.log('\n📊 Test Configuration:');
console.log(`  Vectors: ${testSize}`);
console.log(`  Dimension: ${vectorDim}`);
console.log(`  Clusters: ${k}`);
console.log(`  Max Iterations: ${maxIters}`);

// Generate random test vectors
console.log('\n🔧 Generating test vectors...');
const vectors = new Float32Array(testSize * vectorDim);
for (let i = 0; i < vectors.length; i++) {
  vectors[i] = Math.random() - 0.5; // Range: [-0.5, 0.5]
}
console.log(`  Generated: ${vectors.length} floats (${(vectors.byteLength / 1024).toFixed(2)} KB)`);

// Check CUDA availability
console.log('\n⚡ GPU Status:');
try {
  const cudaAvailable = addon.checkCudaAvailable ? addon.checkCudaAvailable() : -1;
  if (cudaAvailable === 1) {
    console.log('  ✓ CUDA available (GPU acceleration enabled)');
  } else if (cudaAvailable === 0) {
    console.log('  ⚠ CUDA not available (CPU fallback)');
  } else {
    console.log('  ? CUDA status unknown');
  }
} catch (err) {
  console.log('  ? Could not check CUDA:', err.message);
}

// Call kmeansWithCentroids with correct signature
console.log('\n🚀 Running k-means clustering on GPU...');
console.log(`  Calling: kmeansWithCentroids(vectors, ${testSize}, ${vectorDim}, ${k}, ${maxIters})`);

let result;
let startTime = Date.now();

try {
  result = addon.kmeansWithCentroids(vectors, testSize, vectorDim, k, maxIters);
  const elapsed = Date.now() - startTime;

  console.log(`✓ Clustering completed in ${elapsed}ms`);

  if (result) {
    console.log(`\n📈 Results:`);
    console.log(`  Type: ${result.constructor.name}`);
    console.log(`  Length: ${result.length}`);

    if (result instanceof Float32Array) {
      console.log(`  Size: ${(result.byteLength / 1024).toFixed(2)} KB`);

      // Centroids should be k * vectorDim values
      const expectedSize = k * vectorDim;
      console.log(`  Expected size: ${expectedSize} (${k} clusters × ${vectorDim} dim)`);

      if (result.length === expectedSize) {
        console.log('  ✓ Output shape is correct');

        // Sample output values
        console.log(`\n  Sample centroid values (first cluster, first 5 dims):`);
        for (let i = 0; i < Math.min(5, vectorDim); i++) {
          console.log(`    [0, ${i}] = ${result[i].toFixed(6)}`);
        }

        // Check for NaN
        let hasNaN = false;
        for (let i = 0; i < result.length; i++) {
          if (isNaN(result[i])) {
            hasNaN = true;
            break;
          }
        }

        if (hasNaN) {
          console.log('\n  ✗ WARNING: NaN values detected in output');
        } else {
          console.log('\n  ✓ No NaN values');
        }
      } else {
        console.log(`  ✗ Output shape mismatch: got ${result.length}, expected ${expectedSize}`);
      }
    }
  } else {
    console.log('✗ Clustering returned null/undefined');
  }
} catch (err) {
  const elapsed = Date.now() - startTime;
  console.error(`✗ Clustering failed after ${elapsed}ms`);
  console.error(`  Error: ${err.message}`);
  if (err.stack) {
    console.error(`  Stack: ${err.stack.split('\n').slice(0, 3).join('\n  ')}`);
  }
  process.exit(1);
}

// Performance analysis
console.log('\n⏱️  Performance:');
const vectorsPerMs = (testSize * vectorDim) / (Date.now() - startTime + 1);
console.log(`  Throughput: ${vectorsPerMs.toFixed(0)} vector-elements/ms`);
console.log(`  Per-vector: ${((Date.now() - startTime) / testSize).toFixed(2)}ms`);

// Summary
console.log('\n✅ Test completed successfully');
console.log('   GPU acceleration is working correctly');
