#!/usr/bin/env node
/**
 * start-dev-stack.mjs — Node.js canonical startup orchestrator
 *
 * Tier-ordered boot with health-check gating and startup event journaling.
 * Writes startup events to memory/runs/<run_id>/startup.jsonl.
 *
 *   Tier 0  Docker      — Bifrost :3040, Langfuse :3030
 *   Tier 1  Go          — go-retrieval-service :8100 / gRPC :50053
 *   Tier 2  Inference   — llama-server :8090 (TurboQuant KV)
 *   Tier 3  App         — SvelteKit dev :5173
 *   Tier 4  Agents      — TRACE MCP :8788, topology-search :8101
 *   BG      Audit       — relation:extract + graph:cluster-agents (non-blocking)
 *
 * Connection map (inference cascade):
 *   Langfuse :3030  ← traceLLM() autoencodes every LLM call (langfuse.ts)
 *   Bifrost  :3040  ← bifrostChat() L2 semantic cache (ollama.ts L1→L2→L3)
 *   TurboQuant:8090 ← bifrostChat() L3 cold inference, KV q8_0 + FA on
 *   gRPC :50053     ← retrieval-client.ts gRPC/HTTP cascade
 *   MCP  :8788      ← gemma4-agent.ts named tool calls (trace.kag_search etc.)
 *   SOM             ← graphify:som runs periodically; coords in Qdrant payload
 *
 * Usage:
 *   npm run dev:stack
 *   npm run dev:stack:full   (also kicks off background audit)
 *   node scripts/start-dev-stack.mjs --full --no-sveltekit
 */

import { execSync, spawn }    from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath }      from 'node:url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory/runs');

const argv        = process.argv.slice(2);
const FULL        = argv.includes('--full');
const NO_SVELTE   = argv.includes('--no-sveltekit');
const DRY_RUN     = argv.includes('--dry-run');

// ── Run journal ───────────────────────────────────────────────────────────────

const runId  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = join(MEMORY_DIR, runId);
if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
const startupLog = join(runDir, 'startup.jsonl');

function logEvent(tier, service, status, details = {}) {
  const ev = { ts: new Date().toISOString(), tier, service, status, ...details };
  process.stdout.write(`  [${tier}] ${service}: ${status}\n`);
  appendFileSync(startupLog, JSON.stringify(ev) + '\n', 'utf8');
}

// ── Health-check helpers ──────────────────────────────────────────────────────

async function isPortOpen(port, timeoutMs = 800) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(`http://127.0.0.1:${port}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return true;
  } catch { return false; }
}

async function waitForPort(port, label, maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise(r => setTimeout(r, 800));
  }
  logEvent('wait', label, 'timeout', { port });
  return false;
}

function spawnDetached(cmd, args, opts = {}) {
  if (DRY_RUN) { process.stdout.write(`  [dry-run] ${cmd} ${args.join(' ')}\n`); return null; }
  const proc = spawn(cmd, args, {
    detached: true,
    stdio:    'ignore',
    windowsHide: true,
    ...opts,
  });
  proc.unref();
  return proc;
}

function runDockerCompose(args) {
  try {
    execSync(`docker compose ${args.join(' ')}`, { stdio: 'pipe', timeout: 30_000 });
    return true;
  } catch { return false; }
}

// ── Tier 0: Docker services ───────────────────────────────────────────────────

async function startTier0() {
  console.log('\n[ Tier 0 ] Docker services');

  // Bifrost L2 semantic cache
  if (await isPortOpen(3040)) {
    logEvent('T0', 'Bifrost :3040', 'already-up');
  } else {
    logEvent('T0', 'Bifrost :3040', 'starting', { cmd: 'docker compose --profile full up -d bifrost' });
    const ok = runDockerCompose(['--profile', 'full', 'up', '-d', 'bifrost']);
    await new Promise(r => setTimeout(r, 2000));
    logEvent('T0', 'Bifrost :3040', ok && await isPortOpen(3040) ? 'up' : 'warn-not-ready',
      { note: ok ? undefined : 'L2 cache inactive — bifrostChat falls back to L3 cold inference' });
  }

  // Langfuse inference traces (read-only health check)
  if (await isPortOpen(3030)) {
    logEvent('T0', 'Langfuse :3030', 'up');
  } else {
    logEvent('T0', 'Langfuse :3030', 'warn-not-running', { note: 'inference traces disabled; run: docker compose up -d langfuse' });
  }
}

// ── Tier 1: Go retrieval service ──────────────────────────────────────────────

async function startTier1() {
  console.log('\n[ Tier 1 ] Go retrieval service');

  if (await isPortOpen(8100)) {
    logEvent('T1', 'go-retrieval :8100', 'already-up');
    return;
  }

  const goServiceDir = join(ROOT, '..', 'services', 'go-retrieval-service');
  const goExe        = join(goServiceDir, 'go-retrieval-service.exe');
  const goCmd        = 'C:\\Program Files\\Go\\bin\\go.exe';

  if (existsSync(goExe)) {
    logEvent('T1', 'go-retrieval :8100', 'starting', { exe: goExe });
    spawnDetached(goExe, [], {
      cwd: goServiceDir,
      env: {
        ...process.env,
        HTTP_PORT: '8100', GRPC_PORT: '50053',
        GO_RETRIEVAL_ENABLED: 'true',
        GO_RETRIEVAL_HTTP_URL: 'http://127.0.0.1:8100',
        GO_RETRIEVAL_GRPC_ADDR: '127.0.0.1:50053',
        QDRANT_URL: 'http://localhost:6333',
        REDIS_URL: 'redis://localhost:6379',
        OLLAMA_URL: 'http://localhost:11434',
        EMBED_SERVICE_URL: 'localhost:50051',
        GPU_EMBED_ENABLED: 'true',
        EMBED_MODEL: 'embeddinggemma:latest',
        RETRIEVAL_HTTP_ENABLED: 'true',
      },
    });
    const ready = await waitForPort(8100, 'go-retrieval :8100', 10_000);
    logEvent('T1', 'go-retrieval :8100', ready ? 'up' : 'warn-not-ready',
      { note: ready ? undefined : 'falling back to inline TS retrieval pipeline' });
  } else if (existsSync(goCmd)) {
    logEvent('T1', 'go-retrieval :8100', 'starting-via-go-run', { cwd: goServiceDir });
    spawnDetached(goCmd, ['run', '.'], { cwd: goServiceDir,
      env: {
        ...process.env,
        HTTP_PORT: '8100',
        GRPC_PORT: '50053',
        GO_RETRIEVAL_ENABLED: 'true',
        GO_RETRIEVAL_HTTP_URL: 'http://127.0.0.1:8100',
        GO_RETRIEVAL_GRPC_ADDR: '127.0.0.1:50053',
      } });
    const ready = await waitForPort(8100, 'go-retrieval :8100', 20_000);
    logEvent('T1', 'go-retrieval :8100', ready ? 'up' : 'warn-slow');
  } else {
    logEvent('T1', 'go-retrieval :8100', 'skip', { note: 'exe not found; build: npm run go:retrieval:build' });
  }
}

// ── Tier 2: Inference Cascade (Reranker & TurboQuant) ─────────────────────────

async function startTier2() {
  console.log('\n[ Tier 2 ] Inference Cascade');

  const rerankPort = 8090;
  const turboPort  = 8080;

  const candidates = [
    process.env.TURBOQUANT_EXE_PATH,
    process.env.LLAMA_SERVER_PATH,
    'C:\\Users\\james\\Desktop\\llama-server-cuda\\llama-server.exe',
    join(ROOT, 'bin', 'llama-server.exe'),
  ].filter(Boolean);
  const llamaExe = candidates.find(p => existsSync(p));

  const blobPath  = join(process.env.USERPROFILE ?? 'C:\\Users\\james', '.ollama', 'blobs',
    'sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43');
  const modelPath = process.env.TURBO_MODEL_PATH ??
    (existsSync(blobPath) ? blobPath : join(ROOT, 'models', 'gemma4-rotorquant:latest-q4_k_m.gguf'));

  if (!llamaExe) {
    logEvent('T2', 'Inference', 'skip', { note: 'llama-server.exe not found' });
    return;
  }

  // 1. Start Reranker on :8090
  if (await isPortOpen(rerankPort)) {
    logEvent('T2', `Reranker :${rerankPort}`, 'already-up');
  } else {
    logEvent('T2', `Reranker :${rerankPort}`, 'starting', { kv: 'fp16' });
    spawnDetached(llamaExe, [
      '-m', modelPath, '--host', '127.0.0.1', '--port', String(rerankPort),
      '--rerank', '-ngl', '99', '--log-disable'
    ], { cwd: ROOT });
  }

  // 2. Start TurboQuant on :8080
  if (await isPortOpen(turboPort)) {
    logEvent('T2', `TurboQuant :${turboPort}`, 'already-up');
  } else {
    logEvent('T2', `TurboQuant :${turboPort}`, 'starting', { kv: 'q8_0', fa: true });
    spawnDetached(llamaExe, [
      '-m', modelPath, '--host', '127.0.0.1', '--port', String(turboPort),
      '-c', '65536', '-ngl', '99', '-fa', 'on',
      '-ctk', 'q8_0', '-ctv', 'q8_0', '--log-disable'
    ], { cwd: ROOT });
  }

  const rerankReady = await waitForPort(rerankPort, `Reranker :${rerankPort}`, 45_000);
  const turboReady  = await waitForPort(turboPort, `TurboQuant :${turboPort}`, 60_000);
  
  logEvent('T2', 'Inference', rerankReady && turboReady ? 'up' : 'warn-partial');
}

// ── Tier 3: SvelteKit dev server ──────────────────────────────────────────────

async function startTier3() {
  if (NO_SVELTE) { logEvent('T3', 'SvelteKit :5173', 'skip', { flag: '--no-sveltekit' }); return; }
  console.log('\n[ Tier 3 ] SvelteKit dev server');

  if (await isPortOpen(5173)) {
    logEvent('T3', 'SvelteKit :5173', 'already-up');
    return;
  }

  logEvent('T3', 'SvelteKit :5173', 'starting');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  spawn(npmCmd, ['run', 'dev'], { cwd: ROOT, detached: false, stdio: 'inherit' });
  // Don't wait — SvelteKit startup is slow; background services continue
}

// ── Tier 4: TRACE MCP + Topology search ──────────────────────────────────────

async function startTier4() {
  console.log('\n[ Tier 4 ] TRACE MCP + topology search');

  const mcpPort      = process.env.TRACE_MCP_PORT ?? '8788';
  const kbPort       = process.env.KB_MCP_PORT ?? '8789';
  const clusterScript = join(ROOT, 'scripts', 'start-trace-mcp-cluster.mjs');
  const mcpServerTs   = join(ROOT, 'src', 'mcp', 'trace-mcp-server.ts');
  const kbServerTs    = join(ROOT, 'src', 'mcp', 'kb-retrieval-server.ts');
  const topoScript    = join(ROOT, 'scripts', 'topology-search-server.mjs');

  // Topology search :8101
  if (await isPortOpen(8101)) {
    logEvent('T4', 'topo-search :8101', 'already-up');
  } else if (existsSync(topoScript)) {
    logEvent('T4', 'topo-search :8101', 'starting');
    spawnDetached('node', [topoScript], { cwd: ROOT });
    await new Promise(r => setTimeout(r, 1000));
  }

  // TRACE MCP cluster :8788
  if (await isPortOpen(Number(mcpPort))) {
    logEvent('T4', `TRACE MCP :${mcpPort}`, 'already-up');
  } else if (existsSync(clusterScript) && existsSync(mcpServerTs)) {
    const workers = Math.min(4, (await import('node:os')).default.cpus().length);
    logEvent('T4', `TRACE MCP :${mcpPort}`, 'starting', { workers });
    spawnDetached('node', [clusterScript, String(workers)], { cwd: ROOT });
    const ready = await waitForPort(Number(mcpPort), `TRACE MCP :${mcpPort}`, 20_000);
    logEvent('T4', `TRACE MCP :${mcpPort}`, ready ? 'up' : 'warn-not-ready');
  } else {
    logEvent('T4', `TRACE MCP :${mcpPort}`, 'skip', { note: 'cluster script or trace-mcp-server.ts not found' });
  }

  // KB retrieval MCP :8789
  if (await isPortOpen(Number(kbPort))) {
    logEvent('T4', `KB MCP :${kbPort}`, 'already-up');
  } else if (existsSync(kbServerTs)) {
    logEvent('T4', `KB MCP :${kbPort}`, 'starting');
    spawnDetached('node', [join(ROOT, 'scripts', 'ensure-kb-retrieval-server.mjs'), '--spawn'], { cwd: ROOT });
    const ready = await waitForPort(Number(kbPort), `KB MCP :${kbPort}`, 20_000);
    logEvent('T4', `KB MCP :${kbPort}`, ready ? 'up' : 'warn-not-ready');
  } else {
    logEvent('T4', `KB MCP :${kbPort}`, 'skip', { note: 'kb-retrieval-server.ts not found' });
  }
}

// ── Background: codebase audit ────────────────────────────────────────────────

function startBackground() {
  if (!FULL) return;
  console.log('\n[ Background ] Codebase audit (relation:extract + graph:cluster-agents)');

  const logsDir = join(ROOT, 'logs', 'task-output');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  logEvent('BG', 'relation:extract', 'starting-async');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  const auditProc = spawn(
    npmCmd, ['run', 'relation:extract'],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'ignore'] }
  );
  auditProc.unref();

  const agentProc = spawn(
    npmCmd, ['run', 'graph:cluster-agents'],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'ignore'] }
  );
  agentProc.unref();
  process.stdout.write(`  logs: logs/task-output/\n`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n═════════════════════════════════════════════════');
  console.log(' TRACE stack launched');
  console.log('═════════════════════════════════════════════════');
  console.log('  Langfuse traces  http://127.0.0.1:3030/traces');
  console.log('  Bifrost L2 cache http://127.0.0.1:3040/health');
  console.log('  go-retrieval     http://127.0.0.1:8100/health');
  console.log('  Reranker         http://127.0.0.1:8090/health');
  console.log('  TurboQuant KV    http://127.0.0.1:8080/health');
  console.log('  topo-search      http://127.0.0.1:8101/health');
  console.log('  TRACE MCP        http://127.0.0.1:8788/health');
  console.log('  KB MCP           http://127.0.0.1:8789/health');
  console.log('  SvelteKit        http://127.0.0.1:5173');
  console.log('─────────────────────────────────────────────────');
  console.log('  Inference cascade (bifrostChat):');
  console.log('    L1 Redis exact-match   (~5ms)');
  console.log('    L2 Bifrost semantic    (2-5s)');
  console.log('    L3 Reranker scoring    (5-8s)');
  console.log('    L4 TurboQuant KV cold  (~25s)');
  console.log('─────────────────────────────────────────────────');
  console.log(`  Startup log: memory/runs/${runId}/startup.jsonl`);
  console.log('═════════════════════════════════════════════════\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TRACE Dev Stack — Node.js Orchestrator              ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Run ID: ${runId}${FULL ? '  [--full: background audit]' : ''}\n`);

  await startTier0();
  await startTier1();
  await startTier2();
  await startTier3();
  await startTier4();
  startBackground();
  printSummary();

  logEvent('orchestrator', 'start-dev-stack', 'complete', { runId, full: FULL });
})();
