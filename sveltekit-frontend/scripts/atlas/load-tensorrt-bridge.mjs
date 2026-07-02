#!/usr/bin/env node
/**
 * TensorRT Bridge Loader
 *
 * Bridges ESM scripts to CommonJS/native tensorrt_bridge.node addon.
 * Returns the bridge module if available, null otherwise.
 *
 * Shape contract: 40,568 × 384 fp32
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export function loadTensorRTBridge() {
  const candidates = [
    // From scripts/atlas/ location
    path.resolve(__dirname, '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    // Fallback paths
    path.resolve(__dirname, '../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    path.resolve('build/Release/tensorrt_bridge.node')
  ];

  for (const candidatePath of candidates) {
    try {
      const addon = require(candidatePath);
      return addon;
    } catch (e) {
      // Silently try next candidate
    }
  }

  return null;
}

export function getBridgeInfo(addon) {
  if (!addon) {
    return {
      available: false,
      reason: 'tensorrt_bridge.node not found'
    };
  }

  try {
    const cudaAvailable = typeof addon.isCudaAvailable === 'function' ? addon.isCudaAvailable() : false;
    return {
      available: true,
      cudaAvailable,
      exports: Object.keys(addon)
    };
  } catch (e) {
    return {
      available: false,
      reason: `Error checking bridge: ${e.message}`
    };
  }
}
