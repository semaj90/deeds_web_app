#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let bridge = null;
let bridgePath = null;
let bridgeError = null;

const candidates = [
  path.resolve(__dirname, '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  path.resolve(__dirname, '../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  path.resolve(__dirname, '../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
];

for (const candidate of candidates) {
  try {
    bridge = require(candidate);
    bridgePath = candidate;
    break;
  } catch (error) {
    bridgeError = error;
  }
}

function hasSimdJson() {
  return Boolean(bridge && typeof bridge.simdJsonParse === 'function');
}

function hasCuda() {
  try {
    return Boolean(bridge && typeof bridge.isCudaAvailable === 'function' && bridge.isCudaAvailable());
  } catch {
    return false;
  }
}

export function getNativeBridgeStatus() {
  return {
    loaded: Boolean(bridge),
    bridgePath,
    avx2SimdJson: hasSimdJson(),
    cuda: hasCuda(),
    bridgeError: bridgeError instanceof Error ? bridgeError.message : null,
  };
}

export function parseJsonFast(rawText) {
  const text = String(rawText ?? '');
  if (!text) return null;

  if (hasSimdJson()) {
    try {
      const parsed = bridge.simdJsonParse(text);
      if (typeof parsed === 'string') return JSON.parse(parsed);
      return parsed;
    } catch {
      // fallback below
    }
  }

  return JSON.parse(text);
}
