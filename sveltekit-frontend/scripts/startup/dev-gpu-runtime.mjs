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
import net from 'node:net';
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

  const devGpuLlmBackend = String(
    extra.DEV_GPU_LLM_BACKEND ?? envFromFiles.DEV_GPU_LLM_BACKEND ?? process.env.DEV_GPU_LLM_BACKEND ?? 'llama-server',
  ).toLowerCase();

  const isLiteRT = devGpuLlmBackend === 'litert';
  const synthPort = isLiteRT ? '8070' : '8090';

  // Only point the app at the :8081 GGUF embed server when it's been opted
  // into (DEV_GPU_EMBED_SERVER=onnx). Otherwise leave OLLAMA_EMBED_BASE_URL
  // unset so embedding-client.ts's Tier-0 probe is skipped entirely (rather
  // than dialing a dead :8081 on every embed call) and Ollama is used directly.
  const wantOnnxEmbedServer = String(
    extra.DEV_GPU_EMBED_SERVER ?? envFromFiles.DEV_GPU_EMBED_SERVER ?? process.env.DEV_GPU_EMBED_SERVER ?? 'ollama',
  ).toLowerCase() === 'onnx';

  return {
    ...process.env,
    ...envFromFiles,
    GPU_ENABLED: 'true',
    VITE_GPU_ENABLED: 'true',
    CUDA_VISIBLE_DEVICES: envFromFiles.CUDA_VISIBLE_DEVICES ?? '0',
    // Explicit undefined (not omission) so a leftover value from process.env
    // or envFromFiles is actually cleared for the child process, not inherited.
    OLLAMA_EMBED_BASE_URL: wantOnnxEmbedServer
      ? (envFromFiles.OLLAMA_EMBED_BASE_URL ?? envFromFiles.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081')
      : undefined,
    EMBED_SERVER_URL: wantOnnxEmbedServer
      ? (envFromFiles.EMBED_SERVER_URL ?? envFromFiles.OLLAMA_EMBED_BASE_URL ?? 'http://127.0.0.1:8081')
      : undefined,
    EMBED_BACKEND: envFromFiles.EMBED_BACKEND ?? 'onnx',
    EMBED_SERVER_PORT: envFromFiles.EMBED_SERVER_PORT ?? '8081',
    EMBED_MAX_BATCH: envFromFiles.EMBED_MAX_BATCH ?? '64',
    MINIFORGE_SIDECAR_URL: envFromFiles.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095',
    DEV_GPU_LLM_BACKEND: devGpuLlmBackend,
    LOCAL_OPENAI_BASE_URL: envFromFiles.LOCAL_OPENAI_BASE_URL ?? `http://127.0.0.1:${synthPort}/v1`,
    LOCAL_OPENAI_API_KEY: envFromFiles.LOCAL_OPENAI_API_KEY ?? 'local',
    LOCAL_GEMMA_MODEL: envFromFiles.LOCAL_GEMMA_MODEL ?? (isLiteRT ? 'gemma-4-E2B-it.litertlm' : 'gemma4-legal-iq4xs-direct.gguf'),
    TURBO_PORT: isLiteRT ? synthPort : (envFromFiles.TURBO_PORT ?? '8090'),
    TURBO_CTX: envFromFiles.TURBO_CTX ?? envFromFiles.LLAMA_SERVER_CTX ?? '65536',
    LLM_CONTEXT_SIZE: envFromFiles.LLM_CONTEXT_SIZE ?? envFromFiles.TURBO_CTX ?? envFromFiles.LLAMA_SERVER_CTX ?? '65536',
    TURBO_CTX_ALLOW_SHORT_CONTEXT: envFromFiles.TURBO_CTX_ALLOW_SHORT_CONTEXT ?? 'false',
    TURBO_PARALLEL: envFromFiles.TURBO_PARALLEL ?? '1',
    TURBO_BATCH_SIZE: envFromFiles.TURBO_BATCH_SIZE ?? '512',
    TURBO_UBATCH_SIZE: envFromFiles.TURBO_UBATCH_SIZE ?? '128',
    // dev:gpu should boot the canonical synthesis lane reliably.
    // Backend (llama-server or LiteRT) runs on either :8090 or :8070.
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

/**
 * VRAM advisory check (not a hard gate). Warns when free VRAM looks too low
 * for another ~6-8GB GGUF load, which is the signature of a second
 * llama-server racing to start against an already-loaded one from a
 * separate VS Code background task. launch-turboquant.ps1 kills the old
 * process before respawning when IT detects a mismatch, so this check only
 * catches the narrower cross-process race window before that happens.
 */
async function checkVramHeadroom(minFreeMb = 5000) {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=memory.free,memory.used', '--format=csv,noheader,nounits',
    ], { timeout: 3000 });
    const [freeMb, usedMb] = stdout.trim().split(',').map((v) => Number(v.trim()));
    if (Number.isFinite(freeMb) && freeMb < minFreeMb) {
      console.warn(`[dev:gpu] ⚠️  VRAM advisory: ${freeMb}MB free (${usedMb}MB used) — below ${minFreeMb}MB headroom. If launch-turboquant.ps1 is about to load a fresh model rather than reuse a healthy one, this may indicate a second process is already holding VRAM (duplicate-process risk). Proceeding — the launcher's own model-alias check will kill a stale process before respawning if needed.`);
    }
  } catch {
    // nvidia-smi unavailable or timed out — advisory only, never block startup on this
  }
}

/**
 * Detect duplicate llama-server.exe processes (Windows only). Only one
 * process can bind :8090, but a second/third instance can still be alive
 * holding VRAM without ever binding a port (stale, crashed mid-load, or
 * started against a different port) -- exactly the shape of process found
 * live during this session's investigation (2 llama-server.exe: one ~1KB
 * stub, one ~1GB resident). Log-only; does not kill anything here --
 * launch-turboquant.ps1 owns the port-8090 process lifecycle.
 */
async function checkForDuplicateLlamaServerProcesses() {
  if (process.platform !== 'win32') return;
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('tasklist', [
      '/FI', 'IMAGENAME eq llama-server.exe', '/FO', 'CSV', '/NH',
    ], { timeout: 5000 });
    const lines = stdout.trim().split('\n').filter((l) => l.includes('llama-server.exe'));
    if (lines.length === 0) return;
    const procs = lines.map((line) => {
      const cols = line.split('","').map((c) => c.replace(/(^")|("$)/g, ''));
      return { pid: cols[1], memUsage: cols[4] };
    });
    if (procs.length > 1) {
      console.warn(
        `[dev:gpu] ⚠️  ${procs.length} llama-server.exe processes found: ` +
        procs.map((p) => `PID ${p.pid} (${p.memUsage})`).join(', ') +
        ' — only one can bind :8090; the rest are dead weight on VRAM/RAM. ' +
        'launch-turboquant.ps1 only manages the process bound to the target port; ' +
        'kill orphans manually if this persists across restarts.',
      );
    } else {
      console.log(`[dev:gpu] llama-server.exe already running (PID ${procs[0].pid}, ${procs[0].memUsage})`);
    }
  } catch {
    // tasklist unavailable/failed — advisory only, never block startup on this
  }
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

async function isMiniforgeNlpRunning(port = 8095) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.status === 'ok' && data?.model === 'miniforge-nlp-sidecar';
  } catch {
    return false;
  }
}

async function isTcpPortOpen(port) {
  try {
    return await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      const finish = (value) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(value);
      };
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(500, () => finish(false));
    });
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
  // Determine LLM backend: llama-server (default) or litert
  const llmBackend = String(process.env.DEV_GPU_LLM_BACKEND ?? 'llama-server').toLowerCase();
  const isLiteRT = llmBackend === 'litert';

  // Backend-specific ports and URLs
  const synthPort = isLiteRT ? 8070 : 8090;
  const llmUrl = isLiteRT ? 'http://127.0.0.1:8070/v1' : 'http://127.0.0.1:8090/v1';

  // Launch LLM backend (LiteRT or TurboQuant llama-server).
  //
  // llama-server ALWAYS delegates to launch-turboquant.ps1, even when
  // isLlamaServerRunning() sees a healthy /health response. That check only
  // proves *something* is listening on :8090 — not that it's the right
  // model. launch-turboquant.ps1's own health check verifies model_alias +
  // chat template + tool support and exits fast (~2-3s) when already
  // correct, or restarts when it isn't. Skipping that call on a crude
  // /health 200 is exactly what let a stale wrong-model process (hforf.gguf
  // running without the correct chat template) masquerade as "already
  // running" and go unnoticed — see docs/reports/llama-server-restart-2026-08-04.log.
  //
  // LiteRT has no equivalent verification endpoint, so it keeps the
  // cheaper /health-only skip.
  const litertAlreadyRunning = isLiteRT && (await isLlamaServerRunning(synthPort));
  if (litertAlreadyRunning) {
    console.log(`[dev:gpu] ✅ LiteRT already running on :${synthPort} — skipping launch`);
  } else {
    if (isLiteRT) {
      // Launch LiteRT via system Python
      console.log('[dev:gpu] Launching LiteRT-LM (Gemma4) via system Python...');

      try {
        // Determine Python executable
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const litertScript = path.resolve(REPO_ROOT, 'scripts', 'litert-serve.py');
        const backend = String(process.env.CUDA_VISIBLE_DEVICES ?? '0') !== '' ? 'gpu' : 'cpu';

        await runChecked(pythonCmd, [
          litertScript,
          '--port', String(synthPort),
          '--backend', backend,
          '--model', process.env.LOCAL_GEMMA_MODEL ?? 'gemma-4-E2B-it.litertlm',
        ], {
          cwd: REPO_ROOT,
          env: mergedEnv({
            PYTHONUNBUFFERED: '1',
            CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES ?? '0',
          }),
        });

        console.log(`[dev:gpu] ✅ LiteRT-LM (Gemma4) active on :${synthPort}`);
      } catch (error) {
        console.error(`[dev:gpu] ❌ LiteRT launch failed: ${error.message}`);
        console.log('[dev:gpu] Falling back to llama-server (TurboQuant)...');

        // Fallback to llama-server
        if (String(process.env.DEV_GPU_ENABLE_MTP ?? 'false').toLowerCase() !== 'true') {
          console.log('[dev:gpu] MTP speculative decoding is disabled for dev:gpu; use turbo:* launchers for the benchmark lane.');
        }

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

        console.log('[dev:gpu] ✅ TurboQuant llama-server (Gemma4) active on :8090');
      }
    } else {
      // Launch TurboQuant llama-server (Gemma4 at :8090)
      if (String(process.env.DEV_GPU_ENABLE_MTP ?? 'false').toLowerCase() !== 'true') {
        console.log('[dev:gpu] MTP speculative decoding is disabled for dev:gpu; use turbo:* launchers for the benchmark lane.');
      }

      // Pass env vars directly through Node's env inheritance — PowerShell subprocess
      // will see them as $env:TURBO_CTX etc. without needing inline assignment.
      const launcherEnv = mergedEnv();
      const launcherScript = path.win32.join(REPO_ROOT, 'scripts', 'launch-turboquant.ps1');

      await checkForDuplicateLlamaServerProcesses();
      await checkVramHeadroom();
      await runChecked('pwsh', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        launcherScript,
        '-Detached',
        '-TextOnly',
      ], { cwd: REPO_ROOT, env: launcherEnv });

      console.log('[dev:gpu] ✅ TurboQuant llama-server (Gemma4) active on :8090');
    }
  }

  // The GGUF embed server on :8081 is opt-in only — it's a second GPU-resident
  // model competing with the :8090 chat model for the same 8GB card. Ollama
  // already serves embeddinggemma:latest on-demand (loads on first request,
  // unloads after its idle keep-alive) so it's the right default for routine
  // dev. Set DEV_GPU_EMBED_SERVER=onnx to eagerly start :8081 for sessions
  // doing heavy bulk-embedding work (graphify backfills, batch indexing) that
  // want its higher-throughput batch endpoint. embedding-client.ts's Tier-0
  // probe already fails over to Ollama near-instantly when :8081 isn't up.
  const embedPort = parseInt(process.env.EMBED_SERVER_PORT ?? '8081');
  const wantEmbedServer = String(process.env.DEV_GPU_EMBED_SERVER ?? 'ollama').toLowerCase() === 'onnx';
  if (await isLlamaServerRunning(embedPort)) {
    console.log(`[dev:gpu] ✅ Embed server already running on :${embedPort} — leaving it up`);
  } else if (wantEmbedServer) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
      await runChecked(npm, ['run', 'embed:onnx:start:detached'], {
        cwd: FRONTEND_ROOT,
        env: mergedEnv(),
      });
      console.log('[dev:gpu] ✅ ONNX Embedding server started on :8081 (DEV_GPU_EMBED_SERVER=onnx)');
    } catch {
      console.log('[dev:gpu] ⚠️  ONNX Embedding server unavailable, using Ollama fallback');
      console.log('[dev:gpu] Will use Ollama embeddinggemma:latest at :11434/api');
    }
  } else {
    console.log('[dev:gpu] ℹ️  Skipping :8081 GGUF embed server (default) — using Ollama embeddinggemma:latest on-demand');
    console.log('[dev:gpu]    Set DEV_GPU_EMBED_SERVER=onnx to eagerly start :8081 for bulk-embedding sessions');
  }

  // Start the NLP sidecar unless already running on :8095
  const nlpPort = parseInt(process.env.MINIFORGE_SIDECAR_PORT ?? '8095', 10);
  if (await isMiniforgeNlpRunning(nlpPort)) {
    console.log(`[dev:gpu] ✅ NLP sidecar already running on :${nlpPort} — skipping launch`);
  } else {
    const launcherScript = path.win32.join(REPO_ROOT, 'scripts', 'launch-miniforge-nlp-sidecar.ps1');
    await runChecked('pwsh', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      launcherScript,
      '-Detached',
      '-Port',
      String(nlpPort),
    ], { cwd: REPO_ROOT, env: mergedEnv({ MINIFORGE_SIDECAR_PORT: String(nlpPort) }) });
    console.log(`[dev:gpu] ✅ NLP sidecar started on :${nlpPort}`);
  }

  console.log('[dev:gpu] --- GPU Runtime Ready ---');
  console.log(`[dev:gpu] LLM (synthesis):  ${llmUrl} (${isLiteRT ? 'LiteRT-LM' : 'TurboQuant llama-server'})`);
  if (wantEmbedServer) {
    console.log('[dev:gpu] Embeddings (L1):  http://127.0.0.1:8081/v1/embeddings (ONNX, eager)');
    console.log('[dev:gpu] Embeddings (L2):  http://127.0.0.1:11434/api (Ollama embeddinggemma, fallback)');
  } else {
    console.log('[dev:gpu] Embeddings:       http://127.0.0.1:11434/api (Ollama embeddinggemma, on-demand)');
    console.log('[dev:gpu]                   :8081 GGUF embed server not started — set DEV_GPU_EMBED_SERVER=onnx to enable');
  }
  console.log(`[dev:gpu] NLP sidecar:     http://127.0.0.1:${nlpPort} (LangExtract + tree-sitter + ast-grep)`);

  const desiredVitePort = parseInt(process.env.VITE_PORT ?? '5173', 10);
  const vitePort = await findFreePort(desiredVitePort);

  // Check graphify readiness (advisory only, non-blocking)
  console.log('[dev:gpu] Checking graphify readiness...');
  try {
    const graphifyCheck = await fetch(`http://127.0.0.1:${vitePort}/api/graphify/status`, {
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    if (graphifyCheck?.ok) {
      const data = await graphifyCheck.json();
      const coreStatus = data.status?.coreStructural ?? 'unknown';
      console.log(`[dev:gpu] ✅ Graphify core: ${coreStatus}`);
      if (coreStatus !== 'PASS') {
        console.log('[dev:gpu] ⚠️  Advisory: Some graphify lanes are degraded.');
        console.log(`[dev:gpu]    View: http://localhost:${vitePort}/admin/graphify-readiness`);
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
