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
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadRepoEnv } from '../../../scripts/atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const envFromFiles = loadRepoEnv(process.env);

// ---------------------------------------------------------------------------
// Embedding backend selector — explicit enum, not a vague on/off flag.
//
// 'ollama'         Ollama's own supervisor loads embeddinggemma:latest into a
//                   private llama-server.exe runner on demand (ephemeral port),
//                   proxied through :11434/api/embed. Default — no eager VRAM
//                   reservation while the :8090 chat model already holds ~7.5GB
//                   of an 8GB card.
// 'llama_cpp_gguf'  A dedicated second llama-server.exe (GGUF, CUDA) started
//                   eagerly on :8081 via launch-embed-server.ps1. Higher batch
//                   throughput; costs ~600MB extra VRAM held the whole session.
// 'onnx_directml'   In-process ONNX Runtime session inside the SvelteKit
//                   server itself (onnx-server.ts), using the DirectML (D3D12)
//                   execution provider. No separate port/process — the model
//                   loads into the same Node process serving Vite. DirectML
//                   runs through a driver/allocator path separate from CUDA,
//                   so it doesn't compete with TurboQuant's CUDA context for
//                   the same VRAM heap. Windows only; falls back to 'ollama'
//                   elsewhere. Requires onnxruntime-node (package.json).
//
// DEV_GPU_EMBED_SERVER=onnx is a deprecated alias for 'llama_cpp_gguf' — it
// never meant ONNX Runtime; it started the GGUF embed server. Kept only for
// backward compatibility with existing .env files.
// ---------------------------------------------------------------------------
const EMBEDDING_BACKENDS = ['ollama', 'llama_cpp_gguf', 'onnx_directml'];

function resolveEmbeddingBackend(extra = {}) {
  const legacyOnnxFlag = String(
    extra.DEV_GPU_EMBED_SERVER ?? envFromFiles.DEV_GPU_EMBED_SERVER ?? process.env.DEV_GPU_EMBED_SERVER ?? '',
  ).toLowerCase() === 'onnx';

  const raw = String(
    extra.EMBEDDING_BACKEND ?? envFromFiles.EMBEDDING_BACKEND ?? process.env.EMBEDDING_BACKEND
      ?? (legacyOnnxFlag ? 'llama_cpp_gguf' : 'ollama'),
  ).toLowerCase();

  if (legacyOnnxFlag && !envFromFiles.EMBEDDING_BACKEND && !process.env.EMBEDDING_BACKEND) {
    console.warn(
      '[dev:gpu] ⚠️  DEV_GPU_EMBED_SERVER=onnx is deprecated (it starts a GGUF llama.cpp server, not ONNX Runtime). ' +
      'Set EMBEDDING_BACKEND=llama_cpp_gguf instead.',
    );
  }

  if (!EMBEDDING_BACKENDS.includes(raw)) {
    throw new Error(`Unsupported EMBEDDING_BACKEND: "${raw}" — expected one of ${EMBEDDING_BACKENDS.join(', ')}`);
  }

  if (raw === 'onnx_directml' && process.platform !== 'win32') {
    console.warn(
      '[dev:gpu] ⚠️  EMBEDDING_BACKEND=onnx_directml requires Windows (DirectML/D3D12). Falling back to "ollama".',
    );
    return 'ollama';
  }

  return raw;
}

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
  // into (EMBEDDING_BACKEND=llama_cpp_gguf). Otherwise leave OLLAMA_EMBED_BASE_URL
  // unset so embedding-client.ts's Tier-0 probe is skipped entirely (rather
  // than dialing a dead :8081 on every embed call) and Ollama is used directly.
  const embeddingBackend = resolveEmbeddingBackend(extra);
  const wantOnnxEmbedServer = embeddingBackend === 'llama_cpp_gguf';

  return {
    ...process.env,
    ...envFromFiles,
    GPU_ENABLED: 'true',
    VITE_GPU_ENABLED: 'true',
    CUDA_VISIBLE_DEVICES: envFromFiles.CUDA_VISIBLE_DEVICES ?? '0',
    EMBEDDING_BACKEND: embeddingBackend,
    // Explicit undefined (not omission) so a leftover value from process.env
    // or envFromFiles is actually cleared for the child process, not inherited.
    OLLAMA_EMBED_BASE_URL: wantOnnxEmbedServer
      ? (envFromFiles.OLLAMA_EMBED_BASE_URL ?? envFromFiles.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081')
      : undefined,
    EMBED_SERVER_URL: wantOnnxEmbedServer
      ? (envFromFiles.EMBED_SERVER_URL ?? envFromFiles.OLLAMA_EMBED_BASE_URL ?? 'http://127.0.0.1:8081')
      : undefined,
    EMBED_SERVER_PORT: envFromFiles.EMBED_SERVER_PORT ?? '8081',
    EMBED_MAX_BATCH: envFromFiles.EMBED_MAX_BATCH ?? '64',
    MINIFORGE_SIDECAR_URL: envFromFiles.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095',
    DEV_GPU_LLM_BACKEND: devGpuLlmBackend,
    LOCAL_OPENAI_BASE_URL: envFromFiles.LOCAL_OPENAI_BASE_URL ?? `http://127.0.0.1:${synthPort}/v1`,
    LOCAL_OPENAI_API_KEY: envFromFiles.LOCAL_OPENAI_API_KEY ?? 'local',
    // Ornith 1.5 (alias "ornith-1.5-9b", launch-turboquant.ps1 profile
    // "ornith-1.5") is the current production target for the text-only
    // TurboQuant lane; EXPECTED_LLAMA_MODEL/TURBO_MODEL/LOCAL_GEMMA_MODEL let an
    // operator repoint this without editing code. See "verifyLlamaServerModelLoaded"
    // below for the fail-closed identity check this default feeds.
    //
    // NOTE (2026-08-26): the legacy Ornith 1.0 candidate and the current Ornith
    // 1.5 candidate both ship a GGUF file literally named hforf.gguf (in
    // different directories) — comparing against that bare filename can no
    // longer distinguish them. launch-turboquant.ps1 now passes --alias so
    // /props.model_alias reports a unique string per profile ("ornith-9b" vs
    // "ornith-1.5-9b"); this default must track whichever profile is actually
    // launched below (see the -StartupProfile arg passed to launch-turboquant.ps1).
    //
    // LOCAL_GEMMA_MODEL is a legacy env var name kept for backward
    // compatibility with launch-turboquant.ps1 and existing .env files - it
    // no longer implies the target is a Gemma model (hforf.gguf/Ornith is not
    // Gemma). Treat it as "the resolved expected/target model", not literally
    // "the Gemma model". Prefer EXPECTED_LLAMA_MODEL or TURBO_MODEL in new
    // config; LOCAL_GEMMA_MODEL remains the lowest-priority explicit override.
    LOCAL_GEMMA_MODEL: envFromFiles.EXPECTED_LLAMA_MODEL ?? envFromFiles.TURBO_MODEL ?? envFromFiles.LOCAL_GEMMA_MODEL ?? (isLiteRT ? 'gemma-4-E2B-it.litertlm' : 'ornith-1.5-9b'),
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

/**
 * Bounded verification that :8090 is actually serving the TARGET model, not
 * just that something responds. launch-turboquant.ps1 has its own
 * model_alias check before it exits, but that only protects the "already
 * healthy, skip restart" branch inside the PS1 — it does not guarantee the
 * PS1 actually reached a healthy state at all (crash mid-load, wrong file,
 * OOM, stale process holding the port that the PS1's own restart logic
 * failed to kill). This is the dev:gpu-side backstop: poll /props a FIXED
 * number of times (never infinite) and report ok/fail with the reason.
 *
 * llama-server-only by design — this project standardizes on llama-server
 * as the sole GPU chat backend for dev:gpu (LiteRT is a separate opt-in
 * backend with no /props-equivalent verification surface; see the isLiteRT
 * branch in main()). This function does not attempt LiteRT verification and
 * must not be reused for it.
 */
async function verifyLlamaServerModelLoaded(targetModelPath, port = 8090, opts = {}) {
  const { maxAttempts = 10, intervalMs = 1500 } = opts;
  const targetBasename = path.basename(targetModelPath);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/props`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const props = await res.json();
        const runningAlias = props.model_alias || (props.model_path ? path.basename(props.model_path) : null);
        if (runningAlias === targetBasename) {
          return { ok: true, attempt, targetBasename, runningAlias };
        }
        return {
          ok: false,
          attempt,
          targetBasename,
          runningAlias,
          reason: `model mismatch: running="${runningAlias ?? 'unknown'}" target="${targetBasename}"`,
        };
      }
    } catch {
      // Not ready yet (still loading, or briefly down mid-restart) — keep polling.
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    ok: false,
    attempt: maxAttempts,
    targetBasename,
    runningAlias: null,
    reason: `:${port}/props unreachable after ${maxAttempts} attempts (~${Math.round((maxAttempts * intervalMs) / 1000)}s)`,
  };
}

/**
 * Write a plain-text diagnostic summary to openspec/changes/ on verification
 * failure, then STOP (caller must exit — this function never retries or
 * loops). Per-run file (timestamped), not an append-forever log, so each
 * failure is independently readable and old ones don't need pruning.
 */
function writeStartupFailureReport(details) {
  const dir = path.join(REPO_ROOT, 'openspec', 'changes');
  mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, `gpu-startup-failure-${Date.now()}.txt`);

  const lines = [
    `dev:gpu startup verification FAILED`,
    `timestamp: ${new Date().toISOString()}`,
    `target model: ${details.targetBasename}`,
    `running model: ${details.runningAlias ?? 'unknown/unreachable'}`,
    `attempts: ${details.attempt}`,
    `reason: ${details.reason}`,
    ``,
    `Suggested next steps:`,
    `  1. Check for a stale/orphan llama-server.exe bypassing launch-turboquant.ps1:`,
    `     tasklist /FI "IMAGENAME eq llama-server.exe"`,
    `  2. If one is found, kill it and rerun:`,
    `     taskkill /F /IM llama-server.exe`,
    `     npm run dev:gpu`,
    `  3. Check for a manual/raw launch task that bypasses the launcher's`,
    `     model-alias safety check entirely (e.g. a .vscode/tasks.json entry`,
    `     invoking llama-server.exe directly instead of launch-turboquant.ps1).`,
    `  4. Check .env / .env.local for a TURBO_CHAT_TEMPLATE_FILE or`,
    `     TURBO_PROFILE override that may be forcing an unintended pairing.`,
    `  5. Inspect the launcher's own stderr log under logs/turboquant/ for`,
    `     the most recent launch-*.err file (load crash, OOM, missing file).`,
    ``,
    `This run did NOT retry automatically — dev:gpu stops here rather than`,
    `looping. Re-run npm run dev:gpu manually after addressing the cause.`,
  ];

  appendFileSync(reportPath, lines.join('\n') + '\n');
  console.error(`[dev:gpu] ❌ Model verification failed — report written: ${reportPath}`);
  for (const line of lines) console.error(`[dev:gpu]   ${line}`);
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
      // -StartupProfile pins model resolution to the "ornith-1.5" profile
      // explicitly (Model + Alias + TemplateFile bundled in launch-turboquant.ps1),
      // rather than relying on env vars or the legacy on-disk fallback chain.
      // That legacy chain checks models/hfor/hforf.gguf first — a path that no
      // longer exists after the Ornith 1.0 -> Desktop / Ornith 1.5 -> :8090 swap
      // — so leaving this unset would silently fall through to a stale or null
      // model resolution. Override via TURBO_STARTUP_PROFILE env var if a
      // different profile (e.g. "ornith" for the legacy model, once restored)
      // is intentionally wanted for a dev:gpu run.
      const startupProfile = process.env.TURBO_STARTUP_PROFILE || 'ornith-1.5';
      await runChecked('pwsh', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        launcherScript,
        '-StartupProfile',
        startupProfile,
        '-Detached',
        '-TextOnly',
      ], { cwd: REPO_ROOT, env: launcherEnv });

      // Bounded verification gate — confirms the TARGET model is actually
      // loaded on :8090, not just that launch-turboquant.ps1 exited 0 or
      // that something responds. Fixed attempt count (never infinite). On
      // failure: write the report and STOP dev:gpu here — do not retry, do
      // not fall back to a different backend, do not proceed into Vite with
      // an unverified/wrong LLM backend.
      const profileAliasMap = { 'ornith-1.5': 'ornith-1.5-9b', 'ornith': 'ornith-9b', 'gemma4-direct': 'gemma4-legal', 'gemma4-thinking': 'gemma4-legal-thinking' };
      const targetModel = launcherEnv.EXPECTED_LLAMA_MODEL ?? launcherEnv.TURBO_MODEL ?? launcherEnv.LOCAL_GEMMA_MODEL ?? profileAliasMap[startupProfile] ?? 'ornith-1.5-9b';
      console.log(`[dev:gpu] Verifying :8090 is serving "${targetModel}"...`);
      const verification = await verifyLlamaServerModelLoaded(targetModel, synthPort);

      if (!verification.ok) {
        writeStartupFailureReport(verification);
        process.exit(1);
      }

      console.log(`[dev:gpu] ✅ TurboQuant llama-server (${verification.runningAlias}) verified active on :8090 (attempt ${verification.attempt})`);
    }
  }

  // The GGUF embed server on :8081 is opt-in only — it's a second GPU-resident
  // model competing with the :8090 chat model for the same 8GB card. Ollama
  // already serves embeddinggemma:latest on-demand (loads on first request,
  // unloads after its idle keep-alive) so it's the right default for routine
  // dev. Set EMBEDDING_BACKEND=llama_cpp_gguf to eagerly start :8081 for
  // sessions doing heavy bulk-embedding work (graphify backfills, batch
  // indexing) that want its higher-throughput batch endpoint.
  // embedding-client.ts's Tier-0 probe already fails over to Ollama
  // near-instantly when :8081 isn't up.
  const embedPort = parseInt(process.env.EMBED_SERVER_PORT ?? '8081');
  const embeddingBackend = resolveEmbeddingBackend();
  const wantEmbedServer = embeddingBackend === 'llama_cpp_gguf';
  if (embeddingBackend === 'onnx_directml') {
    console.log('[dev:gpu] ✅ Embedding backend: onnx_directml — in-process ONNX Runtime session, no separate port');
    console.log('[dev:gpu]    Model: embeddinggemma (static/embeddinggemma_300m_onnx/model.onnx), execution provider: DirectML (falls back to CPU if unavailable)');
  } else if (await isLlamaServerRunning(embedPort)) {
    console.log(`[dev:gpu] ✅ Embed server already running on :${embedPort} — leaving it up`);
  } else if (wantEmbedServer) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
      await runChecked(npm, ['run', 'embed:onnx:start:detached'], {
        cwd: FRONTEND_ROOT,
        env: mergedEnv(),
      });
      console.log('[dev:gpu] ✅ Embedding backend: llama_cpp_gguf — GGUF/CUDA server on :8081 (EMBEDDING_BACKEND=llama_cpp_gguf)');
    } catch {
      console.log('[dev:gpu] ⚠️  llama_cpp_gguf embed server unavailable, using Ollama fallback');
      console.log('[dev:gpu] Embedding backend: ollama — model embeddinggemma:latest, endpoint http://127.0.0.1:11434/api/embed, execution provider Ollama-managed');
    }
  } else {
    console.log('[dev:gpu] Embedding backend: ollama — model embeddinggemma:latest, endpoint http://127.0.0.1:11434/api/embed, execution provider Ollama-managed (on-demand)');
    console.log('[dev:gpu]    Set EMBEDDING_BACKEND=llama_cpp_gguf to eagerly start a dedicated GGUF/CUDA embed server on :8081');
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
  if (embeddingBackend === 'onnx_directml') {
    console.log('[dev:gpu] Embedding backend: onnx_directml');
    console.log('[dev:gpu]   Model:              embeddinggemma (ONNX, static/embeddinggemma_300m_onnx/model.onnx)');
    console.log('[dev:gpu]   Endpoint:           in-process (no port — session lives inside the SvelteKit server)');
    console.log('[dev:gpu]   Execution provider: DirectML (D3D12) → CPU fallback');
  } else if (wantEmbedServer) {
    console.log('[dev:gpu] Embedding backend: llama_cpp_gguf');
    console.log('[dev:gpu]   Model:              embeddinggemma (GGUF)');
    console.log('[dev:gpu]   Endpoint (L1):      http://127.0.0.1:8081/v1/embeddings');
    console.log('[dev:gpu]   Execution provider: llama.cpp CUDA (-ngl 99)');
    console.log('[dev:gpu]   Fallback (L2):      http://127.0.0.1:11434/api/embed (Ollama-managed)');
  } else {
    console.log('[dev:gpu] Embedding backend: ollama');
    console.log('[dev:gpu]   Model:              embeddinggemma:latest');
    console.log('[dev:gpu]   Endpoint:           http://127.0.0.1:11434/api/embed');
    console.log('[dev:gpu]   Execution provider: Ollama-managed (on-demand runner, unloads on idle)');
    console.log('[dev:gpu]                   Set EMBEDDING_BACKEND=llama_cpp_gguf to enable the dedicated :8081 server');
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
