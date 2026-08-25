#!/usr/bin/env node
/** Run the native bridge evaluation against the explicit CUDA build. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const addon = path.join(root, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node');
const test = path.join(root, 'simd-bridge/cpp/test-addon.cjs');

if (!existsSync(addon)) {
  console.error(`CUDA addon not found: ${addon}`);
  console.error('Build it with: cmake --build simd-bridge/cpp/build-x64-cuda --config Release --target tensorrt_bridge');
  process.exitCode = 2;
} else {
  const result = spawnSync(process.execPath, [test], {
    cwd: root,
    env: { ...process.env, ATLAS_ADDON_PATH: addon },
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
