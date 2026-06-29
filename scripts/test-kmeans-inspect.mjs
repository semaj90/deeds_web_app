#!/usr/bin/env node

/**
 * Inspect k-means return value structure
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const addonPath = path.join(__dirname, '..', 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');

const addon = require(addonPath);

// Generate small test
const vectors = new Float32Array(25 * 768);
for (let i = 0; i < vectors.length; i++) {
  vectors[i] = Math.random() - 0.5;
}

console.log('Running kmeansWithCentroids...');
const result = addon.kmeansWithCentroids(vectors, 25, 768, 3, 5);

console.log('\n📦 Return value structure:');
console.log(`  Type: ${typeof result}`);
console.log(`  Constructor: ${result?.constructor?.name}`);
console.log(`  Keys: ${Object.keys(result || {})}`);

if (result && typeof result === 'object') {
  console.log('\n🔍 Contents:');
  for (const [key, value] of Object.entries(result)) {
    if (value instanceof Float32Array || value instanceof Uint32Array || value instanceof Int32Array) {
      console.log(`  ${key}: ${value.constructor.name}[${value.length}] (${(value.byteLength / 1024).toFixed(1)} KB)`);
      if (value.length <= 15) {
        console.log(`    Values: [${Array.from(value).map(v => v.toFixed(2)).join(', ')}]`);
      } else {
        console.log(`    First 5: [${Array.from(value.slice(0, 5)).map(v => v.toFixed(2)).join(', ')}]`);
      }
    } else if (Array.isArray(value)) {
      console.log(`  ${key}: Array[${value.length}]`);
    } else {
      console.log(`  ${key}: ${typeof value} = ${JSON.stringify(value)}`);
    }
  }
}

console.log('\nExpected output (based on function name):');
console.log('  - centroids: Float32Array with k * dim = 3 * 768 = 2304 values');
console.log('  - labels: Uint32Array with n = 25 values (cluster assignment per vector)');
console.log('  - inertia: float (within-cluster sum of squares)');
