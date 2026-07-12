#!/usr/bin/env node

/**
 * Native Capability Smoke Tests
 * Validates SIMD JSON addon and CUDA/LibTorch tensor addon independently.
 * Failures in one addon do NOT cascade to the other.
 *
 * Usage: node scripts/native/probe-capabilities.mjs [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const verbose = process.argv.includes('--verbose');

const ADDON_PATHS = {
  simd: path.resolve(__dirname, '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  cuda: path.resolve(__dirname, '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
};

console.log('\n🔍 Native Capability Probe Starting...\n');

// ════════════════════════════════════════════════════════════════════════════
// Phase 1: Check artifact existence
// ════════════════════════════════════════════════════════════════════════════

console.log('📦 Phase 1: Artifact Verification');
console.log('─'.repeat(50));

let hasSimd = false;
let hasCuda = false;

for (const [name, filePath] of Object.entries(ADDON_PATHS)) {
  const exists = fs.existsSync(filePath);
  const status = exists ? '✓' : '✗';
  console.log(`  ${status} ${name.toUpperCase()}: ${exists ? 'Found' : 'Missing'}`);
  if (name === 'simd') hasSimd = exists;
  if (name === 'cuda') hasCuda = exists;
}

if (!hasSimd && !hasCuda) {
  console.error('\n❌ FATAL: No native addons found. Rebuilding required.');
  console.error(`   Expected at: ${ADDON_PATHS.simd}`);
  process.exit(1);
}

console.log();

// ════════════════════════════════════════════════════════════════════════════
// Phase 2: Independent addon loading (failures don't cascade)
// ════════════════════════════════════════════════════════════════════════════

console.log('⚙️  Phase 2: Independent Addon Loading');
console.log('─'.repeat(50));

let simdAddon = null;
let cudaAddon = null;

// Try SIMD addon
if (hasSimd) {
  try {
    simdAddon = require(ADDON_PATHS.simd);
    console.log('  ✓ SIMD addon loaded successfully');
    if (verbose && simdAddon) {
      const exports = Object.keys(simdAddon);
      console.log(`    Exports: ${exports.join(', ')}`);
    }
  } catch (err) {
    console.warn(`  ⚠️  SIMD addon load failed: ${err.message}`);
    console.warn('    → Fallback: Will use native JSON.parse()');
  }
}

// Try CUDA addon (same binary for now, but checked independently)
if (hasCuda) {
  try {
    cudaAddon = require(ADDON_PATHS.cuda);
    console.log('  ✓ CUDA addon loaded successfully');
    if (verbose && cudaAddon) {
      const exports = Object.keys(cudaAddon);
      console.log(`    Exports: ${exports.join(', ')}`);
    }
  } catch (err) {
    console.error(`  ❌ CUDA addon load failed: ${err.message}`);
    console.error('    → CUDA inference will not be available');
  }
}

console.log();

// ════════════════════════════════════════════════════════════════════════════
// Phase 3: Capability validation (independent per addon)
// ════════════════════════════════════════════════════════════════════════════

console.log('🧪 Phase 3: Capability Validation');
console.log('─'.repeat(50));

let simdWorking = false;
let cudaWorking = false;

// Test SIMD JSON parsing
if (simdAddon && typeof simdAddon.simdJsonParse === 'function') {
  try {
    const testObj = { name: 'test', values: [1, 2, 3], nested: { key: 'value' } };
    const jsonStr = JSON.stringify(testObj);

    const simdResult = simdAddon.simdJsonParse(jsonStr);
    const nativeResult = JSON.parse(jsonStr);

    if (JSON.stringify(simdResult) === JSON.stringify(nativeResult)) {
      console.log('  ✓ SIMD JSON parsing validated');
      simdWorking = true;
      if (verbose) {
        console.log(`    Input: ${jsonStr}`);
        console.log(`    Output: ${JSON.stringify(simdResult)}`);
      }
    } else {
      console.warn('  ⚠️  SIMD output differs from native JSON.parse');
    }
  } catch (err) {
    console.warn(`  ⚠️  SIMD JSON parse test failed: ${err.message}`);
  }
} else if (simdAddon) {
  console.warn('  ⚠️  simdJsonParse function not exported from addon');
}

// Test CUDA/LibTorch functionality
if (cudaAddon) {
  try {
    // Test 1: Check CUDA memory (non-destructive probe)
    if (typeof cudaAddon.isCudaAvailable === 'function') {
      const cudaAvailable = cudaAddon.isCudaAvailable();
      console.log(`  ✓ CUDA availability probe: ${cudaAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
      cudaWorking = cudaAvailable;
    }

    // Test 2: Try a simple tensor operation
    if (typeof cudaAddon.libtorchCosineSimilarity === 'function') {
      const vec1 = new Float32Array([1.0, 0.0, 0.0]);
      const vec2 = new Float32Array([1.0, 0.0, 0.0]);
      const similarity = cudaAddon.libtorchCosineSimilarity(vec1, vec2);

      if (similarity !== undefined && similarity !== null && Number.isFinite(similarity)) {
        console.log(`  ✓ LibTorch cosine similarity validated (result: ${similarity.toFixed(4)})`);
        cudaWorking = true;
        if (verbose) {
          console.log(`    Query vector: [1.0, 0.0, 0.0]`);
          console.log(`    Candidate vector: [1.0, 0.0, 0.0]`);
          console.log(`    Similarity: ${similarity}`);
        }
      } else {
        console.warn('  ⚠️  LibTorch cosine similarity returned invalid value');
      }
    }
  } catch (err) {
    console.error(`  ❌ CUDA test failed: ${err.message}`);
  }
}

console.log();

// ════════════════════════════════════════════════════════════════════════════
// Phase 4: Summary & Recommendations
// ════════════════════════════════════════════════════════════════════════════

console.log('📊 Phase 4: Capability Summary');
console.log('─'.repeat(50));

const status = {
  simd: simdWorking ? '✓ OPERATIONAL' : '⚠️  FALLBACK',
  cuda: cudaWorking ? '✓ OPERATIONAL' : '❌ UNAVAILABLE',
};

console.log(`  SIMD JSON Parser: ${status.simd}`);
console.log(`  CUDA/LibTorch:    ${status.cuda}`);

console.log('\n📋 Recommended Configuration:');
if (simdWorking) {
  console.log('  ✓ Use fastJsonParse() for Ollama/Qdrant responses >1KB');
} else {
  console.log('  ℹ️  Native JSON.parse() is sufficient (no addon available)');
}

if (cudaWorking) {
  console.log('  ✓ GPU inference enabled (cosine similarity, tensor ops)');
  console.log('  ℹ️  Use tensorrt_bridge.node for vector reranking');
} else {
  console.log('  ℹ️  GPU inference unavailable (CPU fallback only)');
}

console.log();

// ════════════════════════════════════════════════════════════════════════════
// Phase 5: Exit code determination
// ════════════════════════════════════════════════════════════════════════════

const hasWorkingAddon = simdWorking || cudaWorking;
const exitCode = hasWorkingAddon ? 0 : 1;

console.log(`🎯 Probe Result: ${exitCode === 0 ? '✓ PASS' : '❌ FAIL'}`);
console.log();

process.exit(exitCode);
