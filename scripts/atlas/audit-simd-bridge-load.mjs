#!/usr/bin/env node

/**
 * Audit SIMD Bridge N-API Addon Load Path
 *
 * Verifies that tensorrt_bridge.node can be loaded by Node.js
 * and that GPU functions are accessible.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

console.log('[audit-simd-bridge-load] Starting...');
console.log('[audit-simd-bridge-load] Project root:', projectRoot);

const addonPath = resolve(projectRoot, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
console.log('[audit-simd-bridge-load] Addon path:', addonPath);

try {
  // Try to load addon using require (CommonJS-compatible)
  const Module = await import('module');
  const addon = Module.createRequire(import.meta.url)(addonPath);
  
  console.log('✅ ADDON LOADED');
  console.log('[audit-simd-bridge-load] Exported functions:');
  
  const functions = Object.keys(addon);
  if (functions.length === 0) {
    console.log('  ⚠️  No functions exported from addon');
  } else {
    functions.forEach(fn => {
      console.log(`  - ${fn}: ${typeof addon[fn]}`);
    });
  }
  
  // Test a simple function if available
  if (typeof addon.isCudaAvailable === 'function') {
    try {
      const cudaAvailable = addon.isCudaAvailable();
      console.log(`\n✅ CUDA available: ${cudaAvailable}`);
    } catch (err) {
      console.log(`\n⚠️  Error calling isCudaAvailable:`, err.message);
    }
  }
  
} catch (err) {
  console.log('❌ ADDON LOAD FAILED');
  console.log('[audit-simd-bridge-load] Error:', err.message);
  console.log('[audit-simd-bridge-load] Stack:', err.stack);
  process.exit(1);
}

console.log('[audit-simd-bridge-load] Done');
