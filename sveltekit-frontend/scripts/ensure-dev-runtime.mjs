#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawn }      from 'node:child_process';
import path           from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptName = process.argv[2] || 'dev';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const requiredPackages = ['cross-env', 'vite'];
const missing = [];

for (const pkg of requiredPackages) {
  const packageJsonPath = path.join(projectRoot, 'node_modules', ...pkg.split('/'), 'package.json');
  if (!existsSync(packageJsonPath)) {
    missing.push(pkg);
  }
}

if (missing.length === 0) {
  const assetChecks = [
    ['Gemma 3 270M ONNX', path.join(projectRoot, 'static', 'gemma3_270m_onnx', 'gemma3_270m_w8a16.onnx')],
    ['Gemma 3 client ONNX', path.join(projectRoot, 'static', 'gemma3_270m_onnx', 'gemma3_client_quantized.onnx')],
    ['EmbeddingGemma ONNX', path.join(projectRoot, 'static', 'embeddinggemma_300m_onnx', 'model.onnx')],
    ['ORT WASM SIMD', path.join(projectRoot, 'static', 'ort', 'ort-wasm-simd-threaded.wasm')],
    ['Vector ops WASM', path.join(projectRoot, 'static', 'wasm', 'vector-ops.wasm')],
  ];

  for (const [label, filePath] of assetChecks) {
    if (!existsSync(filePath)) {
      if (label === 'Vector ops WASM') {
        const build = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:wasm'], {
          stdio: 'inherit',
          cwd: projectRoot,
          env: { ...process.env },
        });
        const exitCode = await new Promise((resolve) => build.on('close', resolve));
        if (exitCode !== 0) {
          process.exit(typeof exitCode === 'number' ? exitCode : 1);
        }
        continue;
      }

      console.warn(`[ensure-dev-runtime] Missing ${label} at ${filePath}`);
    } else {
      console.log(`[ensure-dev-runtime] ${label} already built`);
    }
  }

  console.log('[ensure-dev-runtime] Gemma 4 ONNX path is remote E2B (onnx-community/gemma-4-E2B-it-ONNX); no local static build check required');

  // ── Detached background services (same pattern as llama-server.exe) ──
  const bgScripts = [
    path.join(scriptDir, 'ensure-search-engine.mjs'),
    path.join(scriptDir, 'ensure-mcp-server.mjs'),
    path.join(scriptDir, 'ensure-kb-retrieval-server.mjs'),
  ];
  for (const script of bgScripts) {
    if (existsSync(script)) {
      const child = spawn(process.execPath, [script, '--spawn'], {
        detached:    true,
        stdio:       'ignore',
        windowsHide: true,
      });
      child.unref();
    }
  }
  process.exit(0);
}

console.error('');
console.error(`Cannot run npm run ${scriptName}: missing required development packages.`);
console.error(`Missing: ${missing.join(', ')}`);
console.error('');
console.error('This repo needs a full development install inside sveltekit-frontend.');
console.error('Do not use npm ci --omit=dev, npm ci --only=production, or NODE_ENV=production for local dev.');
console.error('');
console.error('Run:');
console.error('  cd sveltekit-frontend');
console.error('  npm ci');
console.error('');
console.error('For production images, build and run the adapter-node output instead of npm run dev.');
process.exit(1);
