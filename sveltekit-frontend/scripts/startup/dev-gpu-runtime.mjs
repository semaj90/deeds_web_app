#!/usr/bin/env node
/**
 * Start the local GPU developer runtime, then run Vite in the foreground.
 *
 * Responsibilities:
 * - Gemma4 chat summaries: llama-server on :8090, 16k context, detached.
 * - EmbeddingGemma embeddings: ONNX/OpenAI-compatible server on :8081, detached.
 * - SvelteKit: Vite dev in the current terminal.
 *
 * The servers are intentionally helpers, not truth stores. Postgres remains the
 * canonical packet/summary envelope.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv } from '../../../scripts/atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const envFromFiles = loadRepoEnv(process.env);

function mergedEnv(extra = {}) {
  return {
    ...process.env,
    ...envFromFiles,
    GPU_ENABLED: 'true',
    VITE_GPU_ENABLED: 'true',
    CUDA_VISIBLE_DEVICES: envFromFiles.CUDA_VISIBLE_DEVICES ?? '0',
    OLLAMA_EMBED_BASE_URL: envFromFiles.OLLAMA_EMBED_BASE_URL ?? envFromFiles.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081',
    EMBED_SERVER_URL: envFromFiles.EMBED_SERVER_URL ?? envFromFiles.OLLAMA_EMBED_BASE_URL ?? 'http://127.0.0.1:8081',
    EMBED_BACKEND: envFromFiles.EMBED_BACKEND ?? 'onnx',
    EMBED_SERVER_PORT: envFromFiles.EMBED_SERVER_PORT ?? '8081',
    EMBED_MAX_BATCH: envFromFiles.EMBED_MAX_BATCH ?? '64',
    LOCAL_OPENAI_BASE_URL: envFromFiles.LOCAL_OPENAI_BASE_URL ?? 'http://127.0.0.1:8090/v1',
    LOCAL_OPENAI_API_KEY: envFromFiles.LOCAL_OPENAI_API_KEY ?? 'local',
    LOCAL_GEMMA_MODEL: envFromFiles.LOCAL_GEMMA_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf',
    TURBO_PORT: envFromFiles.TURBO_PORT ?? '8090',
    TURBO_CTX: envFromFiles.TURBO_CTX ?? envFromFiles.LLAMA_SERVER_CTX ?? '16384',
    LLM_CONTEXT_SIZE: envFromFiles.LLM_CONTEXT_SIZE ?? envFromFiles.TURBO_CTX ?? envFromFiles.LLAMA_SERVER_CTX ?? '16384',
    TURBO_CTX_ALLOW_SHORT_CONTEXT: envFromFiles.TURBO_CTX_ALLOW_SHORT_CONTEXT ?? 'true',
    TURBO_PARALLEL: envFromFiles.TURBO_PARALLEL ?? '1',
    TURBO_BATCH_SIZE: envFromFiles.TURBO_BATCH_SIZE ?? '512',
    TURBO_UBATCH_SIZE: envFromFiles.TURBO_UBATCH_SIZE ?? '128',
    ...extra,
  };
}

function runChecked(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[dev:gpu] ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? mergedEnv(),
      stdio: options.stdio ?? 'inherit',
      shell: false,
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

function spawnForeground(command, args, options = {}) {
  console.log(`[dev:gpu] ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: options.cwd ?? FRONTEND_ROOT,
    env: options.env ?? mergedEnv(),
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
  child.on('error', (error) => {
    console.error(`[dev:gpu] failed to start ${command}: ${error.message}`);
    process.exit(1);
  });
}

async function main() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  await runChecked('pwsh', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(REPO_ROOT, 'scripts/launch-turboquant.ps1'),
    '-Detached',
    '-TextOnly',
  ], { cwd: REPO_ROOT, env: mergedEnv() });

  await runChecked(npm, ['run', 'embed:onnx:start:detached'], {
    cwd: REPO_ROOT,
    env: mergedEnv(),
  });

  console.log('[dev:gpu] Gemma4 llama-server and ONNX EmbeddingGemma startup checks completed.');
  console.log('[dev:gpu] Summary text: http://127.0.0.1:8090/v1/chat/completions');
  console.log('[dev:gpu] Embeddings:   http://127.0.0.1:8081/v1/embeddings');

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  spawnForeground(npx, ['vite', 'dev'], {
    cwd: FRONTEND_ROOT,
    env: mergedEnv(),
  });
}

main().catch((error) => {
  console.error(`[dev:gpu] ${error.stack || error.message}`);
  process.exit(1);
});
