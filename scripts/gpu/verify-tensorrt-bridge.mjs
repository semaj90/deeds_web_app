#!/usr/bin/env node
/**
 * verify-tensorrt-bridge.mjs
 *
 * Non-blocking GPU bridge health check.
 * Probes tensorrt_bridge.node availability and CUDA/LibTorch status.
 * Startup continues regardless of result (CPU fallback always available).
 *
 * Usage:
 *   node scripts/gpu/verify-tensorrt-bridge.mjs
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Use require for .node files (ESM import doesn't support them)
const require = createRequire(import.meta.url);

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

log(`${c.b('🔧 TensorRT Bridge Health Check')}`);

const checks = {
  bridge_binary: false,
  addon_loads: false,
  simdjson_works: false,
  libtorch_works: false,
  cuda_available: false,
};

let addon = null;

// ─────────────────────────────────────────────────────────────────

// G1: Binary exists
const bridgePath = resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
try {
  const stat = statSync(bridgePath);
  if (stat.isFile() && stat.size > 0) {
    checks.bridge_binary = true;
    log(`  ${c.g('✓')} Binary exists: ${bridgePath} (${(stat.size / 1024).toFixed(1)} KB)`);
  }
} catch (err) {
  warn(`  ${c.r('✗')} Binary not found: ${bridgePath}`);
}

// ─────────────────────────────────────────────────────────────────

// G2: Addon loads
if (checks.bridge_binary) {
  try {
    addon = require(bridgePath);
    if (addon && typeof addon === 'object') {
      checks.addon_loads = true;
      log(`  ${c.g('✓')} Addon loaded successfully`);
      log(`     Exported functions: ${Object.keys(addon).join(', ')}`);
    }
  } catch (err) {
    warn(`  ${c.r('✗')} Addon load failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────

// G3: simdjson function available
if (addon && typeof addon.simdJsonParse === 'function') {
  checks.simdjson_works = true;
  log(`  ${c.g('✓')} simdjson simdJsonParse available`);

  // Quick test
  const testJson = JSON.stringify({ test: 'value', num: 42 });
  try {
    const result = addon.simdJsonParse(testJson);
    if (result && result.test === 'value') {
      log(`     Test parse: PASS`);
    }
  } catch (parseErr) {
    warn(`     Test parse: FAIL (${parseErr.message})`);
  }
}

// ─────────────────────────────────────────────────────────────────

// G4: LibTorch functions available
if (addon) {
  const torchFns = [
    'computeGpuSimilarity',
    'kmeansWithCentroids',
    'trainSOM',
    'pageRankGPU',
    'attentionScoreGPU',
  ];
  const available = torchFns.filter((fn) => typeof addon[fn] === 'function');

  if (available.length > 0) {
    checks.libtorch_works = true;
    log(`  ${c.g('✓')} LibTorch functions available (${available.length}/${torchFns.length})`);
    log(`     ${available.join(', ')}`);
  } else {
    warn(`  ${c.y('⚠')} No LibTorch functions found`);
  }
}

// ─────────────────────────────────────────────────────────────────

// G5: CUDA availability
if (addon && typeof addon.checkCudaAvailable === 'function') {
  try {
    const cudaOk = addon.checkCudaAvailable();
    if (cudaOk) {
      checks.cuda_available = true;
      log(`  ${c.g('✓')} CUDA available`);
    } else {
      warn(`  ${c.y('⚠')} CUDA not available (CPU fallback active)`);
    }
  } catch (err) {
    warn(`  ${c.y('⚠')} CUDA check error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────

log(`\n${c.b('Results')}:`);
const summary = [
  ['Binary exists', checks.bridge_binary],
  ['Addon loads', checks.addon_loads],
  ['simdjson works', checks.simdjson_works],
  ['LibTorch works', checks.libtorch_works],
  ['CUDA available', checks.cuda_available],
];

for (const [label, ok] of summary) {
  log(`  ${ok ? c.g('✓') : c.y('⚠')} ${label}`);
}

const passCount = Object.values(checks).filter(Boolean).length;
const totalCount = Object.values(checks).length;

log(`\n${c.b('Summary')}: ${passCount}/${totalCount} checks passed`);

if (checks.addon_loads && (checks.simdjson_works || checks.libtorch_works)) {
  log(`${c.g('✓')} Bridge is functional. GPU acceleration available.')}`);
  process.exit(0);
} else if (checks.addon_loads) {
  log(`${c.y('⚠')} Bridge loaded but functions not detected. CPU-only mode.')}`);
  process.exit(0);
} else {
  log(`${c.y('⚠')} Bridge unavailable. Starting with CPU fallback.')}`);
  process.exit(0);
}
