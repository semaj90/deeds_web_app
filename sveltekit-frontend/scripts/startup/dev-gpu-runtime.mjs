#!/usr/bin/env node
/**
 * Start the local GPU developer runtime, then run Vite in the foreground.
 *
 * Responsibilities:
 * - Gemma4 chat summaries: llama-server on :8090, 64K context, detached.
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
    TURBO_CTX: envFromFiles.TURBO_CTX ?? envFromFiles.LLAMA_SERVER_CTX ?? '65536',
    LLM_CONTEXT_SIZE: envFromFiles.LLM_CONTEXT_SIZE ?? envFromFiles.TURBO_CTX ?? envFromFiles.LLAMA_SERVER_CTX ?? '65536',
    TURBO_CTX_ALLOW_SHORT_CONTEXT: envFromFiles.TURBO_CTX_ALLOW_SHORT_CONTEXT ?? 'false',
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
      shell: process.platform === 'win32',  // Use shell on Windows for .cmd resolution
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
    shell: process.platform === 'win32',  // Use shell on Windows for .cmd resolution
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
  // Launch TurboQuant llama-server (Gemma4 at :8090)
  // On Windows, PowerShell subprocess must receive env vars via explicit shell command
  const launcherEnv = mergedEnv();
  const psEnvAssign = `$env:TURBO_CTX='${launcherEnv.TURBO_CTX}'; $env:LLM_CONTEXT_SIZE='${launcherEnv.LLM_CONTEXT_SIZE}'; $env:TURBO_CTX_ALLOW_SHORT_CONTEXT='${launcherEnv.TURBO_CTX_ALLOW_SHORT_CONTEXT}';`;
  const psCommand = `${psEnvAssign} & '${path.join(REPO_ROOT, 'scripts/launch-turboquant.ps1')}' -Detached -TextOnly`;

  await runChecked('pwsh', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    psCommand,
  ], { cwd: REPO_ROOT, env: launcherEnv });

  console.log('[dev:gpu] ✅ TurboQuant llama-server (Gemma4) active');

  // Try to start ONNX embedding server if available
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    await runChecked(npm, ['run', 'embed:onnx:start:detached'], {
      cwd: FRONTEND_ROOT,
      env: mergedEnv(),
    });
    console.log('[dev:gpu] ✅ ONNX Embedding server started on :8081');
  } catch (err) {
    console.log('[dev:gpu] ⚠️  ONNX Embedding server unavailable, using Ollama fallback');
    console.log('[dev:gpu] Will use Ollama embeddinggemma:latest at :11434/api');
  }

  console.log('[dev:gpu] --- GPU Runtime Ready ---');
  console.log('[dev:gpu] LLM (synthesis):  http://127.0.0.1:8090/v1');
  console.log('[dev:gpu] Embeddings (L1):  http://127.0.0.1:8081/v1/embeddings (ONNX)');
  console.log('[dev:gpu] Embeddings (L2):  http://127.0.0.1:11434/api (Ollama embeddinggemma)');

  // Ensure TRACE MCP server is running before Vite starts
  console.log('[dev:gpu] Starting TRACE MCP server (:8788)...');
  try {
    const { ensureTraceMcp } = await import('../ensure-mcp-server.mjs');
    const mcpReady = await ensureTraceMcp();
    if (mcpReady) {
      console.log('[dev:gpu] ✅ TRACE MCP server (:8788) ready');
    } else {
      console.warn('[dev:gpu] ⚠️  TRACE MCP server startup failed; continuing without it');
    }
  } catch (err) {
    console.warn('[dev:gpu] ⚠️  TRACE MCP server error:', err.message);
  }

  console.log('[dev:gpu] Starting Vite dev server (:5173)...\n');

  // Launch Vite dev server in foreground
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
