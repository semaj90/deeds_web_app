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
  const devGpuEnableMtp = String(
    extra.DEV_GPU_ENABLE_MTP ?? envFromFiles.DEV_GPU_ENABLE_MTP ?? process.env.DEV_GPU_ENABLE_MTP ?? 'false',
  ).toLowerCase() === 'true';

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
    // dev:gpu should boot the canonical 8090 synthesis lane reliably.
    // Speculative draft decoding remains available through the dedicated
    // turbo:* launchers, but it is not part of the default dev startup path.
    ENABLE_MTP_DRAFTER: devGpuEnableMtp ? (envFromFiles.ENABLE_MTP_DRAFTER ?? 'true') : 'false',
    MTP_DRAFT_MODEL: devGpuEnableMtp ? (envFromFiles.MTP_DRAFT_MODEL ?? process.env.MTP_DRAFT_MODEL ?? '') : '',
    ...extra,
  };
}

function runChecked(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[dev:gpu] ${command} ${args.join(' ')}`);
    // Never use shell:true for pwsh commands — cmd.exe wrapping breaks semicolons
    // in -Command strings. Pass pwsh.exe args directly via Node spawn.
    const useShell = process.platform === 'win32' && command !== 'pwsh' && command !== 'pwsh.exe';
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? mergedEnv(),
      stdio: options.stdio ?? 'inherit',
      shell: useShell,
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

async function isLlamaServerRunning(port = 8090) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function isTcpPortOpen(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const res = await fetch(`http://127.0.0.1:${port}`, {
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    return Boolean(res);
  } catch {
    return false;
  }
}

async function findFreePort(startPort) {
  let port = startPort;
  for (let i = 0; i < 20; i++, port++) {
    const open = await isTcpPortOpen(port);
    if (!open) return port;
  }
  return startPort;
}

async function main() {
  // Launch TurboQuant llama-server (Gemma4 at :8090) unless already running
  const turboPort = parseInt(process.env.TURBO_PORT ?? '8090');
  if (await isLlamaServerRunning(turboPort)) {
    console.log(`[dev:gpu] ✅ llama-server already running on :${turboPort} — skipping launch`);
  } else {
    if (String(process.env.DEV_GPU_ENABLE_MTP ?? 'false').toLowerCase() !== 'true') {
      console.log('[dev:gpu] MTP speculative decoding is disabled for dev:gpu; use turbo:* launchers for the benchmark lane.');
    }
    // Pass env vars directly through Node's env inheritance — PowerShell subprocess
    // will see them as $env:TURBO_CTX etc. without needing inline assignment.
    const launcherEnv = mergedEnv();
    const launcherScript = path.win32.join(REPO_ROOT, 'scripts', 'launch-turboquant.ps1');

    await runChecked('pwsh', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      launcherScript,
      '-Detached',
      '-TextOnly',
    ], { cwd: REPO_ROOT, env: launcherEnv });

    console.log('[dev:gpu] ✅ TurboQuant llama-server (Gemma4) active');
  }

  // Start ONNX embedding server unless already running on :8081
  const embedPort = parseInt(process.env.EMBED_SERVER_PORT ?? '8081');
  if (await isLlamaServerRunning(embedPort)) {
    console.log(`[dev:gpu] ✅ Embed server already running on :${embedPort} — skipping launch`);
  } else {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
      await runChecked(npm, ['run', 'embed:onnx:start:detached'], {
        cwd: FRONTEND_ROOT,
        env: mergedEnv(),
      });
      console.log('[dev:gpu] ✅ ONNX Embedding server started on :8081');
    } catch {
      console.log('[dev:gpu] ⚠️  ONNX Embedding server unavailable, using Ollama fallback');
      console.log('[dev:gpu] Will use Ollama embeddinggemma:latest at :11434/api');
    }
  }

  console.log('[dev:gpu] --- GPU Runtime Ready ---');
  console.log('[dev:gpu] LLM (synthesis):  http://127.0.0.1:8090/v1');
  console.log('[dev:gpu] Embeddings (L1):  http://127.0.0.1:8081/v1/embeddings (ONNX)');
  console.log('[dev:gpu] Embeddings (L2):  http://127.0.0.1:11434/api (Ollama embeddinggemma)');

  // Check graphify readiness (advisory only, non-blocking)
  console.log('[dev:gpu] Checking graphify readiness...');
  try {
    const graphifyCheck = await fetch('http://127.0.0.1:5173/api/graphify/status', {
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    if (graphifyCheck?.ok) {
      const data = await graphifyCheck.json();
      const coreStatus = data.status?.coreStructural ?? 'unknown';
      console.log(`[dev:gpu] ✅ Graphify core: ${coreStatus}`);
      if (coreStatus !== 'PASS') {
        console.log('[dev:gpu] ⚠️  Advisory: Some graphify lanes are degraded.');
        console.log('[dev:gpu]    View: http://localhost:5173/admin/graphify-readiness');
      }
    } else {
      console.log('[dev:gpu] ℹ️  Graphify status check skipped (SvelteKit not yet up)');
    }
  } catch {
    console.log('[dev:gpu] ℹ️  Graphify readiness check unavailable');
  }

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

  const desiredVitePort = parseInt(process.env.VITE_PORT ?? '5173', 10);
  const vitePort = await findFreePort(desiredVitePort);
  if (vitePort !== desiredVitePort) {
    console.log(`[dev:gpu] :${desiredVitePort} is busy — starting Vite on :${vitePort}`);
  } else {
    console.log(`[dev:gpu] Starting Vite dev server (:${vitePort})...\n`);
  }

  // Launch downstream pipeline orchestrator in background (after Vite warmup)
  const orchestratorScript = path.resolve(REPO_ROOT, 'scripts/atlas/graphify-trigger-downstream-pipeline.mjs');
  const orchestratorEnv = mergedEnv({ SVELTEKIT_URL: `http://127.0.0.1:${vitePort}` });
  const orchestratorChild = spawn('node', [orchestratorScript, '--wait-ready', '--verbose'], {
    cwd: REPO_ROOT,
    env: orchestratorEnv,
    detached: process.platform !== 'win32', // Allow backgrounding on Unix
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  orchestratorChild.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => console.log(`[orchestrator] ${line}`));
  });

  orchestratorChild.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => console.error(`[orchestrator] ${line}`));
  });

  orchestratorChild.on('exit', (code) => {
    if (code !== 0) {
      console.log(`[orchestrator] Exited with code ${code}`);
    } else {
      console.log(`[orchestrator] ✅ Pipeline complete`);
    }
  });

  // Unref the orchestrator so it doesn't keep the process alive
  if (orchestratorChild.unref) orchestratorChild.unref();

  console.log('[dev:gpu] Downstream pipeline orchestrator started (background)\n');

  // Launch Vite dev server in foreground
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  spawnForeground(npx, ['vite', 'dev', '--port', String(vitePort)], {
    cwd: FRONTEND_ROOT,
    env: mergedEnv({ VITE_PORT: String(vitePort) }),
  });
}

main().catch((error) => {
  console.error(`[dev:gpu] ${error.stack || error.message}`);
  process.exit(1);
});
