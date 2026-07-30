#!/usr/bin/env node
/**
 * LiteRT Dev Startup Orchestrator
 *
 * Starts npm run dev:gpu with LiteRT backend and opens LiteRT.js Mocap in VS Code
 *
 * Flow:
 * 1. Launch dev:gpu with DEV_GPU_LLM_BACKEND=litert (LiteRT-LM on :8070)
 * 2. Wait 3 seconds for startup
 * 3. Open LiteRT.js-Mocap workspace in a new VS Code window
 * 4. Display summary
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.resolve(REPO_ROOT, 'sveltekit-frontend');
const LITERT_MOCAP_PATH = path.resolve(
  process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\james',
  'Downloads/LiteRT.js-Mocap-main'
);

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║         LiteRT Dev Startup Orchestrator                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('[startup] Starting npm run dev:gpu with LiteRT backend...');
console.log(`[startup] Frontend root: ${FRONTEND_ROOT}`);
console.log(`[startup] LiteRT.js Mocap: ${LITERT_MOCAP_PATH}\n`);

// Launch dev:gpu with LiteRT backend in detached mode
const devGpuEnv = {
  ...process.env,
  DEV_GPU_LLM_BACKEND: 'litert',
  DEV_BYPASS_AUTH: 'true',
  DEV_GPU_ENABLE_MTP: 'false',
  PYTHONUNBUFFERED: '1',
};

const devGpuChild = spawn('npm', ['run', 'dev:gpu'], {
  cwd: FRONTEND_ROOT,
  env: devGpuEnv,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

console.log(`[startup] ✅ dev:gpu process spawned (PID ${devGpuChild.pid})`);
console.log('[startup] Output from dev:gpu:\n');

// Pipe output
devGpuChild.stdout?.on('data', (data) => {
  process.stdout.write(`[dev:gpu] ${data}`);
});

devGpuChild.stderr?.on('data', (data) => {
  process.stderr.write(`[dev:gpu] ${data}`);
});

devGpuChild.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[startup] ❌ dev:gpu exited with code ${code}`);
  }
});

// Detach the process so this script can exit
devGpuChild.unref();

// Wait for dev:gpu to start
await delay(3000);

console.log('\n[startup] Launching LiteRT.js-Mocap in VS Code...');

// Open LiteRT.js Mocap workspace in a new VS Code window
const vsCodeChild = spawn('code', [LITERT_MOCAP_PATH, '--new-window'], {
  stdio: 'inherit',
  detached: process.platform !== 'win32',
});

vsCodeChild.on('exit', (code) => {
  if (code !== 0) {
    console.warn(`[startup] ⚠️  VS Code exited with code ${code}`);
  }
});

// Summary
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║           LiteRT Dev Environment Started                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log('[startup] ✅ npm run dev:gpu (LiteRT-LM on :8070)');
console.log('[startup] ✅ LiteRT.js-Mocap workspace opened in VS Code');
console.log('[startup] ✅ Vite dev server will start on :5173\n');
console.log('Services:');
console.log('  • SvelteKit frontend:     http://localhost:5173');
console.log('  • LLM synthesis (LiteRT): http://127.0.0.1:8070/v1');
console.log('  • Embeddings (ONNX):      http://127.0.0.1:8081/v1');
console.log('  • LiteRT.js Mocap:        Check the VS Code window\n');
console.log('[startup] Press Ctrl+C to stop the dev server.\n');

// Keep the script alive to capture Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[startup] Shutting down...');
  process.exit(0);
});
