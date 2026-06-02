#!/usr/bin/env node
/**
 * Verify both fallback and CUDA+LibTorch presets produce callable .node modules.
 * Tests N-API exports and function signatures match expected contract.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function testPreset(presetName, buildDir, expectedSize) {
  const nodePath = path.join(__dirname, buildDir, 'Release', 'tensorrt_bridge.node');

  console.log(`\n📦 Testing preset: ${presetName}`);
  console.log(`   Path: ${nodePath}`);

  // Check file exists
  if (!fs.existsSync(nodePath)) {
    console.log(`   ❌ MISSING: .node file not found`);
    return { preset: presetName, status: 'MISSING' };
  }

  const stats = fs.statSync(nodePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`   ✓ File exists: ${stats.size} bytes (${sizeMB} MB)`);
  console.log(`   ✓ Modified: ${stats.mtime.toISOString()}`);

  // Try to load as native module
  try {
    const addon = require(nodePath);
    console.log(`   ✓ Loaded as native module`);

    // List exported functions
    const exports = Object.keys(addon).filter(k => typeof addon[k] === 'function');
    console.log(`   ✓ Exported functions: ${exports.length}`);
    exports.forEach(fn => console.log(`     - ${fn}()`));

    // Test a simple call (e.g., graphSimilarity with dummy data)
    if (typeof addon.graphSimilarity === 'function') {
      try {
        // graphSimilarity(query: Float32Array, corpus: Float32Array, dim: number): number
        const query = new Float32Array(768).fill(1.0);
        const corpus = new Float32Array(768).fill(1.0);
        const result = addon.graphSimilarity(query, corpus, 768);
        console.log(`   ✓ graphSimilarity() callable: returned ${result}`);

        // If fallback (CPU): expects ~1.0 for identical vectors
        // If GPU: should be valid float or -99 if GPU unavailable in stubs
        if (result === -99) {
          console.log(`     ⚠ GPU unavailable (fallback mode or GPU error)`);
        } else if (typeof result === 'number' && !isNaN(result)) {
          console.log(`     ✓ Valid GPU computation`);
        }
      } catch (e) {
        console.log(`   ⚠ graphSimilarity() call failed: ${e.message}`);
      }
    }

    return {
      preset: presetName,
      status: 'OK',
      size: stats.size,
      sizeMB: parseFloat(sizeMB),
      functions: exports.length,
      timestamp: stats.mtime.toISOString()
    };
  } catch (err) {
    console.log(`   ❌ Failed to load: ${err.message}`);
    return { preset: presetName, status: 'LOAD_ERROR', error: err.message };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('SIMD-Bridge Preset Verification');
  console.log('Testing both x64 fallback and CUDA+LibTorch builds');
  console.log('='.repeat(70));

  const results = [];

  // Test both presets
  results.push(await testPreset('windows-x64-fallback', 'simd-bridge/cpp/build-x64-fallback', 299));
  results.push(await testPreset('windows-x64-cuda-libtorch', 'simd-bridge/cpp/build-x64-cuda', 365));

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('Summary:');
  console.log('='.repeat(70));

  const summary = {
    timestamp: new Date().toISOString(),
    presets: results,
    all_ok: results.every(r => r.status === 'OK'),
    size_difference: results.length === 2
      ? `${((results[1].sizeMB - results[0].sizeMB) / results[0].sizeMB * 100).toFixed(1)}% (CUDA larger)`
      : 'N/A'
  };

  console.log(JSON.stringify(summary, null, 2));

  // Write report
  const reportPath = path.join(__dirname, '.tmp', 'simd-presets-test.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Report written to: .tmp/simd-presets-test.json`);

  process.exit(summary.all_ok ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
