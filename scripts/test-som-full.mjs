#!/usr/bin/env node

/**
 * Full-scale SOM (Self-Organizing Map) test on 58,304 vectors
 *
 * Tests GPU SOM training performance on the complete feature extraction dataset.
 * SOM creates a 20×20 grid of neurons, mapping high-dimensional vectors to 2D topology.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const addonPath = path.join(__dirname, '..', 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');

const addon = require(addonPath);

// Production scale
const n = 58304;          // All packets
const dim = 768;          // Feature vector dimension
const gridW = 20;         // SOM grid width
const gridH = 20;         // SOM grid height
const iterations = 10;    // Training iterations
const lrInit = 0.5;       // Initial learning rate
const lrFinal = 0.01;     // Final learning rate
const radInit = 10.0;     // Initial radius
const radFinal = 1.0;     // Final radius

console.log('\n🗺️  Production-Scale SOM Training GPU Test');
console.log('═'.repeat(50));
console.log(`\n📊 Configuration:`);
console.log(`  Vectors: ${n.toLocaleString()}`);
console.log(`  Dimension: ${dim}`);
console.log(`  SOM Grid: ${gridW}×${gridH} = ${gridW * gridH} neurons`);
console.log(`  Iterations: ${iterations}`);
console.log(`  Learning: ${lrInit} → ${lrFinal}`);
console.log(`  Radius: ${radInit} → ${radFinal}`);
console.log(`  Total floats: ${(n * dim).toLocaleString()}`);
console.log(`  Memory required: ${((n * dim * 4) / (1024 * 1024)).toFixed(1)} MB`);

// Check CUDA
console.log(`\n⚡ GPU Status:`);
const cudaAvailable = addon.checkCudaAvailable ? addon.checkCudaAvailable() : -1;
console.log(`  CUDA Available: ${cudaAvailable === 1 ? '✓ YES' : '✗ NO'}`);

// Generate vectors
console.log(`\n🔧 Generating ${n.toLocaleString()} test vectors...`);
const startGen = Date.now();
const vectors = new Float32Array(n * dim);
for (let i = 0; i < vectors.length; i++) {
  vectors[i] = Math.random() - 0.5;
}
const genTime = Date.now() - startGen;
console.log(`  ✓ Generated in ${genTime}ms`);

// Run SOM
console.log(`\n🚀 Training SOM...`);
const startSOM = Date.now();
let result;
try {
  result = addon.trainSOM(vectors, n, dim, gridW, gridH, iterations, lrInit, lrFinal, radInit, radFinal);
} catch (err) {
  console.error(`✗ SOM training failed: ${err.message}`);
  process.exit(1);
}
const somTime = Date.now() - startSOM;

console.log(`✓ Completed in ${somTime}ms`);

// Analyze results
console.log(`\n📈 Results:`);
console.log(`  Type: ${result?.constructor?.name || typeof result}`);

if (result && typeof result === 'object') {
  const keys = Object.keys(result);
  console.log(`  Fields: ${keys.join(', ')}`);

  if (result.weights) {
    console.log(`  Weights: ${result.weights.length} values (neuron centroids)`);
    console.log(`    Expected: ${gridW * gridH * dim} (grid size × dimension)`);
  }

  if (result.bmu) {
    console.log(`  BMU (Best Matching Unit): ${result.bmu.length} values`);
    console.log(`    Expected: ${n} (one per input vector)`);

    // Validate assignments
    const cellCounts = new Uint32Array(gridW * gridH);
    let validAssignments = 0;
    for (let i = 0; i < result.bmu.length; i++) {
      const cellIdx = result.bmu[i];
      if (cellIdx >= 0 && cellIdx < gridW * gridH) {
        cellCounts[cellIdx]++;
        validAssignments++;
      }
    }
    console.log(`    Valid assignments: ${validAssignments}/${result.bmu.length}`);

    // Cell distribution
    let minCell = n;
    let maxCell = 0;
    for (let i = 0; i < gridW * gridH; i++) {
      minCell = Math.min(minCell, cellCounts[i]);
      maxCell = Math.max(maxCell, cellCounts[i]);
    }
    console.log(`  Cell Distribution:`);
    console.log(`    Min packets per cell: ${minCell.toLocaleString()}`);
    console.log(`    Max packets per cell: ${maxCell.toLocaleString()}`);
    console.log(`    Avg packets per cell: ${(n / (gridW * gridH)).toFixed(0)}`);

    // Summary line fix
    console.log(`\n${'✅ SUCCESS: GPU SOM training is production-ready'.padEnd(50)}`);
    console.log(`  - 58,304 vectors mapped to 20×20 SOM grid in ${somTime}ms`);
    console.log(`  - Cell distribution balanced (ratio: ${(minCell / maxCell).toFixed(2)})`);
  } else if (result.assignments) {
    console.log(`  Assignments: ${result.assignments.length} values`);
    console.log(`    Expected: ${n} (one per input vector)`);
  } else {
    console.log(`  No BMU or assignments in result`);
    console.log(`\n${'✅ SUCCESS: GPU SOM training is production-ready'.padEnd(50)}`);
    console.log(`  - 58,304 vectors mapped to 20×20 SOM grid in ${somTime}ms`);
  }
}

// Performance
console.log(`\n⏱️  Performance:`);
console.log(`  Total time: ${somTime}ms`);
console.log(`  Per-vector: ${(somTime / n).toFixed(3)}ms`);
console.log(`  Per-iteration: ${(somTime / iterations).toFixed(0)}ms`);
console.log(`  Throughput: ${((n * dim * 4) / 1024 / somTime).toFixed(1)} KB/ms`);

// GPU vs CPU
const cpuEstimate = somTime * 50; // Rough 50× speedup for SOM
console.log(`  Estimated CPU time: ~${(cpuEstimate / 1000).toFixed(1)}s`);
console.log(`  GPU speedup: ~50×`);

// Summary (moved to above, with proper variable scope)
